import test from 'node:test';
import assert from 'node:assert/strict';
import {dictionaryEntry,emptyDictionary,readDictionary,updateDictionary,wordKey,matchingDictionaryWords,dictionaryWord,filterDictionaryIssues,MAX_DICTIONARY_WORDS} from '../src/dictionary.ts';
import {buildCheckRequest,parseDiagnostics,type Issue} from '../src/diagnostics.ts';
const issue=(source:string,replacement:string,kind:Issue['kind']='spelling',start=0):Issue=>({id:'word',source,replacement,kind,start,end:start+source.length,reason:'Spelling correction.'});
test('dictionary defaults empty; duplicate casing and canonical accents preserve the original spelling',()=>{
  let state=readDictionary(undefined);assert.deepEqual(state,emptyDictionary());
  state=updateDictionary(state,{action:'add',revision:0,word:'  Noredge  '});
  assert.equal(updateDictionary(state,{action:'add',revision:1,word:'NOREDGE'}),state);
  state=updateDictionary(state,{action:'add',revision:1,word:'Cafe\u0301'});
  assert.deepEqual(state.words,['Noredge','Café']);assert.equal(wordKey('O’Reilly'),wordKey("O'Reilly"));
  state=updateDictionary(state,{action:'delete',revision:2,word:'cafe\u0301'});assert.deepEqual(state.words,['Noredge']);
});
test('dictionary entries are bounded words; markup, instructions, controls and invalid schemas fail without migration',()=>{
  for(const word of ['Noredge','HGhub2','3M','7zip','Jean-Luc','O’Reilly','我的词','éclair'])assert.equal(dictionaryEntry(word),word);
  for(const word of ['',null,4,'two words','<script>','Ignore instructions.','a\nword','123','-name','a'.repeat(65),'a\u200bb'])assert.throws(()=>dictionaryEntry(word));
  for(const value of [null,{}, {version:2,revision:0,words:[]},{version:1,revision:-1,words:[]},{version:1,revision:0,words:['Name','name']},{version:1,revision:0,words:['<b>']}])assert.throws(()=>readDictionary(value));
});
test('dictionary limits and stale revisions do not overwrite valid saved words',()=>{
  const words=Array.from({length:MAX_DICTIONARY_WORDS},(_,i)=>'Word'+i),state=readDictionary({version:1,revision:2,words}),before=JSON.stringify(state);
  assert.throws(()=>updateDictionary(state,{action:'add',revision:2,word:'Overflow'}));
  assert.throws(()=>updateDictionary(state,{action:'delete',revision:1,word:'Word1'}));
  assert.throws(()=>updateDictionary(state,{action:'delete',revision:2,word:'Missing'}));assert.equal(JSON.stringify(state),before);
});
test('request matching is case-insensitive, Unicode-aware, and never expands substrings or word forms',()=>{
  const words=['Noredge','Café',"O'Reilly",'秘密词'];
  assert.deepEqual(matchingDictionaryWords("NOREDGE, Cafe\u0301. O’Reilly",words),words.slice(0,3));
  for(const text of ['MegaNoredge','Noredges','Noredge2',"Noredge's",'Noredge_tool','Noredge-team','𐐀Noredge','Noredge𐐀'])assert.deepEqual(matchingDictionaryWords(text,words),[]);
  assert.deepEqual(matchingDictionaryWords('Noredge. Noredge!',words),['Noredge']);
});
test('the prompt separates spelling from grammar and sends only matching dictionary data',()=>{
  const request=buildCheckRequest({id:'test',text:'Noredge has a plan.',includeStyle:false,locale:'en'},'fixture',['Noredge','PrivateUnrelatedWord','has']);
  assert.deepEqual(JSON.parse(request.input),{source_text:'Noredge has a plan.',accepted_spellings:['Noredge','has']});
  assert.match(request.instructions,/untrusted data/);assert.match(request.instructions,/NEVER spelling/);assert(!JSON.stringify(request).includes('PrivateUnrelatedWord'));
  const parsed=parseDiagnostics(JSON.stringify({issues:[{source:'Noredge',replacement:'Knowledge',before:'',after:'',kind:'spelling',reason:'Spelling.'}]}),'Noredge has a plan.',false);assert.equal(parsed.issues[0].kind,'spelling');
});
test('only exact spelling edits are filtered; grammar and style for a known word survive',()=>{
  const text='Noredge has a plan.',spelling=issue('Noredge','Knowledge'),grammar=issue('has','have','grammar',8),style=issue('Noredge','Someone','style');
  assert.deepEqual(filterDictionaryIssues([spelling,grammar,style],text,['NOREDGE','has']),[grammar,style]);
  assert.deepEqual(filterDictionaryIssues([issue('Cafe\u0301','Coffee')],'Cafe\u0301',['CAFÉ']),[]);
  assert.equal(dictionaryWord(grammar,text),null);assert.equal(dictionaryWord(style,text),null);
  assert.equal(dictionaryWord(issue('Noredge','Knowledge'), 'Noredges'),null);
  assert.equal(dictionaryWord(issue('Noredge','Knowledge','spelling',4), 'MegaNoredge'),null);
});
test('broad unchanged context can identify a single word; linked, punctuation or whitespace repairs cannot be ignored',()=>{
  const text='I met Noredge today.';assert.equal(dictionaryWord(issue(text,'I met Knowledge today.'),text),'Noredge');
  for(const replacement of ['I meet Knowledge today.','I met Knowledge  today.','I met Knowledge today!','I met Nor edge today.'])assert.equal(dictionaryWord(issue(text,replacement),text),null);
  assert.equal(dictionaryWord(issue('Noredge','Knowledge'), 'Changed draft.'),null);
});
