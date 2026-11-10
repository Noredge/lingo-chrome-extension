import {useVisibleTrigger} from './visible-trigger.mjs';
import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'lingo-writing-')),ext=path.join(temp,'extension'),evidence=path.resolve('../evidence/writing-settings');
await mkdir(evidence,{recursive:true});await cp('dist',ext,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions.push('http://127.0.0.1/*','http://localhost/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<style>body{padding:60px;font:20px Arial}textarea{width:500px;height:180px;font:24px/36px Arial;padding:15px}</style><textarea id="editor">I has a plan.</textarea>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,legacy=origin.replace('127.0.0.1','localhost');
let ctx,worker,settings,held=false,release;const checks=[],calls=[],errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const end=Date.now()+12000;while(!await fn()){if(Date.now()>end)throw Error('Timed out');await pause(40);}};
const check=name=>{checks.push(name);console.log('PASS',name)};
const message=data=>settings.evaluate(data=>chrome.runtime.sendMessage(data),data);
const state=()=>message({type:'inlineSettings'});
const change=async action=>{const s=await state();const result=await message({type:'inlineSettingsAction',revision:s.defaults.revision,...action});assert(!result.error,result.error);return result;};
async function boot(){
 ctx=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',locale:'zh-CN',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1280,height:960}});
 ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await ctx.route('https://api.openai.com/v1/responses',async route=>{
  calls.push(route.request().postDataJSON());if(held)await new Promise(r=>release=r);
  const text=JSON.stringify({issues:[{source:'has',replacement:'have',before:'',after:'',kind:'grammar',reason:'Use have with I.'}]});
  await route.fulfill({contentType:'text/event-stream',body:[{type:'response.output_text.delta',delta:text},{type:'response.completed',response:{status:'completed'}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')}).catch(()=>{});
 });
 worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');await useVisibleTrigger(worker);settings=await ctx.newPage();await settings.goto(`chrome-extension://${worker.url().split('/')[2]}/options.html#writing`);
}
async function saveDefaults(auto,style){
 await settings.locator('#global-auto').setChecked(auto);await settings.locator('#global-style').setChecked(style);await settings.locator('#save-writing').click();
 await until(async()=>{const s=await state();return s.defaults.autoCheck===auto&&s.defaults.includeStyle===style});
 await settings.locator('#save-writing:disabled').waitFor();
}
const add=async(name,instruction)=>{await settings.locator('.add-preset').click();await settings.locator('.preset-name').fill(name);await settings.locator('.preset-instruction').fill(instruction);await settings.locator('.preset-form button[type=submit]').click();await settings.locator('.preset-form').waitFor({state:'hidden'});};
try{
 await boot();await message({type:'completeOnboarding'});await worker.evaluate(origin=>chrome.storage.local.set({['inlineCheck:'+origin]:{autoCheck:false,includeStyle:true}}),legacy);await settings.reload();
 await settings.locator('#writing-controls:not(:disabled)').waitFor();assert(await settings.locator('#settings-writing').isVisible());assert(!await settings.locator('#settings-general').isVisible());assert(!await settings.locator('#global-auto').isChecked());
 assert(await settings.locator('#save-writing').isDisabled());assert.equal(await settings.locator('#writing-form button').count(),1);assert.deepEqual((await state()).sites,[{origin:legacy,autoCheck:false,includeStyle:true}]);assert.equal(calls.length,0);check('writing tab deep link loads safely; global checks default off and legacy site preferences survive');
 await add('邮件更委婉','Preserve meaning and make the tone polite.');await add('仅改语法','Only fix grammar.');
 await settings.locator('.preset-row').nth(1).getByRole('button',{name:'上移预设',exact:true}).click();await settings.locator('.preset-status').filter({hasText:'顺序已保存'}).waitFor();
 await settings.locator('.preset-row').first().getByRole('button',{name:'编辑',exact:true}).click();await settings.locator('.preset-name').fill('语法校对');await settings.locator('.preset-form button[type=submit]').click();await settings.locator('.preset-form').waitFor({state:'hidden'});
 assert.equal((await message({type:'presetState'})).items[0].name,'语法校对');
 const sidebar=await ctx.newPage();await sidebar.goto(`chrome-extension://${worker.url().split('/')[2]}/sidepanel.html`);await sidebar.locator('.saved-presets button').filter({hasText:'语法校对'}).waitFor();await sidebar.close();
 await settings.locator('.preset-row').first().getByRole('button',{name:'删除预设',exact:true}).click();await settings.getByRole('button',{name:'确认删除',exact:true}).click();await until(async()=>(await message({type:'presetState'})).items.length===1);
 assert.equal(calls.length,0);assert.equal((await message({type:'config'})).hasKey,false);check('settings preset CRUD and ordering share the existing sidebar store and need no Key or API request');
 await settings.locator('.add-preset').click();await settings.locator('.preset-name').fill('未保存的预设');await settings.locator('.preset-instruction').fill('Keep this draft.');
 await settings.locator('#global-auto').check();await settings.locator('#tab-general').click();await settings.locator('#model').fill('unsaved-model-draft');await settings.locator('#tab-general').press('ArrowRight');
 assert(await settings.locator('#global-auto').isChecked());assert.equal(await settings.locator('.preset-instruction').inputValue(),'Keep this draft.');
 await settings.locator('#tab-writing').press('Home');assert.equal(await settings.locator('#model').inputValue(),'unsaved-model-draft');
 await settings.locator('#tab-general').press('End');await settings.locator('.cancel-preset').click();await settings.locator('#global-auto').uncheck();
 const config=await message({type:'config'});await settings.locator('#tab-general').click();await settings.locator('#model').fill(config.settings.model);await settings.locator('#tab-writing').click();
 check('accessible tab switching preserves service, global-checking and preset drafts');
 for(const [locale,label] of [['en','Writing & checking'],['zh-TW','寫作與檢查'],['zh-CN','写作与检查']]){
  await settings.locator('#ui-language').selectOption(locale);await settings.getByRole('tab',{name:label,exact:true}).waitFor();await pause(100);
  assert.equal(await settings.locator('.preset-row-name').textContent(),'邮件更委婉');
  if(locale==='en'){const untranslated=await settings.locator('#settings-writing').evaluate(e=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);const out=[];let n;while(n=w.nextNode())if(n.parentElement?.getClientRects().length&&!n.parentElement.closest('[translate=no]')&&/[\u3400-\u9fff]/.test(n.textContent))out.push(n.textContent.trim());return out;});assert.deepEqual(untranslated,[]);}
  await settings.setViewportSize({width:390,height:844});assert(await settings.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await settings.screenshot({path:path.join(evidence,`settings-${locale}-mobile.png`),fullPage:true});await settings.setViewportSize({width:1280,height:960});
 }
 await settings.evaluate(()=>scrollTo(0,0));await pause(200);await settings.screenshot({path:path.join(evidence,'settings-desktop.png'),fullPage:true});assert.equal(calls.length,0);check('three languages localize visible controls, preserve user preset text, and fit a 390px viewport');
 await settings.locator('#setup-restart').click();await settings.locator('#setup-dialog').waitFor();await settings.locator('#setup-close').click();assert(await settings.locator('#settings-writing').isVisible());await settings.locator('#tab-general').click();assert(await settings.locator('#settings-form').isVisible());await settings.locator('#tab-writing').click();check('replaying and closing onboarding returns to the selected settings tab with connection controls intact');
 const c=await message({type:'config'});assert(!(await message({type:'save',...c.settings,storageMode:'device',dataConsent:true,key:'fixture-writing-only-key'})).error);
 const permissionsBefore=await worker.evaluate(()=>chrome.permissions.getAll());const profileBefore=await message({type:'config'});
 const page=await ctx.newPage();await page.goto(origin);const editor=page.locator('#editor'),host=page.locator('#lingo-inline-root');await editor.focus();await host.locator('.trigger').waitFor();
 await saveDefaults(true,true);await pause(1500);assert.equal(calls.length,0);assert.deepEqual(await worker.evaluate(()=>chrome.permissions.getAll()),permissionsBefore);assert.deepEqual((await message({type:'config'})).settings,profileBefore.settings);check('saving global defaults broadcasts passively without API usage, permission grants or service changes');
 await editor.pressSequentially(' Today.');await until(()=>calls.length===1);await host.locator('.mark').waitFor();assert(!await host.locator('.popover').isVisible());assert(await editor.evaluate(e=>document.activeElement===e));
 await host.locator('.trigger').click();assert(await host.locator('.auto-check').isChecked());assert(await host.locator('.include-style').isChecked());assert(!await host.locator('.follow-defaults').isVisible());await host.locator('.close').click();check('a website without an override inherits both global options and checks real typing without opening a card');
 const other=await ctx.newPage();await other.goto(legacy);await other.locator('#editor').focus();await other.locator('#editor').pressSequentially(' Legacy.');await pause(1500);assert.equal(calls.length,1);check('an existing explicit site-off preference overrides global automatic checking');
 const row=()=>settings.locator('.override-row').filter({hasText:legacy});await row().getByRole('button',{name:'跟随全局设置',exact:true}).click();await until(async()=>(await state()).sites.length===0);await pause(1500);assert.equal(calls.length,1);
 await other.locator('#editor').pressSequentially(' Again.');await until(()=>calls.length===2);await other.locator('#lingo-inline-root .mark').waitFor();await other.close();check('removing an exception restores inheritance on the next real edit, without an immediate request');
 await settings.locator('#override-origin').fill(origin+'/draft');await settings.getByRole('button',{name:'添加关闭例外',exact:true}).click();await until(async()=>(await state()).sites.some(s=>s.origin===origin));
 await editor.pressSequentially(' Disabled.');await pause(4300);assert.equal(calls.length,2);
 await host.locator('.trigger').click();await host.locator('.follow-defaults').waitFor();assert(!await host.locator('.auto-check').isChecked());await host.locator('.follow-defaults').click();await until(async()=>(await state()).sites.length===0);await until(()=>calls.length===3);await host.locator('.trigger[aria-busy=false]').waitFor();await host.locator('.close').click();check('adding an off exception normalizes the origin; the inline controls can return the website to global defaults');
 let count=calls.length;await editor.pressSequentially(' Pending.');await saveDefaults(false,true);await pause(4300);assert.equal(calls.length,count);check('disabling global checking cancels queued automatic work');
 await saveDefaults(true,true);held=true;await editor.pressSequentially(' In flight.');await until(()=>calls.length===count+1);const releaseOld=release;await saveDefaults(false,true);releaseOld();held=false;await pause(250);assert.equal(await host.locator('.mark').count(),0);check('disabling global checking cancels an in-flight inherited request and discards its late response');
 const fromContent=async data=>worker.evaluate(async({url,data})=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);return(await chrome.scripting.executeScript({target:{tabId:tab.id},func:data=>chrome.runtime.sendMessage(data),args:[data]}))[0].result;},{url:origin+'/',data});
 assert.match((await fromContent({type:'inlineSettingsAction',action:'defaults',revision:(await state()).defaults.revision,autoCheck:true,includeStyle:true})).error,/设置页/);
 const denied=await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);return(await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>new Promise(resolve=>{const port=chrome.runtime.connect({name:'lingo-check'});port.onMessage.addListener(m=>{if(m.type==='error'){resolve(m.error);port.disconnect();}});port.postMessage({type:'run',automatic:true,task:{id:'forged-auto',text:'I has a plan.',includeStyle:true,locale:'zh-CN'}});})}))[0].result;},origin+'/');assert.match(denied,/自动检查已关闭/);assert.equal(calls.length,count+1);check('webpage senders cannot change global settings and the backend rejects disabled automatic requests');
 await host.locator('.trigger').click();await host.locator('.auto-check').check();await host.locator('.auto-check:not(:disabled)').waitFor();await host.locator('.close').click();await until(()=>calls.length===count+2);await host.locator('.mark').waitFor();assert.equal((await state()).defaults.autoCheck,false);assert.equal((await state()).sites[0].autoCheck,true);check('explicit site-on remains available when the global default is off');
 await page.close();count=calls.length;
 // Preserve a dirty form while another options window changes the stored values.
 await settings.locator('#global-auto').check();await change({action:'defaults',autoCheck:true,includeStyle:false});await pause(150);assert(await settings.locator('#global-style').isChecked());await settings.locator('#save-writing').click();await settings.locator('#writing-status.error').filter({hasText:'其他窗口'}).waitFor();assert(await settings.locator('#global-style').isChecked());assert.equal((await state()).defaults.includeStyle,false);settings.once('dialog',dialog=>dialog.accept());await settings.reload();await settings.locator('#writing-controls:not(:disabled)').waitFor();assert(!await settings.locator('#global-style').isChecked());check('concurrent settings changes reject stale saves, retain the draft and recover after browser refresh');
 const before=await state();assert((await message({type:'inlineSettingsAction',action:'defaults',revision:before.defaults.revision,autoCheck:'yes',includeStyle:false})).error);assert.deepEqual(await state(),before);
 const race=await Promise.all([true,false].map(autoCheck=>message({type:'inlineSettingsAction',action:'defaults',revision:before.defaults.revision,autoCheck,includeStyle:false})));assert.equal(race.filter(r=>!r.error).length,1);assert.equal(race.filter(r=>r.error).length,1);check('invalid values and concurrent mutations cannot partially overwrite checking defaults');
 await change({action:'defaults',autoCheck:false,includeStyle:false});await change({action:'resetSite',origin});await until(async()=>!await settings.locator('#global-auto').isChecked()&&!await settings.locator('#global-style').isChecked());
 const stored=await worker.evaluate(()=>chrome.storage.local.get(['inlineCheckDefaults','rewritePresets']));assert(!JSON.stringify(stored).includes('I has'));assert.equal(calls.length,count);check('only preferences and user-authored presets persist; settings operations never submit draft text');
 await ctx.close();await boot();await settings.locator('#writing-controls:not(:disabled)').waitFor();assert(!await settings.locator('#global-auto').isChecked());assert.equal((await message({type:'presetState'})).items[0].name,'邮件更委婉');assert.deepEqual((await state()).sites,[]);assert((await message({type:'config'})).hasKey);assert.deepEqual(errors,[]);check('browser restart keeps defaults, removed exceptions, shared presets and the existing service configuration');
 await writeFile(path.join(evidence,'results.json'),JSON.stringify({version:manifest.version_name,checks,pageErrors:errors,requests:calls.length,mockedAPI:true,permissions:'only isolated fixture origins; settings never requested additional grants'},null,2));
}catch(error){const target=ctx?.pages().find(p=>p.url()===origin+'/');if(target){await target.screenshot({path:path.join(evidence,'failure.png')});console.error('Inline state:',await target.locator('#lingo-inline-root').evaluate(el=>({text:el.shadowRoot?.textContent?.slice(-2500),active:el.shadowRoot?.activeElement?.outerHTML})));}throw error;}finally{release?.();await ctx?.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
