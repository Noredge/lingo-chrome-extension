import {plainField,fieldRange,type TextField,type FieldState} from './inline-editor';
import {fieldClip} from './inline-layout';

// A read-only, bounded probe for layout shifts, scrolling and CSS animations.
// It never serializes rich text, walks its descendants, or mutates the overlay.
export function fieldLayoutKey(field:TextField,state:FieldState|null,ranges:readonly {start:number;end:number}[],overlay:Element,watchPoints:readonly {left:number;top:number}[]=[]):string {
  const values:unknown[]=[visualViewport?.offsetLeft,visualViewport?.offsetTop,visualViewport?.width,visualViewport?.height,visualViewport?.scale,innerWidth,innerHeight];
  for(let el:HTMLElement|null=field;el;el=el.parentElement){
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    values.push(r.left,r.top,r.width,r.height,el.clientWidth,el.clientHeight,el.scrollLeft,el.scrollTop,s.display,s.visibility,s.opacity,s.transform,s.zoom,s.overflowX,s.overflowY);
    if(el===field)values.push(s.font,s.lineHeight,s.letterSpacing,s.wordSpacing,s.padding,s.textAlign,s.textIndent,s.direction,s.writingMode,s.whiteSpace,s.wordBreak,s.overflowWrap,plainField(field)&&field instanceof HTMLTextAreaElement?field.wrap:'');
  }
  const clip=fieldClip(field);
  if(clip){const hit=document.elementFromPoint((clip.left+clip.right)/2,(clip.top+clip.bottom)/2);values.push(hit===overlay||hit===field||!!hit&&field.contains(hit));}
  if(state&&!plainField(field)){
    try{for(const range of ranges){const r=fieldRange(state,range.start,range.end);if(!r)return 'stale';for(const part of r.getClientRects())values.push(part.left,part.top,part.width,part.height);}}
    catch{return 'stale';}
  }
  for(const point of watchPoints){const hit=document.elementFromPoint(point.left,point.top);values.push(hit===overlay||hit===field||!!hit&&field.contains(hit));}
  return JSON.stringify(values);
}
