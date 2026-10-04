#!/usr/bin/env node
/** Deterministic local SVG capture -> validated H.264 MP4. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

function parseArgs(argv) {
  const allowed=new Set(['html','output','playwright','browser','ffmpeg','fps','preview-dir','scale']);
  const configPath=fileURLToPath(new URL('../.runtime/runtime.json',import.meta.url));
  const defaults=fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath,'utf8')) : {};
  const result={fps:'24',scale:'1',ffmpeg:defaults.ffmpeg || 'ffmpeg',playwright:defaults.playwright,browser:defaults.browser};
  for(let i=0;i<argv.length;i+=2) {
    const key=argv[i]?.replace(/^--/,'');
    if(!argv[i]?.startsWith('--') || !allowed.has(key) || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error('参数需要 --名称 值');
    result[key]=argv[i+1];
  }
  for(const key of ['html','output','ffmpeg']) if(!result[key]) throw new Error('缺少 --'+key);
  result.fps=Number(result.fps);
  if(!Number.isInteger(result.fps) || result.fps<5 || result.fps>60) throw new Error('fps 必须为 5–60 的整数');
  result.scale=Number(result.scale);
  if(!Number.isFinite(result.scale) || result.scale<1 || result.scale>3) throw new Error('scale 必须为 1–3');
  return result;
}

function findBrowser(explicit) {
  if(explicit) {
    if(!fs.existsSync(explicit)) throw new Error('浏览器不存在: '+explicit);
    return explicit;
  }
  const candidates=[
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe')
  ].filter(Boolean);
  return candidates.find(p=>fs.existsSync(p));
}

async function writeFrame(stream,buffer,done) {
  if(stream.destroyed) throw new Error('编码器输入已关闭');
  if(!stream.write(buffer)) {
    await Promise.race([once(stream,'drain'),done.then(result=>{throw new Error('编码器提前结束: '+JSON.stringify(result));})]);
  }
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  const html=path.resolve(args.html), output=path.resolve(args.output);
  const reportPath=output+'.report.json';
  if(!fs.existsSync(html) || path.extname(html).toLowerCase()!=='.html') throw new Error('需要存在的 .html 动画文件');
  if(path.extname(output).toLowerCase()!=='.mp4') throw new Error('输出必须为 .mp4');
  if(fs.existsSync(output) || fs.existsSync(reportPath)) throw new Error('输出或报告已存在，请换新文件名保留旧版本');
  const version=spawnSync(args.ffmpeg,['-version'],{encoding:'utf8',windowsHide:true});
  if(version.status!==0) throw new Error('FFmpeg 不可运行: '+(version.error?.message || version.stderr));
  const require=createRequire(import.meta.url);
  const privatePlaywright=fileURLToPath(new URL('../.runtime/node_modules/playwright',import.meta.url));
  const {chromium}=args.playwright ? require(path.resolve(args.playwright)) : fs.existsSync(privatePlaywright) ? require(privatePlaywright) : require('playwright');
  const browser=await chromium.launch({headless:true,executablePath:findBrowser(args.browser)});
  const temp=path.join(path.dirname(output),'.'+path.basename(output)+'.'+randomUUID()+'.tmp.mp4');
  let encoder=null, encoderDone=null, stderr='', streamError=null;
  try {
    const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:args.scale,reducedMotion:'reduce'});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith('file:') || url.startsWith('data:') || url.startsWith('about:')) return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(pathToFileURL(html).href,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.ScientificAnimation));
    await page.evaluate(()=>document.fonts.ready);
    const spec=await page.evaluate(()=>{
      const s=window.ScientificAnimation.spec;
      return {width:s.width,height:s.height,duration:s.duration,title:s.title};
    });
    if(!Number.isInteger(spec.width) || !Number.isInteger(spec.height) || spec.width%2 || spec.height%2) throw new Error('H.264 yuv420p 需要偶数画布尺寸');
    const outputWidth=spec.width*args.scale,outputHeight=spec.height*args.scale;
    if(!Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) || outputWidth%2 || outputHeight%2) throw new Error('放大后的输出尺寸必须为偶数整数');
    if(!Number.isFinite(spec.duration) || spec.duration<=0 || spec.duration>300) throw new Error('时长必须在 0–300 秒范围内');
    await page.setViewportSize({width:spec.width,height:spec.height});
    await page.evaluate(()=>window.ScientificAnimation.exportMode());
    const frames=Math.ceil(spec.duration*args.fps);
    const sampleTimes=[0,spec.duration/2,(frames-1)/args.fps];
    const inspection=[];
    for(const t of sampleTimes) {
      const result=await page.evaluate(time=>{
        window.ScientificAnimation.renderAt(time);
        return window.ScientificAnimation.inspect();
      },t);
      inspection.push({time:t,...result});
    }
    if(inspection.some(r=>r.problems.length)) throw new Error('关键帧版式检查失败: '+JSON.stringify(inspection));
    if(args['preview-dir']) {
      const dir=path.resolve(args['preview-dir']);
      const names=['start.png','middle.png','end.png'];
      fs.mkdirSync(dir,{recursive:true});
      for(let i=0;i<sampleTimes.length;i++) {
        const file=path.join(dir,names[i]);
        if(fs.existsSync(file)) throw new Error('预览文件已存在: '+file);
        await page.evaluate(t=>window.ScientificAnimation.renderAt(t),sampleTimes[i]);
        await page.locator('#stage').screenshot({path:file,animations:'disabled'});
      }
    }
    fs.mkdirSync(path.dirname(output),{recursive:true});
    const ffargs=['-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(args.fps),
      '-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',
      '-movflags','+faststart','-metadata','comment=Scientific mechanism illustration; not a numerical simulation',
      '-n',temp];
    encoder=spawn(args.ffmpeg,ffargs,{stdio:['pipe','ignore','pipe'],windowsHide:true});
    encoder.stdin.on('error',error=>{streamError=error;});
    encoder.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-16000);});
    encoderDone=new Promise(resolve=>{
      encoder.once('error',error=>resolve({code:null,error:error.message}));
      encoder.once('close',code=>resolve({code}));
    });
    const progressEvery=Math.max(1,args.fps*2);
    for(let index=0;index<frames;index++) {
      if(streamError) throw streamError;
      const frameProblems=await page.evaluate(t=>{window.ScientificAnimation.renderAt(t);return window.ScientificAnimation.inspect().problems;},index/args.fps);
      if(frameProblems.length) throw new Error('逐帧布局检查失败: '+JSON.stringify({frame:index,time:index/args.fps,problems:frameProblems}));
      const png=await page.locator('#stage').screenshot({type:'png',animations:'disabled',timeout:30000});
      await writeFrame(encoder.stdin,png,encoderDone);
      if((index+1)%progressEvery===0 || index+1===frames) console.error(JSON.stringify({captured:index+1,total:frames}));
    }
    encoder.stdin.end();
    const encoded=await encoderDone;
    if(encoded.code!==0 || !fs.existsSync(temp)) throw new Error('编码失败: '+(encoded.error || stderr));
    const decoded=spawnSync(args.ffmpeg,['-hide_banner','-v','error','-i',temp,'-map','0:v:0','-f','null','-','-progress','pipe:1'],
      {encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,timeout:120000});
    if(decoded.status!==0) throw new Error('视频解码验证失败: '+(decoded.stderr || decoded.error?.message));
    const decodedFrames=[...decoded.stdout.matchAll(/^frame=(\d+)\r?$/gm)].at(-1);
    if(!decodedFrames || Number(decodedFrames[1])!==frames) throw new Error('解码帧数与捕获帧数不一致');
    if(pageErrors.length) throw new Error('动画运行错误: '+pageErrors.join('; '));
    const report={output,title:spec.title,width:outputWidth,height:outputHeight,source_canvas:[spec.width,spec.height],render_scale:args.scale,fps:args.fps,
      source_duration:spec.duration,encoded_duration:frames/args.fps,frames,
      decoded_frames:Number(decodedFrames[1]),codec:'H.264',pixel_format:'yuv420p',
      decode_verified:true,html_source:html,keyframe_inspection:inspection,layout_frames_checked:frames,
      bytes:fs.statSync(temp).size,ffmpeg_version:version.stdout.split(/\r?\n/)[0]};
    // Never replace a concurrently created user's output.
    fs.copyFileSync(temp,output,fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2),'utf8');
    fs.unlinkSync(temp);
    console.log(JSON.stringify(report,null,2));
  } finally {
    if(encoder && encoder.exitCode===null) {
      encoder.kill();
      if(encoderDone) await encoderDone;
    }
    await browser.close();
    if(fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

main().catch(error=>{console.error(JSON.stringify({error:error.message}));process.exitCode=2;});
