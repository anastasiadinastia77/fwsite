export class TelegramError extends Error {
  constructor(code, retryAfterMs = 0) {
    // Telegram descriptions and fetch errors can contain private data or a token-bearing URL.
    super(`Telegram API request failed (code ${Number(code) || 'network'})`);
    this.retryAfterMs = retryAfterMs;
  }
}

export class TelegramAPI {
  constructor(token, fetchImpl = fetch) {
    if (!token || /[\s/?#]/.test(token)) throw new Error('Set TELEGRAM_BOT_TOKEN securely in the server environment');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }
  async call(method, payload = {}, signal) {
    if (!['getMe', 'getUpdates', 'getWebhookInfo', 'sendMessage', 'sendVoice', 'answerCallbackQuery'].includes(method)) throw new Error('Unsupported Telegram method');
    let response;
    try {
      response = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40_000)]) : AbortSignal.timeout(40_000),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new TelegramError(result.error_code ?? response.status, (result.parameters?.retry_after ?? 0) * 1000);
      return result.result;
    } catch (error) {
      if (error instanceof TelegramError) throw error;
      throw new TelegramError(response?.status);
    }
  }
}
