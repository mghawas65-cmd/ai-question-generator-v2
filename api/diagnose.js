export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Method not allowed'});
  const hasKey=!!process.env.OPENAI_API_KEY;
  if(!hasKey) return res.status(200).json({ok:false,stage:'env',hasKey:false,message:'OPENAI_API_KEY is missing'});
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5.6-luna',input:'Reply with the single word OK.',max_output_tokens:20})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      return res.status(200).json({ok:false,stage:'openai',status:r.status,type:data?.error?.type||null,code:data?.error?.code||null,message:data?.error?.message||`OpenAI API error ${r.status}`});
    }
    return res.status(200).json({ok:true,stage:'openai',status:r.status,model:'gpt-5.6-luna'});
  }catch(e){
    return res.status(200).json({ok:false,stage:'network',message:e?.message||'Unknown network error'});
  }
}
