import type {Issue} from './diagnostics';
import {inlineChanges} from './inline-changes';

export type DictionaryState={version:1;revision:number;words:string[]};
export type DictionaryAction={revision:number;action:'add'|'delete';word:string};
export const DICTIONARY_KEY='personalDictionary',MAX_DICTIONARY_WORDS=500,MAX_DICTIONARY_WORD_LENGTH=64;
export const emptyDictionary=():DictionaryState=>({version:1,revision:0,words:[]});
const corrupt='个人词典无法读取，未覆盖原有数据。';
export const wordKey=(word:string)=>word.normalize('NFC').replace(/’/g,"'").toLowerCase();
export function dictionaryEntry(value:unknown):string {
  if(typeof value!=='string')throw new Error('请输入单个词，最多 64 个字符，可含数字、连字符或撇号。');
  const word=value.trim().normalize('NFC');
  if(!word||word.length>MAX_DICTIONARY_WORD_LENGTH||!/^(?=.*\p{L})[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[-'’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u.test(word))throw new Error('请输入单个词，最多 64 个字符，可含数字、连字符或撇号。');
  return word;
}
export function readDictionary(value:unknown):DictionaryState {
  if(value===undefined)return emptyDictionary();
  try{
    const state=value as DictionaryState;
    if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.words)||state.words.length>MAX_DICTIONARY_WORDS)throw 0;
    const seen=new Set<string>();const words=state.words.map(value=>{const word=dictionaryEntry(value),key=wordKey(word);if(seen.has(key))throw 0;seen.add(key);return word;});
    return {version:1,revision:state.revision,words};
  }catch{throw new Error(corrupt);}
}
export function updateDictionary(state:DictionaryState,action:DictionaryAction):DictionaryState {
  if(!action||action.revision!==state.revision)throw new Error('个人词典已在其他窗口更新，请重试。');
  if(state.revision>=Number.MAX_SAFE_INTEGER)throw new Error(corrupt);
  const word=dictionaryEntry(action.word),key=wordKey(word),index=state.words.findIndex(w=>wordKey(w)===key),words=[...state.words];
  if(action.action==='add'){
    if(index>=0)return state;
    if(words.length>=MAX_DICTIONARY_WORDS)throw new Error('个人词典最多保存 500 个词。');
    words.push(word);
  }else if(action.action==='delete'){
    if(index<0)throw new Error('这个词已不在个人词典中，请重新查看。');
    words.splice(index,1);
  }else throw new Error('未知操作。');
  return {version:1,revision:state.revision+1,words};
}
const continuation=/[\p{L}\p{M}\p{N}_'’+\-#]/u;
function wholeWord(text:string,start:number,end:number){
  const before=text.slice(0,start).match(/.$/su)?.[0]||'',after=Array.from(text.slice(end,end+2))[0]||'';
  return !continuation.test(before)&&!continuation.test(after);
}
// Only words present as whole tokens in this request may leave the local dictionary.
export function matchingDictionaryWords(text:string,words:readonly string[]):string[]{
  const folded=wordKey(text);
  return words.filter(word=>{const key=wordKey(word);let at=folded.indexOf(key);while(at>=0){if(wholeWord(folded,at,at+key.length))return true;at=folded.indexOf(key,at+1);}return false;});
}
// Never suppress grammar/style or a repair that also changes another word or whitespace.
export function dictionaryWord(issue:Issue,text:string):string|null {
  if(issue.kind!=='spelling'||text.slice(issue.start,issue.end)!==issue.source)return null;
  const changes=inlineChanges(issue);if(changes.length!==1)return null;
  const change=changes[0];
  try{dictionaryEntry(change.source);dictionaryEntry(change.replacement);if(change.source.trim()!==change.source||change.replacement.trim()!==change.replacement)return null;}catch{return null;}
  if(!wholeWord(text,change.start,change.end))return null;
  if(issue.source.slice(0,change.start-issue.start)+change.replacement+issue.source.slice(change.end-issue.start)!==issue.replacement)return null;
  return change.source;
}
export function filterDictionaryIssues(issues:Issue[],text:string,words:readonly string[]):Issue[]{
  const keys=new Set(words.map(wordKey));
  return issues.filter(issue=>{const word=dictionaryWord(issue,text);return !word||!keys.has(wordKey(word));});
}
