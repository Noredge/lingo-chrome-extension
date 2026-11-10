// IME confirmation is input, not a shortcut, including browsers that end composition
// just before delivering its final key event.
export function createShortcutGuard(scope: Document | ShadowRoot) {
  let composing=false, settledAt=0;
  const document=scope instanceof Document?scope:scope.ownerDocument,held=new Set<string>();
  scope.addEventListener('compositionstart',()=>{composing=true;},true);
  scope.addEventListener('compositionend',()=>{composing=false;settledAt=performance.now()+100;},true);
  const ready=()=>!composing && performance.now()>=settledAt;
  // Consume the whole handled key gesture even if its action closes the UI or moves focus.
  document.addEventListener('keydown',event=>{
    if(!event.isTrusted)return;
    if(event.repeat&&held.has(event.key))consumeShortcut(event);
    else if(!event.repeat)held.delete(event.key);
  },true);
  document.addEventListener('keyup',event=>{if(event.isTrusted&&held.delete(event.key))consumeShortcut(event);},true);
  document.defaultView?.addEventListener('blur',()=>held.clear());
  return {ready, accepts:(event:KeyboardEvent)=>event.isTrusted && !event.defaultPrevented && !event.isComposing && event.keyCode!==229 && ready(),consume:(event:KeyboardEvent)=>{held.add(event.key);consumeShortcut(event);}};
}
export const plainKey=(event:KeyboardEvent)=>!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
function consumeShortcut(event:KeyboardEvent) { event.preventDefault(); event.stopImmediatePropagation(); }
