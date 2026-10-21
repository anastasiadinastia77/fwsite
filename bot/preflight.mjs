// Read-only API calls: safe to run before enabling message delivery.
export async function inspectBot(api, expectedUsername, signal) {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(expectedUsername ?? '')) {
    throw new Error('Set TELEGRAM_BOT_USERNAME to the bot username without @.');
  }
  const identity = await api.call('getMe', {}, signal);
  if (!identity.is_bot || identity.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new Error('The token belongs to a different bot. Check TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in secure settings.');
  }
  const webhook = await api.call('getWebhookInfo', {}, signal);
  return { username: identity.username, webhookConfigured: Boolean(webhook.url) };
}
