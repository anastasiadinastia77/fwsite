import { parseArgs } from 'node:util';
import { Store } from './store.mjs';
import { BotApp } from './app.mjs';
import { SERVICES } from './domain.mjs';

process.umask(0o077);
const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  id: { type: 'string' }, name: { type: 'string' }, expert: { type: 'string' }, title: { type: 'string' },
  track: { type: 'string' }, price: { type: 'string' }, 'receipt-checked': { type: 'boolean' },
  'bot-name': { type: 'string' },
} });
const store = new Store(process.env.BOT_DB_PATH || './.bot-data/bot.sqlite');
try {
  const command = positionals[0];
  if (command === 'expert:add') {
    store.addExpert(Number(values.id), values.name);
    console.log('Confirmed expert registered. No Telegram messages sent.');
  } else if (command === 'order:create') {
    const username = values['bot-name'] ?? process.env.TELEGRAM_BOT_USERNAME;
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username ?? '')) throw new Error('Set a valid bot username (without @)');
    const { order, invite } = store.createOrder({ expertId: Number(values.expert), title: values.title,
      trackUrl: values.track, priceRub: Number(values.price) });
    console.log(`Order: ${order.id}\nPayment: NOT CONFIRMED\nPrivate one-use customer invitation (share only with this customer):\nhttps://t.me/${username}?start=${invite}`);
  } else if (command === 'payment:confirm') {
    if (!values['receipt-checked']) throw new Error('First check actual receipt in the expert payment account, then supply --receipt-checked');
    new BotApp(store).confirmPayment(values.id);
    console.log('Payment marked confirmed by the server operator. Notifications queued; the running bot will deliver them.');
  } else if (command === 'status') {
    const counts = store.db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN sent=0 THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN sent=0 AND attempts>0 THEN 1 ELSE 0 END) AS retrying FROM outbox').get();
    console.log(JSON.stringify({ ...counts, offset: Number(store.getMeta('offset') ?? 0) }));
  } else if (command === 'requests') {
    const requests = store.db.prepare('SELECT data FROM orders').all().map(row => JSON.parse(row.data)).filter(o => o.interested);
    for (const order of requests) console.log(JSON.stringify({ order: order.id, clientId: order.clientId,
      expertId: order.expertId, services: order.services.map(s => SERVICES[s]) }));
    if (!requests.length) console.log('No requests for additional services.');
  } else throw new Error('Commands: expert:add --id ID --name NAME | order:create --expert ID --title TITLE --track HTTPS_URL --price RUB --bot-name USERNAME | payment:confirm --id ORDER_ID --receipt-checked | status | requests');
} catch (error) {
  // Errors here contain validation details, never a Telegram token or API URL.
  console.error(error.message);
  process.exitCode = 1;
} finally { store.close(); }
