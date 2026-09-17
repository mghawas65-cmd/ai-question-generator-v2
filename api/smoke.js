export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Method not allowed'});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return res.status(503).json({ok:false,stage:'env',error:'OPENAI_API_KEY missing'});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-5.6-luna',
        instructions:'You are an accounting assessment engine. Return ONLY a valid JSON object with exactly 10 concise Arabic accounting questions. Shape: {"questions":[{"question":"...","answer":"..."}]}.',
        input:'Generate exactly 10 distinct Arabic questions about IAS 16 property, plant and equipment. JSON only.',
        reasoning:{effort:'low'},
        text:{format:{type:'json_object'}},
        max_output_tokens:3500
      })
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return res.status(502).json({ok:false,stage:'openai',status:r.status,error:data?.error?.message||'OpenAI error'});
    const text=typeof data.output_text==='string'?data.output_text:(data.output||[]).flatMap(x=>x?.content||[]).map(c=>c?.text||'').join('');
    let parsed;try{parsed=JSON.parse(text)}catch{return res.status(502).json({ok:false,stage:'parse',error:'Invalid JSON'})}
    const count=Array.isArray(parsed.questions)?parsed.questions.filter(q=>q&&q.question&&q.answer).length:0;
    if(count<10) return res.status(502).json({ok:false,stage:'validate',count,error:'Fewer than 10 valid questions'});
    return res.status(200).json({ok:true,stage:'end_to_end',status:200,model:'gpt-5.6-luna',questions:count});
  }catch(e){
    return res.status(500).json({ok:false,stage:'exception',error:e?.name==='AbortError'?'timeout':String(e?.message||e)});
  }finally{clearTimeout(timer)}
}
