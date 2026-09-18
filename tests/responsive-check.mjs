import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
const targets=[
  {name:'iphone-se',width:320,height:800},
  {name:'iphone',width:390,height:844},
  {name:'tablet',width:768,height:1024},
  {name:'desktop',width:1440,height:1000}
];
const failures=[];
for(const t of targets){
  const page=await browser.newPage({viewport:{width:t.width,height:t.height}});
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  if(overflow>2)failures.push(`${t.name}: horizontal overflow ${overflow}px`);
  const title=await page.locator('.brand b').textContent();
  if(!title?.includes('محفظة المحاسب'))failures.push(`${t.name}: brand missing`);
  if(t.width<=900){
    const menuVisible=await page.locator('#menu').isVisible();
    if(!menuVisible)failures.push(`${t.name}: mobile menu hidden`);
    await page.locator('#menu').click();
    if(!(await page.locator('#drawer').evaluate(el=>el.classList.contains('open'))))failures.push(`${t.name}: drawer did not open`);
    await page.locator('#drawer [data-go="generator"]').click();
  } else {
    await page.locator('.navlinks [data-go="generator"]').click();
  }
  for(const id of ['content','exam','type','difficulty','framework','jurisdiction','asOf','toolContext','count','lang','generate']){
    if(!(await page.locator('#'+id).isVisible()))failures.push(`${t.name}: #${id} not visible`);
  }
  const positions=await page.evaluate(()=>{const h=document.querySelector('.top').getBoundingClientRect(),hero=document.querySelector('#generator .hero').getBoundingClientRect();return {headerBottom:h.bottom,heroTop:hero.top}});
  if(positions.heroTop+2<positions.headerBottom)failures.push(`${t.name}: sticky header overlaps generator hero`);
  const genOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  if(genOverflow>2)failures.push(`${t.name}: generator overflow ${genOverflow}px`);
  await page.locator('#theme').click();
  if((await page.locator('html').getAttribute('data-theme'))!=='dark')failures.push(`${t.name}: dark mode toggle failed`);
  await page.screenshot({path:`artifacts/${t.name}.png`,fullPage:true});
  await page.close();
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('RESPONSIVE QA PASSED:',targets.map(x=>x.name).join(', '));
