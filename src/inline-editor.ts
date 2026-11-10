import {diffText} from './diff';
import type {Issue} from './diagnostics';
import {replaceSelection} from './selection';
import {unsupportedEditor} from './editor-support';

export type TextField=HTMLElement;
type PlainField=HTMLInputElement|HTMLTextAreaElement;
type Segment={node:Text;start:number;end:number};
export type FieldState={text:string;revision:string;segments?:Segment[]};
const tags=/^(DIV|P|SPAN|B|STRONG|I|EM|U|S|STRIKE|DEL|A|BR|UL|OL|LI|BLOCKQUOTE|PRE|H[1-6]|FONT|SUB|SUP)$/;
const blocks=/^(DIV|P|LI|BLOCKQUOTE|PRE|H[1-6])$/;
const normalize=(text:string)=>text.replace(/\u00a0/g,' ');
export const plainField=(value:unknown):value is PlainField=>value instanceof HTMLTextAreaElement||value instanceof HTMLInputElement;
const hint=(el:Element)=>location.hostname==='mail.google.com'&&el.matches('.jKzJCd[contenteditable="false"]');
export function fieldFor(value:unknown):TextField|null {
  if(!(value instanceof HTMLElement))return null;
  if(plainField(value))return value;
  if(!value.isContentEditable)return null;
  let field=value;
  while(field.parentElement?.isContentEditable)field=field.parentElement;
  return field;
}
export function fieldContains(field:TextField,value:unknown):boolean {
  return value===field||!plainField(field)&&value instanceof Node&&field.contains(value);
}
export function selectionCollapsed(field:TextField):boolean {
  return plainField(field)?field.selectionStart===field.selectionEnd:!window.getSelection()?.toString()&&!!window.getSelection()?.isCollapsed;
}
export function supportedField(value:unknown):value is TextField {
  if(!(value instanceof HTMLElement)||!value.isConnected||value.getRootNode()!==document||unsupportedEditor(value))return false;
  if(plainField(value))return !value.disabled&&!value.readOnly&&(value instanceof HTMLTextAreaElement||['text','search'].includes(value.type));
  return value!==document.body&&value!==document.documentElement&&fieldFor(value)===value&&value.isContentEditable;
}

// One canonical source with explicit BR/block separators and exact text-node offsets.
// Nothing is inserted into the editor; unknown widgets are left to the sidebar.
export function readField(field:TextField):FieldState|null {
  if(!supportedField(field))return null;
  if(plainField(field))return {text:field.value,revision:field.value};
  let text='',valid=true,visited=0,lastSynthetic=false;
  const segments:Segment[]=[];
  const newline=(synthetic:boolean)=>{text+='\n';lastSynthetic=synthetic;};
  const visit=(node:Node)=>{
    if(!valid||++visited>4000){valid=false;return;}
    if(node instanceof Text){const value=normalize(node.data);if(value){segments.push({node,start:text.length,end:text.length+value.length});text+=value;lastSynthetic=false;}return;}
    if(!(node instanceof HTMLElement))return;
    if(hint(node))return;
    if(!tags.test(node.tagName)||node.getAttribute('contenteditable')==='false'||node!==field&&node.hasAttribute('contenteditable')){valid=false;return;}
    const style=getComputedStyle(node);
    if(style.display==='none'||style.visibility!=='visible'||node.hidden)return;
    if(node.tagName==='BR'){newline(false);return;}
    const block=node!==field&&(blocks.test(node.tagName)||['block','list-item'].includes(style.display));
    if(block&&text&&!text.endsWith('\n'))newline(true);
    node.childNodes.forEach(visit);
    if(block&&text&&!text.endsWith('\n'))newline(true);
  };
  visit(field);if(!valid)return null;
  if(lastSynthetic)text=text.slice(0,-1);
  const copy=field.cloneNode(true) as HTMLElement;
  if(location.hostname==='mail.google.com'){
    copy.querySelectorAll('.jKzJCd[contenteditable="false"]').forEach(el=>el.remove());
    copy.querySelectorAll('span[aria-invalid="grammar"],span[aria-invalid="spelling"],span[data-ddnwab-gr]').forEach(el=>el.replaceWith(...el.childNodes));
    copy.normalize();
  }
  return {text,revision:copy.innerHTML,segments};
}
export function fieldRange(state:FieldState,start:number,end:number):Range|null {
  if(!state.segments||start<0||end<start||end>state.text.length)return null;
  const a=state.segments.find(s=>s.start<=start&&s.end>start)||state.segments.filter(s=>s.end===start).at(-1);
  const b=start===end?a:state.segments.find(s=>s.start<end&&s.end>=end);
  if(!a||!b)return null;
  const range=document.createRange();range.setStart(a.node,start-a.start);range.setEnd(b.node,end-b.start);return range;
}
function richPatch(state:FieldState,issue:Issue):{range:Range;replacement:string}|null {
  if(state.text.slice(issue.start,issue.end)!==issue.source)return null;
  const parts=diffText(issue.source,issue.replacement).parts;
  const prefix=parts[0]?.kind==='equal'?parts[0].text.length:0;
  const suffix=parts.at(-1)?.kind==='equal'?parts.at(-1)!.text.length:0;
  const start=issue.start+prefix,end=issue.end-suffix,replacement=issue.replacement.slice(prefix,issue.replacement.length-suffix);
  if(/[\r\n]/.test(state.text.slice(start,end)+replacement))return null;
  const range=fieldRange(state,start,end);if(!range)return null;
  // A single native edit preserves surrounding markup and one-step native undo.
  // Never flatten mixed inline formats or merge paragraphs to accept a broad rewrite.
  if(range.startContainer.parentNode!==range.endContainer.parentNode)return null;
  let node:Node|null=range.startContainer;
  while(node&&node!==range.endContainer){if(!(node instanceof Text))return null;node=node.nextSibling;}
  if(!node||normalize(range.toString())!==state.text.slice(start,end))return null;
  return {range,replacement};
}
export function canApplyIssue(field:TextField,state:FieldState,issue:Issue):boolean {
  return plainField(field)||!!richPatch(state,issue);
}
export function applyFieldIssue(field:TextField,state:FieldState,issue:Issue):FieldState {
  const matches=()=>{const now=readField(field);return now?.text===state.text&&now.revision===state.revision;};
  if(!matches())throw new Error('原文已变化，请重新检查。');
  if(plainField(field))replaceSelection({target:field,kind:'input',text:issue.source,value:state.text,start:issue.start,end:issue.end,rect:field.getBoundingClientRect()},issue.replacement);
  else {
    field.focus({preventScroll:true});
    if(document.activeElement!==field||!matches())throw new Error('编辑区已变化，请重新划选。');
    const fresh=readField(field)!,patch=richPatch(fresh,issue);
    if(!patch)throw new Error('此建议跨越段落或不同格式，请使用侧边栏处理。');
    const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(patch.range);
    if(!document.execCommand('insertText',false,patch.replacement))throw new Error('此编辑区不支持可靠替换，请使用复制。');
  }
  const after=readField(field),expected=state.text.slice(0,issue.start)+issue.replacement+state.text.slice(issue.end);
  if(!after||after.text!==expected)throw new Error('网站重新处理了文字，请检查编辑区内容；可按撤销恢复。');
  return after;
}
