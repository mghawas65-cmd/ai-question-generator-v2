export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { content, type='mixed', difficulty='mixed', count=10, language='ar' } = req.body || {};
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'أدخل محتوى الدرس.' });
  if (content.length > 30000) return res.status(400).json({ error: 'المحتوى طويل جدًا. الحد 30,000 حرف.' });
  const n = Math.max(1, Math.min(30, Number(count) || 10));
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'يلزم إضافة OPENAI_API_KEY في إعدادات الاستضافة.' });
  const instructions = `أنت خبير قياس وتقويم تعليمي. أنشئ أسئلة دقيقة مبنية فقط على المحتوى المرسل. اللغة: ${language==='en'?'English':'العربية'}. النوع: ${type}. الصعوبة: ${difficulty}. العدد: ${n}. تجنب الغموض والتكرار. للاختيار من متعدد قدم 4 خيارات مع إجابة واحدة صحيحة. أعد JSON فقط بالشكل {"questions":[{"question":"...","choices":["..."],"answer":"...","explanation":"...","difficulty":"easy|medium|hard","type":"mcq|tf|short"}]}`;
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-5.6-luna',instructions,input:content,max_output_tokens:12000})});
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'تعذر الاتصال بمحرك الذكاء الاصطناعي.' });
    const text = data.output_text || (data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
    const clean = text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.questions)) throw new Error('Invalid response');
    return res.status(200).json({ questions: parsed.questions.slice(0,n) });
  } catch (e) { return res.status(500).json({ error: 'تعذر إنشاء الأسئلة. حاول مرة أخرى.' }); }
}
