/** Behavioral verification against a generated example in an actual browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const args={};
for(let i=2;i<process.argv.length;i+=2) args[process.argv[i].slice(2)]=process.argv[i+1];
const require=createRequire(import.meta.url);
const {chromium}=require(path.resolve(args.playwright));
const browser=await chromium.launch({headless:true,executablePath:args.browser});
const report={checks:[],network_requests:[]};
try {
  const context=await browser.newContext({viewport:{width:1280,height:940},deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(!url.startsWith('file:') && !url.startsWith('data:')) {report.network_requests.push(url);return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(args.html)).href);
  await page.waitForFunction(()=>window.ScientificAnimation);
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>window.ScientificAnimation.state().playing),false);
  report.checks.push('initially_paused');
  await page.locator('#play').click();
  await page.waitForTimeout(250);
  assert.ok((await page.evaluate(()=>window.ScientificAnimation.state())).current>0);
  await page.locator('#play').click();
  const paused=await page.evaluate(()=>window.ScientificAnimation.state());
  await page.waitForTimeout(200);
  assert.equal((await page.evaluate(()=>window.ScientificAnimation.state())).current,paused.current);
  report.checks.push('play_and_pause');
  await page.locator('#timeline').evaluate(el=>{el.value='9';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal((await page.evaluate(()=>window.ScientificAnimation.state())).current,9);
  assert.match(await page.locator('#stage').textContent(),/凝液沿毛细芯回流/);
  report.checks.push('scrub_updates_time_and_caption');
  await page.locator('#speed').selectOption('2');
  assert.equal((await page.evaluate(()=>window.ScientificAnimation.state())).speed,2);
  report.checks.push('speed_control');
  await page.locator('#reset').click();
  assert.equal((await page.evaluate(()=>window.ScientificAnimation.state())).current,0);
  report.checks.push('reset');
  const output=path.resolve(args.output);fs.mkdirSync(path.dirname(output),{recursive:true});
  const hashes=[];
  for(const t of [0,6,6,11.9]) {
    const inspection=await page.evaluate(time=>{window.ScientificAnimation.renderAt(time);return window.ScientificAnimation.inspect();},t);
    assert.deepEqual(inspection.problems,[]);
    const screenshot=await page.locator('#stage').screenshot({type:'png'});
    fs.writeFileSync(path.join(path.dirname(output),`determinism-${hashes.length}.png`),screenshot);
    hashes.push(createHash('sha256').update(screenshot).digest('hex'));
  }
  assert.equal(hashes[1],hashes[2]);
  assert.notEqual(hashes[0],hashes[1]);
  assert.notEqual(hashes[1],hashes[3]);
  report.checks.push('deterministic_time_capture_and_actual_motion');
  await page.evaluate(()=>window.ScientificAnimation.renderAt(9));
  await page.screenshot({path:path.join(path.dirname(output),'desktop-preview.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.locator('#mobileCaption').isVisible());
  assert.match(await page.locator('#mobileCaption').textContent(),/凝液沿毛细芯回流/);
  await page.locator('#zoom').click();
  assert.equal(await page.locator('.stage-box').evaluate(el=>el.scrollWidth>el.clientWidth),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#zoom').click();
  await page.screenshot({path:path.join(path.dirname(output),'mobile-preview.png'),fullPage:true});
  report.checks.push('390px_mobile_no_horizontal_overflow');
  report.checks.push('mobile_readable_caption_and_zoom');
  const escaped=fs.readFileSync(path.resolve(args.html),'utf8').replace(/(<script id="animation-data" type="application\/json">)([\s\S]*?)(<\/script>)/,
    (_,begin,data,end)=>{const spec=JSON.parse(data);spec.elements.find(e=>e.type==='text').text='</script><script>window.injected=true</script>';return begin+JSON.stringify(spec).replaceAll('<','\\u003c')+end;});
  await page.setContent(escaped,{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  report.checks.push('hostile_text_is_not_executed');
  assert.deepEqual(errors,[]);assert.deepEqual(report.network_requests,[]);
  report.checks.push('no_script_errors_or_network_dependency');
  fs.writeFileSync(output,JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
