// La portada por tramos, para poder mirarla entera y no solo el héroe.
const { chromium, ejecutable } = require("./navegador");
const fs = require("fs");
(async () => {
  fs.mkdirSync("/tmp/rev", { recursive: true });
  const nav = await chromium.launch({ ...ejecutable });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3101/", { waitUntil: "networkidle" });
  const alto = await p.evaluate(() => document.body.scrollHeight);
  console.log("alto total:", alto);
  for (let i = 0, y = 0; y < alto && i < 8; i++, y += 860) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `/tmp/rev/home-${String(i).padStart(2, "0")}.png` });
    console.log("✓ tramo", i, "en y =", y);
  }
  await nav.close();
})();
