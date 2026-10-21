export const QUESTION_WINDOW_MS = 72 * 60 * 60 * 1000;

export const SERVICES = {
  labels: 'Подбор лейблов',
  demo: 'Подготовка демо к отправке',
  intro: 'Личное представление лейблам',
  ar: 'A&R-сопровождение',
  refinement: 'Доработка с экспертом',
  production: 'Продакшн / аранжировка',
  mixing: 'Сведение',
  mastering: 'Мастеринг',
};
export const serviceKeys = verdict => verdict === 'ready'
  ? ['labels', 'demo', 'intro', 'ar']
  : ['refinement', 'production', 'mixing', 'mastering'];

export class UserError extends Error {}
export const requireThat = (condition, message) => { if (!condition) throw new UserError(message); };
// Only the trusted server operator can create a test order. It never records a payment.
export const hasReviewAccess = order => order.paid === true || order.isTest === true;
export const canAsk = (order, now) => order.status === 'reviewed' && now < order.reviewedAt + QUESTION_WINDOW_MS;
export const canFinish = (order, now) => order.status === 'ready_finish'
  || (order.status === 'reviewed' && !canAsk(order, now));

export function changeOrder(current, actorId, action, data = {}, now = Date.now()) {
  const order = structuredClone(current);
  const clientActions = ['questions', 'skip', 'interest'];
  const owner = clientActions.includes(action) ? order.clientId : order.expertId;
  requireThat(actorId === owner, 'Этот заказ недоступен.');
  requireThat(hasReviewAccess(order) && order.clientId, 'Заказ ещё не готов: нужны подтверждение оплаты и подключение клиента.');
  switch (action) {
    case 'review':
      requireThat(order.status === 'awaiting_review', 'Разбор уже отправлен или ожидает доставки.');
      requireThat(typeof data.voice === 'string' && data.voice.length > 0, 'Нужно голосовое сообщение.');
      order.status = 'review_queued';
      break;
    case 'questions':
      requireThat(canAsk(order, now), 'Раунд вопросов уже использован или 72 часа истекли.');
      requireThat(Array.isArray(data.questions) && data.questions.length >= 1 && data.questions.length <= 2
        && data.questions.every(q => typeof q === 'string' && q.trim().length > 0 && q.length <= 1000), 'Отправь один или два вопроса, до 1 000 знаков каждый.');
      order.questions = data.questions.map(q => q.trim());
      order.status = 'questions_pending';
      break;
    case 'skip':
      requireThat(order.status === 'reviewed', 'Этот шаг уже завершён.');
      order.status = 'ready_finish';
      break;
    case 'answer':
      requireThat(order.status === 'questions_pending', 'Вопросов для ответа сейчас нет.');
      requireThat(Boolean(data.voice) || (typeof data.text === 'string' && data.text.trim().length > 0 && data.text.length <= 3000), 'Нужен голосовой или текстовый ответ до 3 000 знаков.');
      order.status = 'answer_queued';
      break;
    case 'finish':
      requireThat(canFinish(order, now), 'Сначала ответь на вопросы. Если вопросов нет, клиент может нажать «Всё понятно», либо дождись окончания 72 часов.');
      order.status = 'deciding';
      break;
    case 'ready':
    case 'work':
      requireThat(['deciding', 'offer_edit'].includes(order.status), 'Сначала заверши разбор.');
      order.status = 'offer_edit';
      order.verdict = action === 'ready' ? 'ready' : 'work';
      order.services = [];
      order.endorsed = false;
      order.note = '';
      break;
    case 'select': {
      requireThat(order.status === 'offer_edit' && serviceKeys(order.verdict).includes(data.service), 'Эта услуга сейчас недоступна.');
      const selected = order.services.includes(data.service);
      requireThat(selected || order.services.length < 2, 'Выбери не более двух услуг.');
      requireThat(selected || data.service !== 'intro' || order.endorsed, 'Для личного представления нужно отдельно подтвердить готовность рекомендовать трек.');
      order.services = selected ? order.services.filter(s => s !== data.service) : [...order.services, data.service];
      if (data.service === 'intro' && selected) order.endorsed = false;
      break;
    }
    case 'endorse':
      requireThat(order.status === 'offer_edit' && order.verdict === 'ready' && order.services.length < 2, 'Личное представление сейчас недоступно.');
      order.endorsed = true;
      if (!order.services.includes('intro')) order.services.push('intro');
      break;
    case 'note':
      requireThat(order.status === 'offer_edit' && typeof data.text === 'string' && data.text.trim().length <= 1000, 'Комментарий — до 1 000 знаков.');
      order.note = data.text.trim();
      break;
    case 'offer':
      requireThat(order.status === 'offer_edit' && order.services.length >= 1 && order.services.length <= 2, 'Сначала выбери одну или две услуги.');
      requireThat(!order.services.includes('intro') || order.endorsed, 'Подтверди личную рекомендацию.');
      order.status = 'offer_queued';
      break;
    case 'close':
      requireThat(['deciding', 'offer_edit'].includes(order.status), 'Сначала заверши разбор.');
      order.status = 'completed';
      order.services = [];
      break;
    case 'interest':
      requireThat(order.status === 'completed' && order.services?.length > 0 && !order.interested, 'Запрос уже отправлен или предложение недоступно.');
      order.interested = true;
      break;
    default: throw new UserError('Неизвестное действие.');
  }
  order.updatedAt = now;
  return order;
}

export function delivered(current, kind, now = Date.now()) {
  const order = structuredClone(current);
  if (kind === 'review' && order.status === 'review_queued') {
    order.status = 'reviewed';
    order.reviewedAt = now;
  } else if (kind === 'answer' && order.status === 'answer_queued') order.status = 'ready_finish';
  else if (kind === 'offer' && order.status === 'offer_queued') order.status = 'completed';
  else throw new Error('Unexpected delivery transition');
  order.updatedAt = now;
  return order;
}

export function offerText(order) {
  return `${order.isTest ? 'Демо · без оплаты\n\n' : ''}Следующий шаг: ${order.isTest ? 'пробный разбор' : order.title}\n\n${order.verdict === 'ready' ? 'Эксперт считает трек готовым к отправке на лейблы.' : 'Эксперт рекомендует доработать трек.'}\n\n${order.services.map(s => `• ${SERVICES[s]}`).join('\n')}${order.note ? `\n\n${order.note}` : ''}\n\nУслуги по желанию. Стоимость и сроки согласуем до нового заказа.${order.services.includes('intro') ? '\nЛичная рекомендация не гарантирует ответ или контракт с лейблом.' : ''}`;
}
