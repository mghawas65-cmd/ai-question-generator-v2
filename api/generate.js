const TYPES=new Set(['mixed','mcq','tf','short','case','calculation']);
const LEVELS=new Set(['mixed','easy','medium','hard','professional']);
const LANGS=new Set(['ar','en']);
const EXAMS=new Set(['skills','university','jobs','professional','practice']);
const FRAMEWORKS=new Set(['auto','ifrs','ias','gaap','audit','tax','cost','management']);

const MODEL='gpt-5.6-luna';
const BATCH_SIZE=4;
const MAX_CONCURRENCY=2;
const CALL_TIMEOUT_MS=50000;
const MAX_RETRIES=2;
const OFFICIAL_SOURCES={
  ifrs:{name:'IFRS Foundation / IASB',url:'https://www.ifrs.org/'},
  ias:{name:'IFRS Foundation / IASB',url:'https://www.ifrs.org/'},
  gaap:{name:'FASB Accounting Standards Codification',url:'https://asc.fasb.org/'},
  audit:{name:'IAASB',url:'https://www.iaasb.org/'},
  tax:{name:'الجهة الضريبية المختصة حسب الدولة',url:''},
  cost:{name:'مرجع أكاديمي/مهني في محاسبة التكاليف',url:''},
  management:{name:'مرجع أكاديمي/مهني في المحاسبة الإدارية',url:''},
  auto:{name:'المرجع الرسمي الأنسب للموضوع',url:''}
};

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function extractText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text;
  return (data?.output||[]).flatMap(x=>x?.content||[]).map(c=>typeof c?.text==='string'?c.text:'').join('').trim();
}
function parseJson(text){
  if(!text) return null;
  try{return JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim())}catch{return null}
}
function keyOf(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,240)}
function normalizeText(s){return String(s||'').trim().replace(/\s+/g,' ')}
function uniqueStrings(arr){const seen=new Set();return arr.filter(x=>{const k=normalizeText(x).toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true})}
function safeReference(ref,framework){
  let r=normalizeText(ref);
  r=r.replace(/(?:paragraph|para\.?|فقرة)\s*\d+(?:\.\d+)*/gi,'').replace(/\s{2,}/g,' ').trim();
  const src=OFFICIAL_SOURCES[framework]||OFFICIAL_SOURCES.auto;
  if(!r) r=src.name;
  if(src.url&&!r.includes(src.url)) r=`${r} — ${src.url}`;
  return r;
}
function normalizeAnswerToChoice(answer,choices){
  const a=normalizeText(answer);
  if(!choices.length) return a;
  const exact=choices.find(c=>normalizeText(c).toLowerCase()===a.toLowerCase());
  if(exact) return normalizeText(exact);
  const letter=a.match(/^([A-D])(?:[\).:\-\s]|$)/i)?.[1]?.toUpperCase();
  if(letter){const idx=letter.charCodeAt(0)-65;if(choices[idx])return normalizeText(choices[idx]);}
  const contained=choices.find(c=>a.includes(normalizeText(c))||normalizeText(c).includes(a));
  return contained?normalizeText(contained):a;
}
function cleanQuestion(q,framework){
  if(!q||typeof q.question!=='string'||typeof q.answer!=='string') return null;
  const question=normalizeText(q.question), answerRaw=normalizeText(q.answer);
  if(question.length<12||!answerRaw) return null;
  const type=['mcq','tf','short','case','calculation'].includes(q.type)?q.type:'short';
  let choices=uniqueStrings(Array.isArray(q.choices)?q.choices.slice(0,6).map(normalizeText):[]);
  if(type==='mcq'&&choices.length!==4) return null;
  if(type==='tf') choices=[];
  if(!['mcq','tf'].includes(type)) choices=[];
  const answer=normalizeAnswerToChoice(answerRaw,choices);
  if(type==='mcq'&&!choices.some(c=>normalizeText(c).toLowerCase()===answer.toLowerCase())) return null;
  const explanation=normalizeText(q.explanation);
  if(explanation.length<20) return null;
  return {
    question,choices,answer,explanation,
    difficulty:['easy','medium','hard','professional'].includes(q.difficulty)?q.difficulty:'medium',
    type,
    topic:normalizeText(q.topic),
    reference:safeReference(q.reference,framework),
    source_url:(OFFICIAL_SOURCES[framework]||OFFICIAL_SOURCES.auto).url,
    learning_objective:normalizeText(q.learning_objective),
    quality_checked:true
  };
}
function isRetryableStatus(status){return status===408||status===409||status===429||status>=500}

async function oneOpenAICall({apiKey,instructions,input,maxOutput=5000}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),CALL_TIMEOUT_MS);
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:MODEL,instructions,input,
        reasoning:{effort:'medium'},
        text:{format:{type:'json_object'}},
        max_output_tokens:maxOutput
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(data?.error?.message||`OpenAI API error (${r.status})`);e.status=r.status;throw e;}
    const parsed=parseJson(extractText(data));
    if(!parsed||!Array.isArray(parsed.questions)) throw new Error('عاد محرك الذكاء الاصطناعي بنتيجة غير قابلة للقراءة.');
    return parsed.questions;
  }finally{clearTimeout(timer)}
}
async function callOpenAI(opts){
  let lastErr;
  for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
    try{return await oneOpenAICall(opts)}catch(e){
      lastErr=e;const status=Number(e?.status||0);
      const retry=e?.name==='AbortError'||isRetryableStatus(status)||!status;
      if(!retry||attempt===MAX_RETRIES) break;
      await sleep(650*(attempt+1)+Math.floor(Math.random()*400));
    }
  }
  if(lastErr?.name==='AbortError') throw new Error('انتهت مهلة الاتصال بمحرك الذكاء الاصطناعي بعد إعادة المحاولة.');
  throw lastErr||new Error('تعذر الاتصال بمحرك الذكاء الاصطناعي.');
}
async function runPool(tasks,limit){
  const out=new Array(tasks.length);let next=0;
  async function worker(){while(true){const i=next++;if(i>=tasks.length)return;try{out[i]={status:'fulfilled',value:await tasks[i]()}}catch(reason){out[i]={status:'rejected',reason}}}}
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},()=>worker()));return out;
}
function diversityPlan(type,count){
  if(type!=='mixed') return `${count} questions all of type ${type}.`;
  const mcq=Math.max(2,Math.round(count*.3)),calc=Math.max(1,Math.round(count*.2)),caseN=Math.max(1,Math.round(count*.2)),tf=Math.max(1,Math.round(count*.15));
  const short=Math.max(1,count-mcq-calc-caseN-tf);
  return `Across the full set target approximately ${mcq} MCQ, ${tf} true/false, ${short} short-answer, ${caseN} applied case, and ${calc} calculation/journal-entry questions. Do not let one type dominate.`;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
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

  const baseInstructions=`You are a senior accounting educator, exam writer, auditor/controller-level practitioner, and assessment quality reviewer. Write in ${lang}. Context: ${examRule}. Question design: ${typeRule}. Difficulty: ${diffRule}. Framework: ${fw}.\n${diversityPlan(type,count)}\nQuality rules:\n1) Use established accounting knowledge and realistic amounts/dates.\n2) Never invent paragraph numbers, tax rates, legal rules, URLs, or authorities. If exact jurisdiction/date is missing, state the assumption or keep the question jurisdiction-neutral.\n3) Calculations must be arithmetically consistent; journal entries must balance; explain reasoning, not just the final answer.\n4) MCQs must have exactly four unique plausible choices and one unambiguous correct answer.\n5) Avoid duplicates, trivia, trick wording, answer clues, vague pronouns, and questions whose answer depends on missing facts.\n6) Prefer application, analysis, professional judgment, controls, error detection, financial-statement impact, and realistic workplace decisions over pure memorization.\n7) For IFRS/IAS/GAAP/ISA references, cite the standard/topic name only unless certain of a specific paragraph. Do not fabricate paragraph numbers.\n8) For tax/zakat questions, identify that rates and rules depend on jurisdiction and date unless the user supplied them.\nReturn ONLY a valid JSON object with this exact shape: {"questions":[{"question":"...","choices":[],"answer":"...","explanation":"...","difficulty":"medium","type":"short","topic":"...","reference":"","learning_objective":"..."}]}. Do not output markdown or text outside the JSON object.`;

  try{
    const sizes=[];for(let left=count;left>0;left-=BATCH_SIZE)sizes.push(Math.min(BATCH_SIZE,left));
    const angles=['recognition and measurement','applied workplace judgment','calculations and journal entries','error detection and internal controls','financial statement presentation and disclosure','professional exam synthesis','audit evidence and controls'];
    const tasks=sizes.map((n,i)=>()=>callOpenAI({
      apiKey:process.env.OPENAI_API_KEY,instructions:baseInstructions,
      input:`Return a valid JSON object only. Create EXACTLY ${n} distinct questions for batch ${i+1}. Emphasize ${angles[i%angles.length]}. Keep every numeric case internally solvable. Do not repeat ideas within this batch.\n\nUSER MATERIAL:\n${content}`,
      maxOutput:5000
    }));
    const settled=await runPool(tasks,MAX_CONCURRENCY),raw=[],failures=[];
    for(const s of settled){s.status==='fulfilled'?raw.push(...s.value):failures.push(String(s.reason?.message||'فشل غير معروف'))}

    const seen=new Set(),questions=[];
    const addItems=items=>{for(const item of items){const q=cleanQuestion(item,framework);if(!q)continue;const k=keyOf(q.question);if(!k||seen.has(k))continue;seen.add(k);questions.push(q);if(questions.length>=count)break;}};
    addItems(raw);

    for(let repair=0;questions.length<count&&repair<3;repair++){
      const missing=count-questions.length,avoid=questions.slice(-18).map((q,i)=>`${i+1}. ${q.question}`).join('\n');
      try{
        const extra=await callOpenAI({
          apiKey:process.env.OPENAI_API_KEY,instructions:baseInstructions,
          input:`Return a valid JSON object only. Create EXACTLY ${Math.min(missing,6)} NEW questions. They must be materially different from every question below and must pass all quality rules.\nAVOID DUPLICATING:\n${avoid||'none'}\n\nUSER MATERIAL:\n${content}`,
          maxOutput:5200
        });
        addItems(extra);
      }catch(e){failures.push(String(e?.message||'تعذر إكمال دفعة الإصلاح'));break;}
    }

    if(questions.length<10) return res.status(502).json({error:`تم إنشاء ${questions.length} أسئلة صالحة فقط من أصل ${count}. لم نحفظ نتيجة ناقصة. ${failures[0]?`التفصيل: ${failures[0]}`:'أعد المحاولة بعد قليل.'}`,partial:questions,canRetry:true});

    const source=OFFICIAL_SOURCES[framework]||OFFICIAL_SOURCES.auto;
    return res.status(200).json({questions:questions.slice(0,count),meta:{count:Math.min(questions.length,count),requested:count,framework,exam,model:MODEL,quality_validation:true,references_normalized:true,official_source:source,warnings:failures.slice(0,2),generated_at:new Date().toISOString()}});
  }catch(e){return res.status(500).json({error:`حدث خطأ في الخادم: ${e?.message||'غير معروف'}`,canRetry:true});}
}
