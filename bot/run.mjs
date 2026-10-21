import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Store } from './store.mjs';
import { BotApp } from './app.mjs';
import { TelegramAPI, TelegramError } from './telegram.mjs';

if (process.env.BOT_ENABLED !== 'true') {
  console.error('Live bot is disabled. Use npm run bot:demo for an offline walkthrough. To connect Telegram, configure the server and set BOT_ENABLED=true.');
  process.exit(1);
}

process.umask(0o077);
const store = new Store(process.env.BOT_DB_PATH || './.bot-data/bot.sqlite');
const controller = new AbortController();
const leaseOwner = randomUUID();
const leaseMs = 180_000;
const app = new BotApp(store, Date.now, process.env.BOT_BRAND || 'FW LABEL NETWORK');
let leased = false;

function renewLease() {
  store.transaction(() => {
    const lease = JSON.parse(store.getMeta('runner') ?? 'null');
    if (lease && lease.owner !== leaseOwner && lease.until > Date.now()) throw new Error('Another bot process is active. Use one instance per database.');
    store.setMeta('runner', JSON.stringify({ owner: leaseOwner, until: Date.now() + leaseMs }));
    leased = true;
  });
}
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  const api = new TelegramAPI(process.env.TELEGRAM_BOT_TOKEN);
  renewLease();
  await api.call('getMe', {}, controller.signal);
  const webhook = await api.call('getWebhookInfo', {}, controller.signal);
  if (webhook.url) throw new Error('This bot already has a webhook. Use a separate pilot bot or deliberately reconfigure its existing deployment.');
  console.log('Bot connected. Long polling active; message contents and tokens are not logged.');
  while (!controller.signal.aborted) {
    renewLease();
    // Limit each delivery pass so the single-runner lease is renewed between API calls.
    await app.flush(api, 1);
    try {
      const updates = await api.call('getUpdates', {
        offset: Number(store.getMeta('offset') ?? 0), timeout: store.nextMessage() ? 0 : 10, limit: 20,
        allowed_updates: ['message', 'callback_query'],
      }, controller.signal);
      for (const update of updates) {
        renewLease();
        app.process(update);
        if (update.callback_query) {
          try { await api.call('answerCallbackQuery', { callback_query_id: update.callback_query.id }, controller.signal); }
          catch { /* Buttons from older updates may have expired. The order state is already durable. */ }
        }
        await app.flush(api, 1);
      }
    } catch (error) {
      if (controller.signal.aborted) break;
      // Application/database errors must stop rather than silently skip a paid order.
      if (!(error instanceof TelegramError)) throw error;
      console.error('Telegram temporarily unavailable. Retrying; updates remain in the queue.');
      await setTimeout(Math.min(60_000, Math.max(2000, error.retryAfterMs ?? 0)), undefined, { signal: controller.signal }).catch(() => {});
    }
  }
} catch {
  console.error('Bot stopped. Check token presence, connectivity, webhook configuration, database permissions and whether another process is running. No private details were logged.');
  process.exitCode = 1;
} finally {
  if (leased) store.transaction(() => {
    const lease = JSON.parse(store.getMeta('runner') ?? 'null');
    if (lease?.owner === leaseOwner) store.setMeta('runner', 'null');
  });
  store.close();
}
