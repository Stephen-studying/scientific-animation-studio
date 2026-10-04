#!/usr/bin/env node
/** Full-timeline layout audit and cue-boundary previews for any scene. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const configPath=fileURLToPath(new URL('../.runtime/runtime.json',import.meta.url));
const defaults=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):{};
const args={fps:'24',scale:'1.5',playwright:defaults.playwright,browser:defaults.browser};
const allowed=new Set(['html','output','playwright','browser','fps','scale']);

async function main() {
  for(let i=2;i<process.argv.length;i+=2) {
    const key=process.argv[i].replace(/^--/,'');
    if(!allowed.has(key) || !process.argv[i+1]) throw new Error('参数需要 --名称 值');
    args[key]=process.argv[i+1];
  }
  if(!args.html || !args.output) throw new Error('需要 --html 与 --output（新检查目录）');
  const fps=Number(args.fps),scale=Number(args.scale);
  if(!Number.isInteger(fps)||fps<5||fps>60) throw new Error('fps 需要 5–60 的整数');
  if(!Number.isFinite(scale)||scale<1||scale>3) throw new Error('scale 需要 1–3');
  const html=path.resolve(args.html),dir=path.resolve(args.output);
  if(!fs.existsSync(html)) throw new Error('HTML 不存在');
  if(fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error('检查目录非空，请使用新目录保留原文件');
  const require=createRequire(import.meta.url);
  let playwright;
  if(args.playwright) playwright=require(path.resolve(args.playwright));
  else if(fs.existsSync(fileURLToPath(new URL('../.runtime/node_modules/playwright',import.meta.url)))) playwright=require(fileURLToPath(new URL('../.runtime/node_modules/playwright',import.meta.url)));
  else playwright=require('playwright');
  const browser=await playwright.chromium.launch({headless:true,...(args.browser?{executablePath:args.browser}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:scale,reducedMotion:'reduce'});
    const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>{
      const url=r.request().url();
      if(/^(file:|data:|about:)/.test(url)) return r.continue();
      requests.push(url);return r.abort();
    });
    await page.goto(pathToFileURL(html).href,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.ScientificAnimation));
    await page.evaluate(()=>document.fonts.ready);
    const spec=await page.evaluate(()=>{
      const {width,height,duration,title,cues}=window.ScientificAnimation.spec;
      return {width,height,duration,title,cues};
    });
    await page.setViewportSize({width:spec.width,height:spec.height});
    await page.evaluate(()=>window.ScientificAnimation.exportMode());
    const frames=Math.ceil(spec.duration*fps);
    const result=await page.evaluate(({frames,fps,duration})=>{
      const failures=[];
      for(let i=0;i<=frames;i++) {
        const time=Math.min(duration,i/fps);
        window.ScientificAnimation.renderAt(time);
        const problems=window.ScientificAnimation.inspect().problems;
        if(problems.length) failures.push({time,problems});
      }
      return {samples_checked:frames+1,failures};
    },{frames,fps,duration:spec.duration});
    const times=new Set([0,spec.duration/2,Math.max(0,spec.duration-1/fps)]);
    for(const cue of spec.cues.slice(1)) for(const offset of [-1/fps,0,1/fps]) times.add(Math.max(0,Math.min(spec.duration,cue.start+offset)));
    fs.mkdirSync(dir,{recursive:true});
    const previews=[];
    for(const time of [...times].sort((a,b)=>a-b)) {
      await page.evaluate(t=>window.ScientificAnimation.renderAt(t),time);
      const file=`frame-${time.toFixed(4)}.png`;
      await page.locator('#stage').screenshot({path:path.join(dir,file),animations:'disabled'});
      previews.push({time,file});
    }
    const report={html:path.basename(html),title:spec.title,canvas:[spec.width,spec.height],duration:spec.duration,fps,
      ...result,script_errors:errors,blocked_requests:requests,previews,
      visual_review_required:true,notes:'Bounding-box checks do not prove arbitrary shape containment, scientific correctness or visual quality.'};
    fs.writeFileSync(path.join(dir,'audit-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({samples_checked:report.samples_checked,failures:report.failures.length,previews:previews.length,script_errors:errors.length,blocked_requests:requests.length,report:path.join(dir,'audit-report.json')}));
    if(report.failures.length || errors.length || requests.length) process.exitCode=2;
  } finally {await browser.close();}
}
main().catch(e=>{console.error(JSON.stringify({error:e.message}));process.exitCode=2;});
