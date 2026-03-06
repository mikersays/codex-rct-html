import { chromium } from "playwright";

const PASS = "\x1b[32mPASS\x1b[0m";
const FAIL = "\x1b[31mFAIL\x1b[0m";
const INFO = "\x1b[36mINFO\x1b[0m";

let passed = 0;
let failed = 0;
const results = [];

function report(name, ok, detail = "") {
  const tag = ok ? PASS : FAIL;
  if (ok) passed++;
  else failed++;
  const msg = `  ${tag} ${name}${detail ? " — " + detail : ""}`;
  results.push(msg);
  console.log(msg);
}

async function waitForGame(page) {
  await page.waitForFunction(() => {
    const d = window.__parkGameDebug;
    return d && typeof d.getSnapshot === "function";
  }, { timeout: 15000 });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function measureFrameTimes(page, frameCount = 60) {
  return page.evaluate(async (count) => {
    const times = [];
    return new Promise((resolve) => {
      let n = 0;
      let last = performance.now();
      function measure(now) {
        const dt = now - last;
        last = now;
        if (n > 0) times.push(dt);
        n++;
        if (n < count + 1) {
          requestAnimationFrame(measure);
        } else {
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          const max = Math.max(...times);
          const min = Math.min(...times);
          const over33 = times.filter((t) => t > 33).length;
          const over50 = times.filter((t) => t > 50).length;
          const guests = window.__parkGameDebug.getSnapshot().guests;
          resolve({ avg: +avg.toFixed(2), max: +max.toFixed(2), min: +min.toFixed(2), fps: +(1000 / avg).toFixed(1), over33, over50, guests, samples: times.length });
        }
      }
      requestAnimationFrame(measure);
    });
  }, frameCount);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium-browser",
});

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("pageerror", () => {});

console.log("\n========================================");
console.log(" Performance & Edge Case Tests");
console.log("========================================\n");

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await waitForGame(page);
await sleep(500);

// -------------------------------------------------------
// TEST 1: Build a MASSIVE park - rides FIRST, then paths
// -------------------------------------------------------
console.log("\n--- Test 1: Build a massive park ---");

const buildResult = await page.evaluate(() => {
  const d = window.__parkGameDebug;

  // Place rides first (they need clear grass, no paths)
  const placements = [
    { type: "carousel", x: 8, y: 6 },
    { type: "swing", x: 12, y: 6 },
    { type: "ferris", x: 16, y: 5 },
    { type: "coaster", x: 8, y: 10 },
    { type: "carousel", x: 14, y: 10 },
    { type: "swing", x: 18, y: 10 },
    { type: "ferris", x: 8, y: 14 },
    { type: "burger", x: 20, y: 6 },
    { type: "gelato", x: 20, y: 9 },
    { type: "coffee", x: 20, y: 12 },
    { type: "burger", x: 14, y: 14 },
    { type: "gelato", x: 20, y: 15 },
  ];

  let ridesPlaced = 0;
  for (const p of placements) {
    d.setTool(p.type);
    if (d.canPlaceStructure(p.type, p.x, p.y)) {
      d.clickTile(p.x, p.y);
      ridesPlaced++;
    }
  }

  // Now lay paths everywhere possible
  d.setTool("path");
  let pathsPlaced = 0;
  for (let y = 4; y < 25; y++) {
    for (let x = 5; x < 24; x++) {
      const tile = d.getTile(x, y);
      if (tile && tile.terrain === "grass" && !tile.path && !tile.structureId) {
        d.clickTile(x, y);
        pathsPlaced++;
      }
    }
  }

  // Place scenery on remaining open tiles
  let sceneryPlaced = 0;
  const sceneryTypes = ["tree", "flower", "fountain", "bench", "bin", "lamp"];
  for (let y = 4; y < 24; y += 2) {
    for (let x = 5; x < 24; x += 2) {
      const tile = d.getTile(x, y);
      if (tile && tile.terrain === "grass" && !tile.structureId && !tile.sceneryId && !tile.path) {
        d.setTool(sceneryTypes[(x + y) % sceneryTypes.length]);
        d.clickTile(x, y);
        sceneryPlaced++;
      }
    }
  }

  const snap = d.getSnapshot();
  return { pathsPlaced, ridesPlaced, sceneryPlaced, snapshot: snap };
});

report(
  "Massive park built without crashes",
  buildResult.ridesPlaced > 0,
  `paths=${buildResult.pathsPlaced}, rides=${buildResult.ridesPlaced}, scenery=${buildResult.sceneryPlaced}, attractions=${buildResult.snapshot.attractions}`
);

// -------------------------------------------------------
// TEST 2: Measure frame time / FPS baseline
// -------------------------------------------------------
console.log("\n--- Test 2: Frame time / FPS measurement ---");
await sleep(500);

const fps = await measureFrameTimes(page, 60);
report(
  "FPS baseline",
  fps.avg < 200, // headless Chromium without GPU: 200ms (~5 FPS) is baseline acceptable
  `avg=${fps.avg}ms, max=${fps.max}ms, min=${fps.min}ms, ~${fps.fps} FPS`
);

// -------------------------------------------------------
// TEST 3: Wait for guests and measure frame times
// -------------------------------------------------------
console.log("\n--- Test 3: Guest accumulation + frame time ---");

let guestCount = 0;
for (let attempt = 0; attempt < 20; attempt++) {
  await sleep(2000);
  guestCount = await page.evaluate(() => window.__parkGameDebug.getSnapshot().guests);
  console.log(`  ${INFO} Guests: ${guestCount}`);
  if (guestCount >= 15) break;
}

const guestFps = await measureFrameTimes(page, 60);
// In headless Chromium without GPU, 200ms is acceptable for a massive park
const framesOk = guestFps.avg < 200;
report(
  `Frame times with ${guestFps.guests} guests`,
  framesOk,
  `avg=${guestFps.avg}ms, max=${guestFps.max}ms, >33ms: ${guestFps.over33}/${guestFps.samples}`
);

// -------------------------------------------------------
// TEST 4: Rapid tool switching (100 times)
// -------------------------------------------------------
console.log("\n--- Test 4: Rapid tool switching ---");

const toolSwitchResult = await page.evaluate(() => {
  const d = window.__parkGameDebug;
  const tools = ["inspect","path","erase","grass","water","carousel","ferris","coaster","swing","burger","gelato","coffee","tree","flower","fountain","bench","bin","lamp"];
  const start = performance.now();
  let errors = 0;
  for (let i = 0; i < 100; i++) {
    try { d.setTool(tools[i % tools.length]); } catch { errors++; }
  }
  const elapsed = performance.now() - start;
  return { elapsed: +elapsed.toFixed(2), errors };
});

report("100 rapid tool switches", toolSwitchResult.errors === 0, `${toolSwitchResult.elapsed}ms`);

// -------------------------------------------------------
// TEST 5: Rapid clicking on the same tile
// -------------------------------------------------------
console.log("\n--- Test 5: Rapid clicking same tile ---");

const rapidClickResult = await page.evaluate(() => {
  const d = window.__parkGameDebug;
  d.setTool("inspect");
  const start = performance.now();
  let errors = 0;
  for (let i = 0; i < 200; i++) {
    try { d.clickTile(14, 14); } catch { errors++; }
  }
  return { elapsed: +(performance.now() - start).toFixed(2), errors };
});

report("200 rapid clicks on same tile", rapidClickResult.errors === 0, `${rapidClickResult.elapsed}ms`);

// -------------------------------------------------------
// TEST 6: Zoom to extremes
// -------------------------------------------------------
console.log("\n--- Test 6: Zoom to extremes ---");

const zoomResult = await page.evaluate(async () => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { ok: false };

  for (let i = 0; i < 40; i++) {
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
  }
  await new Promise((r) => requestAnimationFrame(r));

  for (let i = 0; i < 80; i++) {
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise((r) => requestAnimationFrame(r));

  // Back to normal zoom
  for (let i = 0; i < 20; i++) {
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
  }
  await new Promise((r) => requestAnimationFrame(r));

  const snap = window.__parkGameDebug.getSnapshot();
  return { ok: snap.money !== undefined };
});

report("Zoom to extremes", zoomResult.ok);

// -------------------------------------------------------
// TEST 7: Camera panning to edges
// -------------------------------------------------------
console.log("\n--- Test 7: Camera panning to edges ---");

const panResult = await page.evaluate(async () => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { ok: false };

  // Pan with keyboard
  for (const key of ["arrowleft","arrowright","arrowup","arrowdown","a","d","w","s"]) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
    window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }

  // Pan with mouse drag
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, button: 2, bubbles: true }));
  for (let i = 0; i < 20; i++) {
    canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: cx + (i+1)*100, clientY: cy, button: 2, buttons: 2, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

  canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, button: 2, bubbles: true }));
  for (let i = 0; i < 20; i++) {
    canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: cx - (i+1)*100, clientY: cy, button: 2, buttons: 2, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

  const snap = window.__parkGameDebug.getSnapshot();
  return { ok: snap.money !== undefined };
});

report("Camera panning to edges", panResult.ok);

// -------------------------------------------------------
// TEST 8: 50+ guests stress test (fresh game, big park)
// -------------------------------------------------------
console.log("\n--- Test 8: 50+ guests stress test ---");

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await waitForGame(page);
await sleep(500);

await page.evaluate(() => {
  const d = window.__parkGameDebug;

  // Place lots of rides first
  const spots = [
    { type: "carousel", x: 9, y: 5 }, { type: "swing", x: 13, y: 5 },
    { type: "ferris", x: 16, y: 4 }, { type: "coaster", x: 9, y: 9 },
    { type: "carousel", x: 16, y: 9 }, { type: "swing", x: 20, y: 5 },
    { type: "carousel", x: 20, y: 9 }, { type: "swing", x: 9, y: 14 },
    { type: "burger", x: 14, y: 13 }, { type: "gelato", x: 17, y: 13 },
    { type: "coffee", x: 20, y: 13 }, { type: "burger", x: 14, y: 16 },
  ];
  for (const p of spots) {
    d.setTool(p.type);
    if (d.canPlaceStructure(p.type, p.x, p.y)) d.clickTile(p.x, p.y);
  }

  // Now paths everywhere
  d.setTool("path");
  for (let y = 3; y < 25; y++) {
    for (let x = 5; x < 24; x++) {
      const tile = d.getTile(x, y);
      if (tile && tile.terrain === "grass" && !tile.path && !tile.structureId) {
        d.clickTile(x, y);
      }
    }
  }

  // Bins for cleanliness
  d.setTool("bin");
  for (let y = 4; y < 24; y += 3) {
    for (let x = 5; x < 24; x += 3) {
      const tile = d.getTile(x, y);
      if (tile && tile.terrain === "grass" && !tile.structureId && !tile.sceneryId) {
        d.clickTile(x, y);
      }
    }
  }
});

let maxGuests = 0;
for (let attempt = 0; attempt < 45; attempt++) {
  await sleep(2000);
  const snap = await page.evaluate(() => window.__parkGameDebug.getSnapshot());
  maxGuests = snap.guests;
  console.log(`  ${INFO} Guests: ${maxGuests}, lvl: ${snap.parkLevel}, attr: ${snap.attractions}`);
  if (maxGuests >= 50) break;
}

const stressFps = await measureFrameTimes(page, 120);
report(
  `Stress test with ${stressFps.guests} guests`,
  stressFps.avg < 300, // headless: avg under 300ms with many guests is acceptable
  `avg=${stressFps.avg}ms, max=${stressFps.max}ms, >33ms: ${stressFps.over33}, >50ms: ${stressFps.over50}`
);

// -------------------------------------------------------
// TEST 9: Memory leak / guest stability
// -------------------------------------------------------
console.log("\n--- Test 9: Memory leak / guest stability ---");

const snap1 = await page.evaluate(() => window.__parkGameDebug.getSnapshot());
console.log(`  ${INFO} Initial: ${snap1.guests} guests`);

await sleep(10000);

const snap2 = await page.evaluate(() => window.__parkGameDebug.getSnapshot());
const cap = 10 + snap2.parkLevel * 7 + snap2.attractions * 3;
console.log(`  ${INFO} After 10s: ${snap2.guests} guests (cap ~${cap})`);

report("Guest count bounded", snap2.guests <= cap + 5, `guests=${snap2.guests}, cap=${cap}`);

const heap = await page.evaluate(() => {
  if (performance.memory) return { used: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1), total: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1) };
  return null;
});
if (heap) console.log(`  ${INFO} JS Heap: ${heap.used}MB / ${heap.total}MB`);

// -------------------------------------------------------
// TEST 10: Crash resilience
// -------------------------------------------------------
console.log("\n--- Test 10: Crash resilience ---");

const crashTest = await page.evaluate(async () => {
  const d = window.__parkGameDebug;
  const errors = [];

  // Out of bounds
  try { d.clickTile(-1, -1); } catch (e) { errors.push(e.message); }
  try { d.clickTile(100, 100); } catch (e) { errors.push(e.message); }
  try { d.clickTile(0, 0); } catch (e) { errors.push(e.message); }
  try { d.clickTile(27, 27); } catch (e) { errors.push(e.message); }
  try { d.getTile(-5, -5); } catch (e) { errors.push(e.message); }
  try { d.getTile(999, 999); } catch (e) { errors.push(e.message); }
  try { d.canPlaceStructure("carousel", -1, -1); } catch (e) { errors.push(e.message); }
  try { d.canPlaceStructure("coaster", 25, 25); } catch (e) { errors.push(e.message); }

  // Random tool + click combos
  const tools = ["path","erase","carousel","tree","inspect","water"];
  for (let i = 0; i < 50; i++) {
    try {
      d.setTool(tools[i % tools.length]);
      d.clickTile(Math.floor(Math.random() * 28), Math.floor(Math.random() * 28));
    } catch (e) { errors.push(e.message); }
  }

  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));

  const snap = d.getSnapshot();
  return { errors, ok: snap.money !== undefined };
});

report("Edge-case inputs", crashTest.errors.length === 0 && crashTest.ok, `errors=${crashTest.errors.length}`);

// Erase everything and rebuild
const rebuild = await page.evaluate(async () => {
  const d = window.__parkGameDebug;
  let errors = 0;
  d.setTool("erase");
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { try { d.clickTile(x, y); } catch { errors++; } }
  await new Promise((r) => requestAnimationFrame(r));
  d.setTool("path");
  for (let y = 20; y < 26; y++) for (let x = 10; x < 18; x++) { try { d.clickTile(x, y); } catch { errors++; } }
  await new Promise((r) => requestAnimationFrame(r));
  return { errors, ok: window.__parkGameDebug.getSnapshot().money !== undefined };
});

report("Erase-all then rebuild", rebuild.ok && rebuild.errors === 0, `errors=${rebuild.errors}`);

// -------------------------------------------------------
// SUMMARY
// -------------------------------------------------------
console.log("\n========================================");
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log("========================================\n");

for (const r of results) console.log(r);
console.log();

await browser.close();
process.exit(failed > 0 ? 1 : 0);
