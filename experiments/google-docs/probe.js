// Disposable-document-only feasibility probe. Never included in production builds.
(() => {
 const testPath='/document/d/1wDecbmlCHktxdtgGSjhVlYPOsVrF6TwPAeRupPlpVYM/';
 if(location.hostname!=='docs.google.com'||!location.pathname.startsWith(testPath)||window!==top||document.getElementById('lingo-docs-probe'))return;
 const host=document.createElement('div');host.id='lingo-docs-probe';
 Object.assign(host.style,{position:'fixed',right:'16px',bottom:'16px',width:'460px',zIndex:'2147483647'});
 const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>:host{all:initial}section{background:#fffef9;border:2px solid #315942;border-radius:14px;padding:14px;font:13px system-ui;color:#243e30;box-shadow:0 4px 30px #0003}button{margin:4px;padding:8px;border:1px solid #8da391;border-radius:8px;background:#edf2e8;color:#243e30}textarea{box-sizing:border-box;width:100%;height:240px;font:11px monospace}h3{margin:0 0 8px}</style><section><h3>Lingo · Docs 专项验证（仅测试文档）</h3><button data-op="inspect">检查选区</button><button data-op="copy">读取选区 Copy</button><button data-op="insert">测试 insertText</button><button data-op="paste">测试合成 Paste</button><button data-op="capture">记录选区</button><button data-op="guarded">替换已记录选区</button><button data-op="sentinel">写入测试剪贴板</button><input aria-label="剪贴板检查" placeholder="在此粘贴检查剪贴板"><textarea readonly aria-label="Docs 适配诊断"></textarea></section>`;
 document.documentElement.append(host);
 const output=root.querySelector('textarea');let log=[],lastTarget=null,epoch=0,snapshot=null;
 const invalidate=()=>{epoch++};document.addEventListener('mousedown',e=>{if(!e.composedPath().includes(host))invalidate()},true);document.addEventListener('visibilitychange',invalidate);window.addEventListener('blur',invalidate);
 const write=(kind,data)=>{log.push({kind,...data});log=log.slice(-3);output.value=JSON.stringify(log,null,2);output.scrollTop=output.scrollHeight;};
 const docs=()=>[document,...Array.from(document.querySelectorAll('iframe')).flatMap(f=>{try{return f.contentDocument?[f.contentDocument]:[]}catch{return[]}})];
 const describe=el=>el?{tag:el.tagName,role:el.getAttribute('role'),class:el.className,editable:el.isContentEditable}:null;
 const inspect=()=>write('selection',{contexts:docs().map(d=>({active:describe(d.activeElement),selection:d.getSelection()?.toString(),rangeCount:d.getSelection()?.rangeCount,editables:Array.from(d.querySelectorAll('[contenteditable="true"]')).slice(0,5).map(e=>({...describe(e),text:e.textContent?.slice(0,180)}))})),annotations:Array.from(document.querySelectorAll('svg [aria-label]')).slice(0,6).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')})),selectionRects:document.querySelectorAll('.kix-selection-overlay').length});
 // Attempted clipboard-write suppression; native tests show Docs still overwrites it.
 const copyWithSuppressionAttempt=d=>{const prevent=e=>e.preventDefault();d.addEventListener('copy',prevent,true);try{return d.execCommand('copy')}finally{d.removeEventListener('copy',prevent,true)}};
 const hooked=new WeakSet();
 const hook=()=>docs().forEach(d=>{if(hooked.has(d))return;hooked.add(d);d.addEventListener('keydown',invalidate,true);d.addEventListener('beforeinput',invalidate,true);d.addEventListener('mousedown',e=>{if(!e.composedPath().includes(host))invalidate()},true);d.addEventListener('copy',e=>{queueMicrotask(()=>write('copy-event',{trusted:e.isTrusted,types:Array.from(e.clipboardData?.types||[]),text:e.clipboardData?.getData('text/plain')?.slice(0,500),html:e.clipboardData?.getData('text/html')?.slice(0,250)}));},true);d.addEventListener('focusin',e=>{if(!e.composedPath().includes(host)&&e.target.isContentEditable)lastTarget=e.target;},true);});
 hook();const timer=setInterval(hook,1000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 root.addEventListener('mousedown',e=>{if(e.target instanceof HTMLButtonElement)e.preventDefault()});
 root.addEventListener('click',async e=>{const op=e.target.dataset.op;if(!op)return;hook();if(op==='inspect'){inspect();return;}if(op==='sentinel'){await navigator.clipboard.writeText('LINGO_CLIPBOARD_SENTINEL');write('sentinel-written',{});return;}
 const target=document.querySelector('iframe.docs-texteventtarget-iframe')?.contentDocument?.querySelector('[contenteditable="true"]');
 if(!target){write('error',{message:'No editable target'});return;}const d=target.ownerDocument;target.focus();
 if(op==='capture'){const version=epoch;if(!copyWithSuppressionAttempt(d)){write('capture-failed',{});return;}await new Promise(r=>setTimeout(r,80));const text=d.getSelection()?.toString()||'';snapshot=version===epoch&&text.trim()?{text,epoch}:null;write('captured',{snapshot});return;}
 if(op==='guarded'){if(!snapshot||snapshot.epoch!==epoch){write('blocked',{reason:'Selection changed; capture again. No write.'});return;}const original=snapshot;if(!copyWithSuppressionAttempt(d))return;await new Promise(r=>setTimeout(r,80));if(original.epoch!==epoch||d.getSelection()?.toString()!==original.text){snapshot=null;write('blocked',{reason:'Source changed; no write.'});return;}snapshot=null;const data=new DataTransfer();data.setData('text/plain','Can you send it to me today?');target.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));write('guarded-paste',{source:original.text,result:'Can you send it to me today?',note:'Verify persisted document and undo separately.'});return;}
 if(op==='copy'){write('copy-command',{returned:d.execCommand('copy')});setTimeout(()=>write('after-copy',{selection:d.getSelection()?.toString(),text:target.textContent}),80);}
 if(op==='insert')write('insert-command',{returned:d.execCommand('insertText',false,'Can you send it to me today?')});
 if(op==='paste'){const data=new DataTransfer();data.setData('text/plain','Can you send it to me today?');const ev=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});write('paste-command',{returned:target.dispatchEvent(ev),prevented:ev.defaultPrevented});}
 });
 inspect();
})();
