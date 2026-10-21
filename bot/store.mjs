import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { hasReviewAccess } from './domain.mjs';

export const tokenHash = token => createHash('sha256').update(token).digest('hex');

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS experts (telegram_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL, invite_hash TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS sessions (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, data TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0
      );`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  getMeta(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  setMeta(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, String(value)); }
  expert(id) { return this.db.prepare('SELECT * FROM experts WHERE telegram_id=?').get(id); }
  addExpert(id, name) {
    if (!Number.isSafeInteger(id) || id <= 0 || !name?.trim() || name.length > 100) throw new Error('Valid Telegram ID and expert name required');
    this.db.prepare('INSERT INTO experts VALUES (?,?) ON CONFLICT(telegram_id) DO UPDATE SET name=excluded.name').run(id, name.trim());
  }
  order(id) { const row = this.db.prepare('SELECT data FROM orders WHERE id=?').get(id); return row && JSON.parse(row.data); }
  save(order) { this.db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order), order.id); }
  ordersFor(id) {
    return this.db.prepare('SELECT data FROM orders ORDER BY rowid DESC').all().map(row => JSON.parse(row.data))
      .filter(o => o.clientId === id || (hasReviewAccess(o) && o.clientId && o.expertId === id));
  }
  createOrder({ expertId, title, trackUrl = null, paid = false, priceRub, isTest = false, now = Date.now() }) {
    if (!this.expert(expertId)) throw new Error('Register the confirmed expert first');
    if (typeof title !== 'string' || !title.trim() || title.length > 150) throw new Error('Title required (max 150 characters)');
    if (typeof isTest !== 'boolean' || (isTest && paid)) throw new Error('Test orders cannot record a real payment');
    if (!isTest || trackUrl) {
      const url = new URL(trackUrl);
      if (url.protocol !== 'https:' || url.username || url.password || trackUrl.length > 1500) throw new Error('Use a private HTTPS track link without embedded credentials');
    }
    if (!isTest && (!Number.isSafeInteger(priceRub) || priceRub <= 0)) throw new Error('Agreed client price in whole rubles required');
    const invite = randomBytes(24).toString('base64url');
    const order = { id: randomBytes(6).toString('hex'), expertId, clientId: null, title: title.trim(), trackUrl,
      paid: Boolean(paid), priceRub: isTest ? 0 : priceRub, isTest, status: 'awaiting_review', createdAt: now, updatedAt: now };
    this.db.prepare('INSERT INTO orders VALUES (?,?,?)').run(order.id, JSON.stringify(order), tokenHash(invite));
    return { order, invite };
  }
  bindClient(token, clientId) {
    const row = this.db.prepare('SELECT data FROM orders WHERE invite_hash=?').get(tokenHash(token));
    if (!row) return null;
    const order = JSON.parse(row.data);
    // One-time binding: the deep link is a private invitation, not an order identifier.
    if (order.clientId || order.expertId === clientId) return null;
    order.clientId = clientId;
    this.save(order);
    this.db.prepare('UPDATE orders SET invite_hash=NULL WHERE id=?').run(order.id);
    return order;
  }
  session(id) { const row = this.db.prepare('SELECT data FROM sessions WHERE user_id=?').get(id); return row && JSON.parse(row.data); }
  setSession(id, value) {
    if (value) this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?,?)').run(id, JSON.stringify(value));
    else this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  }
  enqueue(chatId, method, payload, delivery = null) {
    this.db.prepare('INSERT INTO outbox (chat_id,data) VALUES (?,?)').run(chatId, JSON.stringify({ method, payload: { ...payload, chat_id: chatId }, delivery }));
  }
  nextMessage(now = Date.now()) {
    const row = this.db.prepare(`SELECT * FROM outbox AS o WHERE sent=0 AND available_at<=?
      AND NOT EXISTS (SELECT 1 FROM outbox AS p WHERE p.sent=0 AND p.chat_id=o.chat_id AND p.id<o.id)
      ORDER BY id LIMIT 1`).get(now);
    return row && { ...row, ...JSON.parse(row.data) };
  }
  sent(id) { this.db.prepare('UPDATE outbox SET sent=1, data=? WHERE id=?').run('{}', id); }
  retry(id, delay, now = Date.now()) { this.db.prepare('UPDATE outbox SET attempts=attempts+1, available_at=? WHERE id=?').run(now + delay, id); }
}
