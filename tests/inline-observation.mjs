import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'lingo-inline-')),ext=path.join(temp,'extension'),evidence=path.resolve('../evidence/inline-observation');await mkdir(evidence,{recursive:true});
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


 const rich=page.locator('#rich');const html='<p>I <b>has</b> a plan.</p><p>She <i>go</i> to school.</p>',repairs=[item('has','have'),item('go','goes')];
 await rich.evaluate((e,html)=>{e.innerHTML=html;e.style.cssText='width:700px;height:180px;overflow:auto;font:18px/28px Arial;border:2px solid #aaa'},html);await rich.scrollIntoViewIfNeeded();await run(repairs,undefined,'rich',false);await pause(500);
 await page.evaluate(()=>{window.markWrites=0;window.probe=new MutationObserver(()=>window.markWrites++);window.probe.observe(document.querySelector('#lingo-inline-root').shadowRoot.querySelector('.marks'),{childList:true,subtree:true,attributes:true})});await pause(1400);assert.equal(await page.evaluate(()=>window.markWrites),0);assert.equal(await host.locator('.mark').count(),2);check('unchanged rich-text suggestions stay visible without periodic overlay rewrites');
 const original=await host.locator('.mark').first().boundingBox();await page.addStyleTag({content:'#rich b {font-size:32px}'});await pause(100);const enlarged=await host.locator('.mark').first().boundingBox();assert(enlarged.width>original.width);assert.equal(await rich.innerHTML(),html);assert.equal(await host.locator('.issue').count(),2);check('stylesheet changes refresh descendant word geometry without editing source or losing valid suggestions');
 const rect=await host.locator('.mark').first().boundingBox();await page.evaluate(r=>{const cover=document.createElement('div');cover.id='foreign-overlay';cover.style.cssText=`position:fixed;left:${r.x}px;top:${r.y-24}px;width:${r.width}px;height:28px;z-index:2147483647`;const shadow=cover.attachShadow({mode:'open'});shadow.innerHTML='<span style="display:block;width:100%;height:100%;background:white"></span>';document.body.append(cover)},rect);await pause(450);assert.equal(await host.locator('.mark').count(),1);await page.locator('#foreign-overlay').evaluate(e=>e.remove());await page.waitForFunction(()=>document.querySelector('#lingo-inline-root').shadowRoot.querySelectorAll('.mark').length===2,{},{timeout:1500});check('a small foreign shadow overlay hides only its covered mark and the mark returns after removal');
 await page.addStyleTag({content:'#rich b {display:none}'});await pause(100);assert.equal(await host.locator('.mark').count(),0);assert.equal(await host.locator('.issue').count(),0);assert.equal(await rich.innerHTML(),html);check('CSS-hidden source words invalidate stale diagnostics even without an editor DOM mutation');
 await page.locator('#b').focus();await rich.evaluate(e=>{e.innerHTML='<p>I <strong>has</strong> a plan.</p>'});await run([item('has','have')],undefined,'rich',false);await rich.locator('strong').evaluate(e=>e.textContent='have');await pause(50);assert.equal(await host.locator('.mark').count(),0);assert.equal(await host.locator('.issue').count(),0);check('silent rich-text content changes still clear suggestions immediately');
 await run([item('has','have')],'I has a plan.','a',false);await a.evaluate(e=>e.value='Changed silently.');await pause(450);assert.equal(await host.locator('.mark').count(),0);assert.equal(await host.locator('.issue').count(),0);check('plain input value setters still invalidate without relying on DOM mutation events');
 assert.deepEqual(errors,[]);check('no uncaught page errors');await writeFile(path.join(evidence,'results.json'),JSON.stringify({version:manifest.version_name,checks,errors,mockedAPI:true,actualChrome:false},null,2));
}finally{await ctx?.close();server.close();await rm(temp,{recursive:true,force:true});}
