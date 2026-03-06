import { chromium } from "playwright";

const url = process.env.PLAYTEST_URL ?? "http://127.0.0.1:4173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

async function getDebug() {
  return page.evaluate(() => window.__parkGameDebug);
}

async function tilePoint(x, y) {
  return page.evaluate(
    ([tx, ty]) => window.__parkGameDebug.tileToClickPoint(tx, ty),
    [x, y]
  );
}

async function clickTile(x, y) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas not found");
  }
  const point = await tilePoint(x, y);
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function paintPath(points) {
  await page.evaluate(() => window.__parkGameDebug.setTool("path"));
  for (const [x, y] of points) {
    await clickTile(x, y);
  }
}

async function place(tool, x, y) {
  await page.evaluate((toolId) => window.__parkGameDebug.setTool(toolId), tool);
  await clickTile(x, y);
}

async function canPlace(type, x, y) {
  return page.evaluate(
    ([tool, tx, ty]) => window.__parkGameDebug.canPlaceStructure(tool, tx, ty),
    [type, x, y]
  );
}

async function findPlacement(type, bounds) {
  for (let y = bounds.y1; y <= bounds.y2; y += 1) {
    for (let x = bounds.x1; x <= bounds.x2; x += 1) {
      if (await canPlace(type, x, y)) {
        return { x, y };
      }
    }
  }
  throw new Error(`No placement found for ${type}`);
}

function entranceFor(type, x, y) {
  const footprints = {
    carousel: { x: 2, y: 2 },
    ferris: { x: 3, y: 3 },
    coaster: { x: 4, y: 3 },
    swing: { x: 2, y: 2 },
    burger: { x: 2, y: 1 },
    gelato: { x: 1, y: 1 },
    coffee: { x: 2, y: 1 }
  };
  const footprint = footprints[type];
  return { x: x + Math.floor(footprint.x / 2), y: y + footprint.y };
}

async function connectPath(from, to) {
  const points = [];
  const stepX = from.x <= to.x ? 1 : -1;
  const stepY = from.y <= to.y ? 1 : -1;

  for (let x = from.x; x !== to.x; x += stepX) {
    points.push([x, from.y]);
  }
  points.push([to.x, from.y]);
  for (let y = from.y; y !== to.y; y += stepY) {
    points.push([to.x, y]);
  }
  points.push([to.x, to.y]);
  await paintPath(points);
}

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.__parkGameDebug));
await page.click('[data-tool="inspect"]');
await page.waitForSelector('[data-tool="inspect"].active');
await page.click('[data-tool="path"]');
await page.waitForSelector('[data-tool="path"].active');

const hub = { x: 14, y: 21 };
const carousel = await findPlacement("carousel", { x1: 8, y1: 15, x2: 17, y2: 19 });
const burger = await findPlacement("burger", { x1: 9, y1: 17, x2: 13, y2: 20 });
const ferris = await findPlacement("ferris", { x1: 18, y1: 12, x2: 23, y2: 17 });

await connectPath(hub, entranceFor("carousel", carousel.x, carousel.y));
await connectPath(hub, entranceFor("burger", burger.x, burger.y));
await connectPath(hub, entranceFor("ferris", ferris.x, ferris.y));

await place("carousel", carousel.x, carousel.y);
await place("burger", burger.x, burger.y);
await place("ferris", ferris.x, ferris.y);
await place("tree", hub.x + 3, hub.y - 1);
await place("tree", hub.x + 4, hub.y - 1);
await place("flower", hub.x - 4, hub.y - 1);
await place("bin", hub.x - 1, hub.y);
await place("lamp", hub.x + 1, hub.y);

await page.keyboard.down("d");
await page.waitForTimeout(280);
await page.keyboard.up("d");
await page.mouse.wheel(0, -320);

await page.waitForTimeout(12000);

const coffee = await findPlacement("coffee", { x1: 9, y1: 12, x2: 15, y2: 16 });
const swing = await findPlacement("swing", { x1: 21, y1: 8, x2: 25, y2: 13 });
const gelato = await findPlacement("gelato", { x1: 16, y1: 14, x2: 18, y2: 17 });

await connectPath(hub, entranceFor("coffee", coffee.x, coffee.y));
await connectPath(hub, entranceFor("swing", swing.x, swing.y));
await connectPath(hub, entranceFor("gelato", gelato.x, gelato.y));

await place("coffee", coffee.x, coffee.y);
await place("swing", swing.x, swing.y);
await place("gelato", gelato.x, gelato.y);
await place("fountain", hub.x + 5, hub.y - 4);
await place("bench", hub.x, hub.y);

await page.click('[data-tool="erase"]');
await clickTile(10, 20);
await place("flower", 10, 20);

await page.waitForTimeout(18000);

const snapshot = await page.evaluate(() => window.__parkGameDebug.getSnapshot());
const eventLog = await page.evaluate(() => window.__parkGameDebug.eventLog());
console.log(JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify(eventLog, null, 2));

if (snapshot.attractions < 5 || snapshot.rideCount < 3 || snapshot.guests < 6) {
  throw new Error(`Playtest expectations not met: ${JSON.stringify(snapshot)}`);
}

await page.screenshot({ path: "playtest-shot.png", fullPage: true });
await browser.close();
