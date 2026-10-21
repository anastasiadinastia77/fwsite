import { canAsk, canFinish, changeOrder, delivered, hasReviewAccess, offerText, QUESTION_WINDOW_MS, requireThat, SERVICES, serviceKeys, UserError } from './domain.mjs';

const button = (order, text, action) => ({ text, callback_data: `o:${order.id}:${action}` });
const keyboard = rows => ({ inline_keyboard: rows });

export class BotApp {
  constructor(store, clock = Date.now, brand = 'FW LABEL NETWORK') { this.store = store; this.clock = clock; this.brand = brand; }
  say(chatId, text, rows = []) {
    this.store.enqueue(chatId, 'sendMessage', { text, protect_content: true,
      link_preview_options: { is_disabled: true }, ...(rows.length ? { reply_markup: keyboard(rows) } : {}) });
  }
  controls(order, actorId) {
    const expert = order.expertId === actorId;
    if (expert) {
      if (order.status === 'awaiting_review') return [[button(order, 'Записать голосовой разбор', 'review')]];
      if (order.status === 'questions_pending') return [[button(order, 'Ответить на вопросы', 'answer')]];
      if (canFinish(order, this.clock())) return [[button(order, 'Завершить разбор', 'finish')]];
      if (order.status === 'deciding') return [
        [button(order, '🟢 Готов к отправке', 'ready')], [button(order, '🛠 Нужна доработка', 'work')],
        [button(order, 'Завершить без предложения', 'close')],
      ];
      if (order.status === 'offer_edit') return [
        ...serviceKeys(order.verdict).map(key => [button(order, `${order.services.includes(key) ? '✓ ' : ''}${SERVICES[key]}`, `s_${key}`)]),
        [button(order, 'Добавить комментарий', 'note')], [button(order, 'Посмотреть предложение', 'preview')],
        [button(order, 'Изменить оценку готовности', 'verdict')], [button(order, 'Завершить без предложения', 'close')],
      ];
    } else {
      if (canAsk(order, this.clock())) return [[button(order, 'Задать вопросы', 'ask')], [button(order, 'Всё понятно', 'skip')]];
      if (order.status === 'completed' && order.services?.length && !order.interested) return [[button(order, 'Узнать условия', 'interest')]];
    }
    return [];
  }
  showOrder(order, actorId) {
    const statuses = {
      awaiting_review: 'Ожидаем голосовой разбор.', review_queued: 'Доставляем голосовой разбор.',
      reviewed: 'Разбор доставлен. Один раунд: до двух вопросов в течение 72 часов.',
      questions_pending: 'Вопросы отправлены. Ожидаем ответ эксперта.', answer_queued: 'Доставляем ответ эксперта.',
      ready_finish: 'Ответы завершены. Эксперт может подвести итог.', deciding: 'Готов ли трек к отправке на лейблы?',
      offer_edit: 'Выбери одну или две подходящие услуги. Можно завершить без предложения.',
      offer_queued: 'Доставляем предложение.', completed: 'Разбор завершён.',
    };
    const isExpert = order.expertId === actorId;
    const detail = isExpert && hasReviewAccess(order) && order.clientId
      ? (order.trackUrl ? `\nТрек: ${order.trackUrl}` : '\nТест без трека: запиши любое короткое пробное голосовое сообщение.') : '';
    const questions = isExpert && order.questions?.length ? `\n\nВопросы клиента:\n${order.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '';
    const deadline = order.reviewedAt && order.status === 'reviewed'
      ? `\nВопросы принимаются до ${new Date(order.reviewedAt + QUESTION_WINDOW_MS).toISOString().replace('T', ' ').slice(0, 16)} UTC.` : '';
    this.say(actorId, `${order.isTest ? 'ТЕСТ — без оплаты. Реальные услуги не заказываются.\n\n' : ''}Заказ ${order.id} · ${order.title}\n${hasReviewAccess(order) ? statuses[order.status] : 'Ожидаем подтверждение оплаты.'}${detail}${questions}${deadline}`,
      hasReviewAccess(order) ? this.controls(order, actorId) : []);
  }
  orderReady(order) {
    if (hasReviewAccess(order) && order.clientId) {
      this.say(order.clientId, order.isTest
        ? `ТЕСТ — заказ «${order.title}» подключён без оплаты. Эксперт отправит пробное голосовое сообщение. Реальные услуги не заказываются.`
        : `Оплата заказа «${order.title}» подтверждена. Трек передан выбранному эксперту.`);
      this.showOrder(order, order.expertId);
    }
  }
  confirmPayment(orderId) {
    return this.store.transaction(() => {
      const order = this.store.order(orderId);
      requireThat(order && !order.paid, 'Заказ не найден или оплата уже подтверждена.');
      requireThat(!order.isTest, 'Это тестовый заказ без оплаты. Подтверждать платёж для него нельзя.');
      order.paid = true;
      order.updatedAt = this.clock();
      this.store.save(order);
      this.orderReady(order);
    });
  }
  process(update) {
    if (!Number.isSafeInteger(update.update_id)) return;
    return this.store.transaction(() => {
      const offset = Number(this.store.getMeta('offset') ?? 0);
      if (update.update_id < offset) return;
      const message = update.message ?? update.callback_query?.message;
      const actorId = (update.callback_query?.from ?? update.message?.from)?.id;
      // No group chats or identity inferred from a callback payload.
      if (message?.chat?.type === 'private' && message.chat.id === actorId && Number.isSafeInteger(actorId) && actorId > 0) {
        try {
          if (update.callback_query) this.callback(actorId, update.callback_query.data);
          else this.message(actorId, update.message);
        } catch (error) {
          if (!(error instanceof UserError)) throw error;
          this.say(actorId, error.message);
        }
      }
      // This and all state/outgoing effects commit together. Replayed updates have no effects.
      this.store.setMeta('offset', update.update_id + 1);
    });
  }
  message(actorId, message) {
    const text = message.text?.trim() ?? '';
    if (text.startsWith('/start')) {
      requireThat(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]{32})?$/.test(text), 'Открой персональную ссылку на заказ или используй /orders.');
      const token = text.split(/\s+/)[1];
      if (token) {
        const order = this.store.bindClient(token, actorId);
        requireThat(order, 'Приглашение уже использовано или недействительно. Твои заказы: /orders.');
        this.say(actorId, `Ты подключён к заказу «${order.title}». Здесь будут разбор и вопросы. Личные сообщения не публикуются.`);
        this.orderReady(order);
        this.showOrder(order, actorId);
      } else this.say(actorId, `${this.brand}\n\nДля клиента: открой личную ссылку заказа от платформы. Для подключённого эксперта: /orders.\n\n/id — мой Telegram ID для подключения эксперта\n/help — инструкция, /cancel — отменить ввод.`);
      return;
    }
    if (text === '/id') {
      this.say(actorId, `Твой Telegram ID: ${actorId}\nПередай его оператору платформы для подключения. Команда не назначает роль эксперта.`);
      return;
    }
    if (text === '/help') {
      this.say(actorId, 'Трек добавляет платформа по личной ссылке; он доступен эксперту после подтверждения оплаты.\n\nЭксперт отправляет голосовой разбор. Клиент задаёт один или два текстовых вопроса одним раундом за 72 часа или нажимает «Всё понятно». Эксперт отвечает и завершает разбор.\n\nДополнительные услуги — по желанию и с отдельным согласованием.\n\n/orders — мои заказы\n/id — мой Telegram ID\n/cancel — отменить текущий ввод.');
      return;
    }
    if (text === '/cancel' || text === '/orders') {
      this.store.setSession(actorId, null);
      if (text === '/cancel') this.say(actorId, 'Ввод отменён. Открыть заказы: /orders.');
      else {
        const orders = this.store.ordersFor(actorId);
        if (!orders.length) this.say(actorId, 'Заказов пока нет. Клиенту нужна личная ссылка. Эксперта подключает платформа; неоплаченные заказы ему не передаются.');
        // A compact picker avoids enqueuing every historical order on each request.
        else this.say(actorId, 'Выбери заказ:', orders.slice(0, 30).map(o => [button(o, `${o.title} · ${o.id}`, 'open')]));
      }
      return;
    }
    const session = this.store.session(actorId);
    requireThat(session, 'Открой /orders и выбери действие для нужного заказа.');
    const order = this.store.order(session.orderId);
    requireThat(order, 'Заказ не найден.');
    if (session.kind === 'review' || session.kind === 'answer') {
      const action = session.kind;
      const voice = message.voice?.file_id;
      const next = changeOrder(order, actorId, action, { voice, text }, this.clock());
      this.store.save(next);
      if (voice) this.store.enqueue(order.clientId, 'sendVoice', { voice, protect_content: true }, { orderId: order.id, kind: action });
      else this.store.enqueue(order.clientId, 'sendMessage', { text, protect_content: true }, { orderId: order.id, kind: action });
      this.store.setSession(actorId, null);
      this.say(actorId, 'Сообщение сохранено для доставки клиенту. Бот сообщит, когда Telegram примет его.');
    } else if (session.kind === 'questions') {
      requireThat(order.clientId === actorId && canAsk(order, this.clock()), 'Раунд вопросов уже использован или 72 часа истекли.');
      requireThat(text && !text.startsWith('/') && text.length <= 1000, 'Вопрос отправь текстом, до 1 000 знаков.');
      requireThat(session.questions.length < 2, 'Уже записано два вопроса. Нажми «Отправить вопросы» или /cancel.');
      session.questions.push(text);
      this.store.setSession(actorId, session);
      this.say(actorId, `Вопрос ${session.questions.length} сохранён. ${session.questions.length === 1 ? 'Можешь написать второй или отправить один.' : 'Оба вопроса готовы.'}\nЭто единственный раунд вопросов.`,
        [[button(order, 'Отправить вопросы', 'submit')]]);
    } else if (session.kind === 'note') {
      const next = changeOrder(order, actorId, 'note', { text }, this.clock());
      this.store.save(next);
      this.store.setSession(actorId, null);
      this.preview(next, actorId);
    }
  }
  callback(actorId, value) {
    const match = /^o:([a-f0-9]{12}):([a-z_]+)$/.exec(value ?? '');
    requireThat(match, 'Открой актуальные действия через /orders.');
    const [, id, action] = match;
    const order = this.store.order(id);
    requireThat(order && (order.clientId === actorId || order.expertId === actorId), 'Этот заказ недоступен.');
    requireThat(hasReviewAccess(order) && order.clientId, 'Заказ пока недоступен.');
    const expert = order.expertId === actorId;
    const clientActions = ['ask', 'submit', 'skip', 'interest'];
    if (action !== 'open') requireThat(clientActions.includes(action) ? !expert : expert, 'Это действие недоступно.');
    if (action === 'open') { this.showOrder(order, actorId); return; }
    if (action === 'review' || action === 'answer') {
      requireThat(order.status === (action === 'review' ? 'awaiting_review' : 'questions_pending'), 'Этот этап уже завершён.');
      this.store.setSession(actorId, { orderId: id, kind: action });
      this.say(actorId, action === 'review' ? `Заказ «${order.title}». Отправь голосовой разбор (ориентир: 2–4 минуты). /cancel — отмена.`
        : `Заказ «${order.title}». Ответь на вопросы одним голосовым или текстовым сообщением.\n${order.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
      return;
    }
    if (action === 'ask') {
      requireThat(canAsk(order, this.clock()), 'Раунд вопросов уже использован или 72 часа истекли.');
      this.store.setSession(actorId, { orderId: id, kind: 'questions', questions: [] });
      this.say(actorId, 'Напиши первый вопрос одним текстовым сообщением. Можно задать до двух вопросов одним раундом. /cancel — отмена.');
      return;
    }
    if (action === 'submit') {
      const session = this.store.session(actorId);
      requireThat(session?.orderId === id && session.kind === 'questions', 'Сначала запиши вопросы для этого заказа.');
      const next = changeOrder(order, actorId, 'questions', { questions: session.questions }, this.clock());
      this.store.save(next);
      this.store.setSession(actorId, null);
      this.say(actorId, 'Вопросы отправлены эксперту.');
      this.showOrder(next, order.expertId);
      return;
    }
    if (['preview', 'note', 'verdict', 'edit', 'endorse'].includes(action)) {
      requireThat(order.status === 'offer_edit', 'Предложение уже отправлено или ещё не подготовлено.');
      if (action === 'preview') this.preview(order, actorId);
      if (action === 'note') {
        this.store.setSession(actorId, { orderId: id, kind: 'note' });
        this.say(actorId, 'Напиши короткий комментарий к предложению (до 1 000 знаков). /cancel — отмена.');
      }
      if (action === 'verdict') this.say(actorId, 'При смене оценки выбранные услуги и комментарий сбросятся.', [
        [button(order, '🟢 Готов к отправке', 'ready')], [button(order, '🛠 Нужна доработка', 'work')],
      ]);
      if (action === 'edit') this.showOrder(order, actorId);
      if (action === 'endorse') {
        const next = changeOrder(order, actorId, action, {}, this.clock());
        this.store.save(next); this.showOrder(next, actorId);
      }
      return;
    }
    if (action.startsWith('s_')) {
      const service = action.slice(2);
      if (service === 'intro' && !order.services?.includes(service)) {
        requireThat(order.status === 'offer_edit' && order.verdict === 'ready', 'Личное представление сейчас недоступно.');
        this.say(actorId, 'Готовность трека к отправке не означает личную рекомендацию. Подтверди, только если готов представить этот трек по своим контактам.',
          [[button(order, 'Готов лично рекомендовать этот трек', 'endorse')], [button(order, 'Назад', 'edit')]]);
      } else {
        const next = changeOrder(order, actorId, 'select', { service }, this.clock());
        this.store.save(next); this.showOrder(next, actorId);
      }
      return;
    }
    const next = changeOrder(order, actorId, action, {}, this.clock());
    this.store.save(next);
    this.store.setSession(actorId, null);
    if (action === 'skip') { this.say(actorId, 'Уточнения завершены. Эксперт подведёт итог.'); this.showOrder(next, order.expertId); }
    else if (action === 'offer') {
      this.store.enqueue(order.clientId, 'sendMessage', { text: offerText(next), protect_content: true }, { orderId: id, kind: 'offer' });
      this.say(actorId, 'Предложение сохранено для доставки.');
    } else if (action === 'close') {
      this.say(order.clientId, `Разбор «${order.title}» завершён. Спасибо!`);
      this.say(actorId, 'Разбор завершён без предложения услуг.');
    } else if (action === 'interest') {
      this.say(order.expertId, `${order.isTest ? 'ТЕСТ — пробный запрос, реальные услуги не заказываются.\n\n' : ''}Клиент хочет узнать условия по заказу ${id} «${order.title}»:\n${order.services.map(s => SERVICES[s]).join(', ')}.\nПлатформа согласует задачу, стоимость и сроки отдельно.`);
      this.say(actorId, order.isTest ? 'ТЕСТ — запрос передан. Проверка бота завершена, реальные услуги не заказаны.' : 'Запрос передан. Платформа согласует с тобой задачу, стоимость и сроки. Новой оплаты сейчас нет.');
    } else this.showOrder(next, actorId);
  }
  preview(order, actorId) {
    requireThat(order.services?.length > 0, 'Сначала выбери одну или две услуги.');
    this.say(actorId, `Предпросмотр для клиента:\n\n${offerText(order)}`, [
      [button(order, 'Отправить предложение', 'offer')], [button(order, 'Изменить', 'edit')],
    ]);
  }
  async flush(api, limit = 30) {
    for (let i = 0; i < limit; i++) {
      const row = this.store.nextMessage(this.clock());
      if (!row) break;
      try {
        await api.call(row.method, row.payload);
      } catch (error) {
        const delay = Math.max(error.retryAfterMs ?? 0, Math.min(300_000, 1000 * 2 ** Math.min(row.attempts, 8)));
        this.store.retry(row.id, delay, this.clock());
        // No Telegram request URLs, message text, media IDs or raw errors in logs.
        continue;
      }
      this.store.transaction(() => {
        this.store.sent(row.id);
        if (!row.delivery) return;
        const order = delivered(this.store.order(row.delivery.orderId), row.delivery.kind, this.clock());
        this.store.save(order);
        if (row.delivery.kind === 'offer') this.say(order.clientId, 'Если хочешь продолжить, можно запросить условия.', this.controls(order, order.clientId));
        else this.showOrder(order, order.clientId);
        this.showOrder(order, order.expertId);
      });
    }
  }
}
