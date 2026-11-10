import { chromium } from 'playwright';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const temp = await mkdtemp(path.join(tmpdir(),'lingo-lookup-')), extension = path.join(temp,'extension');
await cp('dist',extension,{recursive:true});
const manifest = JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*'); await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const evidence = path.resolve('../evidence/lookup'); await mkdir(evidence,{recursive:true});
const server = http.createServer((req,res) => { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<title>Lingo word mode fixture</title><style>body{padding:36px;font:20px sans-serif}textarea{width:540px;height:100px}</style><h1>Word and phrase testing</h1><p id="word">serendipity</p><p id="phrase">look forward to</p><p id="context">PRIVATE SURROUNDING TEXT MUST NOT BE SENT</p><textarea id="edit">prefix serendipity suffix</textarea>'); });
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const url = `http://127.0.0.1:${server.address().port}`;
const ctx = await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',locale:'zh-CN',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:390,height:850}});
const checks=[],calls=[],errors=[]; let behavior='ok',release,override;
const check = name => {checks.push(name); console.log('PASS',name);};
const word = {kind:'word',senses:[{partOfSpeech:'名词 · 不可数',meaning:'偶然发现美好事物的幸运',usage:'用于描述意料之外的幸运发现，常见于旅行、创作或回忆。',collocations:['pure serendipity','a moment of serendipity'],examples:[{text:'Finding this little café was pure serendipity.',translation:'发现这家小咖啡馆完全是意外之喜。'}]}],note:'比 luck 更强调偶然发现的美好。'};
const phrase = {kind:'phrase',senses:[{partOfSpeech:'动词短语',meaning:'期待；盼望',usage:'用于表示对未来事件的期待。to 后面接名词或动名词，可用于日常交流和邮件结尾。',collocations:['look forward to meeting you','look forward to the weekend'],examples:[{text:'I look forward to hearing from you.',translation:'期待收到你的回复。'}]}],note:''};
await ctx.route('https://api.openai.com/v1/responses',async route=>{
 const req=route.request().postDataJSON(); calls.push(req);
 const source=JSON.parse(req.input).source_text, lookup=req.instructions.includes('language learners');
 const text=lookup ? JSON.stringify(override || (source==='look forward to'?phrase:word)) : source==='I has a plan.'?'I have a plan.':'写作模式结果';
 const mode=behavior;
 if(mode==='held')await new Promise(r=>release=r);
 if(mode==='error')return route.fulfill({status:500,body:'{}'}).catch(()=>{});
 const raw=mode==='malformed'?'not valid JSON':text;
 const events=[{type:'response.output_text.delta',delta:raw.slice(0,15)},{type:'response.output_text.delta',delta:raw.slice(15)},...(mode==='partial'?[]:[{type:'response.completed',response:{status:'completed'}}])];
 await route.fulfill({contentType:'text/event-stream',body:events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')}).catch(()=>{});
});
try {
 const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker'),id=worker.url().split('/')[2];
 const settings=await ctx.newPage(); await settings.goto(`chrome-extension://${id}/options.html`);
 await settings.evaluate(async()=>{await chrome.runtime.sendMessage({type:'completeOnboarding'});const c=await chrome.runtime.sendMessage({type:'config'});const saved=await chrome.runtime.sendMessage({type:'save',...c.settings,uiLanguage:'zh-CN',storageMode:'session',dataConsent:true,key:'fixture-only-lookup-key'});if(saved.error)throw Error(saved.error);});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`chrome-extension://${id}/sidepanel.html`);
 const host=page.locator('#lingo-extension-root'),editor=host.locator('.source-editor'),lookup=host.locator('[data-tool=lookup]'),writing=host.locator('[data-tool=writing]'),submit=host.locator('.source-submit');
 const done=(h=host)=>h.locator('.lookup-actions').getByRole('button',{name:/^(复制词语说明|複製詞語說明|Copy explanation)$/}).waitFor();
 const run=async text=>{await editor.fill(text);await submit.click();await done();};
 await lookup.click();assert.equal(await lookup.getAttribute('aria-pressed'),'true');assert(await submit.isDisabled());assert.equal(calls.length,0);
 await editor.fill('serendipity');assert.equal(calls.length,0);await submit.click();await done();
 assert.equal(await host.locator('.lookup-term').textContent(),'serendipity');assert.equal(await host.locator('.lookup-sense').count(),1);assert.equal(await host.locator('.lookup-pos').textContent(),word.senses[0].partOfSpeech);assert.equal(await host.locator('.example-text').textContent(),word.senses[0].examples[0].text);
 assert.deepEqual(JSON.parse(calls.at(-1).input),{source_text:'serendipity'});assert.match(calls.at(-1).instructions,/Explain in 简体中文/);
 assert.equal(await host.locator('.lookup-actions').getByRole('button',{name:'替换选中文字',exact:true}).count(),0);assert(await host.locator('.translation').isHidden());assert(await host.locator('.writing').isHidden());
 check('empty mode switch and source typing are passive; explicit lookup displays meaning, grammar, usage, combinations and examples without replace');
 await page.screenshot({path:path.join(evidence,'sidebar-word-zh-CN.png')});
 let before=calls.length;await lookup.click();await submit.click();assert.equal(calls.length,before);check('completed same-source lookup is reused');
 await writing.click();await host.locator('.translate-actions button').filter({hasText:'复制'}).waitFor();await host.locator('[data-mode=natural]').click();await host.locator('.write-actions button').filter({hasText:'复制'}).waitFor();
 before=calls.length;await lookup.click();await done();await writing.click();assert.equal(calls.length,before);assert.equal(await host.locator('.write-text').textContent(),'写作模式结果');await lookup.click();await done();
 check('switching back preserves completed translation, rewriting and term results with no duplicate requests');
 await run('look forward to');assert.equal(await host.locator('.lookup-kind').textContent(),'短语');assert.match(await host.locator('.lookup-usage').textContent(),/动名词/);await page.screenshot({path:path.join(evidence,'sidebar-phrase-zh-CN.png')});check('phrases show grammar pattern, contexts, combinations and translated examples');
 override={...word,senses:[word.senses[0],{...word.senses[0],partOfSpeech:'动词',meaning:'第二个词义'}]};await run('bank');assert.equal(await host.locator('.lookup-sense').count(),2);override=undefined;check('multiple senses stay separate');
 override={kind:'other',senses:[],note:'无法确定这个名字的含义，请补充信息或使用写作工具。'};await run('UnknownBrandZ');assert.equal(await host.locator('.lookup-sense').count(),0);assert.match(await host.locator('.lookup-note').textContent(),/无法确定/);override=undefined;check('unknown terms can return an explanation without invented senses');
 override={...word,senses:[{...word.senses[0],meaning:'<img src=x onerror="window.injected=true">'}]};await run('<script>word</script>');assert.equal(await host.locator('.lookup-content img,.lookup-content script').count(),0);assert.equal(await host.locator('.lookup-meaning').textContent(),override.senses[0].meaning);override=undefined;check('source and generated markup remain literal text');
 before=calls.length;for(const text of ['word '.repeat(13),'x'.repeat(161),'one\ntwo','123']){await editor.fill(text);assert(await submit.isDisabled());await host.locator('.lookup-status.error').waitFor();}assert.equal(calls.length,before);assert.equal(await host.locator('.lookup-content').textContent(),'');check('paragraphs and over-limit terms clear prior results and never call the API');
 const rejected=await settings.evaluate(()=>new Promise(resolve=>{const p=chrome.runtime.connect({name:'lingo-task'});p.onMessage.addListener(e=>{if(e.type==='error'){p.disconnect();resolve(e.error)}});p.postMessage({type:'run',task:{id:'oversized',mode:'lookup',text:'x'.repeat(161),language:'简体中文'}})}));assert.match(rejected,/160/);assert.equal(calls.length,before);check('background independently rejects invalid term input before network');
 for(const mode of ['malformed','partial','error','held']){
   await editor.fill('term '+mode);behavior=mode;await submit.click();
   if(mode==='held'){for(let i=0;!release&&i<100;i++)await page.waitForTimeout(10);assert(release);await host.locator('.lookup-actions').getByRole('button',{name:'停止',exact:true}).click();}
   await host.locator('.lookup-actions').getByRole('button',{name:'重试',exact:true}).waitFor();assert.equal(await host.locator('.lookup-content').textContent(),'');assert.equal(await host.locator('.lookup-actions').getByRole('button',{name:'复制词语说明',exact:true}).count(),0);
   release?.();release=undefined;behavior='ok';await host.locator('.lookup-actions').getByRole('button',{name:'重试',exact:true}).click();await done();
 }
 check('malformed, incomplete, failed and stopped responses expose no raw JSON or copy action; explicit retry succeeds');
 await editor.fill('late term');behavior='held';await submit.click();for(let i=0;!release&&i<100;i++)await page.waitForTimeout(10);assert(release);
 await editor.fill('fresh term');release();release=undefined;behavior='ok';await submit.click();await done();assert.equal(await host.locator('.lookup-term').textContent(),'fresh term');check('source edits cancel in-flight lookup and late output cannot repopulate old data');
 await editor.fill('switch pending');behavior='held';await submit.click();for(let i=0;!release&&i<100;i++)await page.waitForTimeout(10);assert(release);behavior='ok';await writing.click();release();release=undefined;await host.locator('.translate-actions button').filter({hasText:'复制'}).waitFor();await lookup.click();await done();assert.equal(await host.locator('.lookup-term').textContent(),'switch pending');check('switching modes cancels hidden pending work and returning starts a fresh lookup');
 for(const [locale,label,language] of [['zh-TW','單字與片語','繁體中文'],['en','Words & phrases','English'],['zh-CN','单词与短语','简体中文']]){
   before=calls.length;await settings.evaluate(uiLanguage=>chrome.runtime.sendMessage({type:'setUiLanguage',uiLanguage}),locale);await host.getByRole('button',{name:label,exact:true}).waitFor();assert.equal(calls.length,before);assert.equal(await host.locator('.lookup-content').textContent(),'');await submit.click();await done();assert(calls.at(-1).instructions.includes('Explain in '+language));assert.equal(await host.locator('.panel').evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:path.join(evidence,`sidebar-${locale}.png`)});
 }
 check('all three locales render in 390px; language changes invalidate explanations without sending a request');
 await editor.fill('I has a plan.');await writing.click();await host.locator('.translate-actions button').filter({hasText:'复制'}).waitFor();await host.locator('[data-mode=proofread]').click();await host.locator('.write-actions button').filter({hasText:'复制'}).waitFor();await host.locator('[data-view=compare]').click();assert.equal(await host.locator('.write-diff ins').textContent(),'have');check('proofreading comparison remains available after using term mode');
 await lookup.click();await done();await host.locator('[data-action=reset-layout]').click();assert.equal(await editor.inputValue(),'');assert.equal(await host.locator('.lookup-content').textContent(),'');assert(await submit.isDisabled());check('sidebar clear removes all term content and actions');
 const web=await ctx.newPage();web.on('pageerror',e=>errors.push(e.message));await web.setViewportSize({width:1150,height:900});await web.goto(url);
 const floating=web.locator('#lingo-extension-root');
 const select=async selector=>{await web.locator(selector).evaluate(el=>{document.activeElement?.blur();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));});await floating.locator('.launcher').waitFor({state:'visible'});await floating.locator('.launcher').click();};
 await select('#word');await floating.locator('.translate-actions button').filter({hasText:'复制'}).waitFor();await floating.locator('[data-tool=lookup]').click();await done(floating);
 assert.deepEqual(JSON.parse(calls.at(-1).input),{source_text:'serendipity'});await web.screenshot({path:path.join(evidence,'floating-word.png')});check('ordinary webpage selection opens shared term card and sends only selected text');
 await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});await web.bringToFront();await floating.locator('.lookup-actions button').click();const copied=await web.evaluate(()=>navigator.clipboard.readText());assert(copied.startsWith('serendipity'));assert(copied.includes(word.senses[0].examples[0].text));assert(!copied.includes('"senses"'));check('copy exports a readable explanation, not protocol JSON');
 await floating.locator('[data-action=close]').click();before=calls.length;await select('#phrase');await done(floating);assert.equal(calls.length,before+1);assert.equal(await floating.locator('.lookup-term').textContent(),'look forward to');assert(calls.at(-1).instructions.includes('language learners'));check('page remembers term mode for the next selection and does not request an extra translation');
 await floating.locator('[data-action=close]').click();await web.locator('#edit').focus();await web.locator('#edit').evaluate(el=>{el.setSelectionRange(7,18);el.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));});await floating.locator('.launcher').waitFor({state:'visible'});await floating.locator('.launcher').click();await done(floating);assert.equal(await floating.locator('.lookup-actions button').count(),1);assert.equal(await web.locator('#edit').inputValue(),'prefix serendipity suffix');
 await web.locator('#edit').evaluate(el=>{el.value='changed externally';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await floating.locator('.lookup-content').textContent(),'');assert.equal(await floating.locator('.lookup-actions button').count(),0);assert.match(await floating.locator('.lookup-status').textContent(),/选区已失效/);assert(await floating.locator('.source-submit').isDisabled());check('editable selection never offers explanation replacement; stale page text clears explanation and asks for reselection');
 assert.deepEqual(errors,[]);check('no uncaught page errors');
 await writeFile(path.join(evidence,'results.json'),JSON.stringify({version:manifest.version_name,checks,errors,mockedAPI:true,actualChrome:false},null,2));
} catch(e) {for(const [i,p]of ctx.pages().entries())await p.screenshot({path:path.join(evidence,`failure-${i}.png`)}).catch(()=>{});throw e;}
finally{release?.();await ctx.close();server.close();await rm(temp,{recursive:true,force:true});}
