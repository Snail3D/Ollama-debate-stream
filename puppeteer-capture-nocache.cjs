const puppeteer = require("puppeteer");

(async () => {
  console.log("Starting Puppeteer browser...");
  
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--kiosk",
      "--start-fullscreen",
      "--window-size=1920,1080",
      "--window-position=0,0",
      "--force-device-scale-factor=1",
      "--display=:99",
      "--force-page-scale-factor=1",
      "--high-dpi-support=0",
      "--font-render-hinting=none",
      "--disk-cache-size=1",
      "--media-cache-size=1",
      "--disable-application-cache",
      "--disable-cache",
      "--disable-offline-load-stale-cache",
      "--disable-gpu-shader-disk-cache",
      "--aggressive-cache-discard",
      "--disable-extensions-http-throttling",
      "--disable-back-forward-cache"
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    }
  });
  
  console.log("Browser launched in kiosk mode");
  
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  
  // Disable cache at page level
  await page.setCacheEnabled(false);
  
  // Listen to console logs from the page
  page.on("console", msg => {
    console.log("BROWSER:", msg.text());
  });
  
  // Set viewport explicitly
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  });
  
  console.log("Navigating to http://localhost:3000...");
  
  // Navigate with cache disabled
  await page.goto("http://localhost:3000", {
    waitUntil: "networkidle2",
    timeout: 60000
  });
  
  // Force hard reload
  await page.reload({ 
    waitUntil: "networkidle2",
    ignoreCache: true 
  });
  
  console.log("Page loaded and reloaded\!");
  
  // Function to hide cursor
  const hideCursor = async () => {
    await page.evaluate(() => {
      document.body.style.zoom = "1.0";
      document.body.style.cursor = "none";
      document.documentElement.style.cursor = "none";
      if (\!document.getElementById("hide-cursor-style")) {
        const style = document.createElement("style");
        style.id = "hide-cursor-style";
        style.textContent = "* { cursor: none \!important; }";
        document.head.appendChild(style);
      }
    });
  };
  
  await hideCursor();
  console.log("Cursor hidden");
  
  // Re-hide cursor every 5 seconds
  setInterval(() => {
    hideCursor().catch(err => console.error("Error hiding cursor:", err));
  }, 5000);
  
  // Keep the process running
  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, closing browser...");
    await browser.close();
    process.exit(0);
  });
  
  // Keep alive
  setInterval(() => {
    page.evaluate(() => document.title).catch(err => {
      console.error("Page became unresponsive, restarting...");
      process.exit(1);
    });
  }, 30000);
  
})().catch(err => {
  console.error("Puppeteer error:", err);
  process.exit(1);
});
