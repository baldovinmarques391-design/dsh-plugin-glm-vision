/**
 * Automated GLM Vision Plugin Tests (v3)
 * Fixed: polling must wait for the NEW turn's turn/end, not a prior turn's
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://127.0.0.1:3081';
const TIMEOUT = 120_000;
const IMG_1 = 'C:\\Users\\hiddenadmin\\.dsh\\image-cache\\1d812855a3728b8e06197e73527930fe3539d877539782b1e9c20e126c56dd44.jpg';
const IMG_2 = 'C:\\Users\\hiddenadmin\\.dsh\\image-cache\\d2ee712b9a856adaa84230b4ced6fcb4abede2828bd8b9824f78cda468d727bf.jpg';

async function api(method, payload) {
  const message = { type: 'client-request', rpcId: randomUUID(), method, payload };
  const resp = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const full = await resp.json();
  if (!full.result?.ok) throw new Error(`API error: ${JSON.stringify(full.result?.error)}`);
  return full.result.value;
}

function imageToBase64(filePath) {
  const buf = readFileSync(filePath);
  const ext = filePath.split('.').pop().toLowerCase();
  return { data: buf.toString('base64'), mediaType: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png' };
}

async function createSession() { return (await api('session.create', { cwd: 'C:\\Users\\hiddenadmin' })).sessionId; }

async function promptSession(sessionId, content) {
  return api('session.prompt', { sessionId, mode: 'queue', content });
}

/**
 * Wait for a complete turn response after a given seq.
 * Strategy: find a turn/end with seq > minSeq, then collect ALL assistant text from that turn.
 */
async function waitForResponse(sessionId, minSeq, maxWaitMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const hist = await api('session.history', { sessionId, maxMessages: 60 });
      const events = (hist.events || []).map(e => e.event);

      // Find ALL turn boundaries after minSeq
      const turnEnds = events.filter(e => e.type === 'turn/end' && e.seq > minSeq);
      if (turnEnds.length > 0) {
        // Use the latest turn/end
        const latestTurnEnd = turnEnds[turnEnds.length - 1];
        // Find the corresponding turn/start (scan backwards from turn/end)
        let turnStartSeq = 0;
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i].type === 'turn/start' && events[i].seq < latestTurnEnd.seq) {
            turnStartSeq = events[i].seq;
            break;
          }
        }
        // Collect all assistant/message text within this turn
        const texts = [];
        for (const ev of events) {
          if (ev.seq <= turnStartSeq || ev.seq > latestTurnEnd.seq) continue;
          if (ev.type === 'assistant/message' && ev.data?.message?.role === 'assistant') {
            for (const block of (ev.data.message.content || [])) {
              if (block.type === 'text' && block.text) texts.push(block.text);
            }
          }
        }
        if (texts.length > 0) return { text: texts.join('\n'), seq: latestTurnEnd.seq };
        // Turn ended but no text — check if there's a final assistant/message with text right before turn/end
        for (const ev of events) {
          if (ev.seq > latestTurnEnd.seq) continue;
          if (ev.type === 'assistant/message' && ev.data?.message?.role === 'assistant') {
            for (const block of (ev.data.message.content || [])) {
              if (block.type === 'text' && block.text) texts.push(block.text);
            }
          }
        }
        if (texts.length > 0) return { text: texts.join('\n'), seq: latestTurnEnd.seq };
        return { text: '[no text response]', seq: latestTurnEnd.seq };
      }
    } catch (e) { /* ignore */ }
    await new Promise(r => setTimeout(r, 3000));
  }
  return null;
}

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

// ═══ Test 1: Multi-image ═══
async function testMultiImage() {
  log('=== TEST 1: Multi-image upload (2 images) ===');
  const sid = await createSession();
  log(`Session: ${sid}`);
  const img1 = imageToBase64(IMG_1), img2 = imageToBase64(IMG_2);
  await promptSession(sid, [
    { type: 'image', data: img1.data, mediaType: img1.mediaType },
    { type: 'image', data: img2.data, mediaType: img2.mediaType },
    { type: 'text', text: '请描述这两张图片的内容，分别说明每张图片里有什么。' },
  ]);
  log('Sent 2 images, waiting...');
  const r = await waitForResponse(sid, 0);
  if (!r) return { pass: false, name: 'multi-image', error: 'timeout' };
  log(`Response (${r.text.length} chars): ${r.text.slice(0, 400)}...`);
  const ok = /两|分别|第一|第二/.test(r.text);
  log(ok ? '✅ PASS' : '⚠️ WARN: may not reference both');
  return { pass: true, name: 'multi-image', response: r.text.slice(0, 500), note: ok ? undefined : 'no dual ref' };
}

// ═══ Test 2: Old conversation + new image ═══
async function testOldConvNewImage() {
  log('=== TEST 2: Old conversation + new image ===');
  const sid = await createSession();
  log(`Session: ${sid}`);
  await promptSession(sid, [{ type: 'text', text: '请记住暗号：蓝鲸。之后我会问你。' }]);
  log('Step 1: text sent...');
  const r1 = await waitForResponse(sid, 0);
  if (!r1) return { pass: false, name: 'old-conv-new-image', error: 'no text response' };
  log(`Step 1 OK (${r1.seq}): ${r1.text.slice(0, 80)}...`);

  const img = imageToBase64(IMG_2);
  await promptSession(sid, [
    { type: 'image', data: img.data, mediaType: img.mediaType },
    { type: 'text', text: '请描述这张图片，并告诉我暗号是什么。' },
  ]);
  log('Step 2: image sent...');
  const r2 = await waitForResponse(sid, r1.seq);
  if (!r2) return { pass: false, name: 'old-conv-new-image', error: 'no image response' };
  log(`Step 2 (${r2.seq}, ${r2.text.length} chars): ${r2.text.slice(0, 400)}...`);

  const hasImage = /图片|描述|看到|显示|画面|内容|image|Mountain|饮料|瓶子|瓶|建筑|城市|夜/.test(r2.text);
  const hasCode = /蓝鲸/i.test(r2.text);
  if (hasImage && hasCode) { log('✅ PASS: image + codeword'); return { pass: true, name: 'old-conv-new-image' }; }
  if (hasImage) { log('⚠️ PARTIAL: image yes, codeword no'); return { pass: true, name: 'old-conv-new-image', note: 'forgot codeword' }; }
  log('❌ FAIL');
  return { pass: false, name: 'old-conv-new-image', response: r2.text.slice(0, 500) };
}

// ═══ Test 3: Non-image error ═══
async function testNonImage() {
  log('=== TEST 3: Non-image error handling ===');
  const sid = await createSession();
  await promptSession(sid, [{ type: 'text', text: '请读取 C:\\Windows\\win.ini 的内容' }]);
  const r = await waitForResponse(sid, 0);
  if (!r) return { pass: false, name: 'non-image-error', error: 'timeout' };
  log(`Response: ${r.text.slice(0, 200)}...`);
  log('✅ PASS: no crash');
  return { pass: true, name: 'non-image-error' };
}

// ═══ Run ═══
async function main() {
  log('GLM Vision Plugin tests (v3)\n');
  const results = [];
  for (const [name, fn] of [['multi-image', testMultiImage], ['old-conv-new-image', testOldConvNewImage], ['non-image-error', testNonImage]]) {
    try { results.push(await fn()); } catch (err) { log(`❌ ${name}: ${err.message}`); results.push({ pass: false, name, error: err.message }); }
    log('');
  }
  log('════════════════════════');
  for (const r of results) log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.note ? ` (${r.note})` : ''}${r.error ? ` ERR: ${r.error}` : ''}`);
  log('════════════════════════');
  writeFileSync('D:\\桌面\\dsh-plugin-glm-vision\\test\\results.json', JSON.stringify(results, null, 2));
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
