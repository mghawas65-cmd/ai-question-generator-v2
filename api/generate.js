const TYPES=new Set(['mixed','mcq','tf','short','case','calculation']);
const LEVELS=new Set(['mixed','easy','medium','hard','professional']);
const LANGS=new Set(['ar','en']);
const EXAMS=new Set(['skills','university','jobs','professional','practice']);
const FRAMEWORKS=new Set(['auto','ifrs','ias','gaap','audit','tax','cost','management']);

const MODEL='gpt-5.6-luna';
const BATCH_SIZE=4;
const MAX_CONCURRENCY=2;
const CALL_TIMEOUT_MS=42000;
const MAX_RETRIES=2;

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function extractText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text;
  return (data?.output||[]).flatMap(x=>x?.content||[]).map(c=>typeof c?.text==='string'?c.text:'').join('').trim();
}
function parseJson(text){
  if(!text) return null;
  try{return JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim())}catch{return null}
}
function keyOf(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,220)}
function cleanQuestion(q){
  if(!q||typeof q.question!=='string'||typeof q.answer!=='string') return null;
  const question=q.question.trim(), answer=String(q.answer).trim();
  if(question.length<8||answer.length<1) return null;
  let choices=Array.isArray(q.choices)?q.choices.map(String).map(x=>x.trim()).filter(Boolean).slice(0,4):[];
  const type=['mcq','tf','short','case','calculation'].includes(q.type)?q.type:'short';
  if(type==='mcq'&&choices.length!==4) return null;
  if(type==='tf'&&choices.length===0) choices=['صح','خطأ'];
  return {
    question,
    choices,
    answer,
    explanation:String(q.explanation||'').trim(),
    difficulty:['easy','medium','hard','professional'].includes(q.difficulty)?q.difficulty:'medium',
    type,
    topic:String(q.topic||'').trim(),
    reference:String(q.reference||'').trim(),
    learning_objective:String(q.learning_objective||'').trim()
  };
}

async function oneOpenAICall({apiKey,instructions,input,maxOutput=4500}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),CALL_TIMEOUT_MS);
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      signal:controller.signal,
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:MODEL,
        instructions,
        input,
        reasoning:{effort:'low'},
        text:{format:{type:'json_object'}},
        max_output_tokens:maxOutput
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const msg=data?.error?.message||`OpenAI API error (${r.status})`;
      const e=new Error(msg);e.status=r.status;throw e;
    }
    const parsed=parseJson(extractText(data));
    if(!parsed||!Array.isArray(parsed.questions)) throw new Error('عاد محرك الذكاء الاصطناعي بنتيجة غير قابلة للقراءة.');
    return parsed.questions;
  } finally { clearTimeout(timer); }
}

async function callOpenAI(opts){
  let lastErr;
  for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
    try{return await oneOpenAICall(opts)}catch(e){
      lastErr=e;
      const status=Number(e?.status||0);
      const retryable=e?.name==='AbortError'||status===408||status===409||status===429||status>=500||!status;
      if(!retryable||attempt===MAX_RETRIES) break;
      await sleep(500*(attempt+1)+Math.floor(Math.random()*350));
    }
  }
  if(lastErr?.name==='AbortError') throw new Error('انتهت مهلة الاتصال بمحرك الذكاء الاصطناعي. تمت إعادة المحاولة تلقائيًا دون نجاح.');
  throw lastErr||new Error('تعذر الاتصال بمحرك الذكاء الاصطناعي.');
}

async function runPool(tasks,limit){
  const out=new Array(tasks.length);let next=0;
  async function worker(){
    while(true){
      const i=next++;if(i>=tasks.length) return;
      try{out[i]={status:'fulfilled',value:await tasks[i]()}}catch(reason){out[i]={status:'rejected',reason}}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},()=>worker()));
  return out;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const b=req.body||{};
  const content=typeof b.content==='string'?b.content.trim():'';
  const type=TYPES.has(b.type)?b.type:'mixed';
  const difficulty=LEVELS.has(b.difficulty)?b.difficulty:'mixed';
  const language=LANGS.has(b.language)?b.language:'ar';
  const exam=EXAMS.has(b.exam)?b.exam:'skills';
  const framework=FRAMEWORKS.has(b.framework)?b.framework:'auto';
  const count=Math.max(10,Math.min(30,Number(b.count)||10));

  if(content.length<8) return res.status(400).json({error:'اكتب موضوعًا أو حالة عملية أو فكرة محاسبية بتفصيل كافٍ.'});
  if(content.length>30000) return res.status(400).json({error:'المدخل طويل جدًا. الحد 30,000 حرف.'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'مفتاح OpenAI غير مفعّل في Vercel.'});

  const lang=language==='en'?'English':'Arabic';
  const typeRule={mixed:'a deliberate mix of MCQ, true/false, short answer, applied case, and calculation questions',mcq:'multiple-choice only',tf:'true/false only',short:'short-answer only',case:'applied workplace case-study questions',calculation:'calculation and accounting-entry problems'}[type];
  const diffRule={mixed:'progressive: foundational, intermediate, advanced, with applied higher-order questions',easy:'foundational',medium:'intermediate',hard:'advanced',professional:'professional certification / senior accountant level'}[difficulty];
  const examRule={skills:'accounting skill development',university:'university assessment',jobs:'accounting job interview and employment assessment',professional:'professional accounting exam preparation',practice:'workplace practice'}[exam];
  const fw={auto:'choose only standards/frameworks genuinely relevant to the topic',ifrs:'IFRS Accounting Standards',ias:'IAS/IFRS Accounting Standards',gaap:'US GAAP when relevant',audit:'ISA auditing standards when relevant',tax:'tax accounting; clearly state that tax rules depend on jurisdiction',cost:'cost accounting',management:'management accounting'}[framework];

  const baseInstructions=`You are a senior accounting educator, assessment designer, and practicing-accounting subject matter expert. Write in ${lang}. Context: ${examRule}. Question design: ${typeRule}. Difficulty: ${diffRule}. Framework: ${fw}. Use established accounting knowledge. Never fabricate paragraph numbers, standard requirements, tax rates, laws, URLs, or authorities. If jurisdiction/date is required but absent, make the question jurisdiction-neutral or identify the assumption. Calculations must be internally consistent. Journal entries must balance. MCQs must have exactly 4 plausible options and one correct answer. Avoid duplicates, trivia, trick wording, and answer clues. Vary recall, application, analysis, calculation, judgment, error detection, journal entries, financial-statement impact, controls, and realistic workplace decisions where relevant. Keep explanations concise but educational. References must name only a real relevant framework/standard; leave reference empty if uncertain. Return ONLY a valid JSON object with this exact shape: {"questions":[{"question":"...","choices":[],"answer":"...","explanation":"...","difficulty":"medium","type":"short","topic":"...","reference":"","learning_objective":"..."}]}. Do not output markdown or text outside the JSON object.`;

  try{
    const sizes=[];for(let left=count;left>0;left-=BATCH_SIZE) sizes.push(Math.min(BATCH_SIZE,left));
    const angles=['concepts and recognition','applied workplace judgment','calculations and journal entries','error detection and controls','financial statement impact','professional exam synthesis','presentation and disclosure','audit evidence and controls'];
    const tasks=sizes.map((n,i)=>()=>callOpenAI({
      apiKey:process.env.OPENAI_API_KEY,
      instructions:baseInstructions,
      input:`Return a valid JSON object only. Create EXACTLY ${n} distinct accounting questions for batch ${i+1}. Emphasize ${angles[i%angles.length]}. Do not repeat questions within this batch.\n\nUSER MATERIAL:\n${content}`,
      maxOutput:4200
    }));

    const settled=await runPool(tasks,MAX_CONCURRENCY);
    const raw=[], failures=[];
    for(const s of settled){
      if(s.status==='fulfilled') raw.push(...s.value);
      else failures.push(String(s.reason?.message||'فشل غير معروف'));
    }

    const seen=new Set(), questions=[];
    const addItems=items=>{
      for(const item of items){
        const q=cleanQuestion(item);if(!q) continue;
        const k=keyOf(q.question);if(!k||seen.has(k)) continue;
        seen.add(k);questions.push(q);if(questions.length>=count) break;
      }
    };
    addItems(raw);

    let repairAttempts=0;
    while(questions.length<count&&repairAttempts<2){
      repairAttempts++;
      const missing=count-questions.length;
      const avoid=questions.slice(-16).map((q,i)=>`${i+1}. ${q.question}`).join('\n');
      try{
        const extra=await callOpenAI({
          apiKey:process.env.OPENAI_API_KEY,
          instructions:baseInstructions,
          input:`Return a valid JSON object only. Create EXACTLY ${Math.min(missing,6)} NEW questions. They must be materially different from the questions below.\nAVOID DUPLICATING:\n${avoid||'none'}\n\nUSER MATERIAL:\n${content}`,
          maxOutput:4300
        });
        addItems(extra);
      }catch(e){failures.push(String(e?.message||'تعذر إكمال الدفعة الأخيرة'));break;}
    }

    if(questions.length<10){
      return res.status(502).json({error:`تم إنشاء ${questions.length} أسئلة صالحة فقط. ${failures[0]?`السبب: ${failures[0]}`:'أعد المحاولة.'}`,partial:questions});
    }

    return res.status(200).json({
      questions:questions.slice(0,count),
      meta:{count:Math.min(questions.length,count),requested:count,framework,exam,model:MODEL,batched:true,retries:MAX_RETRIES,warnings:failures.slice(0,2)}
    });
  }catch(e){
    return res.status(500).json({error:`حدث خطأ في الخادم: ${e?.message||'غير معروف'}`});
  }
}
