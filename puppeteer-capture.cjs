const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting Puppeteer browser...');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--kiosk',
      '--start-fullscreen',
      '--window-size=1920,1080',
      '--window-position=0,0',
      '--force-device-scale-factor=1',
      '--display=:99',
      '--force-page-scale-factor=1',
      '--high-dpi-support=0'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    }
  });
  
  console.log('Browser launched in kiosk mode');
  
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  
  // Set viewport explicitly
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  });
  
  await page.goto('http://localhost:3000', {
    waitUntil: 'networkidle2'
  });
  
  // Force zoom to 100% using multiple methods
  await page.evaluate(() => {
    document.body.style.zoom = '1.0';
    document.body.style.transform = 'scale(1)';
    document.body.style.transformOrigin = '0 0';
    document.documentElement.style.zoom = '1.0';
  });
  
  console.log('Page loaded at 1920x1080 with forced 100% zoom, keeping browser open...');
  
  // Keep the process running
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing browser...');
    await browser.close();
    process.exit(0);
  });
  
  // Keep alive
  setInterval(() => {
    page.evaluate(() => document.title).catch(err => {
      console.error('Page became unresponsive, restarting...');
      process.exit(1);
    });
  }, 30000);
  
})().catch(err => {
  console.error('Puppeteer error:', err);
  process.exit(1);
});
