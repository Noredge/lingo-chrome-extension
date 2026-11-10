import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'lingo-inline-')),ext=path.join(temp,'extension'),evidence=path.resolve('../evidence/inline-idle');await mkdir(evidence,{recursive:true});
await cp('dist',ext,{recursive:true});const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><style>body{margin:50px;font:16px sans-serif}textarea{display:block;width:720px;height:170px;padding:16px;border:3px solid #aaa;line-height:28px;font:18px/28px Arial;margin-bottom:55px;resize:both}input{display:block;margin:25px 0;padding:10px;font:18px/28px Arial}#scroller{height:230px;width:500px;overflow:auto;border:3px solid #aaa}#scroller textarea{margin-top:90px}#tail{height:900px}</style><textarea id="a">I has a plan.\nShe go to school.</textarea><input id="b" value="He have a book."><input id="secret" type="password" value="never send"><textarea id="readonly" readonly>I has secrets.</textarea><div class="CodeMirror"><textarea id="framework">I has a plan.</textarea></div><div contenteditable id="rich">I has a plan.</div><div id="scroller"><textarea id="nested">I has a plan.</textarea><div style="height:400px"></div></div><div id="tail"></div>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const checks=[],errors=[],calls=[];let ctx,output,behavior='ok',release;
const item=(source,replacement,extra={})=>({source,replacement,before:'',after:'',reason:'仅修改语法。',kind:'grammar',...extra});
const check=name=>{checks.push(name);console.log('PASS',name)};
const sameBox=(actual,expected)=>{for(const key of ['x','y','width','height'])assert(Math.abs(actual[key]-expected[key])<1,`panel ${key} changed from ${expected[key]} to ${actual[key]}`);};
try{
 ctx=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',locale:'zh-CN',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1100,height:900}});
 await ctx.route('https://api.openai.com/v1/responses',async route=>{
  const body=route.request().postDataJSON();calls.push(body);const mode=behavior,text=typeof output==='string'?output:JSON.stringify({issues:output});
  if(mode==='held')await new Promise(r=>release=r);
  const events=[{type:'response.output_text.delta',delta:text}];if(mode!=='partial')events.push({type:'response.completed',response:{status:'completed'}});
  await route.fulfill({contentType:'text/event-stream',body:events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')}).catch(()=>{});
 });
 const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');
 const settings=await ctx.newPage();await settings.goto(`chrome-extension://${worker.url().split('/')[2]}/options.html`);
 const message=data=>settings.evaluate(data=>chrome.runtime.sendMessage(data),data);
 await message({type:'completeOnboarding'});const config=await message({type:'config'});
 const saved=await message({type:'save',...config.settings,uiLanguage:'zh-CN',storageMode:'session',dataConsent:true,key:'fixture-inline-only-key'});assert(!saved.error);
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 const host=page.locator('#lingo-inline-root'),a=page.locator('#a');
 const focus=async(id='a')=>{await page.locator('#'+id).focus();await host.locator('.trigger').waitFor();};
 const open=async()=>{if(!await host.locator('.popover').isVisible())await host.locator('.trigger').click();};
 const waitDone=()=>host.locator('.trigger[aria-busy=false]').waitFor();
 const run=async(items,text,id='a',showList=true)=>{behavior='ok';output=items;if(text!==undefined)await page.locator('#'+id).fill(text);await focus(id);await open();await host.locator('.run').click();await waitDone();if(showList)await open();};
 const select=async(index=0)=>{await open();await host.locator('.issue').nth(index).click();};
 const pause=ms=>page.waitForTimeout(ms);
 const moveAway=async()=>{await page.mouse.move(1050,25);await host.locator('.popover').waitFor({state:'hidden'});};
 const hover=async(index=0)=>{let r;for(let attempt=0;attempt<10&&!r;attempt++){r=await host.locator('.mark').nth(index).boundingBox();if(!r)await pause(20);}assert(r);await page.mouse.move(r.x+r.width/2,r.y-5);await host.locator('.detail').waitFor({state:'visible'});return r;};



 const cdp=await ctx.newCDPSession(page);await cdp.send('Performance.enable');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const sample=async label=>{await pause(300);const start=await metrics();await pause(3000);const end=await metrics();const result={label,seconds:3,layoutCount:end.LayoutCount-start.LayoutCount,recalcStyleCount:end.RecalcStyleCount-start.RecalcStyleCount,taskMilliseconds:Math.round((end.TaskDuration-start.TaskDuration)*1000),layoutMilliseconds:Math.round((end.LayoutDuration-start.LayoutDuration)*1000)};console.log(JSON.stringify(result));return result;};
 const results=[];
 const rich=page.locator('#rich');await rich.evaluate(e=>{e.innerHTML=Array.from({length:250},(_,i)=>`<p>Paragraph ${i}: I <b>have</b> a plan for tomorrow.</p>`).join('');e.style.cssText='width:700px;height:180px;overflow:auto'});await rich.scrollIntoViewIfNeeded();
 await page.locator('#readonly').focus();results.push(await sample('no active inline editor'));
 await rich.focus();await host.locator('.trigger').waitFor();results.push(await sample('rich editor focused; automatic off; zero diagnostics'));results.push(await sample('same editor remains idle'));
 await page.locator('#readonly').focus();results.push(await sample('editor blurred again'));
 assert.equal(calls.length,0);assert(results[1].recalcStyleCount<=2);assert(results[2].recalcStyleCount<=2);await writeFile(path.join(evidence,'performance.json'),JSON.stringify({version:manifest.version_name,paragraphs:250,results,mockedAPI:true,apiRequests:calls.length},null,2));
}catch(error){throw error;}finally{await ctx?.close();server.close();await rm(temp,{recursive:true,force:true});}
