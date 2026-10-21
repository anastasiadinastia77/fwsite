import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './test-support.mjs';
import { Store } from './store.mjs';
import { BotApp } from './app.mjs';
import { QUESTION_WINDOW_MS } from './domain.mjs';
import { TelegramAPI, TelegramError } from './telegram.mjs';

test('onboarding gives a user their own Telegram ID without granting expert access', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.message(3001, { text: '/start' }); f.message(3001, { text: '/id' });
  await f.app.flush(f.api);
  assert.ok(f.sent.some(m => m.chat_id === 3001 && m.text.includes('Твой Telegram ID: 3001')));
  assert.equal(f.store.expert(3001), undefined);
});

test('unpaid track never reaches the expert; only trusted operator confirmation releases it', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.message(2001, { text: `/start ${f.invite}` });
  f.message(1001, { text: '/orders' });
  f.click(1001, 'open');
  f.message(2001, { text: '/payment_confirmed' });
  await f.app.flush(f.api);
  assert.equal(f.get().paid, false);
  assert.equal(f.sent.some(m => m.chat_id === 1001 && m.text?.includes(f.order.trackUrl)), false);
  f.app.confirmPayment(f.order.id);
  await f.app.flush(f.api);
  assert.equal(f.sent.some(m => m.chat_id === 1001 && m.text?.includes(f.order.trackUrl)), true);
  assert.throws(() => f.app.confirmPayment(f.order.id));
});

test('personal invitation is single use, not an order ID; actor cannot appoint themselves expert', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.message(1001, { text: `/start ${f.invite}` });
  assert.equal(f.get().clientId, null);
  f.message(2001, { text: `/start ${f.order.id}` });
  assert.equal(f.get().clientId, null);
  f.message(2001, { text: `/start ${f.invite}` });
  f.message(3001, { text: `/start ${f.invite}` });
  assert.equal(f.get().clientId, 2001);
  assert.equal(f.store.expert(3001), undefined);
  const raw = f.store.db.prepare('SELECT invite_hash FROM orders').get();
  assert.equal(raw.invite_hash, null);
});

test('forged callbacks, client acting as expert, groups and conflicting identities cannot expose track', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.paid();
  const before = f.get();
  f.click(3001, 'open'); f.click(3001, 'review'); f.click(2001, 'review');
  f.app.process({ update_id: 1000, callback_query: {
    from: { id: 1001 }, data: `o:${f.order.id}:open`, message: { chat: { id: 3001, type: 'private' } },
  } });
  f.app.process({ update_id: 1001, message: { from: { id: 1001 }, chat: { id: -10, type: 'group' }, text: '/orders' } });
  await f.app.flush(f.api);
  assert.deepEqual(f.get(), before);
  assert.equal(f.sent.some(m => (m.chat_id === 3001 || m.chat_id === -10) && m.text?.includes(f.order.trackUrl)), false);
});

test('full flow: voice review, two questions, expert voice answer, explicit recommendation and optional offer', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.reviewed();
  assert.equal(f.get().status, 'reviewed');
  assert.ok(f.get().reviewedAt);
  f.click(2001, 'ask');
  f.message(2001, { text: 'Что изменить в аранжировке?' });
  f.message(2001, { text: 'Какой баланс баса нужен?' });
  f.click(2001, 'submit');
  assert.equal(f.get().questions.length, 2);
  f.click(1001, 'finish');
  assert.equal(f.get().status, 'questions_pending');
  f.click(1001, 'answer');
  f.message(1001, { voice: { file_id: 'fictional-followup' } });
  assert.equal(f.get().status, 'answer_queued');
  await f.app.flush(f.api);
  assert.equal(f.get().status, 'ready_finish');
  f.click(1001, 'finish'); f.click(1001, 'ready');
  f.click(1001, 's_intro');
  assert.deepEqual(f.get().services, []);
  assert.equal(f.get().endorsed, false);
  f.click(1001, 'endorse'); f.click(1001, 's_labels');
  f.click(1001, 'note'); f.message(1001, { text: 'Предлагаю начать с двух подходящих лейблов.' });
  f.click(1001, 'preview');
  assert.equal(f.get().status, 'offer_edit');
  await f.app.flush(f.api);
  assert.equal(f.sent.some(m => m.chat_id === 2001 && m.text?.includes('Предлагаю начать')), false);
  f.click(1001, 'offer');
  await f.app.flush(f.api);
  assert.equal(f.get().status, 'completed');
  assert.equal(f.sent.filter(m => m.chat_id === 2001 && m.method === 'sendVoice').length, 2);
  assert.ok(f.sent.some(m => m.chat_id === 2001 && m.text?.includes('Стоимость и сроки согласуем')));
  f.click(2001, 'interest'); f.click(2001, 'interest');
  await f.app.flush(f.api);
  assert.equal(f.sent.filter(m => m.chat_id === 1001 && m.text?.includes('Клиент хочет узнать условия')).length, 1);
});

test('question drafts are limited to two, submitted once, cannot use another order draft', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.reviewed();
  f.click(2001, 'ask');
  f.message(2001, { text: 'Первый' }); f.message(2001, { text: 'Второй' }); f.message(2001, { text: 'Третий' });
  assert.equal(f.store.session(2001).questions.length, 2);
  const other = f.store.createOrder({ expertId: 1001, title: 'Другой', trackUrl: 'https://example.invalid/other', priceRub: 2000, paid: true });
  f.message(2001, { text: `/start ${other.invite}` });
  f.click(2001, 'submit', other.order.id);
  assert.equal(f.store.order(other.order.id).status, 'awaiting_review');
  f.click(2001, 'submit'); f.click(2001, 'ask'); f.click(2001, 'submit');
  assert.deepEqual(f.get().questions, ['Первый', 'Второй']);
  assert.equal(f.get().status, 'questions_pending');
});

test('72 hours are enforced at submit, from successful delivery rather than queue time', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.paid();
  f.click(1001, 'review'); f.message(1001, { voice: { file_id: 'voice' } });
  const queuedAt = f.get().updatedAt;
  await f.app.flush({ async call() { throw new Error('offline'); } });
  assert.equal(f.get().reviewedAt, undefined);
  f.advance(QUESTION_WINDOW_MS + 1000);
  await f.app.flush(f.api);
  assert.equal(f.get().reviewedAt, queuedAt + QUESTION_WINDOW_MS + 1000);
  f.click(2001, 'ask'); f.message(2001, { text: 'Вопрос' });
  f.advance(QUESTION_WINDOW_MS);
  f.click(2001, 'submit');
  assert.equal(f.get().status, 'reviewed');
  f.click(1001, 'finish');
  assert.equal(f.get().status, 'deciding');
});

test('client can waive questions; expert cannot prematurely finish or send a text instead of initial voice', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.paid();
  f.click(1001, 'review'); f.message(1001, { text: 'Не голосовое' });
  assert.equal(f.get().status, 'awaiting_review');
  f.message(1001, { voice: { file_id: 'voice' } }); await f.app.flush(f.api);
  f.click(1001, 'finish'); assert.equal(f.get().status, 'reviewed');
  f.click(2001, 'skip'); f.click(1001, 'finish'); f.click(1001, 'close');
  assert.equal(f.get().status, 'completed');
  assert.deepEqual(f.get().services, []);
});

test('one question and a text clarification response are sufficient', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.reviewed();
  f.click(2001, 'ask'); f.message(2001, { text: 'Один вопрос' }); f.click(2001, 'submit');
  f.click(1001, 'answer'); f.message(1001, { text: 'Личный ответ эксперта' });
  await f.app.flush(f.api);
  assert.equal(f.get().status, 'ready_finish');
  assert.ok(f.sent.some(m => m.chat_id === 2001 && m.text === 'Личный ответ эксперта'));
});

test('refinement branch has appropriate services, max two, no personal intro; verdict change resets selections', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.readyToOffer('work');
  f.click(1001, 's_intro'); f.click(1001, 'endorse');
  assert.deepEqual(f.get().services, []);
  f.click(1001, 's_refinement'); f.click(1001, 's_mixing'); f.click(1001, 's_mastering');
  assert.deepEqual(f.get().services, ['refinement', 'mixing']);
  f.click(1001, 'ready');
  assert.deepEqual(f.get().services, []); assert.equal(f.get().endorsed, false);
  f.click(1001, 'offer'); assert.equal(f.get().status, 'offer_edit');
});

test('updates and outgoing queue survive restart; duplicate update does not duplicate a voice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fw-bot-test-'));
  let store;
  try {
    const f = fixture(join(dir, 'state.sqlite')); store = f.store; await f.paid();
    f.click(1001, 'review');
    const update = { update_id: 10000, message: { chat: { id: 1001, type: 'private' }, from: { id: 1001 }, voice: { file_id: 'durable-voice' } } };
    f.app.process(update);
    const id = f.order.id;
    store.close(); store = new Store(join(dir, 'state.sqlite'));
    const app = new BotApp(store);
    app.process(update);
    await app.flush(f.api);
    assert.equal(store.order(id).status, 'reviewed');
    assert.equal(f.sent.filter(m => m.voice === 'durable-voice').length, 1);
    assert.equal(Number(store.getMeta('offset')), 10001);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('failed delivery blocks later messages to that recipient, retries without duplicating state', async t => {
  const f = fixture(); t.after(() => f.store.close()); await f.paid();
  f.click(1001, 'review'); f.message(1001, { voice: { file_id: 'voice' } });
  f.app.say(2001, 'После голосового');
  const received = [];
  await f.app.flush({ async call(method, payload) {
    if (method === 'sendVoice') throw Object.assign(new Error('rate limit'), { retryAfterMs: 5000 });
    received.push(payload);
  } });
  assert.equal(received.some(m => m.text === 'После голосового'), false);
  assert.equal(f.get().status, 'review_queued');
  f.advance(5000); await f.app.flush(f.api);
  assert.equal(f.get().status, 'reviewed');
  const voiceIndex = f.sent.findIndex(m => m.method === 'sendVoice');
  assert.ok(f.sent.findIndex(m => m.text === 'После голосового') > voiceIndex);
});

test('Telegram adapter redacts token-bearing errors and respects retry-after', async () => {
  const secret = '123456:fictional-secret';
  const failing = new TelegramAPI(secret, async url => { throw new Error(`Failed URL ${url}`); });
  await assert.rejects(failing.call('getMe'), error => error instanceof TelegramError && !String(error).includes(secret));
  const limited = new TelegramAPI(secret, async () => ({ ok: false, status: 429,
    async json() { return { ok: false, error_code: 429, parameters: { retry_after: 12 } }; },
  }));
  await assert.rejects(limited.call('sendMessage', {}), error => error.retryAfterMs === 12000);
});

test('server admin commands create unpaid orders and require an explicit receipt check; live startup defaults off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fw-bot-cli-'));
  const env = { ...process.env, BOT_DB_PATH: join(dir, 'state.sqlite'), BOT_ENABLED: 'false' };
  const admin = args => spawnSync(process.execPath, ['bot/admin.mjs', ...args], { env, encoding: 'utf8' });
  try {
    assert.equal(admin(['expert:add', '--id', '1001', '--name', 'Демо']).status, 0);
    const result = admin(['order:create', '--expert', '1001', '--title', 'Демо', '--track', 'https://example.invalid/demo', '--price', '2400', '--bot-name', 'example_bot']);
    assert.equal(result.status, 0);
    const id = /Order: ([a-f0-9]{12})/.exec(result.stdout)[1];
    assert.ok(result.stdout.includes('Payment: NOT CONFIRMED'));
    assert.equal(admin(['payment:confirm', '--id', id]).status, 1);
    assert.equal(admin(['payment:confirm', '--id', id, '--receipt-checked']).status, 0);
    const store = new Store(env.BOT_DB_PATH);
    try { assert.equal(store.order(id).paid, true); } finally { store.close(); }
    const disabled = spawnSync(process.execPath, ['bot/run.mjs'], { env, encoding: 'utf8' });
    assert.equal(disabled.status, 1);
    assert.ok(disabled.stderr.includes('Live bot is disabled'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
