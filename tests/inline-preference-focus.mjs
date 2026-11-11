import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {useVisibleTrigger} from './visible-trigger.mjs';

const temp=await mkdtemp(path.join(tmpdir(),'lingo-preference-focus-')),ext=path.join(temp,'extension');
await cp('dist',ext,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
// Hold the real save path long enough to expose focus loss while its controls are disabled.
const background=await readFile(path.join(ext,'background.js'),'utf8');
assert(background.includes('await notifyInline(origin, passive);'));
await writeFile(path.join(ext,'background.js'),background.replace('await notifyInline(origin, passive);','await new Promise(resolve=>setTimeout(resolve,350)); await notifyInline(origin, passive);'));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<style>body{margin:40px}textarea{width:450px;height:130px;display:block;margin-bottom:120px}</style><textarea id="a">I has a plan.</textarea><textarea id="b">Another field.</textarea>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let ctx;
try{
 ctx=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,viewport:{width:1100,height:900},args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
 let requests=0;await ctx.route('https://api.openai.com/**',route=>{requests++;return route.abort();});
 const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');await useVisibleTrigger(worker);
 const settings=await ctx.newPage();await settings.goto(`chrome-extension://${worker.url().split('/')[2]}/options.html`);
 const message=data=>settings.evaluate(data=>chrome.runtime.sendMessage(data),data);
 await message({type:'completeOnboarding'});const config=await message({type:'config'});
 await message({type:'save',...config.settings,uiLanguage:'zh-CN',storageMode:'session',dataConsent:true,key:'fixture-focus-only-key'});
 const page=await ctx.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const host=page.locator('#lingo-inline-root');await page.locator('#a').focus();await host.locator('.trigger').click();
 const style=host.locator('.include-style'),automatic=host.locator('.auto-check');
 const waitSaved=()=>host.locator('.auto-check:not(:disabled)').waitFor();
 const focused=selector=>host.locator(selector).evaluate(el=>el.getRootNode().activeElement===el);
 for(let i=0;i<4;i++){await style.setChecked(i%2===0);await waitSaved();assert(await focused('.include-style'));assert(await host.locator('.popover').isVisible());}
 console.log('PASS pointer preference changes keep the review open and restore checkbox focus after delayed saves');
 await style.focus();await style.press('Space');await waitSaved();assert(await style.isChecked());assert(await focused('.include-style'));
 console.log('PASS keyboard preference changes retain focus and remain operable after save');
 await automatic.check();await waitSaved();assert(await automatic.isChecked());assert(await focused('.auto-check'));
 await automatic.uncheck();await waitSaved();assert(!await automatic.isChecked());assert(await focused('.auto-check'));assert.equal(requests,0);
 console.log('PASS automatic checking can be enabled then disabled before debounce without submitting text');
 await style.uncheck();await page.locator('#b').focus();await page.waitForTimeout(500);
 assert(await page.locator('#b').evaluate(el=>document.activeElement===el));assert(!await host.locator('.popover').isVisible());
 console.log('PASS completing an earlier preference save does not steal focus from another editor');
}finally{await ctx?.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
