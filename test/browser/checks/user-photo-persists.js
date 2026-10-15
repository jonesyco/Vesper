// Regression check: a stored user-photo background must survive reloads in
// daily mode (it used to be replaced because the first pick ran before the
// user-photo source was registered). Run with Playwright MCP
// browser_run_code_unsafe { filename } against the no-cache server on :8766.
async (page) => {
  const p = await page.context().newPage();
  await p.addInitScript({ path: "C:/dev/Homepage/test/browser/chrome-stub.js" });
  await p.addInitScript(() => {
    window.__stub.data.background_state = { id: "user:seed", pickedAt: Date.now() };
  });
  await p.goto("http://127.0.0.1:8766/newtab.html");
  // Seed one user photo into IndexedDB (persists on this origin across reloads).
  await p.evaluate(async () => {
    const m = await import("/js/image-store.js");
    const canvas = new OffscreenCanvas(64, 48);
    canvas.getContext("2d").fillRect(0, 0, 64, 48);
    const blob = await canvas.convertToBlob({ type: "image/webp" });
    await m.addPhoto({ id: "seed", blob, thumb: blob, addedAt: Date.now() });
  });
  const results = [];
  for (let i = 0; i < 4; i++) {
    await p.reload();
    await p.waitForTimeout(800);
    results.push(await p.evaluate(() => ({
      layer: (document.querySelector("#backdrop .backdrop-image:last-child") || { style: {} }).style.backgroundImage || "",
      state: window.__stub.data.background_state && window.__stub.data.background_state.id
    })));
  }
  await p.evaluate(async () => (await import("/js/image-store.js")).deletePhoto("seed"));
  await p.close();
  const kept = results.every((r) => r.state === "user:seed" && r.layer.startsWith('url("blob:'));
  return { kept, results };
}
