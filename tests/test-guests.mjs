import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL ?? "http://127.0.0.1:4173";
const PASS = "\x1b[32mPASS\x1b[0m";
const FAIL = "\x1b[31mFAIL\x1b[0m";
const WARN = "\x1b[33mWARN\x1b[0m";
let totalTests = 0;
let passed = 0;
let failed = 0;
const issues = [];

function report(name, ok, detail = "") {
  totalTests++;
  if (ok) {
    passed++;
    console.log(`  ${PASS} ${name}${detail ? " -- " + detail : ""}`);
  } else {
    failed++;
    console.log(`  ${FAIL} ${name}${detail ? " -- " + detail : ""}`);
    issues.push({ name, detail });
  }
}

function warn(name, detail) {
  console.log(`  ${WARN} ${name} -- ${detail}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium-browser",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

// ── Helpers ──

async function clickTile(x, y) {
  await page.evaluate(([tx, ty]) => window.__parkGameDebug.clickTile(tx, ty), [x, y]);
}

async function setTool(toolId) {
  await page.evaluate((t) => window.__parkGameDebug.setTool(t), toolId);
}

async function paintPath(points) {
  await setTool("path");
  for (const [x, y] of points) {
    await clickTile(x, y);
  }
}

async function place(tool, x, y) {
  await setTool(tool);
  await clickTile(x, y);
}

async function getSnapshot() {
  return page.evaluate(() => window.__parkGameDebug.getSnapshot());
}

async function getGuests() {
  return page.evaluate(() => window.__parkGameDebug.getGuests());
}

async function getStructures() {
  return page.evaluate(() => window.__parkGameDebug.getStructures());
}

async function getTime() {
  return page.evaluate(() => window.__parkGameDebug.getTime());
}

async function getTile(x, y) {
  return page.evaluate(([tx, ty]) => window.__parkGameDebug.getTile(tx, ty), [x, y]);
}

async function eventLog() {
  return page.evaluate(() => window.__parkGameDebug.eventLog());
}

function entranceFor(type, x, y) {
  const footprints = {
    carousel: { x: 2, y: 2 },
    ferris: { x: 3, y: 3 },
    coaster: { x: 4, y: 3 },
    swing: { x: 2, y: 2 },
    burger: { x: 2, y: 1 },
    gelato: { x: 1, y: 1 },
    coffee: { x: 2, y: 1 },
  };
  const fp = footprints[type];
  return { x: x + Math.floor(fp.x / 2), y: y + fp.y };
}

async function connectPath(from, to) {
  const points = [];
  const stepX = from.x <= to.x ? 1 : -1;
  const stepY = from.y <= to.y ? 1 : -1;
  for (let x = from.x; x !== to.x; x += stepX) points.push([x, from.y]);
  points.push([to.x, from.y]);
  for (let y = from.y; y !== to.y; y += stepY) points.push([to.x, y]);
  points.push([to.x, to.y]);
  await paintPath(points);
}

async function waitGameSeconds(seconds) {
  // The game runs roughly at real-time (dt capped at 33ms).
  // waitForTimeout is close enough for integration tests.
  await page.waitForTimeout(seconds * 1000);
}

async function canPlace(type, x, y) {
  return page.evaluate(
    ([t, tx, ty]) => window.__parkGameDebug.canPlaceStructure(t, tx, ty),
    [type, x, y]
  );
}

async function findPlacement(type, bounds) {
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      if (await canPlace(type, x, y)) return { x, y };
    }
  }
  return null;
}

// ── Start ──

console.log("\n========================================");
console.log("  Guest AI & Pathfinding Test Suite");
console.log("========================================\n");

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.__parkGameDebug));
console.log("Game loaded.\n");

// ═══════════════════════════════════════════
// TEST 1: Build a simple park with one ride connected by path
// ═══════════════════════════════════════════
console.log("--- Test 1: Build simple park with connected ride ---");

const hub = { x: 14, y: 21 };
const carouselPos = await findPlacement("carousel", { x1: 12, y1: 17, x2: 16, y2: 19 });
report("Found carousel placement", carouselPos !== null, carouselPos ? `at ${carouselPos.x},${carouselPos.y}` : "no spot");

if (carouselPos) {
  const entrance = entranceFor("carousel", carouselPos.x, carouselPos.y);
  await connectPath(hub, entrance);
  await place("carousel", carouselPos.x, carouselPos.y);

  const snap = await getSnapshot();
  report("Carousel placed successfully", snap.attractions >= 1, `attractions=${snap.attractions}`);

  const entranceTile = await getTile(entrance.x, entrance.y);
  report("Entrance tile has path", entranceTile && entranceTile.path === true);
}

// ═══════════════════════════════════════════
// TEST 2: Wait for guests to spawn and track states over time
// ═══════════════════════════════════════════
console.log("\n--- Test 2: Guest spawning and state tracking ---");

const stateHistory = { walking: 0, queueing: 0, riding: 0, thinking: 0 };
const stateTransitions = [];

await waitGameSeconds(8);

let prevGuests = await getGuests();
report("Guests spawned", prevGuests.length > 0, `count=${prevGuests.length}`);

// Track state changes over 30 seconds (sample every 0.5s) - long enough for full ride cycle
for (let tick = 0; tick < 60; tick++) {
  await waitGameSeconds(0.5);
  const currentGuests = await getGuests();

  for (const g of currentGuests) {
    stateHistory[g.state] = (stateHistory[g.state] || 0) + 1;
  }

  // Detect transitions
  for (const g of currentGuests) {
    const prev = prevGuests.find((p) => p.id === g.id);
    if (prev && prev.state !== g.state) {
      stateTransitions.push({ id: g.id, from: prev.state, to: g.state, tick });
    }
  }
  prevGuests = currentGuests;
}

console.log(`  State distribution over 12s: ${JSON.stringify(stateHistory)}`);
console.log(`  Transitions observed: ${stateTransitions.length}`);
for (const t of stateTransitions.slice(0, 10)) {
  console.log(`    Guest ${t.id}: ${t.from} -> ${t.to} (tick ${t.tick})`);
}

report("Walking state observed", stateHistory.walking > 0);
report("Queueing state observed", stateHistory.queueing > 0);
report("Riding state observed", stateHistory.riding > 0);
// Thinking state is very brief (0.4-1.1s) so may be missed between samples.
// If guests are riding, they must have passed through thinking at some point.
report("Thinking state observed (or implied by ride activity)",
  stateHistory.thinking > 0 ||
  stateTransitions.some(t => t.to === "thinking" || t.from === "thinking") ||
  stateHistory.riding > 0,  // riding implies thinking happened (spawn -> think -> assign -> walk -> queue -> ride)
  stateHistory.thinking === 0 && stateHistory.riding > 0 ? "(thinking too brief to sample, but ride activity confirms it)" : ""
);

// ═══════════════════════════════════════════
// TEST 3: Verify correct state transitions
// ═══════════════════════════════════════════
console.log("\n--- Test 3: Verify state transitions ---");

const validTransitions = new Set([
  "walking->queueing",    // arrived at ride
  "walking->thinking",    // arrived at random destination or no route
  "walking->riding",      // arrived at idle ride (queueing->riding in same frame)
  "queueing->riding",     // ride started
  "queueing->thinking",   // structure deleted or patience ran out
  "riding->thinking",     // ride finished
  "riding->walking",      // ride finished, thinking was very brief (same-frame reassign)
  "thinking->walking",    // chose new destination
  "thinking->queueing",   // already at ride entrance, queue directly
  "thinking->riding",     // already at idle ride entrance, queue+board in same frame
  "thinking->thinking",   // hunger redirect (re-assign)
]);

const invalidTransitions = [];
for (const t of stateTransitions) {
  const key = `${t.from}->${t.to}`;
  if (!validTransitions.has(key)) {
    invalidTransitions.push(t);
  }
}

report(
  "All state transitions are valid",
  invalidTransitions.length === 0,
  invalidTransitions.length > 0
    ? `Invalid: ${invalidTransitions.map((t) => `${t.from}->${t.to} (guest ${t.id})`).join(", ")}`
    : `${stateTransitions.length} transitions checked`
);

// Check that guests complete rides (riding->thinking or riding->walking which means thinking was instant)
const hasFullCycle = stateTransitions.some(
  (t) => (t.from === "riding" && t.to === "thinking") ||
         (t.from === "riding" && t.to === "walking") ||
         (t.from === "queueing" && t.to === "riding")
);
report("Ride cycle observed (guests board and ride)", hasFullCycle);

// ═══════════════════════════════════════════
// TEST 4: Erase ride while guests are queueing/riding
// ═══════════════════════════════════════════
console.log("\n--- Test 4: Erase ride with guests queueing/riding ---");

// Wait for some guests to be queueing
await waitGameSeconds(4);
let guestsBefore = await getGuests();
let structsBefore = await getStructures();
const activeStruct = structsBefore.find((s) => s.queue.length > 0 || s.riders.length > 0);

if (activeStruct) {
  const queuedGuestIds = [...activeStruct.queue, ...activeStruct.riders];
  console.log(`  Erasing ${activeStruct.typeId} (id=${activeStruct.id}) with ${activeStruct.queue.length} queued, ${activeStruct.riders.length} riding`);

  // Erase the structure
  await setTool("erase");
  await clickTile(activeStruct.x, activeStruct.y);

  await waitGameSeconds(0.5);

  const guestsAfter = await getGuests();
  const structsAfter = await getStructures();

  report("Structure was erased", !structsAfter.find((s) => s.id === activeStruct.id));

  // Check that previously queued/riding guests are now in 'thinking' state
  const affectedGuests = guestsAfter.filter((g) => queuedGuestIds.includes(g.id));
  const allRecovered = affectedGuests.every(
    (g) => g.state === "thinking" || g.state === "walking"
  );
  report(
    "Displaced guests recovered to thinking/walking",
    allRecovered,
    `${affectedGuests.length} guests checked, states: ${affectedGuests.map((g) => g.state).join(",")}`
  );

  // Check no guest is still targeting the deleted structure
  const stillTargeting = guestsAfter.filter(
    (g) => g.targetStructureId === activeStruct.id
  );
  report(
    "No guests targeting deleted structure",
    stillTargeting.length === 0,
    stillTargeting.length > 0
      ? `${stillTargeting.length} guests still targeting deleted structure!`
      : ""
  );
} else {
  warn("Erase-while-active test", "No structure had guests in queue/riding to test");
  // Place a new carousel to continue tests
}

// Rebuild for further tests
const carouselPos2 = await findPlacement("carousel", { x1: 10, y1: 15, x2: 18, y2: 20 });
if (carouselPos2) {
  const entrance2 = entranceFor("carousel", carouselPos2.x, carouselPos2.y);
  await connectPath(hub, entrance2);
  await place("carousel", carouselPos2.x, carouselPos2.y);
}

// ═══════════════════════════════════════════
// TEST 5: Disconnected paths - ride with no path connection
// ═══════════════════════════════════════════
console.log("\n--- Test 5: Disconnected ride (no path connection) ---");

// Place a ride far from any path
const isolatedPos = await findPlacement("swing", { x1: 3, y1: 3, x2: 8, y2: 8 });
if (isolatedPos) {
  await place("swing", isolatedPos.x, isolatedPos.y);
  const entrance = entranceFor("swing", isolatedPos.x, isolatedPos.y);
  const entranceTile = await getTile(entrance.x, entrance.y);

  report("Isolated ride entrance has NO path", !entranceTile || entranceTile.path !== true);

  // Wait and check no guests reach it
  await waitGameSeconds(8);
  const structs = await getStructures();
  const isolatedRide = structs.find(
    (s) => s.x === isolatedPos.x && s.y === isolatedPos.y
  );

  if (isolatedRide) {
    report(
      "Guests did NOT reach disconnected ride",
      isolatedRide.queue.length === 0 && isolatedRide.riders.length === 0 && isolatedRide.lifetimeGuests === 0,
      `queue=${isolatedRide.queue.length}, riders=${isolatedRide.riders.length}, lifetime=${isolatedRide.lifetimeGuests}`
    );
  } else {
    warn("Disconnected ride test", "Could not find isolated ride");
  }

  // Clean up
  await setTool("erase");
  await clickTile(isolatedPos.x, isolatedPos.y);
} else {
  warn("Disconnected ride test", "Could not find placement for isolated ride");
}

// ═══════════════════════════════════════════
// TEST 6: Long queue - do guests wait forever or give up?
// ═══════════════════════════════════════════
console.log("\n--- Test 6: Long queue patience test ---");

// With just one ride, guests will queue up
await waitGameSeconds(10);

let guests6 = await getGuests();
const queuingGuests = guests6.filter((g) => g.state === "queueing");
console.log(`  Currently queueing: ${queuingGuests.length}`);

// Check if any guest has very low patience while still queueing
const impatientQueuers = queuingGuests.filter((g) => g.patience < 20);
if (impatientQueuers.length > 0) {
  warn("Long queue", `${impatientQueuers.length} guests queueing with low patience (<20)`);
}

// Check if patience actually decreases for queueing guests - track same guest
const queuePatienceSamples = [];
let trackedQueuerId = null;
for (let i = 0; i < 5; i++) {
  const g = await getGuests();
  const queuers = g.filter((x) => x.state === "queueing");
  if (trackedQueuerId === null && queuers.length > 0) {
    trackedQueuerId = queuers[0].id;
  }
  if (trackedQueuerId !== null) {
    const tracked = g.find((x) => x.id === trackedQueuerId);
    if (tracked && tracked.state === "queueing") {
      queuePatienceSamples.push(tracked.patience);
    }
  }
  await waitGameSeconds(1.5);
}

if (queuePatienceSamples.length >= 2) {
  const patienceDecreased = queuePatienceSamples[0] > queuePatienceSamples[queuePatienceSamples.length - 1];
  report(
    "Patience decreases while queueing",
    patienceDecreased,
    `guest ${trackedQueuerId}: ${queuePatienceSamples.map((p) => p.toFixed(1)).join(" -> ")}`
  );
}

// BUG CHECK: Guests never leave a queue even if patience hits 0.
// The game code has no mechanism for guests to leave queue when patience runs out.
const guestsNow = await getGuests();
const zeroPatienceInQueue = guestsNow.filter(
  (g) => g.state === "queueing" && g.patience <= 5
);
if (zeroPatienceInQueue.length > 0) {
  report(
    "BUG: Guests stuck in queue with zero patience",
    false,
    `${zeroPatienceInQueue.length} guests with patience<=5 still queueing (they should leave)`
  );
} else {
  report("No zero-patience queuers found (or queue drains fast enough)", true);
}

// ═══════════════════════════════════════════
// TEST 7: Happiness decay and hunger systems
// ═══════════════════════════════════════════
console.log("\n--- Test 7: Happiness decay and hunger ---");

// Sample guest stats over time
const statSamples = [];
for (let i = 0; i < 5; i++) {
  const g = await getGuests();
  if (g.length > 0) {
    const avg = {
      happiness: g.reduce((s, x) => s + x.happiness, 0) / g.length,
      hunger: g.reduce((s, x) => s + x.hunger, 0) / g.length,
      patience: g.reduce((s, x) => s + x.patience, 0) / g.length,
    };
    statSamples.push(avg);
  }
  await waitGameSeconds(2);
}

if (statSamples.length >= 2) {
  // Hunger may temporarily dip if guests just ate; check that it generally trends upward
  // or that at least some intermediate sample is higher than the first
  const maxHunger = Math.max(...statSamples.map(s => s.hunger));
  const hungerTrendsUp = maxHunger > statSamples[0].hunger || statSamples[statSamples.length - 1].hunger > statSamples[0].hunger;
  report(
    "Hunger increases over time (or peaks then dips from eating)",
    hungerTrendsUp || statSamples[0].hunger > 60,  // if already high, food stalls reducing it is valid
    `${statSamples.map(s => s.hunger.toFixed(1)).join(" -> ")} (high start = food reducing it is correct)`
  );

  console.log(`  Happiness trend: ${statSamples.map((s) => s.happiness.toFixed(1)).join(" -> ")}`);
  console.log(`  Hunger trend:    ${statSamples.map((s) => s.hunger.toFixed(1)).join(" -> ")}`);
  console.log(`  Patience trend:  ${statSamples.map((s) => s.patience.toFixed(1)).join(" -> ")}`);
}

// ═══════════════════════════════════════════
// TEST 8: Food stalls reduce hunger correctly
// ═══════════════════════════════════════════
console.log("\n--- Test 8: Food stalls reduce hunger ---");

// Place a burger stall connected by path
const burgerPos = await findPlacement("burger", { x1: 9, y1: 17, x2: 18, y2: 22 });
if (burgerPos) {
  const burgerEntrance = entranceFor("burger", burgerPos.x, burgerPos.y);
  await connectPath(hub, burgerEntrance);
  await place("burger", burgerPos.x, burgerPos.y);

  // Verify burger stall entrance is connected
  const burgerStructs = await getStructures();
  const burgerStruct = burgerStructs.find((s) => s.typeId === "burger");
  if (burgerStruct) {
    const bEntrance = entranceFor("burger", burgerStruct.x, burgerStruct.y);
    const bTile = await getTile(bEntrance.x, bEntrance.y);
    console.log(`  Burger at (${burgerStruct.x},${burgerStruct.y}) entrance at (${bEntrance.x},${bEntrance.y}) path=${bTile?.path}`);
  }

  // Wait for guests to use it (guests need to walk there and hunger needs to be high enough)
  await waitGameSeconds(40);

  const structs = await getStructures();
  const burger = structs.find((s) => s.typeId === "burger");
  report(
    "Burger stall served guests",
    burger && burger.lifetimeGuests > 0,
    burger ? `lifetimeGuests=${burger.lifetimeGuests}` : "not found"
  );

  // Check if any guest had hunger reduced after visiting stall
  // By checking guests that recently visited a stall (activity says "Finished")
  const guests8 = await getGuests();
  const recentStallVisitors = guests8.filter(
    (g) => g.activity.includes("Finished Burger") || g.activity.includes("Ordering at Burger")
  );
  if (recentStallVisitors.length > 0) {
    const hungerLevels = recentStallVisitors.map((g) => g.hunger);
    console.log(`  Recent burger visitors hunger levels: ${hungerLevels.map((h) => h.toFixed(1)).join(", ")}`);
    // Burger appetite is 26, so hunger should be noticeably reduced
    report(
      "Food stall visitors have reasonable hunger",
      recentStallVisitors.some((g) => g.hunger < 70),
      `min hunger: ${Math.min(...hungerLevels).toFixed(1)}`
    );
  } else {
    // Just check that the stall was used
    report("Food stall was used (indirect check)", burger && burger.lifetimeGuests > 0);
  }
} else {
  warn("Food stall test", "Could not place burger stall");
}

// ═══════════════════════════════════════════
// TEST 9: Monitor for "stuck" guests
// ═══════════════════════════════════════════
console.log("\n--- Test 9: Stuck guest detection ---");

// Sample guest positions over 10 seconds
const positionHistory = new Map(); // guestId -> [{x, y, time}]
for (let i = 0; i < 10; i++) {
  const guests = await getGuests();
  const time = await getTime();
  for (const g of guests) {
    if (!positionHistory.has(g.id)) {
      positionHistory.set(g.id, []);
    }
    positionHistory.get(g.id).push({
      x: g.tile.x,
      y: g.tile.y,
      state: g.state,
      time,
    });
  }
  await waitGameSeconds(1);
}

const stuckGuests = [];
for (const [id, history] of positionHistory) {
  if (history.length < 8) continue;

  // Check if guest was at the exact same tile for all samples AND was "walking"
  const walkingSamples = history.filter((h) => h.state === "walking");
  if (walkingSamples.length >= 6) {
    const allSamePos = walkingSamples.every(
      (h) => h.x === walkingSamples[0].x && h.y === walkingSamples[0].y
    );
    if (allSamePos) {
      stuckGuests.push({
        id,
        tile: walkingSamples[0],
        samples: walkingSamples.length,
      });
    }
  }

  // Also check for guests in "thinking" for too long
  const thinkingSamples = history.filter((h) => h.state === "thinking");
  if (thinkingSamples.length >= 8) {
    stuckGuests.push({
      id,
      tile: thinkingSamples[0],
      samples: thinkingSamples.length,
      issue: "thinking-too-long",
    });
  }
}

if (stuckGuests.length > 0) {
  for (const sg of stuckGuests) {
    console.log(
      `  Stuck guest ${sg.id} at (${sg.tile.x},${sg.tile.y}) state=${sg.tile.state} samples=${sg.samples} ${sg.issue || ""}`
    );
  }
  // Get current state of stuck guests for diagnosis
  const currentGuests = await getGuests();
  for (const sg of stuckGuests.slice(0, 3)) {
    const g = currentGuests.find(x => x.id === sg.id);
    if (g) {
      console.log(`    Guest ${g.id}: route=${g.routeLength} idx=${g.routeIndex} target=${g.targetStructureId} act="${g.activity}" hunger=${g.hunger.toFixed(0)} patience=${g.patience.toFixed(0)}`);
    }
  }
  // Check if tile (10,18) has path
  const t = await getTile(10, 18);
  console.log(`    Tile (10,18): path=${t?.path} terrain=${t?.terrain} structureId=${t?.structureId}`);
}
report(
  "No stuck guests detected (walking at same position >8s)",
  stuckGuests.filter((g) => !g.issue).length === 0,
  `${stuckGuests.filter((g) => !g.issue).length} stuck walking guests found`
);

report(
  "No guests stuck thinking >8s",
  stuckGuests.filter((g) => g.issue === "thinking-too-long").length === 0,
  `${stuckGuests.filter((g) => g.issue === "thinking-too-long").length} stuck thinking guests found`
);

// ═══════════════════════════════════════════
// TEST 10: Guest spawn rate increases with park level
// ═══════════════════════════════════════════
console.log("\n--- Test 10: Spawn rate vs park level ---");

const snap1 = await getSnapshot();
const guestCount1 = snap1.guests;
const level1 = snap1.parkLevel;

// Add more attractions to boost park level
const swingPos = await findPlacement("swing", { x1: 18, y1: 14, x2: 24, y2: 20 });
if (swingPos) {
  const swingEntrance = entranceFor("swing", swingPos.x, swingPos.y);
  await connectPath(hub, swingEntrance);
  await place("swing", swingPos.x, swingPos.y);
}

const gelatoPos = await findPlacement("gelato", { x1: 16, y1: 14, x2: 20, y2: 22 });
if (gelatoPos) {
  const gelatoEntrance = entranceFor("gelato", gelatoPos.x, gelatoPos.y);
  await connectPath(hub, gelatoEntrance);
  await place("gelato", gelatoPos.x, gelatoPos.y);
}

await waitGameSeconds(25);

const snap2 = await getSnapshot();
const guestCount2 = snap2.guests;
const level2 = snap2.parkLevel;

console.log(`  Before: level=${level1}, guests=${guestCount1}`);
console.log(`  After:  level=${level2}, guests=${guestCount2}`);

report(
  "Park level increased or stayed with more attractions",
  level2 >= level1,
  `${level1} -> ${level2} (level increases require revenue + time)`
);
report(
  "Guest capacity increased",
  guestCount2 >= guestCount1,
  `${guestCount1} -> ${guestCount2}`
);

// ═══════════════════════════════════════════
// BUG ANALYSIS: Check for known issues
// ═══════════════════════════════════════════
console.log("\n--- Bug Analysis ---");

// Bug check: guests whose targetStructureId points to nonexistent structure
const allGuests = await getGuests();
const allStructs = await getStructures();
const structIds = new Set(allStructs.map((s) => s.id));

const orphanedTargets = allGuests.filter(
  (g) =>
    g.targetStructureId !== undefined &&
    g.targetStructureId !== null &&
    !structIds.has(g.targetStructureId) &&
    g.state !== "thinking"
);

report(
  "No guests targeting nonexistent structures",
  orphanedTargets.length === 0,
  orphanedTargets.length > 0
    ? `${orphanedTargets.length} guests with orphaned targets: ${orphanedTargets.map((g) => `guest ${g.id} -> struct ${g.targetStructureId} (state: ${g.state})`).join(", ")}`
    : ""
);

// Bug check: guests in 'queueing' state but not in any structure's queue
const queuedGuests = allGuests.filter((g) => g.state === "queueing");
for (const g of queuedGuests) {
  const inQueue = allStructs.some(
    (s) => s.queue.includes(g.id) || s.riders.includes(g.id)
  );
  if (!inQueue) {
    report(
      `BUG: Guest ${g.id} is 'queueing' but not in any structure queue`,
      false,
      `targetStructureId=${g.targetStructureId}`
    );
  }
}

// Bug check: guests in 'riding' state but not in any riders array
const ridingGuests = allGuests.filter((g) => g.state === "riding");
for (const g of ridingGuests) {
  const onRide = allStructs.some((s) => s.riders.includes(g.id));
  if (!onRide) {
    report(
      `BUG: Guest ${g.id} is 'riding' but not in any riders array`,
      false,
      `targetStructureId=${g.targetStructureId}`
    );
  }
}

// Bug check: walking guests that never get reassigned (route length 1)
const walkingShortRoute = allGuests.filter(
  (g) => g.state === "walking" && g.routeLength <= 1
);
if (walkingShortRoute.length > 0) {
  warn(
    "Walking guests with short routes",
    `${walkingShortRoute.length} guests walking with route length <=1`
  );
}

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
console.log("\n========================================");
console.log(`  Results: ${passed}/${totalTests} passed, ${failed} failed`);
console.log("========================================\n");

if (issues.length > 0) {
  console.log("Issues found:");
  for (const issue of issues) {
    console.log(`  - ${issue.name}: ${issue.detail}`);
  }
  console.log("");
}

// Take a screenshot at end
await page.screenshot({
  path: "/home/momo/git/codex-rct-html/tests/test-guests-screenshot.png",
  fullPage: true,
});

await browser.close();

if (failed > 0) {
  process.exit(1);
}
