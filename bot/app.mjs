import { canAsk, canFinish, changeOrder, delivered, hasReviewAccess, MAX_QUESTIONS, MAX_QUESTION_CHARS, MAX_QUESTION_ROUND_CHARS, offerText, QUESTION_WINDOW_MS, requireThat, SERVICES, serviceKeys, UserError } from './domain.mjs';

const button = (order, text, action) => ({ text, callback_data: `o:${order.id}:${action}` });
const keyboard = rows => ({ inline_keyboard: rows });
const menuButton = { text: '← Меню', callback_data: 'm:home' };
const navigation = (text, action) => ({ text, callback_data: `m:${action}` });
const orderTitle = order => order.isTest ? 'Пробный разбор' : order.title;
const deadlineText = order => `${new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
}).format(order.reviewedAt + QUESTION_WINDOW_MS)} МСК`;

export class BotApp {
  constructor(store, clock = Date.now, brand = 'FW LABEL NETWORK') { this.store = store; this.clock = clock; this.brand = brand; }
  say(chatId, text, rows = []) {
    const editing = this.replyTo?.chatId === chatId;
    this.store.enqueue(chatId, editing ? 'editMessageText' : 'sendMessage', {
      text, link_preview_options: { is_disabled: true },
      ...(editing ? { message_id: this.replyTo.messageId, reply_markup: keyboard(rows) } : { protect_content: true }),
      ...(!editing && rows.length ? { reply_markup: keyboard(rows) } : {}),
    });
  }
  showHome(actorId, resume = false) {
    const orders = this.store.ordersFor(actorId);
    if (resume && orders.length === 1) { this.showOrder(orders[0], actorId); return; }
    this.say(actorId, `${this.brand}\n\nГолосовой разбор твоего трека и личные рекомендации эксперта.\n\n${orders.length ? 'Открой свой разбор или задание.' : 'Для подключения разбора открой личную ссылку заказа.'}`, [
      [navigation('Мои разборы', 'orders')],
      ...(this.store.expert(actorId) ? [[navigation('Мои задания', 'tasks')]] : []),
      [navigation('Как это работает', 'help')],
    ]);
  }
  showOrders(actorId, role) {
    if (role === 'expert') requireThat(this.store.expert(actorId), 'Доступ к заданиям появится после подключения эксперта.');
    const orders = this.store.ordersFor(actorId).filter(order => order[role === 'expert' ? 'expertId' : 'clientId'] === actorId);
    if (orders.length === 1) { this.showOrder(orders[0], actorId); return; }
    this.say(actorId, orders.length ? 'Выбери разбор:' : (role === 'expert'
      ? 'Новых заданий пока нет. Когда поступит заказ, бот пришлёт его сюда.'
      : 'У тебя пока нет разборов. Открой личную ссылку своего заказа, чтобы подключить его.'), [
      ...orders.slice(0, 30).map(order => [button(order, orderTitle(order), 'open')]), [menuButton],
    ]);
  }
  showHelp(actorId) {
    this.say(actorId, 'Как проходит разбор\n\n1. После оплаты эксперт получает твой трек.\n2. Слушает его и присылает личный голосовой разбор.\n3. В течение 72 часов ты можешь прислать один раунд до пяти вопросов: текстом или одним голосовым. Можно сразу нажать «Всё понятно».\n\nДальнейшие услуги обсуждаются отдельно, по твоему желанию. В демо можно пройти весь путь без оплаты.', [[menuButton]]);
  }
  controls(order, actorId) {
    const expert = order.expertId === actorId;
    if (expert) {
      if (order.status === 'awaiting_review') return [
        ...(order.trackUrl ? [[{ text: 'Открыть трек', url: order.trackUrl }]] : []),
        [button(order, 'Записать голосовой разбор', 'review')],
      ];
      if (order.status === 'questions_pending') return [[button(order, 'Ответить на вопросы', 'answer')]];
      if (canFinish(order, this.clock())) return [[button(order, 'Завершить разбор', 'finish')]];
      if (order.status === 'deciding') return [
        [button(order, '🟢 Готов к отправке', 'ready')], [button(order, '🛠 Нужна доработка', 'work')],
        [button(order, 'Завершить без предложения', 'close')],
      ];
      if (order.status === 'offer_edit') return [
        ...serviceKeys(order.verdict).map(key => [button(order, `${order.services.includes(key) ? '✓ ' : ''}${SERVICES[key]}`, `s_${key}`)]),
        ...(order.services.length ? [[button(order, 'Далее →', 'preview')]] : []),
        [button(order, 'Изменить оценку готовности', 'verdict')], [button(order, 'Завершить без предложения', 'close')],
      ];
    } else {
      if (canAsk(order, this.clock())) return [[button(order, 'Задать вопросы', 'ask')], [button(order, 'Всё понятно', 'skip')]];
      if (order.status === 'completed' && order.services?.length && !order.interested) return [[button(order, 'Узнать условия', 'interest')]];
    }
    return [[button(order, 'Обновить статус', 'open')]];
  }
  showOrder(order, actorId) {
    requireThat(actorId === order.expertId || actorId === order.clientId, 'Этот разбор недоступен.');
    const isExpert = order.expertId === actorId;
    if (!isExpert && order.status === 'completed' && order.services?.length) {
      const requested = order.isTest ? 'Демо пройдено. Запрос передан, реальные услуги не заказаны.'
        : 'Условия запрошены. Вернёмся с предложением по задаче, стоимости и срокам.';
      this.say(actorId, order.interested ? requested : offerText(order), [
        ...this.controls(order, actorId), [menuButton],
      ]);
      return;
    }
    const expertStatuses = {
      awaiting_review: order.isTest && !order.trackUrl
        ? 'Клиент ждёт разбор. Для проверки запиши любое короткое голосовое сообщение.'
        : 'Послушай трек и запиши голосовой разбор: что получилось и что стоит доработать.',
      review_queued: 'Передаём голосовой разбор клиенту.',
      reviewed: canAsk(order, this.clock()) ? 'Клиент получил разбор. Теперь он может задать вопросы или нажать «Всё понятно».'
        : 'Время для уточнений истекло. Подведи итог разбора.',
      questions_queued: 'Передаём голосовое с вопросами клиента.',
      questions_pending: 'Клиент прислал уточнения. Ответь на них одним голосовым или текстовым сообщением.',
      answer_queued: 'Передаём твой ответ клиенту.',
      ready_finish: 'Уточнения завершены. Подведи итог и выбери следующий шаг для трека.',
      deciding: 'Готов ли трек к отправке на лейблы?',
      offer_edit: 'Выбери до двух подходящих услуг. Можно завершить разбор без предложения.',
      offer_queued: 'Отправляем предложение клиенту.',
      completed: order.interested ? 'Клиент запросил условия по следующей услуге.'
        : order.services?.length ? 'Предложение доставлено клиенту. Он сможет запросить условия.' : 'Разбор завершён. Спасибо!',
    };
    const clientStatuses = {
      awaiting_review: 'Заказ у эксперта. Здесь появится твой голосовой разбор, а после него можно будет задать вопросы.',
      review_queued: 'Голосовой разбор готов — сейчас он появится здесь.',
      reviewed: canAsk(order, this.clock()) ? 'Послушай голосовое сообщение выше. Есть вопросы? Пришли один раунд до пяти вопросов: текстом или одним голосовым. Либо нажми «Всё понятно».'
        : 'Время для уточнений истекло. Эксперт подведёт итог разбора.',
      questions_queued: 'Передаём твой голосовой раунд эксперту. Его ответ появится здесь.',
      questions_pending: 'Твои вопросы у эксперта. Его ответ появится здесь.',
      answer_queued: 'Эксперт ответил — сейчас сообщение появится здесь.',
      ready_finish: 'Ответ на уточнения получен. Эксперт подведёт итог разбора.',
      deciding: 'Эксперт подводит итог разбора.',
      offer_edit: 'Эксперт готовит рекомендации по следующему шагу.',
      offer_queued: 'Рекомендации по следующему шагу сейчас появятся здесь.',
      completed: order.services?.length ? offerText(order) : 'Разбор завершён. Возвращайся к рекомендациям, когда будешь работать над треком.',
    };
    const expertName = this.store.expert(order.expertId)?.name ?? 'Твой эксперт';
    const status = hasReviewAccess(order) ? (isExpert ? expertStatuses : clientStatuses)[order.status] : 'Ждём подтверждения оплаты. После неё эксперт получит трек.';
    const questions = isExpert && order.questionVoice ? '\n\nВопросы клиента — в голосовом сообщении выше.'
      : isExpert && order.questions?.length ? `\n\nВопросы клиента:\n${order.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '';
    const deadline = order.reviewedAt && order.status === 'reviewed'
      ? `\n\nУточнения доступны до ${deadlineText(order)}.` : '';
    this.say(actorId, `${order.isTest ? 'Демо · без оплаты\n\n' : ''}${orderTitle(order)}${!isExpert ? `\nЭксперт: ${expertName}` : ''}\n\n${status}${questions}${deadline}`, [
      ...(hasReviewAccess(order) ? this.controls(order, actorId) : []), [menuButton],
    ]);
  }
  orderReady(order) {
    if (hasReviewAccess(order) && order.clientId) {
      this.showOrder(order, order.clientId);
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
    try { return this.store.transaction(() => {
      const offset = Number(this.store.getMeta('offset') ?? 0);
      if (update.update_id < offset) return;
      const message = update.message ?? update.callback_query?.message;
      const actorId = (update.callback_query?.from ?? update.message?.from)?.id;
      // No group chats or identity inferred from a callback payload.
      if (message?.chat?.type === 'private' && message.chat.id === actorId && Number.isSafeInteger(actorId) && actorId > 0) {
        if (update.callback_query && Number.isSafeInteger(message.message_id)) {
          this.replyTo = { chatId: actorId, messageId: message.message_id };
        }
        try {
          if (update.callback_query) this.callback(actorId, update.callback_query.data);
          else this.message(actorId, update.message);
        } catch (error) {
          if (!(error instanceof UserError)) throw error;
          this.say(actorId, error.message, [[menuButton]]);
        }
      }
      // This and all state/outgoing effects commit together. Replayed updates have no effects.
      this.store.setMeta('offset', update.update_id + 1);
    }); } finally { this.replyTo = null; }
  }
  message(actorId, message) {
    const text = message.text?.trim() ?? '';
    if (text.startsWith('/start')) {
      requireThat(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]{32})?$/.test(text), 'Открой личную ссылку своего заказа.');
      const token = text.split(/\s+/)[1];
      if (token) {
        const order = this.store.bindClient(token, actorId);
        if (!order && this.store.ordersFor(actorId).length) { this.showHome(actorId, true); return; }
        requireThat(order, 'Эта ссылка уже использована или недействительна. Открой личную ссылку своего заказа.');
        if (hasReviewAccess(order)) this.orderReady(order);
        else this.showOrder(order, actorId);
      } else {
        this.store.setSession(actorId, null);
        this.showHome(actorId, true);
      }
      return;
    }
    if (text === '/id') {
      this.say(actorId, `Твой Telegram ID: ${actorId}`, [[menuButton]]);
      return;
    }
    if (text === '/help' || text === 'Как это работает') {
      this.showHelp(actorId);
      return;
    }
    if (text === '/cancel' || text === '/orders') {
      this.store.setSession(actorId, null);
      this.showHome(actorId, true);
      return;
    }
    const session = this.store.session(actorId);
    if (!session) { this.showHome(actorId); return; }
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
    } else if (session.kind === 'questions') {
      requireThat(order.clientId === actorId && canAsk(order, this.clock()), 'Раунд вопросов уже использован или 72 часа истекли.');
      const draftButtons = [[button(order, 'Отправить эксперту', 'submit')], [button(order, 'Записать заново', 'ask')], [button(order, 'Отменить', 'open')]];
      if (message.voice) {
        if (session.questions.length) {
          this.say(actorId, 'Текстовые вопросы уже записаны. Отправь их или нажми «Записать заново», чтобы заменить раунд голосовым.', draftButtons);
          return;
        }
        requireThat(typeof message.voice.file_id === 'string' && message.voice.file_id.length > 0
          && Number.isSafeInteger(message.voice.duration) && message.voice.duration >= 0, 'Не удалось прочитать голосовое. Запиши его ещё раз.');
        session.questionVoice = { fileId: message.voice.file_id, durationSeconds: message.voice.duration };
        this.store.setSession(actorId, session);
        this.say(actorId, 'Голосовое с вопросами записано. Отправить эксперту?', draftButtons);
        return;
      }
      if (session.questionVoice) {
        this.say(actorId, 'Голосовой раунд уже записан. Можно отправить его или записать заново.', draftButtons);
        return;
      }
      requireThat(text && !text.startsWith('/') && text.length <= MAX_QUESTION_CHARS, 'Пришли вопрос текстом до 1 000 знаков или запиши один голосовой раунд.');
      if (session.questions.length >= MAX_QUESTIONS) {
        this.say(actorId, 'Пять вопросов уже записаны. Отправить их эксперту?', draftButtons);
        return;
      }
      if (session.questions.join('').length + text.length > MAX_QUESTION_ROUND_CHARS) {
        this.say(actorId, 'На весь текстовый раунд — до 3 000 знаков. Сократи вопрос или отправь уже записанные.', draftButtons);
        return;
      }
      session.questions.push(text);
      this.store.setSession(actorId, session);
      this.say(actorId, session.questions.length === MAX_QUESTIONS ? 'Пять вопросов записаны. Отправить эксперту?'
        : `Записано вопросов: ${session.questions.length} из ${MAX_QUESTIONS}. Можешь добавить ещё или отправить раунд.`, draftButtons);
    } else if (session.kind === 'note') {
      const next = changeOrder(order, actorId, 'note', { text }, this.clock());
      this.store.save(next);
      this.store.setSession(actorId, null);
      this.preview(next, actorId);
    }
  }
  callback(actorId, value) {
    const menu = /^m:(home|orders|tasks|help)$/.exec(value ?? '');
    if (menu) {
      this.store.setSession(actorId, null);
      if (menu[1] === 'home') this.showHome(actorId);
      if (menu[1] === 'orders') this.showOrders(actorId, 'client');
      if (menu[1] === 'tasks') this.showOrders(actorId, 'expert');
      if (menu[1] === 'help') this.showHelp(actorId);
      return;
    }
    const match = /^o:([a-f0-9]{12}):([a-z_]+)$/.exec(value ?? '');
    requireThat(match, 'Эта кнопка устарела. Открой меню, чтобы продолжить.');
    const [, id, action] = match;
    const order = this.store.order(id);
    requireThat(order && (order.clientId === actorId || order.expertId === actorId), 'Этот заказ недоступен.');
    requireThat(hasReviewAccess(order) && order.clientId, 'Заказ пока недоступен.');
    const expert = order.expertId === actorId;
    const clientActions = ['ask', 'submit', 'skip', 'interest'];
    if (action !== 'open') requireThat(clientActions.includes(action) ? !expert : expert, 'Это действие недоступно.');
    if (action === 'open') { this.store.setSession(actorId, null); this.showOrder(order, actorId); return; }
    if (action === 'review' || action === 'answer') {
      requireThat(order.status === (action === 'review' ? 'awaiting_review' : 'questions_pending'), 'Этот этап уже завершён.');
      this.store.setSession(actorId, { orderId: id, kind: action });
      this.say(actorId, action === 'review'
        ? `${orderTitle(order)}\n\nЗапиши голосовое сообщение прямо в этот чат.${order.isTest ? ' Для проверки хватит нескольких секунд.' : ' Ориентир — 2–4 минуты: что работает и что доработать.'}`
        : `Ответ на уточнения\n\n${order.questionVoice ? 'Послушай голосовое с вопросами клиента выше.' : (order.questions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nПришли один голосовой или текстовый ответ на уточнения.`,
      [[button(order, 'Отменить', 'open')]]);
      return;
    }
    if (action === 'ask') {
      requireThat(canAsk(order, this.clock()), 'Раунд вопросов уже использован или 72 часа истекли.');
      this.store.setSession(actorId, { orderId: id, kind: 'questions', questions: [] });
      this.say(actorId, 'Собери до пяти вопросов в один раунд. Запиши одно голосовое или пришли вопросы текстом, каждый отдельным сообщением. Затем нажми «Отправить эксперту».', [[button(order, 'Отменить', 'open')]]);
      return;
    }
    if (action === 'submit') {
      const session = this.store.session(actorId);
      requireThat(session?.orderId === id && session.kind === 'questions', 'Сначала запиши вопросы для этого заказа.');
      const next = changeOrder(order, actorId, 'questions', { questions: session.questions, questionVoice: session.questionVoice }, this.clock());
      this.store.save(next);
      this.store.setSession(actorId, null);
      this.showOrder(next, actorId);
      if (next.questionVoice) {
        this.store.enqueue(order.expertId, 'sendVoice', { voice: next.questionVoice.fileId, protect_content: true },
          { orderId: id, kind: 'questions', clientStatusMessageId: this.replyTo?.messageId });
      } else this.showOrder(next, order.expertId);
      return;
    }
    if (['preview', 'note', 'verdict', 'edit', 'endorse'].includes(action)) {
      requireThat(order.status === 'offer_edit', 'Предложение уже отправлено или ещё не подготовлено.');
      if (action === 'preview') this.preview(order, actorId);
      if (action === 'note') {
        this.store.setSession(actorId, { orderId: id, kind: 'note' });
        this.say(actorId, 'Напиши короткий комментарий к предложению (до 1 000 знаков).', [[button(order, 'Отменить', 'open')]]);
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
    if (action === 'skip') { this.showOrder(next, actorId); this.showOrder(next, order.expertId); }
    else if (action === 'offer') {
      this.store.enqueue(order.clientId, 'sendMessage', { text: offerText(next), protect_content: true,
        reply_markup: keyboard([[button(next, 'Узнать условия', 'interest')], [menuButton]]),
      }, { orderId: id, kind: 'offer' });
      this.showOrder(next, actorId);
    } else if (action === 'close') {
      this.showOrder(next, order.clientId);
      this.showOrder(next, actorId);
    } else if (action === 'interest') {
      this.say(order.expertId, `${order.isTest ? 'Демо · без оплаты\n\n' : ''}Клиент хочет узнать условия: ${orderTitle(order)}\n\n${order.services.map(s => SERVICES[s]).join(', ')}.\n\nПлатформа согласует задачу, стоимость и сроки отдельно.`, [[button(order, 'Открыть разбор', 'open')]]);
      this.say(actorId, order.isTest ? 'Демо пройдено. Запрос передан, реальные услуги не заказаны.' : 'Запрос передан. Согласуем с тобой задачу, стоимость и сроки до нового заказа.', [[menuButton]]);
    } else this.showOrder(next, actorId);
  }
  preview(order, actorId) {
    requireThat(order.services?.length > 0, 'Сначала выбери одну или две услуги.');
    this.say(actorId, `Предпросмотр для клиента:\n\n${offerText(order)}`, [
      [button(order, 'Отправить предложение', 'offer')], [button(order, 'Добавить комментарий', 'note')],
      [button(order, 'Изменить услуги', 'edit')], [button(order, 'Завершить без предложения', 'close')],
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
        if (row.delivery.kind !== 'offer') {
          const previousReply = this.replyTo;
          try {
            if (row.delivery.kind === 'questions' && Number.isSafeInteger(row.delivery.clientStatusMessageId)) {
              this.replyTo = { chatId: order.clientId, messageId: row.delivery.clientStatusMessageId };
            }
            this.showOrder(order, order.clientId);
          } finally { this.replyTo = previousReply; }
        }
        this.showOrder(order, order.expertId);
      });
    }
  }
}
