import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './test-support.mjs';
import { Store } from './store.mjs';

test('only the operator-approved account can submit images in an explicit materials session', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.store.allowMaterials(1001);
  f.message(3001, { text: '/materials' });
  assert.equal(f.store.session(3001), undefined);
  assert.equal(f.store.expert(3001), undefined);
  f.message(3001, { message_id: 1, photo: [{ file_id: 'private-image', file_size: 100 }] });
  f.message(1001, { message_id: 2, photo: [{ file_id: 'not-in-inbox', file_size: 100 }] });
  assert.deepEqual(f.store.materials(), []);
  f.message(1001, { text: '/materials' });
  f.message(1001, { message_id: 3, photo: [{ file_id: 'thumbnail', file_size: 50 }, { file_id: 'full-image', file_size: 3000 }], caption: 'Demo payment page' });
  assert.equal(f.store.materials().length, 1);
  assert.equal(f.store.materials()[0].fileId, 'full-image');
  const lastUpdate = Number(f.store.getMeta('offset')) - 1;
  f.app.process({ update_id: lastUpdate, message: { chat: { id: 1001, type: 'private' }, from: { id: 1001 }, message_id: 3, photo: [{ file_id: 'full-image', file_size: 3000 }] } });
  assert.equal(f.store.materials().length, 1);
  await f.app.flush(f.api);
  assert.ok(f.sent.some(item => item.chat_id === 1001 && item.text.includes('Изображение №1 получено')));
  assert.ok(!f.sent.some(item => item.method === 'sendPhoto' || item.method === 'sendDocument'));
});

test('image documents are bounded; unsafe formats and groups cannot enter the inbox', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.store.allowMaterials(1001);
  f.message(1001, { text: '/materials' });
  for (const document of [
    { file_id: 'script', mime_type: 'image/svg+xml', file_size: 100 },
    { file_id: 'huge', mime_type: 'image/png', file_size: 21 * 1024 * 1024 },
    { file_id: 'unknown-size', mime_type: 'image/png' },
  ]) f.message(1001, { message_id: 2, document });
  assert.equal(f.store.materials().length, 0);
  f.app.process({ update_id: Number(f.store.getMeta('offset')), message: {
    chat: { id: -999, type: 'group' }, from: { id: 1001 }, message_id: 3, photo: [{ file_id: 'group-image', file_size: 100 }],
  } });
  assert.equal(f.store.materials().length, 0);
  // Advance through a fresh command because the test's external group update consumed an offset.
  f.message(1001, { text: '/id' });
  f.message(1001, { message_id: 4, document: { file_id: 'png-image', file_size: 1000, mime_type: 'image/png', file_name: '../../ignored.png' } });
  assert.equal(f.store.materials().length, 1);
  assert.equal(f.store.materials()[0].mimeType, 'image/png');
  assert.equal(f.store.materials()[0].file_name, undefined);
});

test('materials survive restart, do not modify paid orders, and the mode expires or closes', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'fw-materials-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'bot.sqlite');
  const f = fixture(path);
  await f.reviewed();
  const before = JSON.stringify(f.get());
  f.store.allowMaterials(1001);
  f.message(1001, { text: '/materials' });
  f.message(1001, { message_id: 10, document: { file_id: 'webp-image', file_size: 500, mime_type: 'image/webp' } });
  assert.equal(JSON.stringify(f.get()), before);
  f.message(1001, { text: 'Готово' });
  assert.equal(f.store.session(1001), undefined);
  f.message(1001, { text: '/materials' });
  f.advance(60 * 60 * 1000 + 1);
  f.message(1001, { message_id: 11, photo: [{ file_id: 'expired', file_size: 100 }] });
  assert.equal(f.store.session(1001), undefined);
  assert.equal(f.store.materials().length, 1);
  f.store.close();
  const restored = new Store(path); t.after(() => restored.close());
  assert.equal(restored.materials()[0].fileId, 'webp-image');
  assert.equal(restored.canUploadMaterials(1001), true);
  assert.equal(restored.order(f.order.id).status, 'reviewed');
});
