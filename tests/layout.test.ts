import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeBounds, type Edge } from '../src/layout.ts';
const b = { left: 200, top: 180, width: 400, height: 420 }, viewport = { width: 1280, height: 900 };
test('all eight resize directions preserve the opposite edges and unaffected axes', () => {
  for (const edge of ['n','s','e','w','ne','nw','se','sw'] as Edge[]) {
    const r = resizeBounds(b, edge, edge.includes('w') ? -40 : 40, edge.includes('n') ? -30 : 30, viewport);
    assert.equal(r.width, edge.includes('w') || edge.includes('e') ? 440 : 400);
    assert.equal(r.height, edge.includes('n') || edge.includes('s') ? 450 : 420);
    assert.equal(edge.includes('w') ? r.left + r.width : r.left, edge.includes('w') ? 600 : 200);
    assert.equal(edge.includes('n') ? r.top + r.height : r.top, edge.includes('n') ? 600 : 180);
  }
});
test('crossing the opposite side stops at the readable minimum without moving its anchor', () => {
  assert.deepEqual(resizeBounds(b,'nw',9999,9999,viewport),{left:280,top:300,width:320,height:300});
  assert.deepEqual(resizeBounds(b,'se',-9999,-9999,viewport),{left:200,top:180,width:320,height:300});
});
test('resizing stops at viewport margins and maximum width', () => {
  const nw = resizeBounds(b,'nw',-9999,-9999,viewport);
  assert.equal(nw.left,10);assert.equal(nw.top,10);
  const se = resizeBounds(b,'se',9999,9999,viewport);
  assert.equal(se.width,900);assert.equal(se.top+se.height,890);
  const tiny = {left:10,top:10,width:250,height:200};
  assert.deepEqual(resizeBounds(tiny,'se',-999,-999,{width:270,height:220}),tiny);
});
