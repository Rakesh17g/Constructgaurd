import puppeteer from 'puppeteer';

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    page.on('requestfailed', request => {
        console.error('REQUEST FAILED:', request.url(), request.failure().errorText);
    });

    console.log('Navigating to local vite server...');
    await page.goto('http://localhost:5174/inspections');

    console.log('Waiting for network idle...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking New Inspection...');
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('New inspection'));
        if (btn) btn.click();
    });

    console.log('Setting file input...');
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000 });
    await fileInput.uploadFile('./public/logo.png');

    console.log('Waiting for analysis to finish...');
    await new Promise(r => setTimeout(r, 10000));

    await browser.close();
})();
