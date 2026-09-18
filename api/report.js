const reports=globalThis.__acctReports||(globalThis.__acctReports=[]);
function clean(v,max=2000){return String(v??'').replace(/[\u0000-\u001F]/g,' ').trim().slice(0,max)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const b=req.body||{}, questionId=clean(b.questionId,200), issue=clean(b.issue,1200), question=clean(b.question,1200), reference=clean(b.reference,500);
  if(!issue||issue.length<4)return res.status(400).json({ok:false,error:'اكتب وصفًا مختصرًا للمشكلة.'});
  const ticket='AQ-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  const record={ticket,at:new Date().toISOString(),questionId,issue,question,reference};
  reports.unshift(record);if(reports.length>200)reports.length=200;
  console.warn('[ACCOUNTING_QUESTION_REPORT]',JSON.stringify(record));
  return res.status(200).json({ok:true,ticket,message:'تم استلام البلاغ وحفظ رقمه للمتابعة.'});
}