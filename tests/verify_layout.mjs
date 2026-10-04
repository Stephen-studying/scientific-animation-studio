/** Full-timeline collision regression plus enlarged boundary previews. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const args={};for(let i=2;i<process.argv.length;i+=2) args[process.argv[i].slice(2)]=process.argv[i+1];
const {chromium}=createRequire(import.meta.url)(path.resolve(args.playwright));
const browser=await chromium.launch({headless:true,executablePath:args.browser});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1.5});
  await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  await page.goto(pathToFileURL(path.resolve(args.html)).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>window.ScientificAnimation.exportMode());
  const dir=path.resolve(args.output);fs.mkdirSync(dir,{recursive:true});
  const result=await page.evaluate(()=>{
    const api=window.ScientificAnimation, failures=[];
    const count=Math.ceil(api.spec.duration*24);
    for(let i=0;i<=count;i++) {
      api.renderAt(i/24);
      const problems=api.inspect().problems;
      if(problems.length) failures.push({time:i/24,problems});
    }
    return {frames_checked:count+1,failures};
  });
  for(const t of [0,1.9,2.1,4.9,5.1,7.9,8.1,10,11.95]) {
    await page.evaluate(t=>window.ScientificAnimation.renderAt(t),t);
    await page.locator('#stage').screenshot({path:path.join(dir,`frame-${t}.png`)});
  }
  await page.evaluate(()=>window.ScientificAnimation.renderAt(10));
  await page.screenshot({path:path.join(dir,'left-edge.png'),clip:{x:160,y:283,width:230,height:196}});
  await page.screenshot({path:path.join(dir,'right-edge.png'),clip:{x:897,y:283,width:230,height:196}});
  // Prove inspection detects the bug class; static labels and moving geometry.
  const injected=await page.evaluate(()=>{
    const api=window.ScientificAnimation;
    const moving=document.querySelector('[data-id="vapor-0-0"]');
    moving.setAttribute('transform','translate(640 342)');moving.setAttribute('opacity','1');
    const caught=api.inspect().problems.some(p=>p.issue==='motion_label_overlap');
    api.renderAt(10);
    const a=document.querySelector('[data-id="liquid-0"]'),b=document.querySelector('[data-id="liquid-1"]');
    b.setAttribute('transform',a.getAttribute('transform'));a.setAttribute('opacity','1');b.setAttribute('opacity','1');
    const particles=api.inspect().problems.some(p=>p.issue==='guarded_overlap');
    api.renderAt(10);
    return {motion_label_collision_detected:caught,particle_collision_detected:particles};
  });
  Object.assign(result,injected);
  fs.writeFileSync(path.join(dir,'layout-report.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  assert.equal(result.failures.length,0);
  assert.ok(injected.motion_label_collision_detected && injected.particle_collision_detected);
} finally {await browser.close();}
