import { test, expect } from '@playwright/test';

function assertDemoRequests(page:import('@playwright/test').Page){
 const outgoing:string[]=[];
 page.on('request',request=>{if(request.method()==='POST'||!request.url().startsWith('http://127.0.0.1:5173'))outgoing.push(request.url());});
 return outgoing;
}

test('English landing, all profiles and a full demo order are translated and stay offline',async({page})=>{
 const outgoing=assertDemoRequests(page);
 await page.goto('/?lang=en');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('heading',{level:1})).toContainText("hasn't landed on");
 await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',/personal electronic music reviews/);
 await expect(page.locator('main')).not.toContainText(/[А-Яа-яЁё]/u);
 for(let index=0;index<6;index++){
  await page.getByRole('button',{name:'View profile',exact:true}).nth(index).click();
  await expect(page.getByRole('dialog')).not.toContainText(/[А-Яа-яЁё]/u);
  await expect(page.getByRole('dialog')).toContainText('not accepting orders');
  await page.getByRole('button',{name:'Close',exact:true}).click();
 }
 await page.getByRole('button',{name:'Indie Dance',exact:true}).click();
 await page.locator('.hero').getByRole('button',{name:'Try the demo',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('Demo expert / Indie Dance');
 await page.getByLabel('Artist name',{exact:true}).fill('Demo Artist');
 await page.getByLabel('Track title',{exact:true}).fill('Afterhours');
 await page.getByLabel('Test contact',{exact:true}).fill('@demo');
 await page.getByLabel('Promo code').fill('unknown');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect(page.locator('#promo-status')).toContainText('Promo code not found');
 await page.getByLabel('Promo code').fill('DEMO10');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('button',{name:'Simulate payment · 1,791 ₽',exact:true}).click();
 await expect(dialog).not.toContainText(/[А-Яа-яЁё]/u);
 await page.getByRole('button',{name:'Simulate sending to the expert',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Choose a test MP3');
 await page.locator('input[type=file]').setInputFiles({name:'demo.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('demo')});
 await page.getByRole('button',{name:'Simulate sending to the expert',exact:true}).click();
 await expect(dialog).not.toContainText(/[А-Яа-яЁё]/u);
 await page.getByRole('button',{name:'Simulate a voice review',exact:true}).click();
 await page.getByLabel('Questions for the expert').fill('1. Is the track ready?\n2. Which labels could fit?');
 await page.getByRole('button',{name:'Simulate sending questions',exact:true}).click();
 await page.getByRole('button',{name:"Show the expert's demo reply",exact:true}).click();
 await expect(dialog).toContainText('Your one round of follow-up questions is complete.');
 await expect(dialog).not.toContainText(/[А-Яа-яЁё]/u);
 await page.getByRole('button',{name:'Explore opportunities',exact:true}).click();
 await page.locator('#track-refinement').getByRole('button').click();
 await expect(page.getByRole('dialog')).toContainText('Track refinement');
 await expect(page.getByRole('dialog')).not.toContainText(/[А-Яа-яЁё]/u);
 expect(outgoing).toEqual([]);
});

test('language switching keeps the filter, entered form, promo and error; choice survives a new visit',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Indie Dance',exact:true}).click();
 await page.locator('.hero').getByRole('button',{name:'Попробовать демо'}).click();
 await page.getByLabel('Псевдоним').fill('My Artist');
 await page.getByLabel('Название трека').fill('My Track');
 await page.getByLabel('Промокод').fill('unknown');
 await page.getByRole('button',{name:'Применить',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'English',exact:true}).click();
 await expect(page.getByLabel('Artist name',{exact:true})).toHaveValue('My Artist');
 await expect(page.getByLabel('Track title',{exact:true})).toHaveValue('My Track');
 await expect(page.getByLabel('Genre',{exact:true})).toHaveValue('Indie Dance');
 await expect(page.locator('#promo-status')).toContainText('Promo code not found');
 await page.getByLabel('Promo code').fill('DEMO10');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Русский',exact:true}).click();
 await expect(page.getByRole('button',{name:'Симулировать оплату · 1 791 ₽',exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'English',exact:true}).click();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('.expert-card')).toHaveCount(1);
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.goto('/?lang=ru');
 await expect(page.locator('html')).toHaveAttribute('lang','ru');
});

test('RU and EN landing and expert demo fit narrow phones',async({page})=>{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  for(const lang of ['ru','en']){
   await page.goto(`/?lang=${lang}`);
   await page.evaluate(()=>document.fonts.ready);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.locator('header').getByRole('button',{name:lang==='en'?'Open menu':'Открыть меню',exact:true}).click();
   await page.locator('nav').getByRole('link',{name:lang==='en'?'For experts':'Для экспертов',exact:true}).click();
   await expect(page.locator('nav')).not.toBeVisible();
   await page.getByRole('link',{name:lang==='en'?'Open the demo dashboard':'Открыть демо-кабинет',exact:true}).click();
   await expect(page.getByRole('heading',{name:lang==='en'?'Demo registration':'Регистрация в демо',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(lang==='en'&&width===390)await page.screenshot({path:'artifacts/registration-en-mobile.png'});
  }
 }
});

test('language switch still works when browser storage is blocked',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(Storage.prototype,'getItem',{value:()=>{throw new Error('Storage blocked');}});
  Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('Storage blocked');}});
 });
 await page.goto('/');
 await page.locator('header').getByRole('button',{name:'English',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('heading',{level:1})).toContainText("hasn't landed on");
});
