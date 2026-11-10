import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(path.join(tmpdir(), 'lingo-comparison-'));
const evidence = path.resolve('../evidence/comparison');
await mkdir(evidence, { recursive: true });
const dist = path.resolve('dist'), checks = [], errors = [], calls = [];
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', locale: 'zh-CN', headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  viewport: { width: 380, height: 800 }
});
let output = '', behavior = 'ok', release;
const check = name => { checks.push(name); console.log('PASS', name); };
await ctx.route('https://api.openai.com/v1/responses', async route => {
  calls.push(JSON.parse(route.request().postDataJSON().input));
  const text = output, mode = behavior;
  if (mode === 'held') await new Promise(resolve => { release = resolve; });
  if (mode === 'error') return route.fulfill({status: 500, body: '{}'}).catch(() => {});
  const events = [{type: 'response.output_text.delta', delta: text}];
  if (mode !== 'partial') events.push({type: 'response.completed', response: {status: 'completed'}});
  await route.fulfill({contentType: 'text/event-stream', body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')}).catch(() => {});
});
try {
  const worker = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  const settings = await ctx.newPage();
  await settings.goto(`chrome-extension://${id}/options.html`);
  await settings.evaluate(async () => {
    await chrome.runtime.sendMessage({type: 'completeOnboarding'});
    const c = await chrome.runtime.sendMessage({type: 'config'});
    const saved = await chrome.runtime.sendMessage({type: 'save', ...c.settings, uiLanguage: 'zh-CN', storageMode: 'session', dataConsent: true, key: 'fixture-only-comparison-key'});
    if (saved.error) throw new Error(saved.error);
  });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  const host = page.locator('#lingo-extension-root'), editor = host.locator('.source-editor');
  const compare = host.locator('[data-view=compare]'), result = host.locator('[data-view=result]');
  await editor.waitFor();
  const done = () => host.locator('.write-actions button').filter({hasText: /^(复制|複製|Copy)$/}).waitFor();
  const write = async (source, target, mode = 'proofread') => {
    output = target; behavior = 'ok'; await editor.fill(source);
    await host.locator(`[data-mode=${mode}]`).click(); await done();
  };
  const reconstructed = () => host.locator('.write-diff').evaluate(el => {
    const parts = Array.from(el.childNodes);
    return {
      before: parts.filter(n => n.nodeName !== 'INS').map(n => n.textContent).join(''),
      after: parts.filter(n => n.nodeName !== 'DEL').map(n => n.textContent).join('')
    };
  });
  const source = 'I has a plan.\n我们今天一起去学校。 👩🏽‍💻', target = 'I have a plan.\n我们明天一起去学校！ 👩🏽‍💻';
  await write(source, target);
  assert.equal(await result.getAttribute('aria-pressed'), 'true');
  assert(await host.locator('.write-text').isVisible()); assert(!(await host.locator('.write-diff').isVisible()));
  assert.equal(await host.locator('.translation [data-view]').count(), 0);
  const count = calls.length;
  await compare.focus(); await compare.press('Space');
  assert.equal(await compare.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await reconstructed(), {before: source, after: target});
  assert(await host.locator('.write-diff del').count() > 0); assert(await host.locator('.write-diff ins').count() > 0);
  await result.focus(); await result.press('Enter'); await compare.click();
  assert.equal(calls.length, count);
  check('clean result defaults; keyboard switching renders exact multiline bilingual diff without API calls');
  await page.screenshot({path: path.join(evidence, 'sidebar-zh-CN.png')});
  for (const [locale, label] of [['zh-TW','對比'],['en','Compare'],['zh-CN','对比']]) {
    await settings.evaluate(uiLanguage => chrome.runtime.sendMessage({type: 'setUiLanguage', uiLanguage}), locale);
    await host.getByRole('button', {name: label, exact: true}).waitFor();
    assert.deepEqual(await reconstructed(), {before: source, after: target});
    assert.equal(await compare.getAttribute('aria-pressed'), 'true');
    await page.screenshot({path: path.join(evidence, `sidebar-${locale}.png`)});
  }
  check('all three UI languages preserve comparison mode and literal source/output');
  await host.locator('[data-mode=natural]').click(); await done();
  assert.equal(await result.getAttribute('aria-pressed'), 'true');
  await compare.click(); await host.locator('[data-mode=proofread]').click(); await done();
  assert.equal(await result.getAttribute('aria-pressed'), 'true');
  assert.equal(calls.length, count + 1);
  check('switching presets and returning to cached results defaults to clean output');
  output = 'Please send the plan.';
  await host.locator('.custom input').fill('Be more polite'); await host.locator('.custom button').click(); await done();
  await compare.click(); assert.deepEqual(await reconstructed(), {before: source, after: output});
  assert.equal(calls.at(-1).source_text, source); assert.equal(calls.at(-1).editing_request, 'Be more polite');
  check('custom rewrite compares against original source');
  await write('unchanged\n\n原文 👩🏽‍💻', 'unchanged\n\n原文 👩🏽‍💻'); await compare.click();
  await host.getByText('原文与结果一致。', {exact: true}).waitFor();
  assert.equal(await host.locator('.write-diff del,.write-diff ins').count(), 0);
  check('identical output clearly reports no changes');
  await write('<b>source</b>', '<img src=x onerror="window.injected=true">'); await compare.click();
  assert.equal(await host.locator('.write-diff img,.write-diff b,.write-diff script').count(), 0);
  assert.deepEqual(await reconstructed(), {before: '<b>source</b>', after: output});
  check('markup is rendered only as literal text in comparison');
  await editor.fill('Edited while viewing comparison.');
  assert.equal(await host.locator('.write-diff').textContent(), ''); assert.equal(await host.locator('.write-text').textContent(), '');
  assert.equal(await host.locator('.write-actions button').count(), 0); assert(!(await host.locator('.write-output').isVisible()));
  check('source editing clears cached results, differences and actions');
  output = 'Late obsolete output'; behavior = 'held';
  await host.locator('[data-mode=proofread]').click();
  await host.locator('.write-actions').getByRole('button', {name: '停止', exact: true}).waitFor();
  assert(await compare.isDisabled());
  await page.waitForFunction(() => document.querySelector('#lingo-extension-root').shadowRoot.querySelector('.write-status').textContent === '正在生成…');
  // Wait for the intercepted request, then change source before it can finish.
  for (let i=0; !release && i<100; i++) await page.waitForTimeout(10);
  assert(release); await editor.fill('Fresh source'); release(); release = undefined;
  behavior = 'ok'; output = 'Fresh result'; await host.locator('[data-mode=proofread]').click(); await done(); await compare.click();
  assert.deepEqual(await reconstructed(), {before: 'Fresh source', after: 'Fresh result'});
  check('in-flight source edits cancel old generation and late response cannot contaminate new comparison');
  for (const mode of ['partial', 'error', 'held']) {
    await editor.fill(`source for ${mode}`); output = 'Partial output'; behavior = mode;
    await host.locator('[data-mode=proofread]').click();
    if (mode === 'held') { await host.locator('.write-actions').getByRole('button', {name: '停止', exact: true}).click(); }
    await host.locator('.write-actions').getByRole('button', {name: '重试', exact: true}).waitFor();
    assert(await compare.isDisabled()); assert(!(await host.locator('.write-diff').isVisible()));
    assert.equal(await host.locator('.write-actions').getByRole('button', {name: '复制', exact: true}).count(), 0);
    release?.(); release = undefined; behavior = 'ok'; output = 'Recovered output';
    await host.locator('.write-actions').getByRole('button', {name: '重试', exact: true}).click(); await done();
    assert.equal(await result.getAttribute('aria-pressed'), 'true'); await compare.click();
    assert.deepEqual(await reconstructed(), {before: `source for ${mode}`, after: 'Recovered output'});
  }
  check('incomplete, failed and stopped requests cannot compare or apply; explicit retry recovers');
  await write('prefix\n'+'a '.repeat(7990)+'\nsuffix', 'prefix\n'+'b '.repeat(7990)+'\nsuffix');
  await compare.click(); await host.getByText('改动较多，已按整段显示差异。', {exact: true}).waitFor();
  assert.equal((await reconstructed()).after, output);
  const overflow = await host.locator('.panel').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false); check('maximum-length rewrite uses complete coarse diff within narrow sidebar');
  await host.locator('[data-action=reset-layout]').click();
  assert.equal(await host.locator('.write-diff').textContent(), ''); assert.equal(await editor.inputValue(), '');
  assert.equal(errors.length, 0, errors.join('\n')); check('reset clears comparison data; no uncaught page errors');
  await writeFile(path.join(evidence, 'results.json'), JSON.stringify({checks, errors, mockedAPI: true}, null, 2));
} catch (e) {
  for (const [i,p] of ctx.pages().entries()) await p.screenshot({path: path.join(evidence, `failure-${i}.png`)}).catch(() => {});
  throw e;
} finally { release?.(); await ctx.close(); await rm(profile, {recursive: true, force: true}); }
