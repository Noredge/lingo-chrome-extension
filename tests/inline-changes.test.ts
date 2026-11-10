import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineChanges} from '../src/inline-changes.ts';
import {acceptIssue,type Issue} from '../src/diagnostics.ts';
const issue=(source:string,replacement:string,start=0):Issue=>({id:'x',start,end:start+source.length,source,replacement,kind:'grammar',reason:'Correction.'});

test('broad model context produces marks on whole changed words only',()=>{
 const repair=issue('I has a plan. She go home.','I have a plan. She goes home.',10);
 assert.deepEqual(inlineChanges(repair),[
  {start:12,end:15,source:'has',replacement:'have'},
  {start:28,end:30,source:'go',replacement:'goes'}
 ]);
 assert.equal(repair.source,'I has a plan. She go home.');
});
test('word inflections keep the full word rather than only an unchanged stem suffix',()=>{
 assert.deepEqual(inlineChanges(issue('She go','She goes')),[{start:4,end:6,source:'go',replacement:'goes'}]);
 assert.deepEqual(inlineChanges(issue('He have two book.','He has two books.')).map(c=>c.source),['have','book']);
});
test('deletions exclude surrounding unchanged words and trailing whitespace',()=>{
 assert.deepEqual(inlineChanges(issue('really very','very')),[{start:0,end:6,source:'really',replacement:''}]);
 assert.deepEqual(inlineChanges(issue('It is really very useful.','It is very useful.')).map(c=>c.source),['really']);
});
test('pure insertions mark their position, not an unrelated existing word',()=>{
 assert.deepEqual(inlineChanges(issue('I have book.','I have a book.')),[{start:7,end:7,source:'',replacement:'a'}]);
 assert.deepEqual(inlineChanges(issue('Hello world!','Hello, world!')),[{start:5,end:5,source:'',replacement:','}]);
});
test('whitespace edits retain a real visible gap without inventing a changed word',()=>{
 const edits=inlineChanges(issue('a  b','a b'));
 assert(edits.length>0);assert(edits.every(e=>!e.source.trim()&&!e.replacement.trim()));
});
test('display ranges preserve Unicode grapheme boundaries',()=>{
 for(const [before,after] of [['👩🏽‍💻 are ready.','🧑‍💻 is ready.'],['cafe\u0301 are open.','café is open.'],['我今天去学校。','我明天去学校！']]){
  const bounds=new Set([0,before.length,...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(before),p=>p.index)]);
  for(const edit of inlineChanges(issue(before,after))){assert(bounds.has(edit.start));assert(bounds.has(edit.end));assert.equal(before.slice(edit.start,edit.end),edit.source);}
 }
});
test('linked display edits retain the original atomic replacement and reject stale source',()=>{
 const text='Prefix. He have two book. Suffix.',repair=issue('He have two book.','He has two books.',8),snapshot=JSON.stringify(repair);
 assert.equal(inlineChanges(repair).length,2);assert.equal(JSON.stringify(repair),snapshot);
 assert.equal(acceptIssue(text,[repair],'x').text,'Prefix. He has two books. Suffix.');
 assert.throws(()=>acceptIssue(text.replace('two','one'),[repair],'x'));
 assert.equal(inlineChanges({...repair,start:18,end:35})[0].start,21);
});
