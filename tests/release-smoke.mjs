import { chromium } from 'playwright';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'lingo-release-'));
const dist=path.resolve('dist');
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',locale:'zh-CN',headless:true,args:[`--disable-extensions-except=${dist}`,`--load-extension=${dist}`],viewport:{width:1320,height:950}});
try{
 const sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'); const id=sw.url().split('/')[2];
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);await page.getByText('尚未配置 Key',{exact:true}).waitFor();
 const state=await sw.evaluate(async()=>({permissions:await chrome.permissions.getAll(),scripts:await chrome.scripting.getRegisteredContentScripts(),local:await chrome.storage.local.get(null),session:await chrome.storage.session.get(null)}));
 assert.deepEqual(state.permissions.origins,['https://api.openai.com/*']);assert.equal(state.scripts.length,0);assert.equal(state.local.activeServiceId,'default');assert.equal(state.local.serviceProfiles.length,1);assert.equal(state.local.serviceProfiles[0].baseUrl,'https://api.openai.com/v1');assert(!state.local.serviceProfiles[0].deviceKey&&!state.local.serviceProfiles[0].encryptedKey);assert.deepEqual(state.session,{});
 await page.screenshot({path:path.resolve('../evidence/release-settings.png'),fullPage:true});
 await writeFile(path.resolve('../evidence/release-smoke.json'),JSON.stringify({extensionVersion:await sw.evaluate(()=>chrome.runtime.getManifest().version),browser:await context.browser().version(),unchangedProductionManifest:true,hasEmbeddedKey:false,preauthorizedOrigins:state.permissions.origins,initialContentScripts:state.scripts.length,result:'passed'},null,2));
 console.log('PASS production manifest loads unchanged; no embedded credentials or blanket website permissions');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
