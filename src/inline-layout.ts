import {plainField,fieldContains,fieldRange,readField,type TextField,type FieldState} from './inline-editor';
export type MarkRect={left:number;top:number;width:number;height:number;hitTop:number;id:string;key:string;start:number;kind:'spelling'|'grammar'|'style'};
const typography=['fontFamily','fontSize','fontStyle','fontWeight','fontStretch','fontVariant','fontKerning','fontFeatureSettings','fontVariationSettings','letterSpacing','wordSpacing','lineHeight','textAlign','textIndent','textTransform','direction','tabSize','wordBreak','overflowWrap','textRendering'] as const;
export function fieldClip(target:TextField):{left:number;top:number;right:number;bottom:number}|null {
  const r=target.getBoundingClientRect(),style=getComputedStyle(target);
  if(!r.width||!r.height||style.visibility!=='visible'||Number(style.opacity)===0||style.display==='none')return null;
  const v=window.visualViewport;
  let left=Math.max(r.left+target.clientLeft,v?.offsetLeft||0),top=Math.max(r.top+target.clientTop,v?.offsetTop||0);
  let right=Math.min(r.left+target.clientLeft+target.clientWidth,(v?.offsetLeft||0)+(v?.width||innerWidth)),bottom=Math.min(r.top+target.clientTop+target.clientHeight,(v?.offsetTop||0)+(v?.height||innerHeight));
  for(let el=target.parentElement;el;el=el.parentElement){const cs=getComputedStyle(el),rect=el.getBoundingClientRect();
    // visibility is inherited but a descendant can explicitly restore visible
    // (Gmail compose does this). The target check above is authoritative.
    if(Number(cs.opacity)===0)return null;
    if(/hidden|clip|auto|scroll/.test(cs.overflowX)){left=Math.max(left,rect.left+el.clientLeft);right=Math.min(right,rect.left+el.clientLeft+el.clientWidth);}
    if(/hidden|clip|auto|scroll/.test(cs.overflowY)){top=Math.max(top,rect.top+el.clientTop);bottom=Math.min(bottom,rect.top+el.clientTop+el.clientHeight);}
  }
  return right>left&&bottom>top?{left,top,right,bottom}:null;
}
export function measureMarks(target:TextField,mirror:HTMLElement,issues:{id:string;start:number;end:number;kind:'spelling'|'grammar'|'style'}[],overlay?:Element,state?:FieldState,unclipped=false,watchPoints?:{left:number;top:number}[]):{rects:MarkRect[];reliable:boolean} {
  const bounds=target.getBoundingClientRect();
  const clip=unclipped?{left:-Infinity,top:-Infinity,right:Infinity,bottom:Infinity}:fieldClip(target),style=getComputedStyle(target),rects:MarkRect[]=[];
  if(unclipped&&(!bounds.width||!bounds.height||style.visibility!=='visible'))return {rects,reliable:false};
  if(!clip)return {rects,reliable:true};
  // Degrade to the list for geometry we cannot faithfully mirror.
  for(let el:HTMLElement|null=target;el;el=el.parentElement){const s=getComputedStyle(el);if(s.transform!=='none'||s.perspective!=='none'||!['1','normal',''].includes(s.zoom))return {rects,reliable:false};}
  if(style.writingMode!=='horizontal-tb'||(visualViewport?.scale||1)!==1||target instanceof HTMLInputElement&&target.type==='search')return {rects,reliable:false};
  if(!plainField(target)){
    mirror.replaceChildren();const snapshot=state||readField(target);if(!snapshot)return {rects,reliable:false};
    for(const el of target.querySelectorAll('*')){const s=getComputedStyle(el);if(s.transform!=='none'||s.writingMode!=='horizontal-tb'||!['1','normal',''].includes(s.zoom))return {rects:[],reliable:false};}
    for(const issue of issues){
      const range=fieldRange(snapshot,issue.start,issue.end);if(!range)return {rects:[],reliable:false};
      for(const [index,part] of Array.from(range.getClientRects()).entries()){
        const insertion=issue.start===issue.end,width=insertion?6:part.width,y=part.bottom;
        if(insertion&&(part.left<clip.left||part.left>clip.right))continue;
        const left=Math.max(clip.left,insertion?Math.min(part.left,clip.right-width):part.left),right=Math.min(clip.right,insertion?left+width:part.right);
        if(right<=left||y<clip.top||y>clip.bottom)continue;
        const top=Math.min(y,clip.bottom-4);if(top<clip.top)continue;
        if(!unclipped){const point={left:(left+right)/2,top:Math.min(y-2,clip.bottom-1)};watchPoints?.push(point);const hit=document.elementFromPoint(point.left,point.top);if(!fieldContains(target,hit)&&hit!==overlay)continue;}
        rects.push({id:issue.id,key:`${issue.id}:${issue.start}:${index}`,start:issue.start,kind:issue.kind,left,top,width:right-left,height:4,hitTop:Math.max(clip.top,part.top)});
      }
    }
    return {rects,reliable:true};
  }
  mirror.style.cssText='all:initial;display:block;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;border:0;margin:0;height:auto;min-height:0;max-height:none;overflow:visible;';
  for(const property of typography)mirror.style[property]=style[property];
  mirror.style.width=`${target.clientWidth}px`;mirror.style.padding=style.padding;
  mirror.style.whiteSpace=target instanceof HTMLInputElement||target.wrap==='off'?'pre':'pre-wrap';
  if(target instanceof HTMLTextAreaElement&&target.wrap!=='off')mirror.style.overflowWrap='break-word';
  const node=document.createTextNode(target.value);mirror.replaceChildren(node);
  const base=mirror.getBoundingClientRect(),r=target.getBoundingClientRect();
  const vertical=target instanceof HTMLInputElement?Math.max(0,(target.clientHeight-base.height)/2):0;
  for(const issue of issues){
    if(issue.start<0||issue.end>node.length||issue.start>issue.end)return {rects:[],reliable:false};
    const range=document.createRange();range.setStart(node,issue.start);range.setEnd(node,issue.end);
    for(const [index,part] of Array.from(range.getClientRects()).entries()){
      const x=r.left+target.clientLeft+(part.left-base.left)-target.scrollLeft;
      const y=r.top+target.clientTop+vertical+(part.bottom-base.top)-target.scrollTop;
      const insertion=issue.start===issue.end,width=insertion?6:part.width;
      if(insertion&&(x<clip.left||x>clip.right))continue;
      const left=Math.max(clip.left,insertion?Math.min(x,clip.right-width):x),right=Math.min(clip.right,insertion?left+width:x+width);
      if(right<=left||y<clip.top||y>clip.bottom)continue;
      // Auto-growing textareas may end at the glyph box with no bottom padding.
      // Keep the complete underline inside the field without pulling offscreen lines into view.
      const top=Math.min(y,clip.bottom-4);if(top<clip.top)continue;
      if(!unclipped){const point={left:(left+right)/2,top:Math.min(y-2,clip.bottom-1)};watchPoints?.push(point);const hit=document.elementFromPoint(point.left,point.top);if(hit!==target&&hit!==overlay)continue;}
      rects.push({id:issue.id,key:`${issue.id}:${issue.start}:${index}`,start:issue.start,kind:issue.kind,left,top,width:right-left,height:4,hitTop:Math.max(clip.top,y-part.height)});
    }
  }
  return {rects,reliable:true};
}
