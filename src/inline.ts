import {localize,resolveLanguage,setLanguage,t} from './i18n';
import {fieldLayoutKey} from './inline-observation';
import {checkServiceStatus,type CheckServiceStatus} from './inline-status';
import {MAX_TEXT} from './core';
import {acceptIssue,type Issue,type Diagnostics} from './diagnostics';
import {fieldClip,measureMarks,type MarkRect} from './inline-layout';
import {plainField,supportedField,fieldFor,fieldContains,selectionCollapsed,readField,canApplyIssue,applyFieldIssue,type TextField,type FieldState} from './inline-editor';
import {inlineChanges} from './inline-changes';
import {revealFieldRange} from './inline-navigation';
import {emptyDictionary,readDictionary,dictionaryWord,filterDictionaryIssues,type DictionaryState} from './dictionary';
import css from './inline.css?inline';
import {createShortcutGuard,plainKey} from './shortcuts';
import {readTriggerVisibility,type TriggerVisibility} from './inline-preferences';

export function createInlineChecker() {
  const host=document.createElement('div');host.id='lingo-inline-root';
  host.style.cssText='all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483646!important;pointer-events:none!important';
  const root=host.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=css;root.append(style);localize(root);
  const ui=document.createElement('div');
  // Constant UI only. Source, model output and errors are inserted as text, never markup.
  ui.innerHTML=`<div class="marks" aria-hidden="true"></div><div class="mirror" translate="no" aria-hidden="true"></div><button class="trigger" type="button" hidden aria-expanded="false" aria-controls="inline-popover" title="手动检查当前输入框全文">Lingo · 检查</button>
  <section id="inline-popover" class="popover" role="dialog" aria-label="Lingo 行内检查" hidden>
    <div class="heading"><strong>行内检查</strong><button class="close" type="button" aria-label="收起建议">×</button></div>
    <div class="overview"><p class="scope">仅发送当前输入框全文；点击检查才发送。</p><label class="options"><input type="checkbox" class="auto-check">在此网站自动检查</label><label class="options"><input type="checkbox" class="include-style">包含表达优化（可选）</label><p class="preference-source"></p><button type="button" class="follow-defaults" hidden>跟随全局设置</button><div class="row"><button type="button" class="run primary">检查全文</button><button type="button" class="cancel" hidden>停止</button></div><div class="legend"><span class="grammar-key">红线：语法与拼写</span><span class="style-key">绿线：表达改进</span></div><div class="list"></div></div>
    <div class="detail" hidden><div class="heading"><span class="category"></span><button type="button" class="back">所有建议</button></div><div class="change" translate="no" dir="auto"><del></del><span aria-hidden="true">→</span><ins></ins></div><div class="related" translate="no" dir="auto"></div><div class="linked-note"></div><div class="reason" translate="no" dir="auto"></div><div class="row"><button type="button" class="accept primary">接受修改</button><button type="button" class="ignore">忽略本次</button></div><button type="button" class="add-word" hidden>加入个人词典</button><div class="dictionary-feedback" role="status" aria-live="polite"></div></div>
    <div class="status" role="status" aria-live="polite"></div><div class="geometry"></div><div class="footer"><button type="button" class="undo" disabled>撤销上次接受</button><button type="button" class="settings">打开设置</button></div>
  </section><div class="announcement" role="status" aria-live="polite"></div>`;root.append(ui);
  const shortcutGuard=createShortcutGuard(document);
  ui.querySelector('.accept')!.setAttribute('aria-keyshortcuts','Enter');
  const $=<T extends HTMLElement=HTMLElement>(name:string)=>root.querySelector<T>('.'+name)!;
  const detail=$('detail');$('list').tabIndex=-1;$('list').setAttribute('aria-label','修改建议列表');
  let state:FieldState|null=null;
  let target:TextField|null=null,source='',issues:Issue[]=[],skipped=0,checked=false,active:string|null=null,open=false,listOpen=false;
  let allowed=false,locale:'zh-CN'|'zh-TW'|'en'='zh-CN',configEpoch=0,generation=0;
  let composing=false,compositionTyped=false,applying=false,pending=false,automaticRequest=false,port:chrome.runtime.Port|null=null,requestTimer:ReturnType<typeof setTimeout>|undefined;
  let timer:ReturnType<typeof setInterval>|undefined,frame=0,rects:MarkRect[]=[],geometryMessage='',notice='',error=false;
  let dictionary=emptyDictionary(),dictionaryReady=false,dictionaryEpoch=0,savingWord=false,dictionaryProblem='',dictionaryFeedback='';
  const visibleIssues=()=>filterDictionaryIssues(issues,source,dictionary.words);
  const category=(issue:Issue)=>issue.kind==='style'?'表达优化 · 可选':issue.kind==='spelling'?'拼写':'语法';
  let reviewPlacement:{left:number;top:number;height:number}|null=null;
  let lastLayoutKey='',validateScheduled=false,markWatchPoints:{left:number;top:number}[]=[];
  let serviceStatus:CheckServiceStatus={ready:false,label:'Lingo · 加载中',message:'正在读取检查设置…',action:'打开设置'};
  let inherited=true,triggerVisibility:TriggerVisibility='issues';
  let autoCheck=false,styleEnabled=false,autoReady=false,preferencesReady=false,savingPreferences=false,preferenceEpoch=0;
  type Snapshot={source:string;revision:string;issues:Issue[];skipped:number;checked:boolean;notice:string;error:boolean};
  let cache=new WeakMap<TextField,Snapshot>();
  let autoTimer:ReturnType<typeof setTimeout>|undefined,lastAutoStart=0;
  let trustedEdit=false,editEventTimer:ReturnType<typeof setTimeout>|undefined;
  let hoverOpen=false,hoverCandidate:string|null=null,anchorKey:string|null=null;
  let hoverTimer:ReturnType<typeof setTimeout>|undefined,leaveTimer:ReturnType<typeof setTimeout>|undefined;
  let pointer={x:0,y:0};
  const AUTO_DELAY=1200,AUTO_INTERVAL=4000;
  let undo:{before:string;after:string;issues:Issue[];skipped:number}|null=null;
  const changed=()=>{if(!applying&&target&&current())schedule();};
  const mutations=new MutationObserver(changed),ancestors=new MutationObserver(changed),styles=new MutationObserver(changed);
  const resize=new ResizeObserver(()=>schedule(true));
  const includeStyle=()=>styleEnabled;
  function cancelHover(){clearTimeout(hoverTimer);clearTimeout(leaveTimer);hoverTimer=leaveTimer=undefined;hoverCandidate=null;}
  function endHover(){cancelHover();if(hoverOpen)open=false;hoverOpen=false;anchorKey=null;}
  function dismissHover(){if(!hoverOpen){cancelHover();return;}endHover();active=null;render();}
  const contains=(r:MarkRect,x:number,y:number)=>x>=r.left&&x<=r.left+r.width&&y>=r.hitTop&&y<=r.top+r.height;
  function leaveHover(){clearTimeout(hoverTimer);hoverTimer=undefined;hoverCandidate=null;if(hoverOpen&&!leaveTimer)leaveTimer=setTimeout(()=>{leaveTimer=undefined;dismissHover();},220);}
  const fieldFocused=()=>document.activeElement===target||document.activeElement===host&&open;
  function cancelAuto(){clearTimeout(autoTimer);autoTimer=undefined;}
  function queueAuto(){
    cancelAuto();if(!dictionaryReady||!autoCheck||!autoReady||!preferencesReady||!allowed||savingPreferences||pending||checked||error||composing||!target||document.hidden||!fieldFocused()||!source.trim()||source.length>MAX_TEXT)return;
    const field=target,version=generation;
    autoTimer=setTimeout(()=>{autoTimer=undefined;if(field!==target||version!==generation||!dictionaryReady||!autoCheck||!autoReady||!preferencesReady||composing||document.hidden||!fieldFocused()||!current())return;run(true);},Math.max(AUTO_DELAY,AUTO_INTERVAL-(Date.now()-lastAutoStart)));
    notice='即将自动检查当前输入框…';render();
  }
  function stop(){cancelAuto();endHover();generation++;pending=false;automaticRequest=false;clearTimeout(requestTimer);const old=port;port=null;old?.disconnect();}
  function clear(){
    if(autoCheck&&target&&readField(target)?.revision===state?.revision&&(checked||error))cache.set(target,{source,revision:state!.revision,issues,skipped,checked,notice,error});
    stop();reviewPlacement=null;trustedEdit=false;clearTimeout(editEventTimer);compositionTyped=false;target=null;state=null;source='';issues=[];undo=null;rects=[];open=listOpen=false;active=null;checked=false;resize.disconnect();mutations.disconnect();ancestors.disconnect();styles.disconnect();lastLayoutKey='';markWatchPoints=[];validateScheduled=false;clearInterval(timer);cancelAnimationFrame(frame);frame=0;host.remove();$('popover').insertBefore(detail,$('status'));$('marks').replaceChildren();$('mirror').replaceChildren();$('list').replaceChildren();$('related').replaceChildren();$('linked-note').textContent='';$('reason').textContent='';$('change').querySelector('del')!.textContent='';$('change').querySelector('ins')!.textContent='';
  }
  function invalidate(message='原文已变化，请重新检查。') {
    if(target)cache.delete(target);
    stop();state=target?readField(target):null;source=state?.text||'';issues=[];undo=null;skipped=0;checked=false;active=null;notice=message;error=false;rects=[];$('marks').replaceChildren();$('mirror').replaceChildren();render();
  }
  function current(){
    if(!target||!supportedField(target)){clear();return false;}
    const now=readField(target);if(!now){clear();return false;}
    if(now.text!==source||now.revision!==state?.revision){invalidate();return false;}state=now;return true;
  }
  function activate(value:unknown){
    const field=fieldFor(value);
    if(!allowed||!supportedField(field)){clear();return;}
    if(field===target){queueAuto();return;}
    clear();state=readField(field);if(!state)return;target=field;source=state.text;notice='';error=false;skipped=0;composing=false;
    const saved=autoCheck?cache.get(field):undefined;
    if(saved?.source===source&&saved.revision===state.revision){issues=saved.issues;skipped=saved.skipped;checked=saved.checked;notice=saved.notice;error=saved.error;if(checked)notice=resultNotice();}
    document.documentElement.append(host);resize.observe(field);mutations.observe(field,{subtree:true,childList:true,characterData:true,attributes:true});watchAncestors();
    if(document.head)styles.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true});
    timer=setInterval(()=>{
      if(!target)return;
      // Plain value setters do not emit DOM mutations; keep their cheap check.
      if(!target.isConnected||plainField(target)&&target.value!==source){current();return;}
      if(fieldLayoutKey(target,state,issues,host,markWatchPoints)!==lastLayoutKey&&current()){watchAncestors();layout();}
    },200);render();queueAuto();
  }
  function watchAncestors(){ancestors.disconnect();for(let el=target?.parentElement;el;el=el.parentElement)ancestors.observe(el,{attributes:true});}
  function schedule(validate=false){validateScheduled ||= validate;if(!frame&&target)frame=requestAnimationFrame(()=>{frame=0;const verify=validateScheduled;validateScheduled=false;if(target&&(!verify||current()))layout();});}
  function place(el:HTMLElement,anchor:{left:number;right:number;top:number;bottom:number},alignStart=false){
    const v=visualViewport,x=v?.offsetLeft||0,y=v?.offsetTop||0,w=v?.width||innerWidth,h=v?.height||innerHeight;
    el.style.maxWidth=`${Math.max(0,w-16)}px`;el.style.maxHeight=`${Math.max(0,h-16)}px`;
    const width=el.offsetWidth,height=el.offsetHeight;
    el.style.left=`${Math.max(x+8,Math.min(alignStart?anchor.left:anchor.right-width,x+w-width-8))}px`;
    let top=anchor.bottom+7;if(top+height>y+h-8)top=anchor.top-height-7;
    el.style.top=`${Math.max(y+8,Math.min(top,y+h-height-8))}px`;
  }
  function placeReview(){
    if(!reviewPlacement)return;
    const v=visualViewport,x=v?.offsetLeft||0,y=v?.offsetTop||0,w=v?.width||innerWidth,h=v?.height||innerHeight,el=$('popover');
    el.style.maxWidth=`${Math.max(0,w-16)}px`;
    el.style.maxHeight=`${Math.max(0,Math.min(reviewPlacement.height,h-16))}px`;
    el.classList.toggle('context-tight',el.offsetHeight<560);
    el.style.left=`${Math.max(x+8,Math.min(reviewPlacement.left,x+w-el.offsetWidth-8))}px`;
    el.style.top=`${Math.max(y+8,Math.min(reviewPlacement.top,y+h-el.offsetHeight-8))}px`;
  }
  function keepContextVisible(){
    if(!target||!active)return;
    const word=rects.find(r=>r.id===active);if(!word)return;
    const el=$('popover'),box=el.getBoundingClientRect(),field=target.getBoundingClientRect();
    const v=visualViewport,x=v?.offsetLeft||0,y=v?.offsetTop||0,w=v?.width||innerWidth,h=v?.height||innerHeight;
    // Prefer the side of the editor; otherwise leave the selected line visible
    // above/below the list. Retain this placement after accepting the suggestion.
    let left=box.left,top=box.top,height=box.height;
    if(field.right+8+box.width<=x+w-8)left=field.right+8;
    else if(field.left-8-box.width>=x+8)left=field.left-8-box.width;
    else if(box.left<word.left+word.width+24&&box.right>word.left-24&&box.top<word.top+28&&box.bottom>word.hitTop-24){
      const below=y+h-8-(word.top+28),above=word.hitTop-24-y-8;
      if(below>=above){top=word.top+28;height=Math.max(0,below);}
      else {height=Math.max(0,above);top=y+8;}
    }
    reviewPlacement={left,top,height};placeReview();
  }
  function layout(){
    if(!target)return;
    lastLayoutKey=fieldLayoutKey(target,state,issues,host,markWatchPoints);
    const clip=fieldClip(target);
    $('trigger').hidden=!clip||composing||!preferencesReady||!source.trim()||triggerVisibility==='never'||triggerVisibility==='issues'&&!visibleIssues().length;
    $('popover').hidden=!clip||!open||composing;
    if(!clip||composing){$('marks').replaceChildren();rects=[];markWatchPoints=[];return;}
    if(!$('trigger').hidden)place($('trigger'),clip);
    // Hide during a site's modal or another extension overlay rather than paint above it.
    const midpoint=document.elementFromPoint((clip.left+clip.right)/2,(clip.top+clip.bottom)/2);
    if(!fieldContains(target,midpoint)&&midpoint!==host){$('trigger').hidden=true;$('popover').hidden=true;$('marks').replaceChildren();rects=[];return;}
    const displayed=visibleIssues();markWatchPoints=[];
    if(displayed.length){const ranges=displayed.flatMap(issue=>inlineChanges(issue).map(change=>({...change,id:issue.id,kind:issue.kind})));const measured=measureMarks(target,$('mirror'),ranges,host,state||undefined,false,markWatchPoints);rects=measured.rects;geometryMessage=measured.reliable?'':'此输入框暂用建议列表，避免划线错位。';}
    else {rects=[];geometryMessage='';$('mirror').replaceChildren();}
    if(hoverOpen&&!rects.some(r=>r.key===anchorKey)){endHover();active=null;$('popover').hidden=true;}
    const marks=document.createDocumentFragment();
    for(const r of rects){
      if(r.id===active&&(!anchorKey||r.key===anchorKey)){const shade=document.createElement('span');shade.className=`word-active ${r.kind==='style'?'style':''}`;shade.style.cssText=`left:${r.left}px;top:${r.hitTop}px;width:${r.width}px;height:${r.top+r.height-r.hitTop}px`;marks.append(shade);}
      const mark=document.createElement('span');mark.className=`mark ${r.kind==='style'?'style':''} ${r.id===active?'active':''}`;mark.dataset.issue=r.id;mark.dataset.key=r.key;mark.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;marks.append(mark);
    }
    $('marks').replaceChildren(marks);$('geometry').textContent=geometryMessage;
    if(open){
      if(listOpen&&reviewPlacement)placeReview();
      else {$('popover').classList.remove('context-tight');const at=listOpen?undefined:rects.find(r=>r.key===anchorKey)||rects.find(r=>r.id===active);place($('popover'),at?{left:at.left,right:at.left+at.width,top:at.hitTop,bottom:at.top+4}:$('trigger').hidden?clip:$('trigger').getBoundingClientRect(),!!at);}
    }
    lastLayoutKey=fieldLayoutKey(target,state,issues,host,markWatchPoints);
  }
  function render(){
    const focused=root.activeElement as HTMLElement|null,focusedIssue=focused?.dataset.id,listScroll=$('list').scrollTop,popoverScroll=$('popover').scrollTop;
    // The same detail controls serve a compact word card or an expanded row in the list.
    $('popover').insertBefore(detail,$('status'));
    const displayed=visibleIssues();
    $('preference-source').textContent=inherited?'当前跟随全局默认设置。':'此网站使用单独设置。';$('follow-defaults').hidden=inherited;
    const loading=!preferencesReady||!dictionaryReady&&!dictionaryProblem;
    const blocked=dictionaryProblem||(!autoReady?serviceStatus.message:'')||(loading?'正在读取检查设置…':'');
    $('scope').textContent=autoCheck?(blocked?'已保留自动检查设置，当前暂不能检查。':'自动检查已开启：进入文本框或输入停顿后，将当前框全文发送至所选服务。'):'仅发送当前输入框全文；点击检查才发送。';
    $('settings').textContent=serviceStatus.action;
    $<HTMLInputElement>('auto-check').checked=autoCheck;$<HTMLInputElement>('auto-check').disabled=savingPreferences;
    $<HTMLInputElement>('include-style').checked=styleEnabled;
    $('trigger').textContent=blocked?(dictionaryProblem?'Lingo · 暂不可用':!autoReady?serviceStatus.label:'Lingo · 加载中'):pending?'Lingo · 检查中…':autoTimer?'Lingo · 即将检查':checked?`Lingo · ${displayed.length}`:error?'Lingo · 检查失败':autoCheck?'Lingo · 自动':'Lingo · 检查';
    $('trigger').setAttribute('aria-expanded',String(open));$('trigger').setAttribute('aria-busy',String(pending));$('trigger').title=blocked|| (error?notice:checked?`${displayed.length} 条建议，悬停或点击划线查看。`:autoCheck?'自动检查已开启，无需点击检查全文。':'手动检查当前输入框全文');$('announcement').textContent=open?'':blocked||notice;$('overview').hidden=!!active&&!listOpen;detail.hidden=!active;
    $('popover').classList.toggle('list-open',listOpen&&checked);$('back').textContent=listOpen?'收起详情':'所有建议';
    $<HTMLButtonElement>('run').disabled=!autoReady||!preferencesReady||!dictionaryReady||pending||composing||savingPreferences||!source.trim()||source.length>MAX_TEXT;
    $('run').textContent=checked?'重新检查':'检查全文';$('cancel').hidden=!pending;
    $<HTMLInputElement>('include-style').disabled=pending||savingPreferences;
    $<HTMLButtonElement>('undo').disabled=!undo||pending||composing;
    $('status').textContent=blocked|| (source.length>MAX_TEXT?'输入框内容过长，请缩短到 16,000 个字符以内。':notice);
    $('status').classList.toggle('error',error||!!dictionaryProblem||!serviceStatus.ready&&serviceStatus.label!=='Lingo · 加载中');$('list').replaceChildren();
    for(const issue of displayed){const b=document.createElement('button');b.type='button';b.className='issue';b.dataset.kind=issue.kind;b.dataset.id=issue.id;
      const label=document.createElement('span');label.className='category';label.textContent=category(issue);
      const text=document.createElement('span');text.translate=false;text.dir='auto';text.textContent=issue.source+' → '+issue.replacement;b.append(label,text);b.setAttribute('aria-expanded',String(listOpen&&active===issue.id));b.addEventListener('click',()=>{select(issue.id,undefined,false,true);if(active===issue.id){$('accept').focus({preventScroll:true});scrollListTo($('accept'));}});$('list').append(b);if(listOpen&&active===issue.id)$('list').append(detail);}
    const issue=displayed.find(i=>i.id===active);$('popover').classList.toggle('compact',!!issue&&!listOpen);$('related').replaceChildren();$('linked-note').textContent='';
    const word=issue?dictionaryWord(issue,source):null;
    $('add-word').hidden=!word;$<HTMLButtonElement>('add-word').disabled=savingWord||!dictionaryReady;
    $('add-word').title=word?`加入词条：${word}`:'';
    $('dictionary-feedback').textContent=dictionaryProblem||dictionaryFeedback;
    if(issue){
      $('detail').dataset.kind=issue.kind;root.querySelector<HTMLElement>('.detail .category')!.textContent=category(issue);
      const edits=inlineChanges(issue),at=rects.find(r=>r.key===anchorKey),selected=edits.find(edit=>edit.start===at?.start)||edits[0];
    const before=(text:string)=>text?text.trim()?text:t('空白'):t('插入');const after=(text:string)=>text?text.trim()?text:t('空白'):t('删除');
      $('change').querySelector('del')!.textContent=before(selected.source);$('change').querySelector('ins')!.textContent=after(selected.replacement);$('reason').textContent=issue.reason;
      for(const edit of edits.filter(edit=>edit!==selected)){const row=document.createElement('div'),old=document.createElement('del'),next=document.createElement('ins');old.textContent=before(edit.source);next.textContent=after(edit.replacement);row.append(old,document.createTextNode(' → '),next);$('related').append(row);}
      if(edits.length>1)$('linked-note').textContent=`此建议包含 ${edits.length} 处关联修改，将一起接受。`;
    }else{$('reason').textContent='';$('change').querySelector('del')!.textContent='';$('change').querySelector('ins')!.textContent='';}
    layout();
    $('list').scrollTop=listScroll;$('popover').scrollTop=popoverScroll;
    const restore=focusedIssue?[...$('list').querySelectorAll<HTMLElement>('.issue')].find(el=>el.dataset.id===focusedIssue):focused;
    if(restore?.isConnected&&!restore.closest('[hidden]')&&restore!==root.activeElement)restore.focus({preventScroll:true});
    // A refreshed list may remove its focused row; keep focus in the review rather than losing the editor.
    if(focused&&open&&!$('overview').hidden&&document.activeElement===document.body)$('list').focus({preventScroll:true});
  }
  function scrollListTo(el:HTMLElement){const bounds=$('list').getBoundingClientRect(),at=el.getBoundingClientRect();if(at.top<bounds.top)$('list').scrollTop+=at.top-bounds.top;else if(at.bottom>bounds.bottom)$('list').scrollTop+=at.bottom-bounds.bottom;const panel=$('popover').getBoundingClientRect(),control=el.getBoundingClientRect();if(control.bottom>panel.bottom-14)$('popover').scrollTop+=control.bottom-panel.bottom+14;else if(control.top<panel.top+14)$('popover').scrollTop+=control.top-panel.top-14;}
  function focusList(index:number){const rows=$('list').querySelectorAll<HTMLElement>('.issue'),next=rows[Math.min(Math.max(index,0),rows.length-1)];(next||$('list')).focus({preventScroll:true});if(next)scrollListTo(next);}
  function collapse(){
    const field=target;if(!current()||!field)return;
    // Return keyboard focus before hiding the controls; site focus handlers may change the target.
    field.focus({preventScroll:true});if(target!==field||!current())return;
    endHover();reviewPlacement=null;open=listOpen=false;active=null;render();
  }
  function revealMarks(){
    if(!visibleIssues().length||skipped){render();return;}
    collapse();
    // Keep the list visible when none of the suggestions can be drawn in the current viewport.
    if(target&&(!rects.length||geometryMessage)){open=listOpen=true;render();}
  }
  function select(id:string|null,mark?:MarkRect,hover=false,fromList=false){
    if(!current()||id!==null&&!visibleIssues().some(i=>i.id===id))return;
    dictionaryFeedback='';cancelHover();hoverOpen=hover;anchorKey=mark?.key||null;listOpen=fromList||id===null;active=id;open=true;
    render();
    if(fromList){
      // A native input may reset horizontal scrolling on blur; move focus first.
      $('accept').focus({preventScroll:true});if(!current()||!target||!state)return;
      const issue=visibleIssues().find(i=>i.id===id);const change=issue&&inlineChanges(issue)[0];
      if(change)revealFieldRange(target,$('mirror'),state,change.start,change.end);
      if(!current())return;layout();keepContextVisible();
    }
  }
  function resultNotice(){const count=visibleIssues().length;return skipped?'部分建议无法安全定位，已跳过。':count?`${count} 条建议，悬停或点击划线查看。`:'未发现需要修改的问题。';}
  function failure(message:string){stop();issues=[];checked=false;active=null;notice=message;error=true;render();}
  function run(automatic=false){
    if(!autoReady||!preferencesReady||!dictionaryReady||!current()||composing||!source.trim()||source.length>MAX_TEXT||savingPreferences||automatic&&(!autoCheck||!autoReady))return;
    stop();issues=[];undo=null;active=null;checked=false;skipped=0;notice='正在检查当前输入框…';error=false;pending=true;automaticRequest=automatic;if(!automatic)open=true;else lastAutoStart=Date.now();
    if(target)cache.delete(target);
    const version=generation,field=target,text=source,id=crypto.randomUUID();
    try{
      const request=chrome.runtime.connect({name:'lingo-check'});port=request;
      request.onMessage.addListener(event=>{
        if(version!==generation||field!==target||event.id!==id||!current())return;
        if(event.type==='error'){failure(event.error);return;}
        if(event.type!=='checked')return;
        const result=event as Diagnostics;issues=result.issues.filter(issue=>field&&state&&canApplyIssue(field,state,issue));skipped=result.skipped+result.issues.length-issues.length;checked=true;stop();
        notice=resultNotice();if(automatic)render();else revealMarks();
      });
      request.onDisconnect.addListener(()=>{const message=chrome.runtime.lastError?.message;if(port===request&&version===generation)failure(message?'扩展连接已断开，请刷新网页后重试。':'检查中断，请重试。');});
      requestTimer=setTimeout(()=>{if(version===generation)failure('请求超时，请稍后重试。');},125000);
      request.postMessage({type:'run',automatic,task:{id,text,includeStyle:includeStyle(),locale}});
    }catch{failure('扩展已更新，请刷新网页后使用。');}render();
  }
  function accept(){
    if(!current()||composing||!target)return;
    const issue=visibleIssues().find(i=>i.id===active);if(!issue)return;
    const index=visibleIssues().findIndex(i=>i.id===active),keepList=listOpen;
    const field=target,before=source,previous=issues,previousSkipped=skipped,next=acceptIssue(source,issues,issue.id);endHover();
    const top=field.scrollTop,left=field.scrollLeft;applying=true;
    try{
      state=applyFieldIssue(field,state!,issue);
      source=next.text;issues=next.issues;undo={before,after:source,issues:previous,skipped:previousSkipped};active=null;
      // Keep an explicitly opened review list; direct underline cards still dismiss.
      open=keepList;
      notice=next.invalidated?'已接受修改；同句中的其他建议已清除，请重新检查。':'已接受修改，可撤销上次接受。';error=false;field.scrollTop=top;field.scrollLeft=left;
      if(keepList&&!visibleIssues().length&&!next.invalidated)notice='当前建议已处理完，可撤销上次接受。';
    }catch(e){state=readField(field);source=state?.text||'';issues=[];undo=null;checked=false;active=null;notice=(e as Error).message;error=true;}
    finally{applying=false;}render();if(keepList&&!error&&target===field)focusList(index);
  }
  function undoAccept(){
    if(!current()||!target||!undo||composing)return;
    const field=target,record=undo;applying=true;
    try{field.focus({preventScroll:true});if(!supportedField(field)||document.activeElement!==field||readField(field)?.revision!==state?.revision||readField(field)?.text!==record.after)throw new Error('原文已变化，请重新检查。');
      if(!document.execCommand('undo')||readField(field)?.text!==record.before)throw new Error('无法可靠撤销，请检查输入框内容。');
      state=readField(field);source=record.before;issues=record.issues;skipped=record.skipped;checked=true;active=null;undo=null;notice='已撤销上次接受。';error=false;
    }catch(e){state=readField(field);source=state?.text||'';issues=[];undo=null;checked=false;active=null;notice=(e as Error).message;error=true;}finally{applying=false;}render();
  }
  root.addEventListener('pointerdown',e=>{if((e.target as Element).closest('button'))e.preventDefault();});
  $('trigger').addEventListener('click',()=>{if(current()){const next=hoverOpen||!open;endHover();reviewPlacement=null;open=listOpen=next;active=null;render();}});
  $('run').addEventListener('click',event=>{if(event.isTrusted)run();});$('accept').addEventListener('click',accept);$('undo').addEventListener('click',undoAccept);
  $('close').addEventListener('click',()=>{if(pending&&!automaticRequest){stop();notice='已停止检查。';}collapse();});$('back').addEventListener('click',()=>{const index=visibleIssues().findIndex(i=>i.id===active);select(null);if(open)focusList(index);});
  $('cancel').addEventListener('click',()=>{stop();notice='已停止检查。';render();});
  $('ignore').addEventListener('click',()=>{if(current()){const index=visibleIssues().findIndex(i=>i.id===active),keyboard=root.activeElement===$('ignore');endHover();issues=issues.filter(i=>i.id!==active);if(undo)undo.issues=undo.issues.filter(i=>i.id!==active);active=null;notice='已忽略本次，原文未修改。';if(keyboard)target?.focus({preventScroll:true});render();if(listOpen)focusList(index);}});
  async function refreshPreferences(schedule=true){
    const epoch=++preferenceEpoch;
    try{const prefs=await chrome.runtime.sendMessage({type:'inlineConfig'});if(epoch!==preferenceEpoch)return;if(prefs?.error){preferencesReady=false;autoCheck=false;invalidate(prefs.error);return;}applyPreferences(prefs,schedule);}
    catch{if(epoch===preferenceEpoch){preferencesReady=false;autoCheck=false;invalidate('扩展已更新，请刷新网页后使用。');}}
  }
  function applyPreferences(prefs:{autoCheck:boolean;includeStyle:boolean;inherited?:boolean;triggerVisibility?:TriggerVisibility},schedule=true){
    inherited=prefs.inherited===true;
    triggerVisibility=readTriggerVisibility(prefs.triggerVisibility);
    const changed=autoCheck!==prefs.autoCheck||styleEnabled!==prefs.includeStyle;
    preferencesReady=true;autoCheck=prefs.autoCheck===true;styleEnabled=prefs.includeStyle===true;
    if(changed){cache=new WeakMap();invalidate('检查选项已变化，请重新检查。');}else render();
    if(schedule)queueAuto();
  }
  async function savePreferences(event:Event,reset=false){
    if(!event.isTrusted||savingPreferences){render();return;}
    const next={autoCheck:$<HTMLInputElement>('auto-check').checked,includeStyle:$<HTMLInputElement>('include-style').checked};
    const previous={autoCheck,includeStyle:styleEnabled};const epoch=++preferenceEpoch;savingPreferences=true;cache=new WeakMap();autoCheck=next.autoCheck;styleEnabled=next.includeStyle;invalidate('检查选项已变化，请重新检查。');
    try{const prefs=await chrome.runtime.sendMessage(reset?{type:'resetInlineConfig'}:{type:'setInlineConfig',...next});if(prefs?.error)throw new Error(prefs.error);if(epoch===preferenceEpoch)applyPreferences(prefs);}
    catch(e){autoCheck=previous.autoCheck;styleEnabled=previous.includeStyle;notice=(e as Error).message;error=true;}finally{savingPreferences=false;render();queueAuto();}
  }
  function applyDictionary(next:DictionaryState){
    if(next.revision<dictionary.revision)return;
    dictionary=next;dictionaryReady=true;dictionaryProblem='';
    if(target&&!current())return;
    const removed=!!active&&!visibleIssues().some(issue=>issue.id===active);
    if(removed){endHover();active=null;open=listOpen;}
    if(checked&&!error)notice=resultNotice();
    render();if(removed&&listOpen)focusList(0);
  }
  async function refreshDictionary(){
    const epoch=++dictionaryEpoch;
    try{const next=await chrome.runtime.sendMessage({type:'dictionaryState'});if(epoch!==dictionaryEpoch)return;if(next?.error)throw new Error(next.error);applyDictionary(readDictionary(next));}
    catch(e){if(epoch===dictionaryEpoch){dictionaryReady=false;dictionaryProblem=(e as Error).message;cancelAuto();render();}}
  }
  $('add-word').addEventListener('click',async event=>{
    if(!event.isTrusted||savingWord||!dictionaryReady||!current())return;
    const issue=visibleIssues().find(issue=>issue.id===active),word=issue?dictionaryWord(issue,source):null;if(!word)return;
    const field=target,version=generation;savingWord=true;dictionaryFeedback='';render();
    try{const next=await chrome.runtime.sendMessage({type:'dictionaryAction',action:'add',word,revision:dictionary.revision});if(next?.error)throw new Error(next.error);applyDictionary(readDictionary(next));
      if(field===target&&version===generation){notice='已加入个人词典；原文未修改。';error=false;}
    }catch(e){if(field===target&&version===generation)dictionaryFeedback=(e as Error).message;await refreshDictionary();}
    finally{savingWord=false;render();}
  });
  $('include-style').addEventListener('change',event=>void savePreferences(event));$('auto-check').addEventListener('change',event=>void savePreferences(event));
  $('follow-defaults').addEventListener('click',event=>void savePreferences(event,true));
  $('settings').addEventListener('click',()=>void chrome.runtime.sendMessage({type:'options'}).catch(()=>failure('扩展已更新，请刷新网页后使用。')));
  const inside=(e:Event)=>e.composedPath().includes(host);
  document.addEventListener('focusin',e=>{if(!inside(e)&&!applying)activate(e.composedPath()[0]);},true);
  document.addEventListener('focusout',()=>setTimeout(()=>{if(target&&document.activeElement!==target&&document.activeElement!==host)clear();},0),true);
  document.addEventListener('pointerdown',e=>{cancelHover();if(target&&!inside(e)){dismissHover();if(!fieldContains(target,e.composedPath()[0]))clear();}},true);
  document.addEventListener('pointerup',e=>{
    if(e.button!==0||composing||!target||inside(e)||!fieldContains(target,e.composedPath()[0])||!selectionCollapsed(target)||!current())return;
    const hit=rects.find(r=>contains(r,e.clientX,e.clientY));
    if(hit)select(hit.id,hit);else if(open)collapse();
  },true);
  document.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;
    pointer={x:e.clientX,y:e.clientY};
    if(e.buttons||composing||applying||pending||!target||!selectionCollapsed(target)){dismissHover();return;}
    if(inside(e)&&e.composedPath().includes($('popover'))){cancelHover();return;}
    if(open&&!hoverOpen)return;
    const hit=target&&fieldContains(target,e.composedPath()[0])?rects.find(r=>contains(r,e.clientX,e.clientY)):undefined;
    if(!hit){leaveHover();return;}
    clearTimeout(leaveTimer);leaveTimer=undefined;
    if(hoverOpen&&anchorKey===hit.key||hoverCandidate===hit.key)return;
    clearTimeout(hoverTimer);hoverCandidate=hit.key;const version=generation;
    hoverTimer=setTimeout(()=>{hoverTimer=undefined;hoverCandidate=null;const at=rects.find(r=>r.key===hit.key&&contains(r,pointer.x,pointer.y));if(version===generation&&at&&target&&selectionCollapsed(target)&&current())select(at.id,at,true);},220);
  },true);
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget)leaveHover();},true);
  root.addEventListener('focusin',()=>{if(hoverOpen){hoverOpen=false;cancelHover();}});
  // Native execCommand can emit trusted input without a user edit. Require its beforeinput pair.
  document.addEventListener('beforeinput',e=>{if(!applying&&target&&fieldContains(target,e.composedPath()[0])&&e.isTrusted){trustedEdit=true;clearTimeout(editEventTimer);editEventTimer=setTimeout(()=>{trustedEdit=false;},0);}},true);
  document.addEventListener('input',e=>{
    if(applying||!target||!fieldContains(target,e.composedPath()[0]))return;
    const userEdit=e.isTrusted&&trustedEdit;trustedEdit=false;clearTimeout(editEventTimer);
    // Rich DOM mutation delivery can precede input; do not lose its trusted edit.
    if(!userEdit&&readField(target)?.revision===state?.revision)return;
    if(userEdit&&(composing||(e as InputEvent).isComposing))compositionTyped=true;
    invalidate();if(userEdit&&!composing&&!(e as InputEvent).isComposing)queueAuto();
  },true);
  document.addEventListener('change',e=>{if(!applying&&target&&fieldContains(target,e.composedPath()[0])&&readField(target)?.revision!==state?.revision)invalidate();},true);
  document.addEventListener('compositionstart',e=>{if(target&&fieldContains(target,e.composedPath()[0])){composing=true;compositionTyped=false;open=listOpen=false;invalidate();}},true);
  document.addEventListener('compositionend',e=>{if(target&&fieldContains(target,e.composedPath()[0])){const typed=compositionTyped;composing=false;compositionTyped=false;invalidate();if(typed)queueAuto();}},true);
  document.addEventListener('keydown',e=>{
    if(!shortcutGuard.accepts(e)||composing||!plainKey(e))return;
    const origin=e.composedPath()[0],fromField=!!target&&fieldContains(target,origin);
    if(e.key==='Escape'&&open&&(inside(e)||fromField)){shortcutGuard.consume(e);if(!e.repeat){if(listOpen&&active){const index=visibleIssues().findIndex(i=>i.id===active);select(null);focusList(index);}else collapse();}return;}
    if(e.key!=='Enter'||!open||!active||$('popover').hidden||pending||(!fromField&&origin!==$('accept'))||fromField&&!selectionCollapsed(target!))return;
    shortcutGuard.consume(e);if(e.repeat)return;
    accept();
  },true);
  document.addEventListener('scroll',()=>{dismissHover();schedule();},true);window.addEventListener('resize',()=>{dismissHover();schedule(true);});visualViewport?.addEventListener('resize',()=>schedule(true));visualViewport?.addEventListener('scroll',()=>schedule());document.fonts?.addEventListener('loadingdone',()=>schedule(true));
  window.addEventListener('pagehide',()=>{clear();cache=new WeakMap();});document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else activate(document.activeElement);});
  async function config(){const epoch=++configEpoch;preferencesReady=false;autoReady=false;clear();cache=new WeakMap();try{const c=await chrome.runtime.sendMessage({type:'config'});if(epoch!==configEpoch)return;
    serviceStatus=checkServiceStatus(c||{});autoReady=serviceStatus.ready;
    allowed=!!c?.settings&&!c.settings.blockedHosts.includes(location.hostname);locale=resolveLanguage(c?.settings?.uiLanguage);setLanguage(locale);
    clear();if(allowed){await refreshDictionary();if(epoch!==configEpoch)return;activate(document.activeElement);await refreshPreferences();}
  }catch{allowed=false;clear();}}
  // Keep the actual right-click target, including right clicks inside nested rich text.
  // A changed draft or expired menu must never submit a different field silently.
  let menuField:{field:TextField|null;revision:string|undefined;created:number}|undefined;
  document.addEventListener('contextmenu',event=>{
    if(!event.isTrusted)return;
    const field=fieldFor(event.composedPath()[0]),snapshot=field&&supportedField(field)?readField(field):null;
    menuField={field:snapshot?field:null,revision:snapshot?.revision,created:Date.now()};
  },true);
  let configuration=config();
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(msg.type==='dictionaryChanged')void refreshDictionary();
    if(msg.type==='refreshConfig')configuration=config();
    if(msg.type==='inlineConfigChanged'&&(!msg.origin||msg.origin===location.origin))void refreshPreferences(msg.passive!==true);
    if(msg.type==='checkField'&&sender.id===chrome.runtime.id&&!sender.tab){
      const captured=menuField;menuField=undefined;
      void configuration.then(async()=>{
        const field=captured?captured.field:fieldFor(document.activeElement);
        if(!allowed||!supportedField(field))return;
        if(captured&&(Date.now()-captured.created>30000||readField(field)?.revision!==captured.revision))return;
        const revision=readField(field)?.revision;
        field.focus({preventScroll:true});activate(field);await refreshPreferences(false);
        if(target!==field||readField(field)?.revision!==revision||!current())return;
        cancelAuto();endHover();reviewPlacement=null;active=null;open=listOpen=true;render();run();
      }).finally(()=>reply({ok:true}));return true;
    }
  });
}
