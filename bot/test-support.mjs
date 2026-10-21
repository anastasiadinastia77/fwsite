import { Store } from './store.mjs';
import { BotApp } from './app.mjs';

// Deliberately fictional identities and an unreachable example domain. No network transport.
export function fixture(path = ':memory:', { isTest = false } = {}) {
  const store = new Store(path);
  let now = Date.UTC(2026, 9, 21, 12);
  let updateId = Number(store.getMeta('offset') ?? 0);
  const app = new BotApp(store, () => now, 'Тестовая платформа');
  store.addExpert(1001, 'Демо-эксперт');
  const created = store.createOrder({ expertId: 1001, title: 'Тестовый трек',
    trackUrl: isTest ? undefined : 'https://example.invalid/private-demo', priceRub: 1990, isTest, now });
  const sent = [];
  const api = { async call(method, payload) { sent.push({ method, ...payload }); return { message_id: sent.length }; } };
  const message = (actorId, payload) => app.process({ update_id: updateId++, message: {
    chat: { id: actorId, type: 'private' }, from: { id: actorId }, ...payload,
  } });
  const click = (actorId, action, id = created.order.id) => app.process({ update_id: updateId++, callback_query: {
    id: `callback-${updateId}`, from: { id: actorId }, data: `o:${id}:${action}`,
    message: { chat: { id: actorId, type: 'private' } },
  } });
  return { store, app, api, sent, message, click, ...created,
    get: () => store.order(created.order.id),
    advance: ms => { now += ms; },
    async paid() {
      message(2001, { text: `/start ${created.invite}` });
      app.confirmPayment(created.order.id);
      await app.flush(api);
    },
    async reviewed() {
      await this.paid();
      click(1001, 'review');
      message(1001, { voice: { file_id: 'fictional-review-voice' } });
      await app.flush(api);
    },
    async readyToOffer(verdict = 'ready') {
      await this.reviewed();
      click(2001, 'skip');
      click(1001, 'finish');
      click(1001, verdict);
    },
  };
}
