import {chromium} from 'playwright';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'lingo-review-')),checks=[],failures=[];
const fake='sk-test-fixture-not-a-real-secret',password='fixture-only password 2026';
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',locale:'zh-CN',headless:true,args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=worker.url().split('/')[2];
 const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.evaluate(()=>chrome.runtime.sendMessage({type:'completeOnboarding'}));await options.reload();
 const msg=data=>options.evaluate(data=>chrome.runtime.sendMessage(data),data);
 const settings={model:'gpt-6-luna',language:'English',languages:['English'],dataConsent:true};
 const save=(extra={})=>msg({type:'save',...settings,storageMode:'device',deviceConsent:true,...extra});
 const reset=async()=>{await worker.evaluate(async()=>{const {serviceProfiles}=await chrome.storage.local.get('serviceProfiles');const p={...serviceProfiles[0],storageMode:'device',dataConsent:false};delete p.deviceKey;delete p.encryptedKey;await chrome.storage.local.clear();await chrome.storage.local.set({serviceProfiles:[p],activeServiceId:p.id,onboardingComplete:true,writingIntroVersion:'1.1'});await chrome.storage.session.clear()});await options.reload();await options.getByRole('heading',{name:'设置你的 Lingo'}).waitFor()};
 const check=async(name,fn)=>{try{await reset();await fn();checks.push(name);console.log('PASS',name)}catch(e){failures.push({name,error:e.message});console.log('FAIL',name,e.message)}};
 await check('ordinary preferences save before entering any API key',async()=>{const c=await save();assert(!c.error,c.error);assert(!c.hasKey);assert.equal(c.settings.language,'English')});
 await check('locked encrypted key survives a session-only conversion attempt',async()=>{await save({key:fake,storageMode:'encrypted',password,passwordConfirm:password});await msg({type:'lock'});const c=await save({storageMode:'session'});assert.match(c.error||'',/先解锁/);assert((await msg({type:'config'})).hasVault)});
 await check('concurrent preference save does not overwrite an unpaused site',async()=>{
  await save({key:fake});await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,blockedHosts:['example.com']}});self.auditDeriveStarted=false;const original=crypto.subtle.deriveKey.bind(crypto.subtle);crypto.subtle.deriveKey=async(...args)=>{self.auditDeriveStarted=true;await new Promise(r=>setTimeout(r,150));return original(...args)}});
  const saving=save({storageMode:'encrypted',password,passwordConfirm:password});
  await worker.evaluate(()=>new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{if(self.auditDeriveStarted)return resolve();if(Date.now()-start>3000)return reject(new Error('encryption did not start'));setTimeout(poll,5)};poll()}));
  const unpause=msg({type:'unblock',host:'example.com'});await Promise.all([saving,unpause]);assert(!(await msg({type:'config'})).settings.blockedHosts.includes('example.com'));
 });
 await check('locking clears unsaved key and password inputs and restores masking',async()=>{
  await save({key:fake,storageMode:'encrypted',password,passwordConfirm:password});await options.reload();await options.locator('#key-status').filter({hasText:'Key 已配置'}).waitFor();
  await options.locator('#key-options').evaluate(el=>el.open=true);await options.locator('#api-key').fill(fake);await options.locator('#reveal').click();await options.locator('#vault-password').fill(password);await options.locator('#vault-confirm').fill(password);await options.locator('#lock-key').click();await options.locator('#key-status').filter({hasText:'Key 已锁定'}).waitFor();
  for(const selector of ['#api-key','#vault-password','#vault-confirm','#unlock-password'])assert.equal(await options.locator(selector).inputValue(),'');assert.equal(await options.locator('#api-key').getAttribute('type'),'password');
 });
 await check('corrupted automatic vault does not prevent revoking data consent',async()=>{
  await save({key:fake});await worker.evaluate(async()=>{const {serviceProfiles}=await chrome.storage.local.get('serviceProfiles');serviceProfiles[0].deviceKey={version:1,algorithm:'AES-GCM',iv:'AAAA',ciphertext:'AAAA'};await chrome.storage.local.set({serviceProfiles});await chrome.storage.session.clear()});
  const c=await save({dataConsent:false});assert(!c.error,c.error);assert(!c.dataConsent&&c.deviceError);assert(await worker.evaluate(async()=>!!(await chrome.storage.local.get('serviceProfiles')).serviceProfiles[0].deviceKey));
 });
 await check('deleting a profile clears all credential draft inputs',async()=>{
  await save({key:fake});await options.reload();await options.locator('#key-status').filter({hasText:'Key 已配置'}).waitFor();await options.locator('#key-options').evaluate(el=>el.open=true);await options.locator('#api-key').fill(fake);await options.locator('#reveal').click();
  options.once('dialog',d=>d.accept());await options.locator('#delete-profile').click();await options.getByText('尚未配置 Key',{exact:true}).waitFor();assert.equal(await options.locator('#api-key').inputValue(),'');assert.equal(await options.locator('#api-key').getAttribute('type'),'password');
 });
 await check('Enter in the unlock-password field unlocks rather than submitting settings',async()=>{
  await save({key:fake,storageMode:'encrypted',password,passwordConfirm:password});await msg({type:'lock'});await options.reload();await options.locator('#key-status').filter({hasText:'Key 已锁定'}).waitFor();
  await options.locator('#unlock-password').fill(password);await options.locator('#unlock-password').press('Enter');await options.locator('#key-status').filter({hasText:'Key 已配置'}).waitFor({timeout:3000});assert((await msg({type:'config'})).hasKey);
 });
 await mkdir('../evidence',{recursive:true});await writeFile('../evidence/review-results.json',JSON.stringify({extensionVersion:await worker.evaluate(()=>chrome.runtime.getManifest().version),checks,failures,fixtureOnly:true},null,2));
 if(failures.length)throw new Error(`${failures.length} review regressions failed`);
}finally{await context.close();await rm(profile,{recursive:true,force:true})}
