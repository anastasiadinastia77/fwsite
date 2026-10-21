import { inspectBot } from './preflight.mjs';
import { TelegramAPI } from './telegram.mjs';

try {
  const result = await inspectBot(new TelegramAPI(process.env.TELEGRAM_BOT_TOKEN), process.env.TELEGRAM_BOT_USERNAME);
  console.log(`Connected to @${result.username}. Read-only check; no messages sent.`);
  console.log(result.webhookConfigured
    ? 'A webhook is already configured. Resolve the existing deployment before starting long polling.'
    : 'No webhook configured. The bot is ready for a separate, deliberate startup.');
} catch {
  console.error('Connection not verified. Check TELEGRAM_BOT_TOKEN in secure settings, TELEGRAM_BOT_USERNAME (without @), and HTTPS access to api.telegram.org. The token was not logged.');
  process.exitCode = 1;
}
