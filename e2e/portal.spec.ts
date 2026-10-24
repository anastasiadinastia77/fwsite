import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function register(page:Page,lang='ru'){
 await page.goto(`/?view=expert&lang=${lang}`);
 await page.getByLabel(lang==='ru'?'Сценическое имя':'Artist name',{exact:true}).fill('Demo Expert');
 await page.getByLabel(lang==='ru'?'Страна проживания':'Country of residence',{exact:true}).selectOption('UA');
 await page.getByRole('button',{name:lang==='ru'?'Создать демо-кабинет':'Create a demo dashboard',exact:true}).click();
 await expect(page.getByRole('navigation',{name:lang==='ru'?'Разделы кабинета':'Dashboard sections'})).toBeVisible();
}
function tab(page:Page,name:string){return page.getByRole('navigation').getByRole('button',{name,exact:true});}
function requests(page:Page){const outgoing:string[]=[];page.on('request',request=>{if(request.method()==='POST'||(!request.url().startsWith('http://127.0.0.1:5173')&&!request.url().startsWith('data:')))outgoing.push(request.url());});return outgoing;}

test('an artist registers in the demo and keeps their own profile after refresh without sending data',async({page})=>{
 const outgoing=requests(page);await register(page);
 await expect(page.locator('.portal-order-card')).toHaveCount(4);
 await expect(page.locator('.portal-topbar')).toContainText('Demo Expert');
 await expect(page.locator('.portal-demo-strip')).toContainText('вымышлены');
 await page.reload();await expect(page.locator('.portal-order-card')).toHaveCount(4);
 expect(await page.evaluate(()=>Object.keys(sessionStorage))).toEqual(['fw-expert-demo-v1']);
 expect(page.url()).not.toContain('Demo');
 expect(outgoing).toEqual([]);
});

test('profile edits, photo and languages persist, while existing order prices stay unchanged',async({page})=>{
 const outgoing=requests(page);await register(page);
 await tab(page,'Профиль').click();
 await page.getByLabel('Сценическое имя',{exact:true}).fill('Updated Expert');
 await page.getByLabel('Описание на английском').fill('I help artists prepare music for labels.');
 await page.getByLabel('Цена разбора',{exact:true}).fill('125,50');
 await page.getByLabel('Валюта цены').selectOption('EUR');
 await page.getByRole('checkbox',{name:'Английский язык',exact:true}).check();
 await page.getByRole('checkbox',{name:'Принимаю новые заказы',exact:true}).uncheck();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.getByLabel('Загрузить фото',{exact:true}).setInputFiles({name:'demo.png',mimeType:'image/png',buffer:png});
 await expect(page.locator('.profile-photo-row img')).toBeVisible();
 await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.locator('.portal-topbar')).toContainText('Updated Expert');
 await page.locator('.portal-topbar').getByRole('button',{name:'English',exact:true}).click();
 await expect(page.getByLabel('Artist name',{exact:true})).toHaveValue('Updated Expert');
 await expect(page.getByLabel('Review price',{exact:true})).toHaveValue('125,50');
 await page.getByRole('button',{name:'Preview',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('I help artists prepare music for labels.');
 await expect(page.getByRole('dialog')).toContainText('€125.5');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await tab(page,'Orders').click();
 await expect(page.locator('.portal-order-list')).toContainText('3,000');
 await expect(page.locator('.portal-profile-shortcut')).toContainText('New orders paused');
 await page.reload();await tab(page,'Profile').click();
 await expect(page.getByLabel('Artist name',{exact:true})).toHaveValue('Updated Expert');
 await expect(page.locator('.profile-photo-row img')).toBeVisible();
 expect(outgoing).toEqual([]);
});

test('unpaid order has no track or review action and search/filter works',async({page})=>{
 await register(page);
 await page.getByLabel('Поиск заказов').fill('New Horizons');
 await expect(page.locator('.portal-order-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Открыть заказ',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Ожидает оплаты');
 await expect(page.getByRole('dialog').locator('.portal-track')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Показать демо-разбор',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.getByLabel('Поиск заказов').fill('missing');
 await expect(page.getByRole('heading',{name:'Заказы не найдены',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Показать все заказы',exact:true}).click();
 await page.getByLabel('Статус заказа').selectOption('questions_pending');
 await expect(page.locator('.portal-order-card')).toHaveCount(1);
 await expect(page.locator('.portal-order-card')).toContainText('Hidden Motion');
});

test('expert completes a fictional review and prepares a label proposal with explicit recommendation consent',async({page})=>{
 const outgoing=requests(page);await register(page);
 await page.locator('.portal-order-card').filter({hasText:'Afterhours'}).getByRole('button',{name:'Открыть заказ',exact:true}).click();
 await page.getByRole('button',{name:'Показать демо-разбор',exact:true}).click();
 await page.getByRole('button',{name:'Симулировать вопросы клиента',exact:true}).click();
 await page.getByLabel('Ответ на раунд вопросов').fill('A fictional answer about readiness and label direction.');
 await page.getByRole('button',{name:'Симулировать ответ',exact:true}).click();
 await page.getByRole('button',{name:'Готов к отправке',exact:true}).click();
 await page.getByRole('checkbox',{name:'Подбор лейблов',exact:true}).check();
 await page.getByRole('checkbox',{name:'Личная рекомендация',exact:true}).check();
 await page.getByRole('button',{name:'Сформировать демо-предложение',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Подтверди готовность');
 await page.getByRole('checkbox',{name:'Я готов лично рекомендовать этот трек по своим профессиональным контактам.',exact:true}).check();
 await page.getByLabel('Стоимость сопровождения').fill('15000');
 await page.getByRole('button',{name:'Сформировать демо-предложение',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('status')).toContainText('Предложение сохранено в демо');
 await page.keyboard.press('Escape');await tab(page,'Помощь с лейблами').click();
 await expect(page.locator('.portal-label-projects')).toContainText('Afterhours');
 await expect(page.locator('.portal-label-projects')).toContainText('Личная рекомендация');
 expect(outgoing).toEqual([]);
});

test('earnings show only completed reviews and payout preferences never connect a payment service',async({page})=>{
 const outgoing=requests(page);await register(page);await tab(page,'Расчёты').click();
 await expect(page.locator('.portal-workspace')).toContainText('Платежи и выплаты не подключены');
 await expect(page.locator('.portal-stats')).toContainText('5 000');
 await expect(page.locator('.portal-stats')).toContainText('2 000');
 await expect(page.locator('.portal-stats')).toContainText('3 000');
 await page.getByLabel('Страна банковского счёта').selectOption('GB');
 await page.getByLabel('Твой статус').selectOption('individual');
 await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
 await page.reload();
 await expect(page.getByLabel('Страна банковского счёта')).toHaveValue('GB');
 await expect(page.getByLabel('Твой статус')).toHaveValue('individual');
 await expect(page.locator('input[type=password], input[autocomplete=cc-number]')).toHaveCount(0);
 expect(outgoing).toEqual([]);
});

test('English registration and every dashboard tab are translated; reset removes only the workspace',async({page})=>{
 await register(page,'en');
 for(const name of ['Orders','Label support','Earnings','Profile']){
  await tab(page,name).click();await expect(page.locator('.expert-portal')).not.toContainText(/[А-Яа-яЁё]/u);
 }
 await page.getByRole('button',{name:'Simulate submitting for review',exact:true}).click();
 await expect(page.locator('.portal-profile-status')).toContainText('awaiting review');
 await page.evaluate(()=>sessionStorage.setItem('unrelated-test-key','keep'));
 await page.getByRole('button',{name:'Reset the demo',exact:true}).click();
 await page.getByRole('button',{name:'Reset and start again',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Demo registration',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('fw-expert-demo-v1'))).toBeNull();
 expect(await page.evaluate(()=>sessionStorage.getItem('unrelated-test-key'))).toBe('keep');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('dashboard fits phones and all tabs stay usable in RU and EN',async({page})=>{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});await register(page);
  for(const name of ['Заказы','Помощь с лейблами','Расчёты','Профиль']){
   await tab(page,name).click();await page.evaluate(()=>document.fonts.ready);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(width===390&&name==='Заказы')await page.screenshot({path:'artifacts/expert-orders-mobile.png',fullPage:true});
  }
  await page.locator('.portal-topbar').getByRole('button',{name:'English',exact:true}).click();
  for(const name of ['Orders','Label support','Earnings','Profile']){
   await tab(page,name).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Reset the demo',exact:true}).click();
  await page.getByRole('button',{name:'Reset and start again',exact:true}).click();
 }
});

test('registration and editing work without browser storage',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(Storage.prototype,'getItem',{value:()=>{throw new Error('blocked');}});
  Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('blocked');}});
 });
 await register(page);await tab(page,'Профиль').click();
 await page.getByLabel('Сценическое имя',{exact:true}).fill('In-memory Expert');
 await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Сохранено в памяти страницы');
 await expect(page.locator('.portal-topbar')).toContainText('In-memory Expert');
});
