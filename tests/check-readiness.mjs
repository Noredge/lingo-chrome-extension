import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'lingo-inline-')),ext=path.join(temp,'extension'),evidence=path.resolve('../evidence/check-readiness');await mkdir(evidence,{recursive:true});
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


 const defaults=async autoCheck=>{const prefs=await message({type:'inlineSettings'});const result=await message({type:'inlineSettingsAction',action:'defaults',revision:prefs.defaults.revision,autoCheck,includeStyle:false});assert(!result.error)};
 const save=async extra=>{const c=await message({type:'config'});const result=await message({type:'save',...c.settings,storageMode:'session',dataConsent:true,key:'fixture-inline-only-key',...extra});assert(!result.error);return result;};
 const readyPage=async()=>{await page.reload();await focus();await open();await host.locator('.trigger').filter({hasNotText:'加载中'}).waitFor();await pause(100)};
 output=[];await message({type:'deleteKey'});await defaults(true);await readyPage();await pause(1400);assert.equal(await host.locator('.trigger').textContent(),'Lingo · 需设置');assert.match(await host.locator('.status').textContent(),/API Key/);assert(await host.locator('.run').isDisabled());assert(await host.locator('.auto-check').isChecked());assert.equal(await host.locator('.settings').textContent(),'配置检查服务');assert.equal(calls.length,0);await page.screenshot({path:path.join(evidence,'needs-setup.png')});check('missing credentials explain why checking is unavailable and preserve the enabled preference');
 await a.fill('I has another plan.');await pause(1400);assert.equal(calls.length,0);assert(await host.locator('.run').isDisabled());check('typing with unavailable service cannot submit automatically or enable manual checking');
 await save({dataConsent:false});await readyPage();await pause(1400);assert.equal(await host.locator('.trigger').textContent(),'Lingo · 需确认');assert.equal(await host.locator('.settings').textContent(),'确认数据说明');assert(await host.locator('.run').isDisabled());assert.equal(calls.length,0);check('a saved key without data consent has a distinct actionable state and sends nothing');
 await save({dataConsent:true});await readyPage();await pause(1500);await waitDone();assert.equal(await host.locator('.trigger').textContent(),'Lingo · 0');assert(!await host.locator('.run').isDisabled());assert.equal(await host.locator('.settings').textContent(),'打开设置');assert.equal(calls.length,1);check('fixing configuration restores automatic checks and clears the blocked notice');
 await defaults(false);await save({storageMode:'encrypted',password:'fixture-password-only-2026',passwordConfirm:'fixture-password-only-2026'});await message({type:'lock'});await defaults(true);await readyPage();const count=calls.length;await pause(1400);assert.equal(await host.locator('.trigger').textContent(),'Lingo · 已锁定');assert.match(await host.locator('.status').textContent(),/解锁密码/);assert.equal(await host.locator('.settings').textContent(),'解锁 Key');assert(await host.locator('.run').isDisabled());assert.equal(calls.length,count);check('a locked vault is distinguished from a missing key and does not silently pretend to check');
 await message({type:'unlock',password:'fixture-password-only-2026'});await readyPage();await pause(1500);await waitDone();assert.equal(await host.locator('.trigger').textContent(),'Lingo · 0');assert.equal(calls.length,count+1);check('unlocking restores the retained automatic preference without editing text');
 await defaults(false);await save({storageMode:'device'});await worker.evaluate(async()=>{const {serviceProfiles,activeServiceId}=await chrome.storage.local.get(null),p=serviceProfiles.find(p=>p.id===activeServiceId);p.deviceKey.ciphertext='broken';await chrome.storage.local.set({serviceProfiles});await chrome.storage.session.clear()});await defaults(true);await readyPage();const corruptedCalls=calls.length;await pause(1400);assert.match(await host.locator('.status').textContent(),/凭据无法读取/);assert(await host.locator('.run').isDisabled());assert.equal(calls.length,corruptedCalls);check('unreadable device credentials show recovery instructions without any request');
 await message({type:'deleteKey'});for(const [locale,label] of [['en','Lingo · Setup needed'],['zh-TW','Lingo · 需設定'],['zh-CN','Lingo · 需设置']]){await message({type:'setUiLanguage',uiLanguage:locale});await readyPage();await host.getByText(label,{exact:true}).waitFor();assert(!await host.locator('.popover').evaluate(e=>e.scrollWidth>e.clientWidth));}check('blocked states and actions localize in all three interface languages');
 assert.deepEqual(errors,[]);check('no uncaught page errors');await writeFile(path.join(evidence,'results.json'),JSON.stringify({version:manifest.version_name,checks,errors,mockedAPI:true,actualChrome:false},null,2));
}finally{await ctx?.close();server.close();await rm(temp,{recursive:true,force:true});}
