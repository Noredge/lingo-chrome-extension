import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'lingo-presets-')),ext=path.join(temp,'extension');
const evidence=path.resolve('../evidence/presets');await mkdir(evidence,{recursive:true});
await cp('dist',ext,{recursive:true});const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<textarea id="editor">Before. I has a plan. After.</textarea><p id="read">She go to work every day.</p>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
let ctx,worker,settings,release,held=false;const calls=[],checks=[],errors=[];
const check=n=>{checks.push(n);console.log('PASS',n)};
async function boot(){
 ctx=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',locale:'zh-CN',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1100,height:850}});
 await ctx.route('https://api.openai.com/v1/responses',async route=>{
  const input=JSON.parse(route.request().postDataJSON().input);calls.push(input);const holding=held;
  if(holding)await new Promise(r=>{release=r;});
  const text=input.source_text.replace('has','have').replace('She go','She goes');
  await route.fulfill({contentType:'text/event-stream',body:[{type:'response.output_text.delta',delta:text},{type:'response.completed',response:{status:'completed'}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')}).catch(()=>{});
 });
 worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');
 settings=await ctx.newPage();await settings.goto(`chrome-extension://${worker.url().split('/')[2]}/options.html#presets`);
}
const message=data=>settings.evaluate(data=>chrome.runtime.sendMessage(data),data);
const state=()=>message({type:'presetState'});
const done=host=>host.locator('.write-actions').getByRole('button',{name:'复制',exact:true}).waitFor();
async function add(manager,name,instruction){await manager.getByRole('button',{name:'新增预设',exact:true}).click();await manager.locator('.preset-name').fill(name);await manager.locator('.preset-instruction').fill(instruction);await manager.getByRole('button',{name:'保存预设',exact:true}).click();await manager.locator('.preset-form').waitFor({state:'hidden'});}
try{
 await boot();await settings.locator('#settings-writing:not([hidden])').waitFor();await settings.locator('#settings-presets .add-preset').waitFor();assert(await settings.locator('#setup-dialog').isHidden());assert.equal((await message({type:'config'})).onboardingComplete,false);check('direct preset link works before API setup without marking onboarding complete');await message({type:'completeOnboarding'});
 assert.deepEqual((await state()).items,[]);
 const sidebar=await ctx.newPage();sidebar.on('pageerror',e=>errors.push(e.message));await sidebar.goto(`chrome-extension://${worker.url().split('/')[2]}/sidepanel.html`);
 const side=sidebar.locator('#lingo-extension-root');await side.getByRole('button',{name:'管理预设',exact:true}).click();

 const manager=settings.locator('#settings-presets');await settings.waitForURL('**/options.html#presets');await settings.locator('#settings-writing:not([hidden])').waitFor();
 assert.equal(await side.locator('.preset-manager,.preset-form').count(),0);assert.equal(ctx.pages().filter(p=>p.url().includes('/options.html')).length,1);check('Manage presets reuses the settings page and the sidebar contains no manager or editing form');
 await add(manager,'邮件委婉','Make the tone polite without adding promises.');
 await add(manager,'校对','Only fix grammar; preserve wording.');
 assert.equal(calls.length,0);assert.equal((await message({type:'config'})).hasKey,false);
 check('presets can be created without a Key and never call the API');
 let saved=await state();const polite=saved.items[0].id,grammar=saved.items[1].id;
 await manager.locator(`[data-preset-id="${grammar}"]`).getByRole('button',{name:'上移预设',exact:true}).click();
 await manager.getByText('顺序已保存。',{exact:true}).waitFor();assert.deepEqual((await state()).items.map(p=>p.id),[grammar,polite]);
 await manager.locator(`[data-preset-id="${polite}"]`).getByRole('button',{name:'编辑',exact:true}).click();
 await manager.locator('.preset-name').fill('<b>邮件委婉</b>');await manager.locator('.preset-instruction').fill('Be polite. Preserve all facts.');
 await manager.getByRole('button',{name:'保存预设',exact:true}).click();await manager.locator('.preset-form').waitFor({state:'hidden'});
 await side.locator(`[data-preset="${polite}"]`).filter({hasText:'<b>邮件委婉</b>'}).waitFor();assert.equal((await state()).items[1].id,polite);assert.equal(await side.locator('.saved-presets b').count(),0);
 assert.equal(await side.locator(`[data-preset="${polite}"]`).textContent(),'<b>邮件委婉</b>');
 check('edit preserves identity, ordering persists, and names render as literal text');
 await manager.getByRole('button',{name:'新增预设',exact:true}).click();await manager.locator('.preset-name').fill('校对');await manager.locator('.preset-instruction').fill('Duplicate');
 await manager.getByRole('button',{name:'保存预设',exact:true}).click();await manager.getByText('已存在同名预设，请换一个名称。',{exact:true}).waitFor();
 assert.equal(await manager.locator('.preset-instruction').inputValue(),'Duplicate');assert.equal((await state()).items.length,2);
 await manager.getByRole('button',{name:'取消编辑',exact:true}).click();
 const rev=(await state()).revision;
 const race=await Promise.all(['Race A','Race B'].map(name=>message({type:'presetAction',action:'save',revision:rev,name,instruction:'Keep the meaning.'})));
 assert.equal(race.filter(x=>!x.error).length,1);assert.equal(race.filter(x=>x.error).length,1);
 check('duplicate names preserve draft; concurrent saves reject stale revision instead of overwriting');
 await manager.locator(`[data-preset-id="${grammar}"]`).getByRole('button',{name:'编辑',exact:true}).click();
 await manager.locator('.preset-instruction').fill('Unsaved instruction draft');
 saved=await state();await message({type:'presetAction',action:'save',revision:saved.revision,name:'From another window',instruction:'Make it shorter.'});
 await manager.getByRole('button',{name:'保存预设',exact:true}).click();await manager.getByText('预设已在其他窗口更新，请取消编辑后重试。',{exact:true}).waitFor();
 assert.equal(await manager.locator('.preset-instruction').inputValue(),'Unsaved instruction draft');await manager.getByRole('button',{name:'取消编辑',exact:true}).click();
 check('editing conflicts preserve unsaved text and expose a recoverable message');
 for(const [locale,label] of [['en','Manage presets'],['zh-TW','管理預設'],['zh-CN','管理预设']]){
  await message({type:'setUiLanguage',uiLanguage:locale});await side.getByRole('button',{name:label,exact:true}).waitFor();
  assert.equal(await side.locator(`[data-preset="${grammar}"]`).textContent(),'校对');
 }
 assert.equal(calls.length,0);check('preset controls localize in three languages without translating user names or sending text');
 await manager.locator('.add-preset').click();await manager.locator('.preset-name').fill('Keep my draft');await manager.locator('.preset-instruction').fill('Unsaved instructions');
 await settings.locator('#tab-general').click();const modelBefore=await settings.locator('#model').inputValue();await settings.locator('#model').fill('unsaved-model');await settings.evaluate(()=>window.presetNavigationSentinel=true);
 await side.getByRole('button',{name:'管理预设',exact:true}).click();await settings.locator('#settings-writing:not([hidden])').waitFor();assert.equal(await settings.evaluate(()=>window.presetNavigationSentinel),true);assert.equal(await manager.locator('.preset-name').inputValue(),'Keep my draft');assert.equal(await settings.locator('#model').inputValue(),'unsaved-model');assert.equal(calls.length,0);assert.equal(ctx.pages().filter(p=>p.url().includes('/options.html')).length,1);
 await settings.waitForFunction(()=>{const section=document.querySelector('#settings-presets').closest('.card'),rect=section.getBoundingClientRect();return document.activeElement===section && rect.top>=0 && rect.top<innerHeight;},null,{timeout:3000}).catch(async error=>{console.error('Preset navigation layout:',await settings.evaluate(()=>{const section=document.querySelector('#settings-presets').closest('.card');return {rect:section.getBoundingClientRect().toJSON(),active:document.activeElement.outerHTML.slice(0,200),scrollY,innerHeight,hash:location.hash};}));throw error;});
 await manager.locator('.cancel-preset').click();await settings.locator('#tab-general').click();await settings.locator('#model').fill(modelBefore);await side.getByRole('button',{name:'管理预设',exact:true}).click();await settings.locator('#settings-writing:not([hidden])').waitFor();check('repeated navigation preserves unsaved presets and connection fields, focuses the section and makes no API request');

 const c=await message({type:'config'});await message({type:'save',...c.settings,storageMode:'device',dataConsent:true,key:'fixture-preset-test-only-key'});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 const host=page.locator('#lingo-extension-root');
 const open=async()=>{
  await page.locator('#editor').focus();await page.locator('#editor').evaluate(el=>{el.setSelectionRange(8,21);el.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));});
  await host.locator('.launcher').click();await host.locator('.translate-actions').getByRole('button',{name:'复制',exact:true}).waitFor();
 };
 const close=()=>host.getByRole('button',{name:'关闭',exact:true}).click();
 await open();assert(await host.locator('.source-editor').isVisible());assert.equal(await host.locator('.source-editor').inputValue(),'I has a plan.');
 await host.locator(`[data-preset="${polite}"]`).waitFor();assert.equal(await host.locator('.saved-presets button').count(),(await state()).items.length);
 check('floating source opens expanded and editable; presets are shared with the sidebar');
 await host.locator('.source-editor').fill('I has a different plan.');
 assert.equal(await host.locator('.translate-actions button').count(),0);assert.equal(await page.locator('#editor').inputValue(),'Before. I has a plan. After.');
 await host.locator(`[data-preset="${polite}"]`).click();await done(host);
 assert.deepEqual(calls.at(-1),{source_text:'I has a different plan.',editing_request:'Be polite. Preserve all facts.'});
 assert.equal(await host.locator('.write-label').count(),0);assert.equal(await host.locator('[data-preset][aria-pressed=true]').textContent(),'<b>邮件委婉</b>');
 await host.getByRole('button',{name:'对比',exact:true}).click();
 assert.equal(await host.locator('.write-diff').evaluate(el=>Array.from(el.childNodes).filter(n=>n.nodeName!=='INS').map(n=>n.textContent).join('')),'I has a different plan.');
 await host.locator('.write-actions').getByRole('button',{name:'替换选中文字',exact:true}).click();
 assert.equal(await page.locator('#editor').inputValue(),'Before. I have a different plan. After.');
 await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');assert.equal(await page.locator('#editor').inputValue(),'Before. I has a plan. After.');await close();
 check('saved preset uses edited source; comparison, original-range replacement and native undo agree');
 await open();await host.locator('.source-editor').fill('I has a new translation source.');await host.locator('.source-submit').click();
 await host.locator('.translate-actions').getByRole('button',{name:'复制',exact:true}).waitFor();assert.equal(calls.at(-1).source_text,'I has a new translation source.');
 assert.equal(await host.locator('.translate-actions').getByRole('button',{name:'替换选中文字',exact:true}).isEnabled(),true);
 const invalidCalls=calls.length;
 for(const text of ['   ','x'.repeat(16001)]) {await host.locator('.source-editor').fill(text);assert(await host.locator('.source-submit').isDisabled());await host.locator(`[data-preset="${grammar}"]`).click();await host.getByRole('button',{name:'校对',exact:true}).first().click();}
 assert.equal(calls.length,invalidCalls);await close();
 check('explicit Translate uses edited source and retains target; blank/oversized source cannot run presets');
 await open();await host.getByRole('button',{name:'管理预设',exact:true}).click();await settings.waitForURL('**/options.html#presets');assert.equal(await host.locator('.preset-manager,.preset-form').count(),0);check('floating Manage presets uses the same settings destination without expanding a form');
 held=true;await host.locator(`[data-preset="${grammar}"]`).click();await host.locator('.write-actions').getByRole('button',{name:'停止',exact:true}).waitFor();
 for(let i=0;!release&&i<100;i++)await page.waitForTimeout(10);assert(release);
 const activeCalls=calls.length;await add(manager,'During request','Be concise.');
 assert.equal(calls.length,activeCalls);assert(await host.locator('.write-actions').getByRole('button',{name:'停止',exact:true}).isVisible());
 held=false;release();release=undefined;await done(host);
 await side.locator('.saved-presets').getByRole('button',{name:'During request',exact:true}).waitFor();
 check('managing unrelated presets does not start or interrupt API requests and updates other panels');
 await manager.locator(`[data-preset-id="${grammar}"]`).getByRole('button',{name:'编辑',exact:true}).click();await manager.locator('.preset-instruction').fill('Fix grammar without changing the tone.');
 await manager.getByRole('button',{name:'保存预设',exact:true}).click();await manager.locator('.preset-form').waitFor({state:'hidden'});
 assert.equal(await host.locator('.write-actions button').count(),0);
 await host.locator(`[data-preset="${grammar}"]`).click();await done(host);assert.equal(calls.at(-1).editing_request,'Fix grammar without changing the tone.');
 check('editing a preset discards its cached result and the next execution uses new instructions');
 await manager.locator(`[data-preset-id="${grammar}"]`).getByRole('button',{name:'删除预设',exact:true}).click();await manager.getByRole('button',{name:'取消',exact:true}).click();assert((await state()).items.some(p=>p.id===grammar));
 await manager.locator(`[data-preset-id="${grammar}"]`).getByRole('button',{name:'删除预设',exact:true}).click();await manager.getByRole('button',{name:'确认删除',exact:true}).click();
 await host.locator(`[data-preset="${grammar}"]`).waitFor({state:'detached'});await side.locator(`[data-preset="${grammar}"]`).waitFor({state:'detached'});
 assert.equal(await host.locator('.write-actions button').count(),0);check('deletion can be cancelled; confirmed deletion updates both surfaces and clears its result');
 await host.locator('.source-editor').fill('I has a layout preview.');await host.locator(`[data-preset="${polite}"]`).click();await done(host);await host.getByRole('button',{name:'对比',exact:true}).click();
 await close();
 await settings.setViewportSize({width:360,height:800});await manager.getByRole('button',{name:'新增预设',exact:true}).click();await manager.locator('.preset-name').fill('窄窗口');await manager.locator('.preset-instruction').fill('保留原意，缩短句子。');assert.equal(await settings.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await manager.locator('.cancel-preset').click();check('preset management fits a narrow settings page');
 await settings.close();const newSettings=ctx.waitForEvent('page');await side.getByRole('button',{name:'管理预设',exact:true}).click();settings=await newSettings;await settings.waitForURL('**/options.html#presets');await settings.locator('#settings-writing:not([hidden])').waitFor();await settings.locator('#settings-presets .add-preset').waitFor();assert(await settings.locator('#setup-dialog').isHidden());check('Manage presets opens a new settings tab at the section when none exists');
 saved=await state();assert(!JSON.stringify(saved).includes('I has a layout preview.'));
 const beforeRestart=calls.length;await ctx.close();ctx=null;await boot();assert.deepEqual(await state(),saved);assert.equal(calls.length,beforeRestart);
 check('saved presets survive browser restart without persisting source text');
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(path.join(evidence,'results.json'),JSON.stringify({checks,errors,mockedAPI:true},null,2));
}catch(e){throw e;}
finally{release?.();await ctx?.close();server.close();await rm(temp,{recursive:true,force:true});}
