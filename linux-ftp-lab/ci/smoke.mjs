import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.env.LAB_URL || 'http://127.0.0.1:8123/linux-ftp-lab/';
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const browser = await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage({viewport:{width:1200,height:900}});
const seen=[];
page.on('console',msg=>seen.push('console '+msg.type()+' '+msg.text()));
page.on('pageerror',e=>seen.push('page error '+e.message));
page.on('requestfailed',r=>seen.push('request failed '+r.url()+' '+r.failure()?.errorText));
try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#boot').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('シェル起動完了'),null,{timeout:150000});
  console.log('REAL_LINUX_SHELL_READY');
  await page.locator('#uname').click();
  await page.waitForTimeout(1500);
  await page.locator('#list').click();
  await page.waitForTimeout(2000);
  const initial=await page.locator('#terminal').textContent();
  console.log('BOOT_LOG_TAIL\n'+initial.slice(-3500));
  const applets=['ftpd','ftpput','tcpsvd','httpd','wget'];
  const lines=initial.split('\n').map(s=>s.trim());
  const found=applets.filter(a=>lines.some(s=>s===a));
  console.log('BUSYBOX_APPLETS='+found.join(','));
  if(found.length<applets.length)throw new Error('Missing applets: '+applets.filter(a=>!found.includes(a)).join(','));
  await page.locator('#mount').click();
  await page.waitForTimeout(1300);
  await page.locator('#stage').click();
  await page.waitForTimeout(700);
  await page.locator('#ftpd').click();
  await page.waitForTimeout(1600);
  await page.locator('#put').click();
  await page.waitForTimeout(2800);
  await page.locator('#httpd').click();
  await page.waitForTimeout(1100);
  await page.locator('#wget').click();
  await page.waitForTimeout(2600);
  await page.locator('#preview').click();
  await page.waitForTimeout(1100);
  const preview=await page.locator('#result').contentFrame().locator('body').textContent();
  console.log('HTTP_PREVIEW='+preview);
  if(!preview.includes('Hello from Linux!'))throw new Error('FTP/HTTP preview did not contain the uploaded HTML');
  console.log('FTP_HTTP_END_TO_END_OK');
} catch(error) {
  console.error('TEST_FAILED '+error.stack);
  const log=await page.locator('#terminal').textContent().catch(()=>'');
  console.error('TERMINAL_LAST_9000\n'+log.slice(-9000));
  console.error('BROWSER_ERRORS\n'+seen.join('\n'));
  process.exitCode=1;
} finally {
  await page.screenshot({path:'/tmp/linux-ftp-lab.png',fullPage:true}).catch(()=>{});
  await browser.close();
}
