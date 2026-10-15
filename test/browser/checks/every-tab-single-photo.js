// Regression check: in every-tab mode a new tab should show one photo, not
// flash the cached one first and then switch. Counts backdrop layers added
// during load. Run with Playwright MCP browser_run_code_unsafe { filename }.
async (page) => {
  const p = await page.context().newPage();
  await p.addInitScript({ path: "C:/dev/Homepage/test/browser/chrome-stub.js" });
  await p.addInitScript(() => {
    window.__stub.data.settings = { photoFrequency: "every-tab" };
    window.__layersAdded = 0;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        window.__layersAdded += [...mutation.addedNodes].filter((n) => n.classList && n.classList.contains("backdrop-image")).length;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await p.goto("http://127.0.0.1:8766/newtab.html");
  await p.waitForTimeout(1000);
  await p.reload(); // second load has a cache entry from the first
  await p.waitForTimeout(1000);
  const layersAdded = await p.evaluate(() => window.__layersAdded);
  await p.close();
  return { layersAdded, ok: layersAdded === 1 };
}
