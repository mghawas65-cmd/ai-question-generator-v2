const TYPES=new Set(['mixed','mcq','tf','short','case','calculation']);
const LEVELS=new Set(['mixed','easy','medium','hard','professional']);
const LANGS=new Set(['ar','en']);
const EXAMS=new Set(['skills','university','jobs','professional','practice']);
const FRAMEWORKS=new Set(['auto','ifrs','ias','gaap','audit','tax','cost','management']);
const schema={type:'object',additionalProperties:false,properties:{questions:{type:'array',minItems:10,maxItems:30,items:{type:'object',additionalProperties:false,properties:{question:{type:'string'},choices:{type:'array',items:{type:'string'}},answer:{type:'string'},explanation:{type:'string'},difficulty:{type:'string',enum:['easy','medium','hard','professional']},type:{type:'string',enum:['mcq','tf','short','case','calculation']},topic:{type:'string'},reference:{type:'string'},learning_objective:{type:'string'}},required:['question','choices','answer','explanation','difficulty','type','topic','reference','learning_objective']}}},required:['questions']};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const b=req.body||{},content=typeof b.content==='string'?b.content.trim():'';
 const type=TYPES.has(b.type)?b.type:'mixed',difficulty=LEVELS.has(b.difficulty)?b.difficulty:'mixed',language=LANGS.has(b.language)?b.language:'ar',exam=EXAMS.has(b.exam)?b.exam:'skills',framework=FRAMEWORKS.has(b.framework)?b.framework:'auto';
 const count=Math.max(10,Math.min(30,Number(b.count)||10));
 if(content.length<8)return res.status(400).json({error:'اكتب موضوعًا أو حالة عملية أو فكرة محاسبية بتفصيل كافٍ.'});
 if(content.length>30000)return res.status(400).json({error:'المدخل طويل جدًا. الحد 30,000 حرف.'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'مفتاح OpenAI غير مفعّل في الاستضافة.'});
 const lang=language==='en'?'English':'Arabic';
 const typeRule={mixed:'balanced mix of MCQ, true/false, short answer, applied cases and calculations',mcq:'multiple-choice only',tf:'true/false only',short:'short-answer only',case:'applied workplace case studies',calculation:'calculations and journal-entry problems'}[type];
 const diffRule={mixed:'progress from foundational through advanced, including higher-order application',easy:'foundational',medium:'intermediate',hard:'advanced',professional:'professional certification / senior accountant'}[difficulty];
 const examRule={skills:'skill development',university:'university assessment',jobs:'job interview and employment assessment',professional:'professional exam preparation',practice:'real workplace practice'}[exam];
 const fw={auto:'select only genuinely relevant accounting standards/frameworks',ifrs:'IFRS Accounting Standards',ias:'IAS/IFRS Accounting Standards',gaap:'US GAAP',audit:'International Standards on Auditing (ISA)',tax:'tax accounting; identify jurisdiction assumptions and never invent rates',cost:'cost accounting',management:'management accounting'}[framework];
 const instructions=`You are a senior accounting educator, assessment designer and practicing accounting subject-matter expert. Create exactly ${count} DISTINCT questions in ${lang}. Purpose: ${examRule}. Format: ${typeRule}. Difficulty: ${diffRule}. Framework: ${fw}.
QUALITY RULES: Questions must test meaningful accounting knowledge, not trivia. Use realistic figures and workplace situations where useful. Avoid duplicate concepts and cosmetic rewording. Mixed sets should cover recognition, measurement, presentation/disclosure, journal entries, calculations, analysis, error detection, controls and professional judgment when relevant. Calculations must reconcile and journal entries must balance. MCQ items require exactly four plausible choices and one unambiguous answer. True/false items should use two choices. Other types use an empty choices array.
ACCURACY RULES: Never invent a standard paragraph, law, tax rate, URL or authority. Mention IFRS/IAS/ISA standard number/title only when confident. If jurisdiction or reporting date is essential but absent, state a neutral assumption. Separate requirements from judgment/estimates. Do not claim live verification. Explanations must teach the accounting reasoning, not merely repeat the answer. References may be blank if a precise authoritative reference is not confidently applicable.`;
 try{
  const payload={model:process.env.OPENAI_MODEL||'gpt-5.6-luna',instructions,input:content,max_output_tokens:20000,text:{format:{type:'json_schema',name:'accounting_question_set',strict:true,schema}}};
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json();
  if(!r.ok){const msg=data?.error?.message||'تعذر الاتصال بمحرك الذكاء الاصطناعي.';return res.status(r.status>=500?502:r.status).json({error:msg});}
  const text=data.output_text||(data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('');let parsed;
  try{parsed=JSON.parse(text)}catch{return res.status(502).json({error:'لم تكتمل نتيجة الذكاء الاصطناعي. حاول مرة أخرى.'})}
  const seen=new Set(),questions=[];
  for(const q of parsed.questions||[]){if(!q?.question||!q?.answer)continue;const key=q.question.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,180);if(seen.has(key))continue;seen.add(key);let choices=Array.isArray(q.choices)?q.choices.map(String):[];if(q.type==='mcq'&&choices.length!==4)continue;if(q.type==='tf'&&choices.length!==2)choices=language==='ar'?['صح','خطأ']:['True','False'];questions.push({...q,question:String(q.question).trim(),answer:String(q.answer).trim(),explanation:String(q.explanation||'').trim(),topic:String(q.topic||'').trim(),reference:String(q.reference||'').trim(),learning_objective:String(q.learning_objective||'').trim(),choices});if(questions.length===count)break;}
  if(questions.length<10)return res.status(502).json({error:'لم ينتج المحرك 10 أسئلة سليمة وفريدة على الأقل. أعد المحاولة.'});
  return res.status(200).json({questions,meta:{count:questions.length,framework,exam,generatedAt:new Date().toISOString()}});
 }catch(e){console.error(e);return res.status(500).json({error:'حدث خطأ أثناء إنشاء الأسئلة. حاول مرة أخرى.'});}
}
