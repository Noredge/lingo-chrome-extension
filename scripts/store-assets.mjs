import {chromium} from 'playwright';import {mkdtemp,cp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';
const out=path.resolve('store/assets');await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'lingo-store-')),ext=path.join(temp,'extension');await cp('dist',ext,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const html=await readFile('store/fixtures/showcase.html');const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],viewport:{width:1280,height:800},deviceScaleFactor:1});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=worker.url().split('/')[2];
 await context.route('https://api.openai.com/v1/responses',async route=>{
  const b=route.request().postDataJSON(),t=JSON.parse(b.input).source_text;
  const output=b.instructions.includes('Translate the source')?(t.includes('quiet')?'那些安静的时刻，往往最令人难忘。':'你今天能把它发给我吗？'):'Can you send it to me today?';
  await route.fulfill({contentType:'text/event-stream',body:[{type:'response.output_text.delta',delta:output},{type:'response.completed'}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
 });
 const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
 await options.evaluate(()=>chrome.runtime.sendMessage({type:'save',key:'sk-test-fixture-not-a-real-secret',model:'gpt-6-luna',language:'简体中文',languages:['简体中文','English','日本語'],remember:false,dataConsent:true}));
 const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);const host=page.locator('#lingo-extension-root');
 const select=async selector=>{await page.locator(selector).evaluate(el=>{if(el.closest('[contenteditable]'))el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}))});await host.locator('.launcher').click();await host.locator('.translate-actions').getByRole('button',{name:'复制',exact:true}).waitFor()};
 const move=async()=>{const r=await host.locator('.panel').boundingBox(),h=await host.locator('.drag-handle').boundingBox();const x=h.x+100,y=h.y+25;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+810-r.x,y+110-r.y,{steps:12});await page.mouse.up();await page.mouse.move(750,760)};
 await select('#translate');await move();await page.screenshot({path:path.join(out,'01-translation-1280x800.png')});
 await host.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>{document.body.classList.add('mode-mail');document.querySelector('#headline').textContent='写得自然，改得准确。';document.querySelector('#lead').textContent='校对、语气改写与自定义要求，始终基于原文。'});
 await select('#rewrite');await host.getByRole('button',{name:'校对',exact:true}).click();await host.locator('.write-actions').getByRole('button',{name:'复制',exact:true}).waitFor();await move();await page.screenshot({path:path.join(out,'02-writing-1280x800.png')});
 await options.reload();await options.getByRole('heading',{name:'浮窗翻译语言',exact:true}).waitFor();await options.locator('.card').filter({has:options.getByRole('heading',{name:'浮窗翻译语言',exact:true})}).scrollIntoViewIfNeeded();await options.screenshot({path:path.join(out,'03-settings-1280x800.png')});
 const promo=await context.newPage();await promo.setViewportSize({width:440,height:280});await promo.setContent('<html><body style="margin:0;background:#edf2e6;font-family:-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif;color:#294733;padding:32px;box-sizing:border-box"><div style="font-size:18px;font-weight:650">文 Lingo</div><h1 style="font-size:31px;line-height:1.5;font-weight:550;letter-spacing:-1px;margin:20px 0 12px">读懂每一句。<br>写好每一句。</h1><p style="font-size:12px;color:#73886a;margin:0">划词翻译 · 校对改写 · 自备 API Key</p></body></html>');await promo.screenshot({path:path.join(out,'promo-440x280.png')});
 await cp('public/icons/128.png',path.join(out,'icon-128.png'));
 await writeFile(path.join(out,'ASSETS.md'),'截图尺寸均为 1280×800，来源为运行中的真实扩展界面及本地演示页面；演示 API 响应为固定样例，页面内已标注。未使用用户邮箱、真实 Key 或私人数据。宣传图为 440×280，图标为 128×128。重建：npm run build && npm run store:assets。\n');
 console.log('Created 3 store screenshots, promotional tile and icon.');
}finally{await context.close();server.close();await rm(temp,{recursive:true,force:true})}
