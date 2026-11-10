import test from 'node:test';
import assert from 'node:assert/strict';
import { diffText } from '../src/diff.ts';

function roundTrip(before: string, after: string) {
  const diff = diffText(before, after);
  assert.equal(diff.parts.filter(p => p.kind !== 'insert').map(p => p.text).join(''), before);
  assert.equal(diff.parts.filter(p => p.kind !== 'delete').map(p => p.text).join(''), after);
  assert(diff.parts.every(p => p.text.length > 0));
  return diff;
}
test('diff preserves unchanged text and marks word replacements, insertions and deletions', () => {
  assert.deepEqual(diffText('I has a plan.', 'I have a plan.').parts, [
    { kind: 'equal', text: 'I ' }, { kind: 'delete', text: 'has' },
    { kind: 'insert', text: 'have' }, { kind: 'equal', text: ' a plan.' }
  ]);
  for (const [a,b] of [['',''],['same','same'],['','new'],['old',''],['Hello.','Hello there.'],['Hello there.','Hello.']]) roundTrip(a,b);
});
test('diff round trips CJK, punctuation, line endings, whitespace, emoji and literal markup', () => {
  for (const [a,b] of [
    ['我今天去学校。','我明天去学校！'],['今日は晴れです。','今日は雨です。'],
    ['first\r\nsecond\n\nlast','first\nsecond\nlast'],['a  b\t',' a b\t\n'],
    ['👩🏽‍💻 says cafe\u0301 👍🏻','👨🏽‍💻 says café 👍🏽'],['مرحبا بك','أهلا بك'],
    ['<script>alert(1)</script>','<img src=x onerror=alert(1)>']
  ]) roundTrip(a,b);
  const emoji = diffText('Hi 👩🏽‍💻!', 'Hi 👨🏽‍💻!');
  assert(emoji.parts.some(p => p.kind === 'delete' && p.text === '👩🏽‍💻'));
  assert(emoji.parts.some(p => p.kind === 'insert' && p.text === '👨🏽‍💻'));
});
test('diff handles repeated words and bounded randomized edits without losing text', () => {
  let seed = 12345;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const words = ['a','a','中','👩🏽‍💻','\n',' ','<b>','é'];
  for (let trial = 0; trial < 100; trial++) {
    const a = Array.from({length: 40}, () => words[Math.floor(random() * words.length)]);
    const b = [...a]; b.splice(Math.floor(random() * b.length), 4, '改', '\n', 'new');
    roundTrip(a.join(''), b.join(''));
  }
});
test('heavily rewritten maximum-length text uses bounded fallback and retains shared context', () => {
  const before = 'prefix\n' + 'a '.repeat(7990) + '\nsuffix';
  const after = 'prefix\n' + 'b '.repeat(7990) + '\nsuffix';
  const diff = roundTrip(before, after);
  assert.equal(diff.coarse, true);
  assert.equal(diff.parts[0].kind, 'equal');
  assert.equal(diff.parts.at(-1)?.kind, 'equal');
  assert.equal(roundTrip('a '.repeat(7999), 'a '.repeat(7998) + 'b ').coarse, false);
});
