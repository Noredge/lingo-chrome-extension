import {diffText} from './diff';
import type {Issue} from './diagnostics';

export type InlineChange={start:number;end:number;source:string;replacement:string};
const cache=new WeakMap<Issue,InlineChange[]>();

// Display only the changed words. Keep the validated issue intact for atomic replacement.
export function inlineChanges(issue:Issue):InlineChange[] {
  const saved=cache.get(issue);if(saved)return saved;
  const changes:InlineChange[]=[];let offset=issue.start,start=offset,before='',after='';
  const flush=()=>{
    if(!before&&!after)return;
    const leading=before.match(/^\s+/u)?.[0].length||0,trailing=before.match(/\s+$/u)?.[0].length||0;
    // Whitespace-only edits retain their real range; insertions use a small caret marker.
    const trim=leading<before.length;
    changes.push({start:start+(trim?leading:0),end:start+before.length-(trim?trailing:0),source:trim?before.trim():before,replacement:after.trim()||after});
    before='';after='';
  };
  for(const part of diffText(issue.source,issue.replacement).parts){
    if(part.kind==='equal'){flush();offset+=part.text.length;start=offset;}
    else if(part.kind==='delete'){before+=part.text;offset+=part.text.length;}
    else after+=part.text;
  }
  flush();cache.set(issue,changes);return changes;
}
