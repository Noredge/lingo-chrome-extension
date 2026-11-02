import { chromium } from 'playwright';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'lingo-vault-')), extension=path.resolve('dist'), checks=[];
const fake='sk-test-fixture-not-a-real-secret',password='fixture-only password 2026';
let context,worker,options,id,requests=0;
const check=name=>{checks.push(name);console.log('PASS',name)};
async function boot(){
 context=await chromium.launchPersistentContext(temp,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 await context.route('https://api.openai.com/**',r=>{requests++;return r.abort();});
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');id=worker.url().split('/')[2];
 options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.getByRole('heading',{name:'设置你的 Lingo'}).waitFor();
}
const config=()=>options.evaluate(()=>chrome.runtime.sendMessage({type:'config'}));
const msg=data=>options.evaluate(data=>chrome.runtime.sendMessage(data),data);
const save=async(override={})=>{const c=await config();return msg({type:'save',key:'',...c.settings,remember:c.remember,dataConsent:c.dataConsent,...override})};
const stats=()=>worker.evaluate(async()=>{const l=await chrome.storage.local.get(null),s=await chrome.storage.session.get(null);return {plain:!!l.apiKey||typeof l.deviceKey==='string',vault:!!l.encryptedKey,session:!!s.apiKey,leak:JSON.stringify(l).includes('sk-test-fixture-not-a-real-secret')||JSON.stringify(l).includes('fixture-only password 2026')}});
try {
 await boot();assert.equal((await config()).storageMode,'device');assert.equal(await options.locator('#storage-mode').inputValue(),'device');check('fresh install defaults to device persistence without an unlock password');
 await worker.evaluate(async key=>{await chrome.storage.local.set({apiKey:key,settings:{model:'gpt-6-luna',language:'日本語',blockedHosts:[]}});await chrome.storage.session.clear()},fake);
 await context.close();await boot();
 let c=await config();assert(c.hasKey&&c.migrated&&!c.remember);assert.equal(c.settings.language,'日本語');assert.equal((await stats()).plain,false);check('legacy plaintext migrates to session and preserves old language before persistent deletion');
 const denied=await options.evaluate(()=>new Promise(resolve=>{const p=chrome.runtime.connect({name:'lingo-task'});p.onMessage.addListener(e=>{if(e.type==='error'){resolve(e.error);p.disconnect()}});p.postMessage({type:'run',task:{id:'consent',text:'A test sentence.',mode:'translate',language:'English'}})}));
 assert.match(denied,/确认/);assert.equal(requests,0);check('no API request before explicit data-processing consent');
 c=await save({remember:true,password,passwordConfirm:'different',dataConsent:true});assert.match(c.error,/不一致/);assert.equal((await stats()).session,true);assert.equal((await stats()).vault,false);check('invalid save preserves existing session key');
 c=await save({remember:true,password,passwordConfirm:password,dataConsent:true});assert(c.hasKey&&c.hasVault);assert.deepEqual(await stats(),{plain:false,vault:true,session:true,leak:false});check('encrypted persistent vault contains no plaintext key or password');
 await msg({type:'lock'});c=await config();assert(!c.hasKey&&c.hasVault);assert.equal((await stats()).session,false);check('lock clears session key while retaining encrypted vault');
 assert.match((await msg({type:'unlock',password:'incorrect password'})).error,/解锁失败/);assert.equal((await config()).hasKey,false);check('wrong password does not unlock vault');
 c=await save({model:'gpt-6-luna',language:'English',languages:['English'],remember:true,dataConsent:true});assert(!c.error&&!c.hasKey&&c.hasVault);check('language/settings can be saved while vault stays locked');
 await context.close();await boot();c=await config();assert(!c.hasKey&&c.hasVault);check('browser restart keeps vault locked and removes decrypted session key');
 c=await msg({type:'unlock',password});assert(c.hasKey);check('correct password unlocks after browser restart');
 c=await config();assert(!('apiKey' in c)&&!('vault' in c)&&!('encryptedKey' in c));check('public config never returns decrypted key, ciphertext, password or salt');
 c=await save({remember:false,dataConsent:true});assert(c.hasKey&&!c.hasVault);assert.deepEqual(await stats(),{plain:false,vault:false,session:true,leak:false});check('session-only mode removes the encrypted persistent copy');
 await msg({type:'deleteKey'});assert.deepEqual(await stats(),{plain:false,vault:false,session:false,leak:false});check('delete clears both credential stores');

 await options.reload();await options.locator('#storage-mode').selectOption('device');
 await options.getByLabel('API Key',{exact:true}).fill(fake);await options.getByRole('button',{name:'保存设置',exact:true}).click();
 await options.getByText('已记住 Key，本机自动加密，重启 Chrome 后无需解锁。',{exact:true}).waitFor();
 assert.equal(await options.getByLabel('API Key',{exact:true}).inputValue(),'');assert.deepEqual(await stats(),{plain:false,vault:false,session:true,leak:false});check('device mode saves through UI without password or extra checkbox and clears key input');
 await context.close();await boot();c=await config();assert(c.hasKey&&!c.hasVault&&c.storageMode==='device');assert.equal(await options.locator('#unlock-section').isVisible(),false);check('device key survives real browser restart without unlocking');
 const keyMetadata=()=>worker.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('lingo-device-vault',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('keys'),q=tx.objectStore('keys').get('aes');tx.oncomplete=()=>{const k=q.result;db.close();resolve(k?{type:k.type,algorithm:k.algorithm.name,length:k.algorithm.length,extractable:k.extractable}:null)};tx.onerror=()=>reject(tx.error)};r.onerror=()=>reject(r.error)}));
 assert.deepEqual(await keyMetadata(),{type:'secret',algorithm:'AES-GCM',length:256,extractable:false});check('device AES-256 key survives as a non-extractable CryptoKey in extension IndexedDB');
 const record=await worker.evaluate(async()=>(await chrome.storage.local.get('deviceKey')).deviceKey);
 await worker.evaluate(async record=>{await chrome.storage.local.set({deviceKey:{...record,ciphertext:(record.ciphertext[0]==='A'?'B':'A')+record.ciphertext.slice(1)}})},record);
 c=await config();assert(c.deviceError&&!c.hasKey);await worker.evaluate(record=>chrome.storage.local.set({deviceKey:record}),record);c=await config();assert(c.hasKey&&!c.deviceError);check('tampered device ciphertext fails closed and restores without leaking credentials');
 assert(!JSON.stringify(c).includes(fake)&&!('deviceKey' in c));check('device credentials are excluded from public config');
 assert.match((await msg({type:'lock'})).error,/免解锁/);assert((await config()).hasKey);check('device mode cannot misleadingly report a password lock');
 c=await save({storageMode:'encrypted',password:'short',passwordConfirm:'short'});assert(c.error);assert.equal((await config()).hasKey,true);assert.equal((await config()).storageMode,'device');check('failed encryption conversion preserves remembered key');
 c=await save({storageMode:'encrypted',password,passwordConfirm:password});assert(c.hasVault&&c.hasKey);assert.deepEqual(await stats(),{plain:false,vault:true,session:true,leak:false});assert.equal(await keyMetadata(),null);check('switching device to password encryption removes automatic device key');
 await msg({type:'lock'});c=await save({storageMode:'device',deviceConsent:true});assert.match(c.error,/先解锁/);assert((await config()).hasVault);check('locked vault is preserved until user unlocks or supplies replacement key');
 await msg({type:'unlock',password});c=await save({storageMode:'device',deviceConsent:true});assert(c.hasKey&&!c.hasVault);check('unlocked encrypted key can switch to device mode without retyping key');
 c=await save({storageMode:'session'});assert(c.hasKey&&!c.hasVault);assert.deepEqual(await stats(),{plain:false,vault:false,session:true,leak:false});
 await context.close();await boot();c=await config();assert(!c.hasKey&&c.storageMode==='session');check('session mode removes persistent copies and remains selected after restart');
 c=await save({storageMode:'device',deviceConsent:true,key:fake});assert(c.hasKey);await msg({type:'deleteKey'});await context.close();await boot();c=await config();assert(!c.hasKey&&!c.hasVault);assert.deepEqual(await stats(),{plain:false,vault:false,session:false,leak:false});assert.equal(await keyMetadata(),null);check('deleting device credentials also deletes the automatic decryption key across restart');
 await mkdir('../evidence',{recursive:true});await writeFile('../evidence/security-results.json',JSON.stringify({checks,apiRequests:requests,fixtureOnly:true},null,2));
} finally {await context?.close();await rm(temp,{recursive:true,force:true})}
