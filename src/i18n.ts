import messages from './messages.json';
export type Locale = 'zh-CN' | 'zh-TW' | 'en';
const roots = new Set<Document | ShadowRoot>();
const nodes = new WeakMap<Node,{source:string; rendered:string}>();
const attributes = new WeakMap<Element,Map<string,{source:string;rendered:string}>>();
export function resolveLanguage(choice = 'auto', browser = typeof chrome !== 'undefined' && chrome.i18n ? chrome.i18n.getUILanguage() : 'en'): Locale {
  if (choice !== 'auto' && ['zh-CN','zh-TW','en'].includes(choice)) return choice as Locale;
  return /^zh(?:-|_)(?:TW|HK|MO|Hant)/i.test(browser) ? 'zh-TW' : /^zh/i.test(browser) ? 'zh-CN' : 'en';
}
let locale = resolveLanguage();
const catalog = messages as Record<string,string[]>;
export function t(text:string): string {
  if (locale === 'zh-CN' || !text) return text;
  const index = locale === 'zh-TW' ? 0 : 1;
  if (catalog[text]) return catalog[text][index];
  // Only known UI templates; variable segments (host, model, result) stay untouched.
  for (const [source,values] of Object.entries(catalog)) {
    if (!source.includes('{0}')) continue;
    const parts=source.split('{0}');
    if (text.startsWith(parts[0]) && text.endsWith(parts[1]) && text.length>=parts[0].length+parts[1].length) return values[index].replace('{0}',(source === '调整浮窗大小：{0}' || source === '{0}结果') ? t(text.slice(parts[0].length,text.length-parts[1].length)) : text.slice(parts[0].length,text.length-parts[1].length));
  }
  return text;
}
function render(root:Document|ShadowRoot) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) {
    const node=walker.currentNode, el=node instanceof Element ? node : node.parentElement;
    if(el?.closest('[translate="no"],script,style'))continue;
    if(node.nodeType===Node.TEXT_NODE && node.nodeValue?.trim()) {
      const value=node.nodeValue, prior=nodes.get(node), source=prior?.rendered===value ? prior.source : value;
      const trimmed=source.trim(), translated=t(trimmed), rendered=source.replace(trimmed,translated);
      nodes.set(node,{source,rendered}); if(rendered!==value)node.nodeValue=rendered;
    }
    if(node instanceof Element) for(const name of ['title','aria-label','placeholder']) {
      const value=node.getAttribute(name);if(!value)continue;
      let map=attributes.get(node);if(!map){map=new Map();attributes.set(node,map);}
      const prior=map.get(name),source=prior?.rendered===value ? prior.source : value,rendered=t(source);
      map.set(name,{source,rendered});if(rendered!==value)node.setAttribute(name,rendered);
    }
  }
  if(root instanceof Document)root.documentElement.lang=locale;
}
export function setLanguage(value:string) { locale=resolveLanguage(value); for(const root of roots)render(root); }
export function localize(root:Document|ShadowRoot) {
  roots.add(root);render(root);
  new MutationObserver(()=>render(root)).observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
}
