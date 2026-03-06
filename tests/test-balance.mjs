import { chromium } from "playwright";

const URL = "http://127.0.0.1:4173/";
const SIM_DURATION = 30_000; // 30 seconds
const SAMPLE_INTERVAL = 5_000; // sample every 5s

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForGame(page) {
  await page.waitForFunction(() => {
    const dbg = window.__parkGameDebug;
    return dbg && typeof dbg.getSnapshot === "function";
  }, { timeout: 15000 });
  // small delay to let initial frame render
  await sleep(500);
}

async function setTool(page, toolId) {
  await page.evaluate((id) => window.__parkGameDebug.setTool(id), toolId);
}

async function clickTile(page, x, y) {
  await page.evaluate(([tx, ty]) => window.__parkGameDebug.clickTile(tx, ty), [x, y]);
  // Reset paintAppliedAt so we can place again at different coords
  await sleep(50);
}

async function placePath(page, x, y) {
  await setTool(page, "path");
  await clickTile(page, x, y);
}

async function placePathLine(page, x1, y1, x2, y2) {
  await setTool(page, "path");
  if (x1 === x2) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      await clickTile(page, x1, y);
    }
  } else {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      await clickTile(page, x, y1);
    }
  }
}

async function placeStructure(page, typeId, x, y) {
  await setTool(page, typeId);
  await clickTile(page, x, y);
  await sleep(30);
}

async function placeScenery(page, typeId, x, y) {
  await setTool(page, typeId);
  await clickTile(page, x, y);
  await sleep(30);
}

async function getSnapshot(page) {
  return page.evaluate(() => window.__parkGameDebug.getSnapshot());
}

async function getStructures(page) {
  return page.evaluate(() => window.__parkGameDebug.getStructures());
}

async function getGuests(page) {
  return page.evaluate(() => window.__parkGameDebug.getGuests());
}

async function getTime(page) {
  return page.evaluate(() => window.__parkGameDebug.getTime());
}

async function runSimulation(page, label, buildFn) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SIMULATION: ${label}`);
  console.log(`${"=".repeat(60)}`);

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await waitForGame(page);

  const snapBefore = await getSnapshot(page);
  console.log(`  Starting money: $${snapBefore.money}`);

  // Execute the build plan
  await buildFn(page);
  await sleep(200);

  const snapAfterBuild = await getSnapshot(page);
  console.log(`  Money after building: $${snapAfterBuild.money}`);
  console.log(`  Attractions placed: ${snapAfterBuild.attractions}`);

  // Collect samples over the simulation period
  const samples = [];
  const startTime = Date.now();

  while (Date.now() - startTime < SIM_DURATION) {
    await sleep(SAMPLE_INTERVAL);
    const snap = await getSnapshot(page);
    const structs = await getStructures(page);
    const guests = await getGuests(page);
    const gameTime = await getTime(page);

    const totalLifetimeGuests = structs.reduce((s, st) => s + st.lifetimeGuests, 0);
    const avgHappiness = guests.length > 0
      ? (guests.reduce((s, g) => s + g.happiness, 0) / guests.length)
      : 0;
    const avgHunger = guests.length > 0
      ? (guests.reduce((s, g) => s + g.hunger, 0) / guests.length)
      : 0;
    const avgPatience = guests.length > 0
      ? (guests.reduce((s, g) => s + g.patience, 0) / guests.length)
      : 0;
    const queueingCount = guests.filter((g) => g.state === "queueing").length;
    const ridingCount = guests.filter((g) => g.state === "riding").length;

    samples.push({
      elapsed: Math.round((Date.now() - startTime) / 1000),
      gameTime: Math.round(gameTime * 10) / 10,
      money: snap.money,
      guests: snap.guests,
      happiness: snap.happiness,
      cleanliness: snap.cleanliness,
      parkLevel: snap.parkLevel,
      totalLifetimeGuests,
      avgHappiness: Math.round(avgHappiness),
      avgHunger: Math.round(avgHunger),
      avgPatience: Math.round(avgPatience),
      queueing: queueingCount,
      riding: ridingCount,
      activeQueues: snap.activeQueues,
    });

    console.log(`  [${samples[samples.length-1].elapsed}s] Money=$${snap.money} Guests=${snap.guests} Happy=${snap.happiness} Clean=${snap.cleanliness} ParkLv=${snap.parkLevel} Served=${totalLifetimeGuests} AvgHunger=${Math.round(avgHunger)} Q=${queueingCount} R=${ridingCount}`);
  }

  // Final detailed snapshot
  const finalSnap = await getSnapshot(page);
  const finalStructs = await getStructures(page);
  const finalGuests = await getGuests(page);

  const result = {
    label,
    moneyStart: snapBefore.money,
    moneyAfterBuild: snapAfterBuild.money,
    moneyFinal: finalSnap.money,
    netRevenue: finalSnap.money - snapAfterBuild.money,
    guestCount: finalSnap.guests,
    happiness: finalSnap.happiness,
    cleanliness: finalSnap.cleanliness,
    parkLevel: finalSnap.parkLevel,
    attractions: finalSnap.attractions,
    totalServed: finalStructs.reduce((s, st) => s + st.lifetimeGuests, 0),
    samples,
    structureDetails: finalStructs.map((s) => ({
      typeId: s.typeId,
      lifetimeGuests: s.lifetimeGuests,
      queueLen: s.queue.length,
      status: s.status,
    })),
  };

  console.log(`\n  --- FINAL RESULTS: ${label} ---`);
  console.log(`  Net revenue (after build): $${result.netRevenue}`);
  console.log(`  Final money: $${result.moneyFinal}`);
  console.log(`  Guests: ${result.guestCount}`);
  console.log(`  Happiness: ${result.happiness}`);
  console.log(`  Cleanliness: ${result.cleanliness}`);
  console.log(`  Park Level: ${result.parkLevel}`);
  console.log(`  Total guests served: ${result.totalServed}`);
  console.log(`  Structure breakdown:`);
  for (const s of result.structureDetails) {
    console.log(`    ${s.typeId}: served=${s.lifetimeGuests}, queue=${s.queueLen}, status=${s.status}`);
  }

  return result;
}

// ===== BUILD PLANS =====

// BASE_SPAWN = {x:14, y:24}
// Initial paths: y=21..26, x=12..16
// Side paths: y=21..23, x=11 and x=17

async function buildRidesOnly(page) {
  console.log("  Building: Rides Only strategy");

  // Extend paths to reach ride entrances
  // Left branch
  await placePathLine(page, 8, 21, 11, 21);
  await placePathLine(page, 8, 21, 8, 19);
  // Right branch
  await placePathLine(page, 17, 21, 20, 21);
  await placePathLine(page, 20, 21, 20, 19);
  // Upper path
  await placePathLine(page, 12, 20, 16, 20);
  await placePathLine(page, 12, 19, 16, 19);
  await placePathLine(page, 12, 18, 16, 18);

  // Place rides:
  // Carousel at (9, 17) - 2x2, entrance at (10, 19) - need path there
  await placePath(page, 10, 19);
  await placePath(page, 9, 19);
  await placeStructure(page, "carousel", 9, 17);

  // Ferris wheel at (17, 16) - 3x3, entrance at (18, 19) - need path
  await placePath(page, 18, 19);
  await placePath(page, 17, 19);
  await placePath(page, 18, 18);
  await placePath(page, 17, 18);
  await placeStructure(page, "ferris", 17, 16);

  // Star Swing at (12, 16) - 2x2, entrance at (13, 18)
  await placeStructure(page, "swing", 12, 16);

  // Another carousel at (15, 16) - 2x2, entrance at (16, 18)
  await placeStructure(page, "carousel", 15, 16);
}

async function buildBalanced(page) {
  console.log("  Building: Balanced strategy");

  // Extend paths
  await placePathLine(page, 8, 21, 11, 21);
  await placePathLine(page, 8, 21, 8, 19);
  await placePathLine(page, 17, 21, 20, 21);
  await placePathLine(page, 20, 21, 20, 19);
  await placePathLine(page, 12, 20, 16, 20);
  await placePathLine(page, 12, 19, 16, 19);
  await placePathLine(page, 12, 18, 16, 18);

  // Rides
  await placePath(page, 10, 19);
  await placePath(page, 9, 19);
  await placeStructure(page, "carousel", 9, 17); // 420

  await placeStructure(page, "swing", 12, 16); // 560, entrance at (13,18)

  // Food stalls
  // Burger at (15, 17) - 2x1, entrance at (16, 18)
  await placeStructure(page, "burger", 15, 17); // 150

  // Gelato at (20, 20) - 1x1, entrance at (20, 21)
  await placePath(page, 20, 20);
  await placeStructure(page, "gelato", 20, 19); // 140, entrance at (20,20)

  // Scenery
  await placeScenery(page, "tree", 11, 20);
  await placeScenery(page, "tree", 17, 20);
  await placeScenery(page, "flower", 13, 20);
  await placeScenery(page, "flower", 15, 20);
  await placeScenery(page, "bin", 14, 20);
  await placeScenery(page, "bin", 12, 21);
  await placeScenery(page, "bench", 16, 21);
  await placeScenery(page, "fountain", 14, 18);
}

async function buildFoodEmpire(page) {
  console.log("  Building: Food Empire strategy");

  // Extend paths
  await placePathLine(page, 8, 21, 11, 21);
  await placePathLine(page, 17, 21, 20, 21);
  await placePathLine(page, 12, 20, 16, 20);
  await placePathLine(page, 12, 19, 16, 19);
  await placePathLine(page, 12, 18, 16, 18);
  await placePathLine(page, 8, 21, 8, 19);
  await placePathLine(page, 20, 21, 20, 19);

  // One ride to attract guests
  await placePath(page, 10, 19);
  await placePath(page, 9, 19);
  await placeStructure(page, "carousel", 9, 17); // 420

  // Many food stalls
  await placeStructure(page, "burger", 12, 17); // 150, entrance at (13,18)
  await placeStructure(page, "burger", 15, 17); // 150, entrance at (16,18)

  await placePath(page, 20, 20);
  await placeStructure(page, "gelato", 20, 19); // 140, entrance at (20,20)

  await placeStructure(page, "coffee", 17, 20); // 165, entrance at (18,21)
  await placePath(page, 18, 21);

  // Gelato on left
  await placeStructure(page, "gelato", 8, 18); // 140, entrance at (8,19)
}

// ===== COMET COASTER VS 2 CAROUSELS =====

async function buildCoasterTest(page) {
  console.log("  Building: Comet Coaster test");

  await placePathLine(page, 12, 20, 16, 20);
  await placePathLine(page, 12, 19, 16, 19);
  await placePathLine(page, 12, 18, 16, 18);
  await placePathLine(page, 12, 17, 16, 17);

  // Coaster at (11, 14) - 4x3, entrance at (13, 17)
  await placeStructure(page, "coaster", 11, 14); // 960
}

async function buildTwoCarouselsTest(page) {
  console.log("  Building: Two Carousels test");

  await placePathLine(page, 12, 20, 16, 20);
  await placePathLine(page, 12, 19, 16, 19);
  await placePathLine(page, 12, 18, 16, 18);
  await placePathLine(page, 8, 21, 11, 21);
  await placePath(page, 10, 19);
  await placePath(page, 9, 19);

  // Carousel 1 at (12, 16) - 2x2, entrance at (13, 18)
  await placeStructure(page, "carousel", 12, 16); // 420

  // Carousel 2 at (9, 17) - 2x2, entrance at (10, 19)
  await placeStructure(page, "carousel", 9, 17); // 420
}

// ===== MAIN =====

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium-browser",
  });

  const results = {};

  try {
    // Simulation A: Rides Only
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      results.ridesOnly = await runSimulation(page, "Rides Only", buildRidesOnly);
      await page.close();
    }

    // Simulation B: Balanced
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      results.balanced = await runSimulation(page, "Balanced", buildBalanced);
      await page.close();
    }

    // Simulation C: Food Empire
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      results.foodEmpire = await runSimulation(page, "Food Empire", buildFoodEmpire);
      await page.close();
    }

    // Coaster vs 2 Carousels
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      results.coaster = await runSimulation(page, "Comet Coaster (960)", buildCoasterTest);
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      results.twoCarousels = await runSimulation(page, "Two Carousels (840)", buildTwoCarouselsTest);
      await page.close();
    }

    // ===== COMPARATIVE ANALYSIS =====
    console.log(`\n${"=".repeat(60)}`);
    console.log("  COMPARATIVE ANALYSIS");
    console.log(`${"=".repeat(60)}`);

    console.log("\n  --- Strategy Comparison ---");
    const strats = ["ridesOnly", "balanced", "foodEmpire"];
    const header = "Strategy".padEnd(16) + "NetRev".padStart(8) + "Guests".padStart(8) + "Happy".padStart(7) + "Clean".padStart(7) + "PkLv".padStart(6) + "Served".padStart(8);
    console.log(`  ${header}`);
    console.log(`  ${"-".repeat(header.length)}`);
    for (const key of strats) {
      const r = results[key];
      const row = r.label.padEnd(16)
        + `$${r.netRevenue}`.padStart(8)
        + `${r.guestCount}`.padStart(8)
        + `${r.happiness}`.padStart(7)
        + `${r.cleanliness}`.padStart(7)
        + `${r.parkLevel}`.padStart(6)
        + `${r.totalServed}`.padStart(8);
      console.log(`  ${row}`);
    }

    console.log("\n  --- Comet Coaster vs 2 Carousels ---");
    const cc = results.coaster;
    const tc = results.twoCarousels;
    console.log(`  Comet Coaster (cost $960): NetRev=$${cc.netRevenue}, Served=${cc.totalServed}, Happy=${cc.happiness}`);
    console.log(`  Two Carousels (cost $840): NetRev=$${tc.netRevenue}, Served=${tc.totalServed}, Happy=${tc.happiness}`);
    const coasterWorth = cc.netRevenue > tc.netRevenue ? "YES" : "NO";
    console.log(`  Is Comet Coaster worth it? ${coasterWorth} (net diff: $${cc.netRevenue - tc.netRevenue})`);

    // Food stall income analysis
    console.log("\n  --- Food Stall Income Analysis ---");
    const fe = results.foodEmpire;
    const foodStructs = fe.structureDetails.filter((s) => ["burger", "gelato", "coffee"].includes(s.typeId));
    const totalFoodServed = foodStructs.reduce((s, f) => s + f.lifetimeGuests, 0);
    console.log(`  Food Empire total food-stall guests served: ${totalFoodServed}`);
    console.log(`  Food Empire net revenue: $${fe.netRevenue}`);
    console.log(`  Balanced net revenue: $${results.balanced.netRevenue}`);
    const foodJustified = fe.netRevenue > 0 ? "YES - food generates positive income" : "MARGINAL - food income may not justify cost";
    console.log(`  Food stalls justified? ${foodJustified}`);

    // Guest spawn analysis
    console.log("\n  --- Guest Spawn Rate Analysis ---");
    for (const key of strats) {
      const r = results[key];
      const lastSample = r.samples[r.samples.length - 1];
      const guestsPerSec = lastSample ? (r.guestCount / lastSample.gameTime).toFixed(2) : "N/A";
      console.log(`  ${r.label}: ${r.guestCount} guests in ~${lastSample?.gameTime}s game time = ${guestsPerSec} guests/s`);
    }

    // Happiness decay analysis
    console.log("\n  --- Happiness Decay Analysis ---");
    for (const key of strats) {
      const r = results[key];
      const happinessTrack = r.samples.map((s) => s.avgHappiness);
      console.log(`  ${r.label} happiness over time: [${happinessTrack.join(", ")}]`);
    }

    // Scenery impact
    console.log("\n  --- Scenery Impact ---");
    console.log(`  Rides Only (no scenery):  happiness=${results.ridesOnly.happiness}`);
    console.log(`  Balanced (with scenery):  happiness=${results.balanced.happiness}`);
    console.log(`  Scenery happiness delta: ${results.balanced.happiness - results.ridesOnly.happiness}`);

    // Balance recommendations
    console.log("\n  --- Balance Recommendations ---");

    // Check if food is underpowered
    if (fe.netRevenue < results.ridesOnly.netRevenue * 0.5) {
      console.log("  [!] Food stalls appear underpowered relative to rides");
    }

    // Check if happiness decays too fast
    const ridesHappy = results.ridesOnly.samples;
    if (ridesHappy.length > 1 && ridesHappy[ridesHappy.length - 1].avgHappiness < 50) {
      console.log("  [!] Happiness may decay too fast (Rides-Only drops below 50)");
    }

    // Check if scenery bonus is too small
    const sceneryDelta = results.balanced.happiness - results.ridesOnly.happiness;
    if (Math.abs(sceneryDelta) < 5) {
      console.log("  [!] Scenery beauty bonuses may be too small to matter");
    }

    // Guest spawn check
    const balancedGuests = results.balanced.guestCount;
    if (balancedGuests < 5) {
      console.log("  [!] Guest spawn rate seems too slow (< 5 guests in 30s)");
    } else if (balancedGuests > 40) {
      console.log("  [!] Guest spawn rate seems too fast (> 40 guests in 30s)");
    } else {
      console.log("  [OK] Guest spawn rate seems reasonable");
    }

    // Coaster value check
    if (cc.totalServed < tc.totalServed * 0.8) {
      console.log("  [!] Comet Coaster may not serve enough guests to justify cost");
    }

    console.log("\n  Done. All simulations complete.");
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    await browser.close();
  }
}

main();
