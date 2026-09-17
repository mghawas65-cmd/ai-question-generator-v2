const TYPES=new Set(['mixed','mcq','tf','short','case','calculation']);
const LEVELS=new Set(['mixed','easy','medium','hard','professional']);
const LANGS=new Set(['ar','en']);
const EXAMS=new Set(['skills','university','jobs','professional','practice']);
const FRAMEWORKS=new Set(['auto','ifrs','ias','gaap','audit','tax','cost','management']);
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
 const typeRule={mixed:'a deliberate mix of MCQ, true/false, short answer, applied case, and calculation questions',mcq:'multiple-choice only',tf:'true/false only',short:'short-answer only',case:'applied workplace case-study questions',calculation:'calculation and accounting-entry problems'}[type];
 const diffRule={mixed:'progressive: foundational, intermediate, advanced, with at least two applied higher-order questions',easy:'foundational',medium:'intermediate',hard:'advanced',professional:'professional certification / senior accountant level'}[difficulty];
 const examRule={skills:'accounting skill development',university:'university assessment',jobs:'accounting job interview and employment assessment',professional:'professional accounting exam preparation',practice:'workplace practice'}[exam];
 const fw={auto:'choose only standards/frameworks genuinely relevant to the topic',ifrs:'IFRS Accounting Standards',ias:'IAS/IFRS Accounting Standards',gaap:'US GAAP when relevant',audit:'ISA auditing standards when relevant',tax:'tax accounting; clearly state that tax rules depend on jurisdiction',cost:'cost accounting',management:'management accounting'}[framework];
 const instructions=`You are a senior accounting educator, assessment designer, and practicing-accounting subject matter expert. Create EXACTLY ${count} distinct, high-quality questions in ${lang}. Context: ${examRule}. Question design: ${typeRule}. Difficulty: ${diffRule}. Framework: ${fw}.
The user may provide a topic, idea, workplace scenario, or study material. When the input is a topic rather than source text, use established accounting knowledge. Never fabricate a paragraph number, standard requirement, tax rate, law, URL, or authority. If jurisdiction/date is required but absent, make the question jurisdiction-neutral or explicitly identify the assumption. For IFRS/IAS/ISA references, cite a standard number/title only when confident; otherwise use an empty reference. Distinguish accounting treatment from estimates/judgment. Calculations must be internally consistent and recomputed before output. Journal entries must balance. MCQs must have exactly 4 plausible options and one unambiguously correct answer. Avoid duplicate concepts, cosmetic rewordings, trivia, trick wording, and answer clues. Across a mixed set, vary recall, application, analysis, calculation, judgment, error detection, journal entries, financial-statement impact, controls, and realistic workplace decisions where relevant. Make scenarios realistic and educational, not merely verbose.
Return JSON only: {"questions":[...]}. Every item: question, choices (array; empty unless MCQ/TF), answer, explanation, difficulty (easy|medium|hard|professional), type (mcq|tf|short|case|calculation), topic, reference, learning_objective. Explanations must teach why the answer is correct and, for MCQ where useful, why alternatives fail. Do not claim a source was checked live.`;
 try{
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-luna',instructions,input:content,max_output_tokens:18000})});
  const data=await r.json(); if(!r.ok)return res.status(r.status>=500?502:r.status).json({error:data?.error?.message||'تعذر الاتصال بمحرك الذكاء الاصطناعي.'});
  const text=data.output_text||(data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
  const clean=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim(); let parsed;
  try{parsed=JSON.parse(clean)}catch{return res.status(502).json({error:'عاد المحرك بنتيجة غير مكتملة. أعد المحاولة.'})}
  if(!Array.isArray(parsed.questions))return res.status(502).json({error:'صيغة نتيجة الذكاء الاصطناعي غير صحيحة.'});
  const seen=new Set(),questions=[];
  for(const q of parsed.questions){if(!q||typeof q.question!=='string'||typeof q.answer!=='string')continue;const key=q.question.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,180);if(seen.has(key))continue;seen.add(key);questions.push({question:q.question.trim(),choices:Array.isArray(q.choices)?q.choices.slice(0,4).map(String):[],answer:String(q.answer).trim(),explanation:String(q.explanation||'').trim(),difficulty:['easy','medium','hard','professional'].includes(q.difficulty)?q.difficulty:'medium',type:['mcq','tf','short','case','calculation'].includes(q.type)?q.type:'short',topic:String(q.topic||'').trim(),reference:String(q.reference||'').trim(),learning_objective:String(q.learning_objective||'').trim()});if(questions.length===count)break}
  if(questions.length<10)return res.status(502).json({error:'لم ينتج المحرك 10 أسئلة فريدة على الأقل. أعد المحاولة لتحسين الجودة.'});
  return res.status(200).json({questions,meta:{count:questions.length,framework,exam}});
 }catch(e){return res.status(500).json({error:'حدث خطأ أثناء إنشاء الأسئلة. حاول مرة أخرى.'})}
}
