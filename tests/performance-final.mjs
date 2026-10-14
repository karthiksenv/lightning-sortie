import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/?dev=1');await page.waitForFunction(()=>window.__LIGHTNING__);
  await page.evaluate(()=>{__LIGHTNING__.start('free');__LIGHTNING__.changeSetting('timeOfDay','day');});
  const results=[];
  for(const quality of ['high','low']){
    await page.evaluate(q=>__LIGHTNING__.changeSetting('quality',q),quality);
    await page.waitForTimeout(1800);
    const timing=await page.evaluate(async()=>{
      const samples=[];let last=performance.now();
      for(let i=0;i<80;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;}
      samples.sort((a,b)=>a-b);const average=samples.reduce((a,b)=>a+b)/samples.length;
      return{fps:Math.round(1000/average),frameMs:+average.toFixed(2),p90Ms:+samples[72].toFixed(2),...__LIGHTNING__.snapshot()};
    });results.push({quality,...timing});console.log(quality,JSON.stringify(timing));
  }
  await page.screenshot({path:'test-results/final-flight.png'});
  await page.evaluate(()=>{__LIGHTNING__.ui.callbacks.menu();__LIGHTNING__.changeSetting('quality','high');});
  await page.waitForTimeout(500);await page.screenshot({path:'test-results/final-menu.png',animations:'disabled'});
  await fs.writeFile('test-results/performance-final.json',JSON.stringify(results,null,2));
} finally {await browser.close();}
