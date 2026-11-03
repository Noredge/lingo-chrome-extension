import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBaseUrl, apiOrigin, validKey, readChatResponse, buildRequest} from '../src/core.ts';
import {encryptKey, decryptKey} from '../src/vault.ts';
import {resolveLanguage, setLanguage, t} from '../src/i18n.ts';
function stream(events:unknown[], tail = '') { return new Response(events.map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join('')+tail,{headers:{'Content-Type':'text/event-stream'}}); }
const chunk=(content:string, finish_reason:string|null=null)=>({choices:[{index:0,delta:{content},finish_reason}]});
test('base URLs canonicalize the complete path; unsafe credentials and transports rejected',()=>{
 assert.equal(normalizeBaseUrl('https://EXAMPLE.com/v1/chat/completions/'),'https://example.com/v1');
 assert.equal(normalizeBaseUrl('https://api.deepseek.com'),'https://api.deepseek.com');
 assert.equal(normalizeBaseUrl('http://localhost:1234/v1/'),'http://localhost:1234/v1');
 assert.equal(apiOrigin('https://example.com:8443/v1'),'https://example.com/*');
 for(const bad of ['http://remote.example/v1','https://user:password@example.com/v1','https://example.com/v1?q=key','https://example.com/#key','file:///tmp','https://example.com\\evil','https://bad .com'])assert.throws(()=>normalizeBaseUrl(bad));
 assert(validKey('provider-key-without-openai-prefix'));assert(!validKey('abc\nAuthorization:test'));
});
test('stream parser accepts standard terminal marker, ignores reasoning and usage, preserves Unicode',async()=>{
 let out='';await readChatResponse(stream([{choices:[{index:0,delta:{reasoning_content:'private reasoning'}}]},chunk('你好🌿'),{choices:[],usage:{}}],'data: [DONE]\n\n'),s=>out+=s);assert.equal(out,'你好🌿');
});
test('nonstream JSON accepted; text content parts supported',async()=>{
 let out='';await readChatResponse(Response.json({choices:[{message:{content:[{type:'text',text:'hello'}]},finish_reason:'stop'}]}),s=>out+=s);assert.equal(out,'hello');
});
test('truncated, refused, malformed and empty outputs fail closed',async()=>{
 for(const res of [stream([chunk('partial')]),stream([chunk('partial','length')]),stream([chunk('','content_filter')]),stream([{error:{message:'secret'}}]),stream([chunk('','stop')]),new Response('data: nope\n\n'),Response.json({choices:[{message:{content:'partial'},finish_reason:'length'}]})])await assert.rejects(readChatResponse(res,()=>{}));
});
test('HTTP error body never escapes into UI',async()=>{
 await assert.rejects(readChatResponse(Response.json({error:{message:'NEVER-EXPOSE-SECRET'}},{status:401}),()=>{}),e=>!String(e).includes('NEVER-EXPOSE-SECRET'));
});
test('minimal shared protocol excludes provider-specific request fields',()=>{
 const req=buildRequest({id:'x',text:'Hello',mode:'translate',language:'English'},'provider/model');
 assert.deepEqual(Object.keys(req).sort(),['messages','model','stream']);assert.equal(req.messages[0].role,'system');assert.equal(req.messages[1].role,'user');
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
