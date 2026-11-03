import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBaseUrl, apiOrigin, validKey, readResponses, buildRequest} from '../src/core.ts';
import {encryptKey, decryptKey} from '../src/vault.ts';
import {resolveLanguage, setLanguage, t} from '../src/i18n.ts';
function stream(events:unknown[], tail = '') { return new Response(events.map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join('')+tail,{headers:{'Content-Type':'text/event-stream'}}); }
const chunk=(delta:string)=>({type:'response.output_text.delta',delta});
const completed={type:'response.completed',response:{status:'completed'}};
test('base URLs canonicalize the complete path; unsafe credentials and transports rejected',()=>{
 assert.equal(normalizeBaseUrl('https://EXAMPLE.com/v1/responses/'),'https://example.com/v1');
 assert.equal(normalizeBaseUrl('https://api.deepseek.com'),'https://api.deepseek.com');
 assert.equal(normalizeBaseUrl('http://localhost:1234/v1/'),'http://localhost:1234/v1');
 assert.equal(apiOrigin('https://example.com:8443/v1'),'https://example.com/*');
 for(const bad of ['http://remote.example/v1','https://user:password@example.com/v1','https://example.com/v1?q=key','https://example.com/#key','file:///tmp','https://example.com\\evil','https://bad .com'])assert.throws(()=>normalizeBaseUrl(bad));
 assert(validKey('provider-key-without-openai-prefix'));assert(!validKey('abc\nAuthorization:test'));
});
test('Responses terminal event completes without DONE, ignoring reasoning',async()=>{
 let out='';await readResponses(stream([{type:'response.reasoning_summary_text.delta',delta:'private'},chunk('你好🌿'),completed]),s=>out+=s);assert.equal(out,'你好🌿');
});
test('Responses JSON and completed-only stream accepted',async()=>{
 const response={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'hello'}]}]};
 for(const res of [Response.json(response),stream([{type:'response.completed',response}])]){let out='';await readResponses(res,s=>out+=s);assert.equal(out,'hello');}
});
test('truncated, refused, malformed, empty and Chat-only outputs fail closed',async()=>{
 for(const res of [stream([chunk('partial')]),stream([chunk('partial'),{type:'response.incomplete'}]),stream([{type:'response.refusal.done'}]),stream([{type:'error',message:'secret'}]),stream([completed]),new Response('data: nope\n\n'),Response.json({choices:[{message:{content:'Chat-only'},finish_reason:'stop'}]}),stream([{choices:[{delta:{content:'Chat-only'}}]}],'data: [DONE]\n\n'),stream([chunk('partial'),{type:'response.completed',response:{output:[{type:'message',content:[{type:'output_text',text:'different'}]}]}}])])await assert.rejects(readResponses(res,()=>{}));
});
test('HTTP error body never escapes into UI',async()=>{
 await assert.rejects(readResponses(Response.json({error:{message:'NEVER-EXPOSE-SECRET'}},{status:401}),()=>{}),e=>!String(e).includes('NEVER-EXPOSE-SECRET'));
});
test('minimal shared protocol excludes provider-specific request fields',()=>{
 const req=buildRequest({id:'x',text:'Hello',mode:'translate',language:'English'},'provider/model');
 assert.deepEqual(Object.keys(req).sort(),['input','instructions','max_output_tokens','model','store','stream']);assert.equal(req.store,false);assert.equal(JSON.parse(req.input).source_text,'Hello');
});
test('password ciphertext is bound to full normalized service address; legacy is OpenAI-only',async()=>{
 const secret='fixture-compatible-key',password='fixture-only password';
 const vault=await encryptKey(secret,password,'https://example.com/v1');
 assert.equal(await decryptKey(vault,password,'https://example.com/v1'),secret);
 await assert.rejects(decryptKey(vault,password,'https://example.com/v2'));
 await assert.rejects(decryptKey({...vault,baseUrl:'https://other.example/v1'},password,'https://other.example/v1'));
 const legacy=await encryptKey(secret,password);await assert.rejects(decryptKey(legacy,password,'https://example.com/v1'));
});
test('locale follows Chrome and manual override is independent',()=>{
 for(const code of ['zh-TW','zh-HK','zh-Hant','zh-MO'])assert.equal(resolveLanguage('auto',code),'zh-TW');
 for(const code of ['zh-CN','zh-SG','zh-Hans'])assert.equal(resolveLanguage('auto',code),'zh-CN');
 assert.equal(resolveLanguage('auto','fr-FR'),'en');assert.equal(resolveLanguage('zh-TW','en-US'),'zh-TW');
 setLanguage('en');assert.equal(t('复制'),'Copy');assert.equal(t('自然结果'),'Natural result');assert.equal(t('连接成功 · 你好'),'Connected · 你好');
 setLanguage('zh-TW');assert.equal(t('翻译'),'翻譯');setLanguage('zh-CN');
});
