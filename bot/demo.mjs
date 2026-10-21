import { fixture } from './test-support.mjs';

const f = fixture();
try {
  await f.reviewed();
  f.click(2001, 'ask');
  f.message(2001, { text: 'Что доработать в треке?' });
  f.message(2001, { text: 'Как подготовить демо для лейбла?' });
  f.click(2001, 'submit');
  f.click(1001, 'answer');
  f.message(1001, { voice: { file_id: 'fictional-followup-voice' } });
  await f.app.flush(f.api);
  f.click(1001, 'finish'); f.click(1001, 'work');
  f.click(1001, 's_refinement'); f.click(1001, 'preview'); f.click(1001, 'offer');
  await f.app.flush(f.api);
  f.click(2001, 'interest'); await f.app.flush(f.api);
  console.log('OFFLINE DEMO · fictional data only · no Telegram requests\n');
  for (const message of f.sent) {
    console.log(`[${message.chat_id === 1001 ? 'Эксперт' : 'Клиент'}] ${message.method === 'sendVoice' ? '🎙 Голосовое сообщение' : message.text}`);
    if (message.reply_markup) console.log(`Кнопки: ${message.reply_markup.inline_keyboard.flat().map(b => b.text).join(' | ')}`);
    console.log('');
  }
  if (f.get().status !== 'completed' || !f.get().interested) throw new Error('Demo did not complete');
  console.log('PASS: paid order → voice review → 2 questions → voice answer → refinement proposal → request for terms');
} finally { f.store.close(); }
