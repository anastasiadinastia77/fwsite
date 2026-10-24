import { test, expect } from '@playwright/test';
test('Future Waves preserves original design and demo order',async({page})=>{
 const outgoing:string[]=[];
 page.on('request',r=>{if(r.method()==='POST'||!r.url().startsWith('http://127.0.0.1:5173'))outgoing.push(r.url());});
 await page.goto('/?concept=future-waves&lang=en');
 await expect(page.locator('html')).toHaveAttribute('lang','ru');
 await expect(page.locator('h1')).toContainText('ПОЙМАЙ');
 for(const width of [1440,768,390,320]){
 await page.setViewportSize({width,height:1000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===1440||width===390)await page.screenshot({path:`artifacts/future-waves-${width}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Отправить трек',exact:true}).click();
 await page.getByLabel('Псевдоним').fill('Demo Artist');
 await page.getByLabel('Название трека').fill('Future Waves');
 await page.getByLabel('Тестовый контакт').fill('@demo');
 await page.getByRole('button',{name:'Симулировать оплату'}).click();
 await expect(page.getByText('Демо-оплата подтверждена',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Прежний вариант'}).click();
 await expect(page.locator('.hero')).toBeVisible();
 await expect(page.locator('html')).not.toHaveClass('future-waves');
 expect(outgoing).toEqual([]);
});
