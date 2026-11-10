import {plainField,readField,type TextField,type FieldState} from './inline-editor';
import {measureMarks} from './inline-layout';

// Scroll the validated changed range into view without changing the editor's
// selection, focus, content or undo history. Native scrollIntoView cannot target
// an offscreen word inside a textarea, so use the same geometry as its marks.
export function revealFieldRange(field:TextField,mirror:HTMLElement,state:FieldState,start:number,end:number):boolean {
  const fresh=readField(field);
  if(!fresh||fresh.text!==state.text||fresh.revision!==state.revision)return false;
  const measure=()=>{
    const result=measureMarks(field,mirror,[{id:'navigation',start,end,kind:'grammar'}],undefined,fresh,true);
    const rect=result.rects[0];
    return result.reliable&&rect?{left:rect.left,right:rect.left+rect.width,top:rect.hitTop,bottom:rect.top+rect.height}:null;
  };
  if(!measure())return false;
  const delta=(start:number,end:number,low:number,high:number)=>{
    const margin=Math.min(24,Math.max(0,(high-low-(end-start))/4));
    return start<low+margin||end>high-margin?start-(low+(high-low-(end-start))/2):0;
  };
  for(let el:HTMLElement|null=field;el&&el!==document.scrollingElement;el=el.parentElement){
    const r=measure();if(!r)return false;
    const box=el.getBoundingClientRect(),style=getComputedStyle(el);
    const dx=(el===field&&plainField(field)||/auto|scroll|hidden/.test(style.overflowX))&&el.scrollWidth>el.clientWidth?delta(r.left,r.right,box.left+el.clientLeft,box.left+el.clientLeft+el.clientWidth):0;
    const dy=(el===field&&plainField(field)||/auto|scroll|hidden/.test(style.overflowY))&&el.scrollHeight>el.clientHeight?delta(r.top,r.bottom,box.top+el.clientTop,box.top+el.clientTop+el.clientHeight):0;
    if(dx||dy)el.scrollTo({left:el.scrollLeft+dx,top:el.scrollTop+dy,behavior:'instant'});
  }
  const r=measure();if(!r)return false;
  const v=visualViewport,x=v?.offsetLeft||0,y=v?.offsetTop||0;
  const dx=delta(r.left,r.right,x,x+(v?.width||innerWidth)),dy=delta(r.top,r.bottom,y,y+(v?.height||innerHeight));
  if(dx||dy)window.scrollBy({left:dx,top:dy,behavior:'instant'});
  return true;
}
