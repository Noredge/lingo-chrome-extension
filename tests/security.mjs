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
const stats=()=>worker.evaluate(async()=>{const l=await chrome.storage.local.get(null),s=await chrome.storage.session.get(null);return {plain:!!l.apiKey,vault:!!l.encryptedKey,session:!!s.apiKey,leak:JSON.stringify(l).includes('sk-test-fixture-not-a-real-secret')||JSON.stringify(l).includes('fixture-only password 2026')}});
try {
 await boot();await config();
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
 await mkdir('../evidence',{recursive:true});await writeFile('../evidence/security-results.json',JSON.stringify({checks,apiRequests:requests,fixtureOnly:true},null,2));
} finally {await context?.close();await rm(temp,{recursive:true,force:true})}
