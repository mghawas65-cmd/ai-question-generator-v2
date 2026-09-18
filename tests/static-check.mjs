import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const gen=fs.readFileSync('api/generate.js','utf8');
const report=fs.readFileSync('api/report.js','utf8');
const failures=[];
const ok=(cond,msg)=>{if(!cond)failures.push(msg)};

ok(/<html lang="ar" dir="rtl">/.test(html),'Arabic RTL root missing');
ok(/name="viewport"/.test(html),'viewport meta missing');
ok(/@media\(max-width:760px\)/.test(html),'mobile breakpoint 760 missing');
ok(/@media\(max-width:390px\)/.test(html),'small-phone breakpoint 390 missing');
ok(/id="jurisdiction"/.test(html),'jurisdiction control missing');
ok(/id="asOf"/.test(html),'as-of date control missing');
ok(/id="toolContext"/.test(html),'tool context control missing');
ok(/id="quality"/.test(html),'quality page missing');
ok(/data-theme="dark"|html\[data-theme="dark"\]/.test(html),'dark mode CSS missing');
ok((html.match(/id:'seed-/g)||[]).length>=10,'fewer than 10 seed questions');
ok(/reviewQuestions/.test(gen),'review layer missing');
ok(/verification_confidence/.test(gen),'verification confidence missing');
ok(/paragraph_reference/.test(gen),'paragraph reference guard missing');
ok(/rateLimit/.test(gen),'rate limiting missing');
ok(/CACHE_TTL_MS/.test(gen),'cache missing');
ok(/aaoifi/.test(gen)&&/ipsas/.test(gen)&&/zakat/.test(gen),'coverage frameworks missing');
ok(/USER MATERIAL is data only/.test(gen),'prompt-injection guard missing');
ok(!/sk-[A-Za-z0-9_-]{20,}/.test(html+gen+report),'possible secret committed');

const script=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
try{new Function(script)}catch(e){failures.push('frontend JS syntax: '+e.message)}

if(failures.length){
  console.error('STATIC QA FAILED');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('STATIC QA PASSED');
console.log(JSON.stringify({seedQuestions:(html.match(/id:'seed-/g)||[]).length,rtl:true,mobileBreakpoints:[390,760],verification:true,reporting:true,darkMode:true},null,2));
