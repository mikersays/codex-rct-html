import { chromium } from "playwright";

const OUTPUT = "/home/momo/git/codex-rct-html/output";
const URL = "http://127.0.0.1:4173/";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

// Tolerance-based money comparison (upkeep drains money every frame)
function assertMoneyClose(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  PASS: ${label} (actual=${actual}, expected=${expected}, diff=${diff})`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label} (actual=${actual}, expected=${expected}, diff=${diff})`);
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: true });
}

async function getSnapshot(page) {
  return page.evaluate(() => window.__parkGameDebug.getSnapshot());
}

async function setTool(page, toolId) {
  return page.evaluate((id) => window.__parkGameDebug.setTool(id), toolId);
}

async function clickTile(page, x, y) {
  return page.evaluate(([x, y]) => window.__parkGameDebug.clickTile(x, y), [x, y]);
}

async function getTile(page, x, y) {
  return page.evaluate(([x, y]) => window.__parkGameDebug.getTile(x, y), [x, y]);
}

async function canPlace(page, typeId, x, y) {
  return page.evaluate(([t, x, y]) => window.__parkGameDebug.canPlaceStructure(t, x, y), [typeId, x, y]);
}

async function getEventLog(page) {
  return page.evaluate(() => window.__parkGameDebug.eventLog());
}

// Atomically: set tool, snapshot money, click tile, snapshot money again, return both.
// This minimizes upkeep drift between measurements.
async function atomicToolClick(page, toolId, x, y) {
  return page.evaluate(([t, x, y]) => {
    const d = window.__parkGameDebug;
    d.setTool(t);
    const before = d.getSnapshot().money;
    d.clickTile(x, y);
    const after = d.getSnapshot().money;
    return { before, after, diff: before - after };
  }, [toolId, x, y]);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium-browser",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await screenshot(page, "01-initial");

  // ============================================================
  // TEST 1: Inspect tool
  // ============================================================
  console.log("\n=== TEST: Inspect Tool ===");
  await setTool(page, "inspect");
  await clickTile(page, 14, 14);
  let tile = await getTile(page, 14, 14);
  assert(tile !== null, "Inspect: tile data returned for grass tile");
  assert(tile.terrain === "grass", "Inspect: terrain is grass");

  await clickTile(page, 14, 22);
  tile = await getTile(page, 14, 22);
  assert(tile.path === true, "Inspect: path tile detected");

  await clickTile(page, 5, 7);
  tile = await getTile(page, 5, 7);
  assert(tile.terrain === "water", "Inspect: water tile detected");

  await screenshot(page, "02-inspect");

  // ============================================================
  // TEST 2: Path tool
  // ============================================================
  console.log("\n=== TEST: Path Tool ===");
  let result = await atomicToolClick(page, "path", 16, 20);
  tile = await getTile(page, 16, 20);
  assert(tile.path === true, "Path: tile became path");
  assert(result.diff === 6, `Path: correct cost deducted (diff=${result.diff})`);

  // Path on water - should fail (diff=0)
  result = await atomicToolClick(page, "path", 5, 7);
  assert(result.diff === 0, "Path: no money deducted on water tile");
  tile = await getTile(page, 5, 7);
  assert(tile.path === false, "Path: water tile did not get path");

  // Path on already-path tile - no charge
  result = await atomicToolClick(page, "path", 16, 20);
  assert(result.diff === 0, "Path: no double-charge on already-path tile");

  await screenshot(page, "03-path");

  // ============================================================
  // TEST 3: Water tool
  // ============================================================
  console.log("\n=== TEST: Water Tool ===");
  result = await atomicToolClick(page, "water", 20, 5);
  tile = await getTile(page, 20, 5);
  assert(tile.terrain === "water", "Water: tile terrain changed to water");
  assert(result.diff === 10, `Water: correct cost deducted (diff=${result.diff})`);

  // Water on path - should fail
  result = await atomicToolClick(page, "water", 14, 22);
  assert(result.diff === 0, "Water: no money deducted on path tile");
  tile = await getTile(page, 14, 22);
  assert(tile.terrain !== "water", "Water: path tile terrain unchanged");

  await screenshot(page, "04-water");

  // ============================================================
  // TEST 4: Grass tool
  // ============================================================
  console.log("\n=== TEST: Grass Tool ===");
  // Convert water tile back to grass
  result = await atomicToolClick(page, "grass", 20, 5);
  tile = await getTile(page, 20, 5);
  assert(tile.terrain === "grass", "Grass: water tile converted to grass");
  assert(result.diff === 5, `Grass: correct cost deducted (diff=${result.diff})`);

  // Grass on already-grass - should be free (early return)
  result = await atomicToolClick(page, "grass", 20, 6);
  assert(result.diff === 0, "Grass: no cost for grass-on-grass");

  await screenshot(page, "05-grass");

  // ============================================================
  // TEST 5: Scenery tools (tree, flower, fountain, bench, bin, lamp)
  // ============================================================
  console.log("\n=== TEST: Scenery Tools ===");
  const sceneryItems = [
    { id: "tree", x: 18, y: 8, cost: 18 },
    { id: "flower", x: 19, y: 8, cost: 14 },
    { id: "fountain", x: 20, y: 8, cost: 78 },
    { id: "bench", x: 21, y: 8, cost: 24 },
    { id: "bin", x: 22, y: 8, cost: 20 },
    { id: "lamp", x: 23, y: 8, cost: 26 },
  ];

  // First clear any pre-existing world-gen scenery on these tiles
  for (const item of sceneryItems) {
    const existing = await getTile(page, item.x, item.y);
    if (existing && existing.sceneryId) {
      await atomicToolClick(page, "erase", item.x, item.y);
    }
  }

  for (const item of sceneryItems) {
    result = await atomicToolClick(page, item.id, item.x, item.y);
    tile = await getTile(page, item.x, item.y);
    assert(tile.sceneryId === item.id, `Scenery(${item.id}): placed correctly`);
    assert(result.diff === item.cost, `Scenery(${item.id}): correct cost (diff=${result.diff})`);
  }

  // Scenery on water - should fail
  result = await atomicToolClick(page, "tree", 5, 7);
  assert(result.diff === 0, "Scenery: no placement on water");

  // Same scenery on same tile - no charge
  result = await atomicToolClick(page, "tree", 18, 8);
  assert(result.diff === 0, "Scenery: no charge for same type on same tile");

  // Different scenery over existing - should charge new cost minus refund of old
  result = await atomicToolClick(page, "flower", 18, 8);
  tile = await getTile(page, 18, 8);
  assert(tile.sceneryId === "flower", "Scenery: replaced tree with flower");
  const expectedNetCost = 14 - Math.round(18 * 0.55); // flower cost - tree refund (55%)
  assert(result.diff === expectedNetCost, `Scenery: overwrite net cost correct (diff=${result.diff}, expected=${expectedNetCost})`);

  await screenshot(page, "06-scenery");

  // ============================================================
  // TEST 6: Structure placement (rides and food stalls)
  // ============================================================
  console.log("\n=== TEST: Structure Placement ===");

  // Clear scenery we placed
  for (const item of sceneryItems) {
    await atomicToolClick(page, "erase", item.x, item.y);
  }
  // Also erase the flower we placed at 18,8
  await atomicToolClick(page, "erase", 18, 8);

  // Place carousel (2x2) at (18,8)
  const canPlaceCarousel = await canPlace(page, "carousel", 18, 8);
  console.log(`  canPlaceStructure(carousel, 18, 8) = ${canPlaceCarousel}`);
  result = await atomicToolClick(page, "carousel", 18, 8);
  tile = await getTile(page, 18, 8);
  let snap = await getSnapshot(page);
  assert(tile.structureId !== undefined, "Structure(carousel): placed at 18,8");
  assert(result.diff === 420, `Structure(carousel): correct cost (diff=${result.diff})`);
  assert(snap.attractions >= 1, "Structure(carousel): attraction count >= 1");

  await screenshot(page, "07-carousel");

  // Place gelato (1x1) at (22,10)
  result = await atomicToolClick(page, "gelato", 22, 10);
  tile = await getTile(page, 22, 10);
  assert(tile.structureId !== undefined, "Structure(gelato): placed at 22,10");
  assert(result.diff === 140, `Structure(gelato): correct cost (diff=${result.diff})`);

  // Place burger (2x1) at (22,13)
  result = await atomicToolClick(page, "burger", 22, 13);
  tile = await getTile(page, 22, 13);
  assert(tile.structureId !== undefined, "Structure(burger): placed at 22,13");
  assert(result.diff === 150, `Structure(burger): correct cost (diff=${result.diff})`);

  // Place coffee (2x1) at (16, 13)
  result = await atomicToolClick(page, "coffee", 16, 13);
  tile = await getTile(page, 16, 13);
  assert(tile.structureId !== undefined, "Structure(coffee): placed at 16,13");
  assert(result.diff === 165, `Structure(coffee): correct cost (diff=${result.diff})`);

  // Place swing (2x2) at (10, 10)
  const canPlaceSwing = await canPlace(page, "swing", 10, 10);
  console.log(`  canPlaceStructure(swing, 10, 10) = ${canPlaceSwing}`);
  if (canPlaceSwing) {
    result = await atomicToolClick(page, "swing", 10, 10);
    tile = await getTile(page, 10, 10);
    assert(tile.structureId !== undefined, "Structure(swing): placed at 10,10");
    assert(result.diff === 560, `Structure(swing): correct cost (diff=${result.diff})`);
  } else {
    console.log("  SKIP: swing cannot be placed at 10,10 (blocked)");
  }

  await screenshot(page, "08-structures");

  // ============================================================
  // TEST 7: Invalid placement tests
  // ============================================================
  console.log("\n=== TEST: Invalid Placement ===");

  // Structure on water
  result = await atomicToolClick(page, "carousel", 4, 7);
  assert(result.diff === 0, "Invalid: no money for structure on water");

  // Structure on occupied tile
  result = await atomicToolClick(page, "carousel", 18, 8);
  assert(result.diff === 0, "Invalid: no money for structure on occupied tile");

  // Structure on path
  result = await atomicToolClick(page, "carousel", 14, 22);
  assert(result.diff === 0, "Invalid: no money for structure on path");

  // Out of bounds
  await clickTile(page, -1, -1);
  await clickTile(page, 100, 100);
  assert(true, "Invalid: out of bounds does not crash");

  // Scenery on structure tile
  result = await atomicToolClick(page, "tree", 18, 8);
  assert(result.diff === 0, "Invalid: no scenery on structure tile");

  await screenshot(page, "09-invalid");

  // ============================================================
  // TEST 8: Erase tool and refunds
  // ============================================================
  console.log("\n=== TEST: Erase Tool & Refunds ===");

  // Place a tree, then erase it
  await atomicToolClick(page, "tree", 24, 5);
  tile = await getTile(page, 24, 5);
  assert(tile.sceneryId === "tree", "Erase: tree placed for erase test");

  result = await atomicToolClick(page, "erase", 24, 5);
  tile = await getTile(page, 24, 5);
  assert(tile.sceneryId === undefined, "Erase: tree removed");
  const treeRefund = Math.round(18 * 0.55);
  assert(result.diff === -treeRefund, `Erase: tree refund correct (diff=${result.diff}, expected=${-treeRefund})`);

  // Place and erase path
  await atomicToolClick(page, "path", 16, 18);
  tile = await getTile(page, 16, 18);
  assert(tile.path === true, "Erase: path placed for erase test");

  result = await atomicToolClick(page, "erase", 16, 18);
  tile = await getTile(page, 16, 18);
  assert(tile.path === false, "Erase: path removed");
  const pathRefund = Math.round(6 * 0.55);
  assert(result.diff === -pathRefund, `Erase: path refund correct (diff=${result.diff}, expected=${-pathRefund})`);

  // Place and erase gelato structure
  await atomicToolClick(page, "gelato", 24, 12);
  tile = await getTile(page, 24, 12);
  const structId = tile.structureId;
  assert(structId !== undefined, "Erase: gelato placed for erase test");

  snap = await getSnapshot(page);
  const attractionsBefore = snap.attractions;
  result = await atomicToolClick(page, "erase", 24, 12);
  tile = await getTile(page, 24, 12);
  snap = await getSnapshot(page);
  assert(tile.structureId === undefined, "Erase: gelato structure removed");
  const gelatoRefund = Math.round(140 * 0.55);
  assert(result.diff === -gelatoRefund, `Erase: gelato refund correct (diff=${result.diff}, expected=${-gelatoRefund})`);
  assert(snap.attractions === attractionsBefore - 1, "Erase: attraction count decreased");

  // Erase water tile -> convert to grass
  tile = await getTile(page, 5, 7);
  if (tile.terrain === "water") {
    await atomicToolClick(page, "erase", 5, 7);
    tile = await getTile(page, 5, 7);
    assert(tile.terrain === "grass", "Erase: water tile converted to grass");
  }

  // Erase on empty grass tile - no-op
  result = await atomicToolClick(page, "erase", 25, 3);
  assert(result.diff === 0, "Erase: no money change on empty grass");

  await screenshot(page, "10-erase");

  // ============================================================
  // TEST 9: Path connectivity for rides
  // ============================================================
  console.log("\n=== TEST: Path Connectivity ===");

  // Carousel at (18,8): entrance at (19, 10) (x+floor(2/2), y+2)
  const entranceTile = await getTile(page, 19, 10);
  console.log(`  Carousel entrance tile (19,10): terrain=${entranceTile.terrain}, path=${entranceTile.path}`);

  // Place path from entrance down to main path area
  for (let py = 10; py <= 22; py++) {
    const t = await getTile(page, 19, py);
    if (t && t.terrain === "grass" && !t.path && t.structureId === undefined) {
      await atomicToolClick(page, "path", 19, py);
    }
  }
  // Connect horizontally to main path
  for (let px = 14; px <= 19; px++) {
    const t = await getTile(page, px, 21);
    if (t && t.terrain === "grass" && !t.path && t.structureId === undefined) {
      await atomicToolClick(page, "path", px, 21);
    }
  }

  const entranceAfter = await getTile(page, 19, 10);
  assert(entranceAfter.path === true, "Connectivity: entrance tile has path");

  await screenshot(page, "11-connectivity");

  // ============================================================
  // TEST 10: Ferris wheel (3x3) and Coaster (4x3)
  // ============================================================
  console.log("\n=== TEST: Large Structures ===");

  // Ferris wheel (3x3)
  const canFerris = await canPlace(page, "ferris", 8, 14);
  console.log(`  canPlaceStructure(ferris, 8, 14) = ${canFerris}`);
  if (canFerris) {
    result = await atomicToolClick(page, "ferris", 8, 14);
    tile = await getTile(page, 8, 14);
    assert(tile.structureId !== undefined, "Structure(ferris): placed at 8,14");
    assert(result.diff === 620, `Structure(ferris): correct cost (diff=${result.diff})`);
  } else {
    console.log("  SKIP: ferris can't be placed at 8,14");
  }

  // Coaster (4x3)
  const canCoaster = await canPlace(page, "coaster", 14, 2);
  console.log(`  canPlaceStructure(coaster, 14, 2) = ${canCoaster}`);
  if (canCoaster) {
    result = await atomicToolClick(page, "coaster", 14, 2);
    tile = await getTile(page, 14, 2);
    assert(tile.structureId !== undefined, "Structure(coaster): placed at 14,2");
    assert(result.diff === 960, `Structure(coaster): correct cost (diff=${result.diff})`);
  } else {
    console.log("  SKIP: coaster can't be placed at 14,2");
  }

  await screenshot(page, "12-large-structures");

  // ============================================================
  // TEST 11: Tool button UI state
  // ============================================================
  console.log("\n=== TEST: Tool UI State ===");

  await setTool(page, "inspect");
  let activeButton = await page.evaluate(() => {
    const btn = document.querySelector('.tool-button.active');
    return btn ? btn.getAttribute('data-tool') : null;
  });
  assert(activeButton === "inspect", "UI: inspect button has active class");

  await setTool(page, "path");
  activeButton = await page.evaluate(() => {
    const btn = document.querySelector('.tool-button.active');
    return btn ? btn.getAttribute('data-tool') : null;
  });
  assert(activeButton === "path", "UI: path button has active class after switch");

  await page.evaluate(() => {
    const btn = document.querySelector('[data-tool="erase"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(100);
  activeButton = await page.evaluate(() => {
    const btn = document.querySelector('.tool-button.active');
    return btn ? btn.getAttribute('data-tool') : null;
  });
  assert(activeButton === "erase", "UI: clicking tool button sets active class");

  await screenshot(page, "13-ui-state");

  // ============================================================
  // TEST 12: Scenery on path tiles
  // ============================================================
  console.log("\n=== TEST: Scenery on Path ===");

  // Lamp should survive path placement
  await atomicToolClick(page, "lamp", 20, 18);
  tile = await getTile(page, 20, 18);
  if (tile.sceneryId === "lamp") {
    await atomicToolClick(page, "path", 20, 18);
    tile = await getTile(page, 20, 18);
    assert(tile.path === true && tile.sceneryId === "lamp", "Scenery: lamp survives path placement");
  }

  // Tree should NOT survive path placement
  await atomicToolClick(page, "tree", 20, 16);
  tile = await getTile(page, 20, 16);
  if (tile.sceneryId === "tree") {
    await atomicToolClick(page, "path", 20, 16);
    tile = await getTile(page, 20, 16);
    assert(tile.path === true && tile.sceneryId === undefined, "Scenery: tree cleared by path placement");
  }

  await screenshot(page, "14-scenery-path");

  // ============================================================
  // TEST 13: Money insufficient tests
  // ============================================================
  console.log("\n=== TEST: Insufficient Money ===");
  snap = await getSnapshot(page);
  console.log(`  Current money: ${snap.money}`);

  if (snap.money < 960) {
    result = await atomicToolClick(page, "coaster", 20, 2);
    assert(result.diff === 0, "Money: coaster rejected when insufficient funds");
    const log = await getEventLog(page);
    assert(log.some(e => e.toLowerCase().includes("not enough") || e.toLowerCase().includes("cash") || e.toLowerCase().includes("afford")),
      "Money: event log mentions insufficient funds");
  } else {
    console.log("  SKIP: Still have enough money for coaster");
  }

  // ============================================================
  // TEST 14: Event log verification
  // ============================================================
  console.log("\n=== TEST: Event Log ===");
  const log = await getEventLog(page);
  assert(Array.isArray(log), "EventLog: returns array");
  assert(log.length > 0, "EventLog: has entries");
  assert(log.length <= 8, "EventLog: max 8 entries");
  console.log(`  Log entries: ${log.length}`);
  log.slice(0, 3).forEach(e => console.log(`    "${e}"`));

  // ============================================================
  // TEST 15: Snapshot correctness
  // ============================================================
  console.log("\n=== TEST: Snapshot ===");
  snap = await getSnapshot(page);
  assert(typeof snap.money === "number", "Snapshot: money is number");
  assert(typeof snap.guests === "number", "Snapshot: guests is number");
  assert(typeof snap.attractions === "number", "Snapshot: attractions is number");
  assert(typeof snap.rideCount === "number", "Snapshot: rideCount is number");
  assert(typeof snap.pathTiles === "number", "Snapshot: pathTiles is number");
  assert(typeof snap.cleanliness === "number", "Snapshot: cleanliness is number");
  assert(typeof snap.happiness === "number", "Snapshot: happiness is number");
  assert(typeof snap.parkLevel === "number", "Snapshot: parkLevel is number");
  assert(snap.cleanliness >= 0 && snap.cleanliness <= 100, "Snapshot: cleanliness in range");
  assert(snap.happiness >= 0 && snap.happiness <= 100, "Snapshot: happiness in range");

  // ============================================================
  // TEST 16: Grass on Grass (no-charge check)
  // ============================================================
  console.log("\n=== TEST: Grass on Grass (no-charge check) ===");
  tile = await getTile(page, 25, 2);
  if (tile && tile.terrain === "grass") {
    result = await atomicToolClick(page, "grass", 25, 2);
    assert(result.diff === 0, "GrassOnGrass: no charge for grass on grass");
  }

  // ============================================================
  // TEST 17: Erase multi-tile structure
  // ============================================================
  console.log("\n=== TEST: Multi-tile Structure Erase ===");
  const t18_8 = await getTile(page, 18, 8);
  if (t18_8 && t18_8.structureId !== undefined) {
    await atomicToolClick(page, "erase", 18, 8);
    const t18_8a = await getTile(page, 18, 8);
    const t19_8 = await getTile(page, 19, 8);
    const t18_9 = await getTile(page, 18, 9);
    const t19_9 = await getTile(page, 19, 9);
    assert(t18_8a.structureId === undefined, "MultiErase: tile (18,8) cleared");
    assert(t19_8.structureId === undefined, "MultiErase: tile (19,8) cleared");
    assert(t18_9.structureId === undefined, "MultiErase: tile (18,9) cleared");
    assert(t19_9.structureId === undefined, "MultiErase: tile (19,9) cleared");
  }

  // ============================================================
  // TEST 18: Scenery overwrite refund
  // ============================================================
  console.log("\n=== TEST: Scenery Overwrite (refund check) ===");
  await atomicToolClick(page, "tree", 25, 4);
  tile = await getTile(page, 25, 4);
  assert(tile.sceneryId === "tree", "SceneryOverwrite: tree placed");

  result = await atomicToolClick(page, "flower", 25, 4);
  tile = await getTile(page, 25, 4);
  assert(tile.sceneryId === "flower", "SceneryOverwrite: flower replaced tree");
  // With bug fix: old scenery (tree, cost=18) gets 55% refund = 10
  // New scenery (flower) costs 14. Net = 14 - 10 = 4
  const expectedNet = 14 - Math.round(18 * 0.55);
  assert(result.diff === expectedNet, `SceneryOverwrite: correct net cost with refund (diff=${result.diff}, expected=${expectedNet})`);

  await screenshot(page, "15-final");

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("FAILURES:");
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log("========================================\n");

  await browser.close();
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
