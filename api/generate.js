const TYPES=new Set(['mixed','mcq','tf','short','case','calculation']);
const LEVELS=new Set(['mixed','easy','medium','hard','professional']);
const LANGS=new Set(['ar','en']);
const EXAMS=new Set(['skills','university','jobs','professional','practice']);
const FRAMEWORKS=new Set(['auto','ifrs','ias','gaap','audit','tax','cost','management']);

function extractText(data){
 if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text;
 return (data?.output||[]).flatMap(x=>x?.content||[]).map(c=>typeof c?.text==='string'?c.text:'').join('').trim();
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const b=req.body||{},content=typeof b.content==='string'?b.content.trim():'';
 const type=TYPES.has(b.type)?b.type:'mixed',difficulty=LEVELS.has(b.difficulty)?b.difficulty:'mixed',language=LANGS.has(b.language)?b.language:'ar',exam=EXAMS.has(b.exam)?b.exam:'skills',framework=FRAMEWORKS.has(b.framework)?b.framework:'auto';
 const count=Math.max(10,Math.min(30,Number(b.count)||10));
 if(content.length<8)return res.status(400).json({error:'اكتب موضوعًا أو حالة عملية أو فكرة محاسبية بتفصيل كافٍ.'});
 if(content.length>30000)return res.status(400).json({error:'المدخل طويل جدًا. الحد 30,000 حرف.'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'مفتاح OpenAI غير مفعّل في Vercel. أضف OPENAI_API_KEY في Environment Variables ثم أعد النشر.'});
 const lang=language==='en'?'English':'Arabic';
 const typeRule={mixed:'a deliberate mix of MCQ, true/false, short answer, applied case, and calculation questions',mcq:'multiple-choice only',tf:'true/false only',short:'short-answer only',case:'applied workplace case-study questions',calculation:'calculation and accounting-entry problems'}[type];
 const diffRule={mixed:'progressive: foundational, intermediate, advanced, with at least two applied higher-order questions',easy:'foundational',medium:'intermediate',hard:'advanced',professional:'professional certification / senior accountant level'}[difficulty];
 const examRule={skills:'accounting skill development',university:'university assessment',jobs:'accounting job interview and employment assessment',professional:'professional accounting exam preparation',practice:'workplace practice'}[exam];
 const fw={auto:'choose only standards/frameworks genuinely relevant to the topic',ifrs:'IFRS Accounting Standards',ias:'IAS/IFRS Accounting Standards',gaap:'US GAAP when relevant',audit:'ISA auditing standards when relevant',tax:'tax accounting; clearly state that tax rules depend on jurisdiction',cost:'cost accounting',management:'management accounting'}[framework];
 const instructions=`You are a senior accounting educator, assessment designer, and practicing-accounting subject matter expert. Create EXACTLY ${count} distinct, high-quality questions in ${lang}. Context: ${examRule}. Question design: ${typeRule}. Difficulty: ${diffRule}. Framework: ${fw}.\nThe user may provide a topic, idea, workplace scenario, or study material. Use established accounting knowledge. Never fabricate a paragraph number, standard requirement, tax rate, law, URL, or authority. If jurisdiction/date is required but absent, make the question jurisdiction-neutral or identify the assumption. Calculations must be internally consistent. Journal entries must balance. MCQs must have exactly 4 plausible options and one correct answer. Avoid duplicates, trivia, trick wording, and answer clues. Vary recall, application, analysis, calculation, judgment, error detection, journal entries, financial-statement impact, controls, and realistic workplace decisions where relevant.\nReturn ONLY a valid JSON object. The JSON object must have this exact shape: {"questions":[{"question":"...","choices":[],"answer":"...","explanation":"...","difficulty":"medium","type":"short","topic":"...","reference":"","learning_objective":"..."}]}. Do not output markdown or any text outside the JSON object.`;
 try{
  const input=`Create the requested accounting assessment from the following user material. Your response must be a valid JSON object only.\n\nUSER MATERIAL:\n${content}`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-luna',instructions,input,reasoning:{effort:'low'},text:{format:{type:'json_object'}},max_output_tokens:12000})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const msg=data?.error?.message||`OpenAI API error (${r.status})`;return res.status(r.status===401||r.status===403?503:502).json({error:`تعذر التوليد: ${msg}`});}
  const text=extractText(data);
  if(!text)return res.status(502).json({error:'لم يُرجع محرك الذكاء الاصطناعي نصًا. حاول مرة أخرى.'});
  let parsed;
  try{parsed=JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim())}catch{return res.status(502).json({error:'عاد المحرك بنتيجة غير قابلة للقراءة. حاول مرة أخرى.'})}
  if(!Array.isArray(parsed.questions))return res.status(502).json({error:'صيغة نتيجة الذكاء الاصطناعي غير صحيحة.'});
  const seen=new Set(),questions=[];
  for(const q of parsed.questions){if(!q||typeof q.question!=='string'||typeof q.answer!=='string')continue;const key=q.question.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,180);if(seen.has(key))continue;seen.add(key);questions.push({question:q.question.trim(),choices:Array.isArray(q.choices)?q.choices.slice(0,4).map(String):[],answer:String(q.answer).trim(),explanation:String(q.explanation||'').trim(),difficulty:['easy','medium','hard','professional'].includes(q.difficulty)?q.difficulty:'medium',type:['mcq','tf','short','case','calculation'].includes(q.type)?q.type:'short',topic:String(q.topic||'').trim(),reference:String(q.reference||'').trim(),learning_objective:String(q.learning_objective||'').trim()});if(questions.length===count)break;}
  if(questions.length<10)return res.status(502).json({error:`تم إنشاء ${questions.length} أسئلة صالحة فقط. أعد المحاولة لإكمال 10 أسئلة على الأقل.`});
  return res.status(200).json({questions,meta:{count:questions.length,framework,exam,model:'gpt-5.6-luna'}});
 }catch(e){return res.status(500).json({error:`حدث خطأ في الخادم: ${e?.message||'غير معروف'}`})}
}
