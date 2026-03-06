type TerrainType = "grass" | "water";
type ToolId =
  | "inspect"
  | "path"
  | "erase"
  | "grass"
  | "water"
  | "carousel"
  | "ferris"
  | "coaster"
  | "swing"
  | "burger"
  | "gelato"
  | "coffee"
  | "tree"
  | "flower"
  | "fountain"
  | "bench"
  | "bin"
  | "lamp";
type StructureTypeId = "carousel" | "ferris" | "coaster" | "swing" | "burger" | "gelato" | "coffee";
type SceneryTypeId = "tree" | "flower" | "fountain" | "bench" | "bin" | "lamp";
type ToolCategory = "Park Ops" | "Terrain" | "Rides" | "Food" | "Scenery";
type GuestState = "walking" | "queueing" | "riding" | "thinking";

interface Point {
  x: number;
  y: number;
}

interface Tile {
  terrain: TerrainType;
  path: boolean;
  sceneryId?: SceneryTypeId;
  structureId?: number;
  litter: number;
}

interface ToolDef {
  id: ToolId;
  label: string;
  cost: number;
  category: ToolCategory;
  description: string;
}

interface StructureConfig {
  id: StructureTypeId;
  label: string;
  category: "ride" | "stall";
  cost: number;
  upkeep: number;
  ticketPrice: number;
  footprint: Point;
  capacity: number;
  cycleTime: number;
  excitement: number;
  appetite: number;
  palette: [string, string, string];
}

interface SceneryConfig {
  id: SceneryTypeId;
  label: string;
  cost: number;
  beauty: number;
  binPower?: number;
  glow?: boolean;
}

interface StructureInstance {
  id: number;
  typeId: StructureTypeId;
  x: number;
  y: number;
  queue: number[];
  riders: number[];
  cycle: number;
  lifetimeGuests: number;
  lifetimeRevenue: number;
  status: "idle" | "boarding" | "running";
}

interface Guest {
  id: number;
  tile: Point;
  screenOffset: Point;
  route: Point[];
  routeIndex: number;
  speed: number;
  state: GuestState;
  targetStructureId?: number;
  waitTimer: number;
  rideTimer: number;
  queueSlot: number;
  hunger: number;
  excitement: number;
  patience: number;
  happiness: number;
  activity: string;
  color: string;
  lastDecision: number;
  ridesTaken: number;
}

interface SelectionState {
  type: "tile" | "structure" | "scenery" | null;
  x?: number;
  y?: number;
  structureId?: number;
}

interface Snapshot {
  money: number;
  guests: number;
  attractions: number;
  rideCount: number;
  pathTiles: number;
  cleanliness: number;
  happiness: number;
  parkLevel: number;
  activeQueues: number;
  statusSummary: string[];
}

const ART_ASSET_URLS = {
  grassTexture: "/theme-park/grass-texture.png",
  waterTexture: "/theme-park/water-texture.png",
  pathTexture: "/theme-park/path-texture.png",
  shellBackdrop: "/theme-park/shell-backdrop.png"
} as const;

type ArtAssetId = keyof typeof ART_ASSET_URLS;

const GRID_W = 28;
const GRID_H = 28;
const TILE_W = 68;
const TILE_H = 34;
const BASE_SPAWN = { x: Math.floor(GRID_W / 2), y: GRID_H - 4 };

const TOOLS: ToolDef[] = [
  { id: "inspect", label: "Inspect", cost: 0, category: "Park Ops", description: "Review tile, guest, and ride details." },
  { id: "path", label: "Stone Path", cost: 6, category: "Park Ops", description: "Paint walkways that connect your park together." },
  { id: "erase", label: "Remove", cost: 0, category: "Park Ops", description: "Clear paths, scenery, or attractions with a refund." },
  { id: "grass", label: "Meadow", cost: 5, category: "Terrain", description: "Restore grassy terrain tiles." },
  { id: "water", label: "Water", cost: 10, category: "Terrain", description: "Paint decorative ponds and canals." },
  { id: "carousel", label: "Carousel", cost: 420, category: "Rides", description: "A cozy centerpiece that lifts spirits quickly." },
  { id: "ferris", label: "Sky Wheel", cost: 620, category: "Rides", description: "Slow panoramic ride with excellent park appeal." },
  { id: "coaster", label: "Comet Coaster", cost: 960, category: "Rides", description: "High excitement draw with bigger upkeep." },
  { id: "swing", label: "Star Swing", cost: 560, category: "Rides", description: "Fast-loading thrill ride for compact spaces." },
  { id: "burger", label: "Burger Bar", cost: 150, category: "Food", description: "Reliable snack income that calms hungry guests." },
  { id: "gelato", label: "Gelato Cart", cost: 140, category: "Food", description: "Quick treat stall with low operating cost." },
  { id: "coffee", label: "Coffee Corner", cost: 165, category: "Food", description: "Boosts patient guests and adds park charm." },
  { id: "tree", label: "Canopy Tree", cost: 18, category: "Scenery", description: "Softens plazas and increases nearby happiness." },
  { id: "flower", label: "Flower Bed", cost: 14, category: "Scenery", description: "Bright accent planting for paths and plazas." },
  { id: "fountain", label: "Fountain", cost: 78, category: "Scenery", description: "A visual focal point that improves park appeal." },
  { id: "bench", label: "Bench", cost: 24, category: "Scenery", description: "Helps guests rest and wait more comfortably." },
  { id: "bin", label: "Litter Bin", cost: 20, category: "Scenery", description: "Reduces nearby trash buildup." },
  { id: "lamp", label: "Lantern", cost: 26, category: "Scenery", description: "Adds glow and polish to walkways." }
];

const STRUCTURES: Record<StructureTypeId, StructureConfig> = {
  carousel: {
    id: "carousel",
    label: "Carousel",
    category: "ride",
    cost: 420,
    upkeep: 1.4,
    ticketPrice: 18,
    footprint: { x: 2, y: 2 },
    capacity: 4,
    cycleTime: 10,
    excitement: 16,
    appetite: 0,
    palette: ["#f6db76", "#de6b5f", "#54a8b0"]
  },
  ferris: {
    id: "ferris",
    label: "Sky Wheel",
    category: "ride",
    cost: 620,
    upkeep: 1.9,
    ticketPrice: 24,
    footprint: { x: 3, y: 3 },
    capacity: 6,
    cycleTime: 14,
    excitement: 21,
    appetite: 0,
    palette: ["#7bc0e0", "#255f85", "#f4ead7"]
  },
  coaster: {
    id: "coaster",
    label: "Comet Coaster",
    category: "ride",
    cost: 960,
    upkeep: 2.8,
    ticketPrice: 34,
    footprint: { x: 4, y: 3 },
    capacity: 7,
    cycleTime: 12,
    excitement: 28,
    appetite: 0,
    palette: ["#ee8052", "#7440b1", "#f7d47d"]
  },
  swing: {
    id: "swing",
    label: "Star Swing",
    category: "ride",
    cost: 560,
    upkeep: 1.6,
    ticketPrice: 22,
    footprint: { x: 2, y: 2 },
    capacity: 5,
    cycleTime: 8,
    excitement: 18,
    appetite: 0,
    palette: ["#5d8fcb", "#f1c453", "#f5f1eb"]
  },
  burger: {
    id: "burger",
    label: "Burger Bar",
    category: "stall",
    cost: 150,
    upkeep: 0.7,
    ticketPrice: 12,
    footprint: { x: 2, y: 1 },
    capacity: 2,
    cycleTime: 4,
    excitement: 4,
    appetite: 26,
    palette: ["#e7a45e", "#c4553c", "#f8edd9"]
  },
  gelato: {
    id: "gelato",
    label: "Gelato Cart",
    category: "stall",
    cost: 140,
    upkeep: 0.5,
    ticketPrice: 11,
    footprint: { x: 1, y: 1 },
    capacity: 1,
    cycleTime: 3,
    excitement: 3,
    appetite: 18,
    palette: ["#8dd4c2", "#f06da3", "#f8f3e8"]
  },
  coffee: {
    id: "coffee",
    label: "Coffee Corner",
    category: "stall",
    cost: 165,
    upkeep: 0.7,
    ticketPrice: 13,
    footprint: { x: 2, y: 1 },
    capacity: 2,
    cycleTime: 4,
    excitement: 5,
    appetite: 14,
    palette: ["#8d6748", "#f0d17b", "#f8f0e6"]
  }
};

const SCENERY: Record<SceneryTypeId, SceneryConfig> = {
  tree: { id: "tree", label: "Canopy Tree", cost: 18, beauty: 8 },
  flower: { id: "flower", label: "Flower Bed", cost: 14, beauty: 5 },
  fountain: { id: "fountain", label: "Fountain", cost: 78, beauty: 12 },
  bench: { id: "bench", label: "Bench", cost: 24, beauty: 4 },
  bin: { id: "bin", label: "Litter Bin", cost: 20, beauty: 1, binPower: 1.2 },
  lamp: { id: "lamp", label: "Lantern", cost: 26, beauty: 4, glow: true }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rand(seed: number): number {
  const x = Math.sin(seed * 143.913) * 43758.5453;
  return x - Math.floor(x);
}

function choice<T>(items: T[], weights: number[], seed: number): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = rand(seed) * total;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) {
      return items[index];
    }
  }
  return items[items.length - 1];
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function getTool(id: ToolId): ToolDef {
  const tool = TOOLS.find((entry) => entry.id === id);
  if (!tool) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return tool;
}

function getStructureTool(id: StructureTypeId): ToolDef {
  return getTool(id);
}

function getSceneryTool(id: SceneryTypeId): ToolDef {
  return getTool(id);
}

function buildIconSvg(id: ToolId): string {
  const stroke = "#305045";
  const fill = "#f6eddc";
  const accent = "#de7c42";
  const accent2 = "#50a691";

  const paths: Record<string, string> = {
    inspect: `<circle cx="12" cy="12" r="4.5" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><path d="M15.5 15.5 20 20" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>`,
    path: `<path d="M4 14 12 6l8 8-8 8Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><path d="M7 14h10" stroke="${accent}" stroke-width="1.8" stroke-linecap="round"/>`,
    erase: `<path d="M4 15 10 7h8l2 5-8 7Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><path d="M7 17h7" stroke="${accent}" stroke-width="1.8" stroke-linecap="round"/>`,
    grass: `<path d="M6 19c2-7 5-10 6-14 1 3 2 5 2 9 1-4 4-7 6-9-1 7-1 10 2 14" fill="none" stroke="${accent2}" stroke-width="1.9" stroke-linecap="round"/>`,
    water: `<path d="M4 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" fill="none" stroke="${accent2}" stroke-width="1.8" stroke-linecap="round"/><path d="M6 18c2-2 4-2 6 0s4 2 6 0" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/>`,
    carousel: `<circle cx="12" cy="12" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><path d="M7 10h10M12 5v14" stroke="${accent}" stroke-width="1.8"/><path d="M8 7h8l-4-3Z" fill="${accent2}" stroke="${stroke}" stroke-width="1.2"/>`,
    ferris: `<circle cx="12" cy="12" r="7" fill="none" stroke="${stroke}" stroke-width="1.8"/><path d="M12 5v14M5 12h14M7 7l10 10M17 7 7 17" stroke="${accent2}" stroke-width="1.5"/><path d="M9 20h6l2-5H7Z" fill="${accent}" stroke="${stroke}" stroke-width="1.2"/>`,
    coaster: `<path d="M4 18c2-7 5-10 8-10s6 3 8 10" fill="none" stroke="${accent}" stroke-width="1.8"/><path d="M5 18h14" stroke="${stroke}" stroke-width="1.6"/><circle cx="13" cy="10" r="2" fill="${accent2}"/>`,
    swing: `<path d="M7 19 12 5l5 14" fill="none" stroke="${stroke}" stroke-width="1.8"/><path d="M9 12c1 2 5 2 6 0" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="16" r="1.3" fill="${accent2}"/><circle cx="15" cy="16" r="1.3" fill="${accent2}"/>`,
    burger: `<path d="M6 10c1-3 3-4 6-4s5 1 6 4" fill="${accent3()}" stroke="${stroke}" stroke-width="1.4"/><path d="M6 14h12" stroke="${accent}" stroke-width="2.2" stroke-linecap="round"/><path d="M7 17h10" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`,
    gelato: `<path d="M12 17 9 9h6Z" fill="${accent}" stroke="${stroke}" stroke-width="1.4"/><circle cx="10" cy="8.5" r="2.2" fill="${accent2}"/><circle cx="14" cy="8.5" r="2.2" fill="#f28cb4"/>`,
    coffee: `<path d="M7 8h8a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H9a2 2 0 0 1-2-2Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><path d="M8 6c0-2 1-3 2-4M12 6c0-2 1-3 2-4" stroke="${accent}" stroke-width="1.4" stroke-linecap="round"/>`,
    tree: `<path d="M12 20v-5" stroke="${stroke}" stroke-width="1.8"/><circle cx="12" cy="10" r="6" fill="${accent2}" stroke="${stroke}" stroke-width="1.4"/>`,
    flower: `<circle cx="12" cy="12" r="2" fill="${accent}"/><circle cx="9" cy="10" r="2" fill="${accent2}"/><circle cx="15" cy="10" r="2" fill="#f2b84e"/><circle cx="9" cy="14" r="2" fill="#f28cb4"/><circle cx="15" cy="14" r="2" fill="#7bc0e0"/>`,
    fountain: `<circle cx="12" cy="16" r="5" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/><path d="M12 16V6" stroke="${accent2}" stroke-width="1.7" stroke-linecap="round"/><path d="M9 10c1 2 5 2 6 0" fill="none" stroke="${accent2}" stroke-width="1.4"/>`,
    bench: `<path d="M6 14h12M8 10h8M8 14v4M16 14v4" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`,
    bin: `<path d="M8 9h8l-1 10H9Z" fill="${accent2}" stroke="${stroke}" stroke-width="1.4"/><path d="M7 9h10" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`,
    lamp: `<path d="M12 19V7" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/><path d="M9 8h6l-1.5 4h-3Z" fill="${accent3()}" stroke="${stroke}" stroke-width="1.2"/>`
  };

  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${paths[id]}</svg>`;
}

function accent3(): string {
  return "#f1c453";
}

function structureEntrance(structure: StructureInstance): Point {
  const config = STRUCTURES[structure.typeId];
  return {
    x: structure.x + Math.floor(config.footprint.x / 2),
    y: structure.y + config.footprint.y
  };
}

export class ThemeParkGame {
  private root: HTMLElement;
  private shell: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private leftPanel!: HTMLDivElement;
  private rightPanel!: HTMLDivElement;
  private topBar!: HTMLDivElement;
  private bottomStrip!: HTMLDivElement;
  private artAssets: Partial<Record<ArtAssetId, HTMLImageElement>> = {};
  private tiles: Tile[][] = [];
  private structures = new Map<number, StructureInstance>();
  private guests = new Map<number, Guest>();
  private guestCounter = 0;
  private structureCounter = 0;
  private selectedTool: ToolId = "path";
  private selection: SelectionState = { type: null };
  private camera = { x: 0, y: 0, zoom: 0.9, targetX: 0, targetY: 0, targetZoom: 0.9 };
  private pointerDown = false;
  private panMode = false;
  private lastPointer = { x: 0, y: 0 };
  private hoverTile: Point | null = null;
  private paintAppliedAt = "";
  private money = 3400;
  private dailyRevenue = 0;
  private guestSpawnTimer = 0;
  private guestsServed = 0;
  private lifetimeRevenue = 0;
  private parkGrowth = 0;
  private eventLog = [
    "The gates are open. Lay down paths to guide your first guests.",
    "Scenery boosts charm while bins protect cleanliness.",
    "Rides need a path to their entrance tile before guests can queue."
  ];
  private time = 0;
  private lastFrame = performance.now();
  private keys = new Set<string>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.shell = document.createElement("div");
    this.shell.className = "game-shell";
    this.loadArtAssets();

    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }
    this.ctx = context;

    this.shell.append(this.canvas);
    this.root.append(this.shell);

    this.buildUi();
    this.createWorld();
    this.bindEvents();
    this.resize();
    this.updateUi();
    this.publishDebugApi();
    requestAnimationFrame(this.frame);
  }

  private buildUi(): void {
    this.topBar = document.createElement("div");
    this.topBar.className = "top-bar";

    this.leftPanel = document.createElement("div");
    this.leftPanel.className = "left-panel";

    this.rightPanel = document.createElement("div");
    this.rightPanel.className = "right-panel";

    this.bottomStrip = document.createElement("div");
    this.bottomStrip.className = "bottom-strip";

    this.shell.append(this.topBar, this.leftPanel, this.rightPanel, this.bottomStrip);
  }

  private loadArtAssets(): void {
    for (const [id, url] of Object.entries(ART_ASSET_URLS) as Array<[ArtAssetId, string]>) {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      this.artAssets[id] = image;
    }
  }

  private getArtAsset(id: ArtAssetId): HTMLImageElement | null {
    const image = this.artAssets[id];
    if (!image || !image.complete || image.naturalWidth === 0) {
      return null;
    }
    return image;
  }

  private drawTexturedShape(
    ctx: CanvasRenderingContext2D,
    shape: Path2D,
    image: HTMLImageElement,
    seedX: number,
    seedY: number,
    bounds: { x: number; y: number; width: number; height: number },
    alpha: number,
    driftY = 0
  ): void {
    const sample = Math.max(160, Math.min(image.width, image.height, 320));
    const maxX = Math.max(1, image.width - sample);
    const maxY = Math.max(1, image.height - sample);
    const sx = Math.floor(rand(seedX * 17 + seedY * 31 + 3) * maxX);
    const sy = Math.floor(rand(seedX * 47 + seedY * 19 + 7) * maxY);

    ctx.save();
    ctx.clip(shape);
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, sx, sy, sample, sample, bounds.x, bounds.y + driftY, bounds.width, bounds.height);
    ctx.restore();
  }

  private publishDebugApi(): void {
    (window as Window & { __parkGameDebug?: unknown }).__parkGameDebug = {
      getSnapshot: () => this.getSnapshot(),
      tileToScreen: (x: number, y: number) => this.tileToScreen({ x, y }),
      tileToClickPoint: (x: number, y: number) => {
        const point = this.tileToScreen({ x, y });
        return { x: point.x, y: point.y + TILE_H * 0.58 * this.camera.zoom };
      },
      clickTile: (x: number, y: number) => this.placeAtTile(x, y),
      getTile: (x: number, y: number) => this.getTileDebug(x, y),
      canPlaceStructure: (typeId: StructureTypeId, x: number, y: number) => this.canPlaceStructure(typeId, x, y),
      eventLog: () => [...this.eventLog],
      setTool: (toolId: ToolId) => {
        this.selectedTool = toolId;
        this.updateUi();
      }
    };
  }

  private createWorld(): void {
    this.tiles = Array.from({ length: GRID_H }, (_, y) =>
      Array.from({ length: GRID_W }, (_, x) => {
        const lake = Math.hypot(x - 5.5, y - 7.5) < 3.2 || (x < 5 && y < 9 && rand(x * 9 + y * 11) > 0.74);
        const tile: Tile = {
          terrain: lake ? "water" : "grass",
          path: false,
          litter: 0
        };

        if (!lake && rand((x + 10) * 17 + (y + 2) * 13) > 0.83) {
          tile.sceneryId = rand(x * 44 + y * 97) > 0.52 ? "tree" : "flower";
        }

        return tile;
      })
    );

    for (let y = GRID_H - 7; y < GRID_H - 1; y += 1) {
      for (let x = BASE_SPAWN.x - 2; x <= BASE_SPAWN.x + 2; x += 1) {
        this.tiles[y][x].terrain = "grass";
        this.tiles[y][x].path = true;
        this.tiles[y][x].sceneryId = undefined;
      }
    }

    for (let y = GRID_H - 7; y < GRID_H - 4; y += 1) {
      this.tiles[y][BASE_SPAWN.x - 3].path = true;
      this.tiles[y][BASE_SPAWN.x + 3].path = true;
    }

    this.tiles[GRID_H - 5][BASE_SPAWN.x - 1].sceneryId = "lamp";
    this.tiles[GRID_H - 5][BASE_SPAWN.x + 1].sceneryId = "lamp";
    this.tiles[GRID_H - 3][BASE_SPAWN.x - 4].sceneryId = "tree";
    this.tiles[GRID_H - 3][BASE_SPAWN.x + 4].sceneryId = "tree";
    this.tiles[GRID_H - 3][BASE_SPAWN.x].sceneryId = "fountain";

    this.camera.targetX = this.width * 0.5;
    this.camera.targetY = this.height * 0.16;
    this.camera.x = this.camera.targetX;
    this.camera.y = this.camera.targetY;
  }

  private bindEvents(): void {
    window.addEventListener("resize", this.resize);

    this.canvas.addEventListener("pointerdown", (event) => {
      this.pointerDown = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.panMode = event.button === 1 || event.button === 2 || event.altKey;
      this.canvas.setPointerCapture(event.pointerId);

      if (!this.panMode && event.button === 0) {
        const tile = this.eventToTile(event);
        if (tile) {
          this.placeAtTile(tile.x, tile.y);
        }
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      const tile = this.eventToTile(event);
      this.hoverTile = tile;
      if (!this.pointerDown) {
        return;
      }

      if (this.panMode) {
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        this.camera.targetX += dx;
        this.camera.targetY += dy;
        this.lastPointer = { x: event.clientX, y: event.clientY };
        return;
      }

      if (event.buttons === 1 && tile && (this.selectedTool === "path" || this.selectedTool === "erase" || this.selectedTool === "water" || this.selectedTool === "grass")) {
        this.placeAtTile(tile.x, tile.y);
      }
    });

    this.canvas.addEventListener("pointerup", () => {
      this.pointerDown = false;
      this.panMode = false;
      this.paintAppliedAt = "";
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const zoomDelta = event.deltaY > 0 ? -0.08 : 0.08;
      this.camera.targetZoom = clamp(this.camera.targetZoom + zoomDelta, 0.5, 1.45);
    }, { passive: false });

    window.addEventListener("keydown", (event) => {
      this.keys.add(event.key.toLowerCase());
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
  }

  private resize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * devicePixelRatio);
    this.canvas.height = Math.floor(this.height * devicePixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    if (!this.camera.x && !this.camera.y) {
      this.camera.targetX = this.width * 0.5;
      this.camera.targetY = this.height * 0.16;
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
    }
  };

  private frame = (now: number): void => {
    const dt = Math.min(0.033, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;
    this.time += dt;
    this.update(dt);
    this.render();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const cameraSpeed = 700 * dt;
    if (this.keys.has("a") || this.keys.has("arrowleft")) {
      this.camera.targetX += cameraSpeed;
    }
    if (this.keys.has("d") || this.keys.has("arrowright")) {
      this.camera.targetX -= cameraSpeed;
    }
    if (this.keys.has("w") || this.keys.has("arrowup")) {
      this.camera.targetY += cameraSpeed;
    }
    if (this.keys.has("s") || this.keys.has("arrowdown")) {
      this.camera.targetY -= cameraSpeed;
    }

    this.camera.x = lerp(this.camera.x, this.camera.targetX, clamp(dt * 7, 0, 1));
    this.camera.y = lerp(this.camera.y, this.camera.targetY, clamp(dt * 7, 0, 1));
    this.camera.zoom = lerp(this.camera.zoom, this.camera.targetZoom, clamp(dt * 10, 0, 1));

    const upkeep = Array.from(this.structures.values()).reduce((sum, structure) => sum + STRUCTURES[structure.typeId].upkeep, 0);
    this.money -= upkeep * dt;

    for (const structure of this.structures.values()) {
      this.updateStructure(structure, dt);
    }

    for (const guest of this.guests.values()) {
      this.updateGuest(guest, dt);
    }

    this.guestSpawnTimer -= dt;
    if (this.guestSpawnTimer <= 0 && this.guests.size < this.maxGuestCapacity()) {
      this.spawnGuest();
      const densityPenalty = Math.max(0, this.guestQueuePressure() - 1.4) * 0.45;
      this.guestSpawnTimer = clamp(4.4 - this.parkLevel() * 0.25 - this.attractionCount() * 0.14 + densityPenalty, 1.2, 5.8);
    }

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const tile = this.tiles[y][x];
        tile.litter = Math.max(0, tile.litter - dt * 0.018 * (1 + this.localBinPower(x, y)));
      }
    }

    this.parkGrowth += dt * (this.averageHappiness() * 0.002 + this.cleanlinessScore() * 0.0015 + this.attractionCount() * 0.04);
    if (Math.floor(this.time) % 5 === 0) {
      this.updateUi();
    }
  }

  private updateStructure(structure: StructureInstance, dt: number): void {
    const config = STRUCTURES[structure.typeId];
    structure.cycle -= dt;

    if (structure.status === "running" && structure.cycle <= 0) {
      structure.status = "idle";
      structure.cycle = 0;
      for (const guestId of structure.riders) {
        const guest = this.guests.get(guestId);
        if (!guest) {
          continue;
        }
        guest.state = "thinking";
        guest.rideTimer = 0.4 + rand(guest.id * 9) * 0.7;
        guest.targetStructureId = undefined;
        guest.queueSlot = 0;
        guest.excitement = clamp(guest.excitement + config.excitement * 0.14, 0, 100);
        guest.hunger = clamp(guest.hunger + 10 + config.excitement * 0.06, 0, 100);
        guest.happiness = clamp(guest.happiness + config.excitement * 0.28, 20, 100);
        guest.activity = `Finished ${config.label}`;
      }
      structure.riders = [];
      this.logEvent(`${config.label} wrapped up a cycle with cheering guests.`);
    }

    if ((structure.status === "idle" || structure.status === "boarding") && structure.queue.length > 0) {
      const batch = structure.queue.splice(0, config.capacity);
      structure.riders = batch;
      structure.status = "running";
      structure.cycle = config.cycleTime;

      for (const guestId of batch) {
        const guest = this.guests.get(guestId);
        if (!guest) {
          continue;
        }
        guest.state = "riding";
        guest.activity = config.category === "ride" ? `Enjoying ${config.label}` : `Ordering at ${config.label}`;
        guest.rideTimer = config.cycleTime;
        guest.waitTimer = 0;
        guest.happiness = clamp(guest.happiness + (config.category === "ride" ? 3 : 1), 0, 100);
        guest.patience = clamp(guest.patience + 8, 10, 100);
        this.money += config.ticketPrice;
        this.dailyRevenue += config.ticketPrice;
        this.lifetimeRevenue += config.ticketPrice;
        structure.lifetimeRevenue += config.ticketPrice;
        this.guestsServed += 1;
        guest.ridesTaken += 1;

        if (config.category === "stall") {
          guest.hunger = clamp(guest.hunger - config.appetite, 0, 100);
          guest.happiness = clamp(guest.happiness + 6, 0, 100);
        }

        const entrance = structureEntrance(structure);
        this.addLitterAround(entrance.x, entrance.y, config.category === "stall" ? 0.48 : 0.2);
      }

      structure.lifetimeGuests += batch.length;
    }
  }

  private updateGuest(guest: Guest, dt: number): void {
    guest.hunger = clamp(guest.hunger + dt * 1.2, 0, 100);
    guest.patience = clamp(guest.patience - dt * (guest.state === "queueing" ? 1.6 : 0.2), 0, 100);
    guest.happiness = clamp(guest.happiness - dt * (this.cleanlinessScore() < 60 ? 0.42 : 0.07), 10, 100);
    guest.happiness = clamp(guest.happiness + this.localBeauty(guest.tile.x, guest.tile.y) * dt * 0.04, 10, 100);

    if (guest.state === "thinking") {
      guest.rideTimer -= dt;
      if (guest.rideTimer <= 0) {
        this.assignDestination(guest);
      }
      return;
    }

    if (guest.state === "queueing") {
      const structure = guest.targetStructureId !== undefined ? this.structures.get(guest.targetStructureId) : undefined;
      if (!structure) {
        guest.state = "thinking";
        guest.rideTimer = 0.2;
        return;
      }
      const index = structure.queue.indexOf(guest.id);
      if (index >= 0) {
        guest.queueSlot = index;
        guest.waitTimer += dt;
        guest.activity = `Queueing for ${STRUCTURES[structure.typeId].label}`;
        if (guest.waitTimer > 10) {
          guest.happiness = clamp(guest.happiness - dt * 0.75, 0, 100);
        }
      }
      return;
    }

    if (guest.state === "riding") {
      guest.rideTimer -= dt;
      return;
    }

    if (guest.hunger > 82 && guest.ridesTaken > 0) {
      const foodOptions = Array.from(this.structures.values()).filter((structure) => STRUCTURES[structure.typeId].category === "stall");
      if (foodOptions.length > 0 && (guest.targetStructureId === undefined || STRUCTURES[this.structures.get(guest.targetStructureId)?.typeId ?? "burger"].category !== "stall")) {
        guest.state = "thinking";
        guest.rideTimer = 0.1;
        return;
      }
    }

    if (guest.route.length <= 1) {
      this.assignDestination(guest);
      return;
    }

    const from = guest.route[guest.routeIndex];
    const to = guest.route[guest.routeIndex + 1];
    if (!from || !to) {
      this.assignDestination(guest);
      return;
    }

    const direction = { x: to.x - from.x, y: to.y - from.y };
    const step = guest.speed * dt;
    const targetOffset = { x: direction.x, y: direction.y };
    const dx = targetOffset.x - guest.screenOffset.x;
    const dy = targetOffset.y - guest.screenOffset.y;
    const length = Math.hypot(dx, dy);

    if (length <= step) {
      guest.tile = { x: to.x, y: to.y };
      guest.screenOffset = { x: 0, y: 0 };
      guest.routeIndex += 1;
      if (guest.routeIndex >= guest.route.length - 1) {
        this.onGuestArrive(guest);
      }
      return;
    }

    const move = step / Math.max(length, 0.0001);
    guest.screenOffset.x += dx * move;
    guest.screenOffset.y += dy * move;
  }

  private onGuestArrive(guest: Guest): void {
    if (guest.targetStructureId === undefined) {
      guest.state = "thinking";
      guest.rideTimer = 0.5 + rand(guest.id * 7) * 0.7;
      guest.activity = "Taking in the view";
      return;
    }

    const structure = this.structures.get(guest.targetStructureId);
    if (!structure) {
      guest.state = "thinking";
      guest.rideTimer = 0.3;
      return;
    }

    structure.queue.push(guest.id);
    guest.state = "queueing";
    guest.waitTimer = 0;
    guest.activity = `Joining ${STRUCTURES[structure.typeId].label}`;
  }

  private assignDestination(guest: Guest): void {
    const attractions = Array.from(this.structures.values()).filter((structure) => {
      const entrance = structureEntrance(structure);
      return this.inBounds(entrance.x, entrance.y) && this.tiles[entrance.y][entrance.x].path;
    });

    if (attractions.length === 0) {
      guest.targetStructureId = undefined;
      guest.route = this.findRoute(guest.tile, BASE_SPAWN) ?? [guest.tile];
      guest.routeIndex = 0;
      guest.state = "walking";
      guest.activity = "Circling the plaza";
      return;
    }

    const weights = attractions.map((structure) => {
      const config = STRUCTURES[structure.typeId];
      const queuePenalty = structure.queue.length * 4;
      const hungerBoost = config.category === "stall" ? guest.hunger * 0.7 + 8 : guest.excitement * 0.28 + config.excitement;
      const variety = 8 + rand(guest.id * 51 + structure.id * 7) * 6;
      return Math.max(2, hungerBoost + variety - queuePenalty);
    });

    const target = choice(attractions, weights, guest.id * 13 + Math.floor(this.time * 10));
    const entrance = structureEntrance(target);
    const route = this.findRoute(guest.tile, entrance);

    if (!route) {
      guest.targetStructureId = undefined;
      guest.route = this.findRoute(guest.tile, BASE_SPAWN) ?? [guest.tile];
      guest.routeIndex = 0;
      guest.state = "walking";
      guest.activity = "Looking for a clear route";
      return;
    }

    guest.targetStructureId = target.id;
    guest.route = route;
    guest.routeIndex = 0;
    guest.state = "walking";
    guest.activity = `Heading to ${STRUCTURES[target.typeId].label}`;
    guest.lastDecision = this.time;
  }

  private spawnGuest(): void {
    const spawn = { x: BASE_SPAWN.x, y: GRID_H - 2 };
    const guest: Guest = {
      id: this.guestCounter++,
      tile: spawn,
      screenOffset: { x: 0, y: 0 },
      route: [spawn],
      routeIndex: 0,
      speed: 2 + rand(this.guestCounter * 17) * 0.55,
      state: "thinking",
      waitTimer: 0,
      rideTimer: 0.4,
      queueSlot: 0,
      hunger: 24 + rand(this.guestCounter * 31) * 40,
      excitement: 18 + rand(this.guestCounter * 43) * 30,
      patience: 56 + rand(this.guestCounter * 61) * 30,
      happiness: 68 + rand(this.guestCounter * 29) * 18,
      activity: "Arriving at the gates",
      color: ["#f76c5e", "#4c88d7", "#55aa77", "#f0ba4f", "#aa72da"][this.guestCounter % 5],
      lastDecision: this.time,
      ridesTaken: 0
    };

    this.guests.set(guest.id, guest);
    this.assignDestination(guest);
  }

  private eventToTile(event: PointerEvent): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    return this.screenToTile(screenX, screenY);
  }

  private screenToTile(screenX: number, screenY: number): Point | null {
    const zoom = this.camera.zoom;
    const localX = (screenX - this.camera.x) / zoom;
    const localY = (screenY - this.camera.y) / zoom;
    const tileX = Math.floor((localX / (TILE_W / 2) + localY / (TILE_H / 2)) / 2);
    const tileY = Math.floor((localY / (TILE_H / 2) - localX / (TILE_W / 2)) / 2);

    if (!this.inBounds(tileX, tileY)) {
      return null;
    }

    return { x: tileX, y: tileY };
  }

  private tileToScreen(tile: Point): Point {
    return {
      x: this.camera.x + (tile.x - tile.y) * (TILE_W / 2) * this.camera.zoom,
      y: this.camera.y + (tile.x + tile.y) * (TILE_H / 2) * this.camera.zoom
    };
  }

  private placeAtTile(x: number, y: number): void {
    if (!this.inBounds(x, y)) {
      return;
    }

    const key = `${this.selectedTool}:${x}:${y}`;
    if (this.paintAppliedAt === key) {
      return;
    }
    this.paintAppliedAt = key;

    if (this.selectedTool === "inspect") {
      this.inspectAt(x, y);
      this.updateUi();
      return;
    }

    if (this.selectedTool === "erase") {
      this.eraseAt(x, y);
      this.updateUi();
      return;
    }

    if (this.selectedTool === "path" || this.selectedTool === "water" || this.selectedTool === "grass") {
      this.paintTerrainTool(x, y, this.selectedTool);
      this.updateUi();
      return;
    }

    if (this.selectedTool in STRUCTURES) {
      this.tryPlaceStructure(this.selectedTool as StructureTypeId, x, y);
      this.updateUi();
      return;
    }

    if (this.selectedTool in SCENERY) {
      this.tryPlaceScenery(this.selectedTool as SceneryTypeId, x, y);
      this.updateUi();
    }
  }

  private inspectAt(x: number, y: number): void {
    const tile = this.tiles[y][x];
    if (tile.structureId !== undefined) {
      this.selection = { type: "structure", structureId: tile.structureId, x, y };
      return;
    }
    if (tile.sceneryId) {
      this.selection = { type: "scenery", x, y };
      return;
    }
    this.selection = { type: "tile", x, y };
  }

  private paintTerrainTool(x: number, y: number, toolId: "path" | "water" | "grass"): void {
    const tile = this.tiles[y][x];
    if (toolId === "path") {
      if (tile.terrain === "water" || tile.structureId !== undefined) {
        this.logEvent("Paths need open ground.");
        return;
      }
      if (!tile.path) {
        if (this.money < getTool("path").cost) {
          this.logEvent("Not enough cash for more paving.");
          return;
        }
        this.money -= getTool("path").cost;
      }
      tile.path = true;
      if (tile.sceneryId && tile.sceneryId !== "lamp" && tile.sceneryId !== "bin" && tile.sceneryId !== "bench") {
        tile.sceneryId = undefined;
      }
      this.selection = { type: "tile", x, y };
      return;
    }

    if (toolId === "water") {
      if (tile.structureId !== undefined || tile.path) {
        this.logEvent("Clear structures and paths before reshaping water.");
        return;
      }
      if (this.money < getTool("water").cost) {
        this.logEvent("Not enough cash for waterworks.");
        return;
      }
      this.money -= getTool("water").cost;
      tile.terrain = "water";
      tile.sceneryId = undefined;
      this.selection = { type: "tile", x, y };
      return;
    }

    if (tile.terrain === "water") {
      if (this.money < getTool("grass").cost) {
        this.logEvent("Not enough cash for meadow fill.");
        return;
      }
      this.money -= getTool("grass").cost;
    }
    tile.terrain = "grass";
    this.selection = { type: "tile", x, y };
  }

  private tryPlaceScenery(id: SceneryTypeId, x: number, y: number): void {
    const tile = this.tiles[y][x];
    if (tile.terrain !== "grass" || tile.structureId !== undefined) {
      this.logEvent("Scenery needs open ground.");
      return;
    }
    const tool = getSceneryTool(id);
    if (this.money < tool.cost) {
      this.logEvent("Not enough cash for more decorations.");
      return;
    }
    if (tile.sceneryId === id) {
      return;
    }
    this.money -= tool.cost;
    tile.sceneryId = id;
    this.selection = { type: "scenery", x, y };
  }

  private tryPlaceStructure(typeId: StructureTypeId, x: number, y: number): void {
    const config = STRUCTURES[typeId];
    const entrance = { x: x + Math.floor(config.footprint.x / 2), y: y + config.footprint.y };

    if (!this.inBounds(entrance.x, entrance.y)) {
      this.logEvent("That placement pushes the entrance out of bounds.");
      return;
    }

    for (let ty = y; ty < y + config.footprint.y; ty += 1) {
      for (let tx = x; tx < x + config.footprint.x; tx += 1) {
        if (!this.inBounds(tx, ty)) {
          this.logEvent("That attraction footprint is outside the park.");
          return;
        }
        const tile = this.tiles[ty][tx];
        if (tile.terrain !== "grass" || tile.path || tile.structureId !== undefined) {
          this.logEvent("Attractions need clear land with room to breathe.");
          return;
        }
      }
    }

    const entryTile = this.tiles[entrance.y][entrance.x];
    if (entryTile.terrain === "water" || entryTile.structureId !== undefined) {
      this.logEvent("The attraction entrance needs a reachable front tile.");
      return;
    }

    if (this.money < config.cost) {
      this.logEvent("Not enough cash for that build.");
      return;
    }

    this.money -= config.cost;
    const structure: StructureInstance = {
      id: this.structureCounter++,
      typeId,
      x,
      y,
      queue: [],
      riders: [],
      cycle: 0,
      lifetimeGuests: 0,
      lifetimeRevenue: 0,
      status: "idle"
    };

    this.structures.set(structure.id, structure);
    for (let ty = y; ty < y + config.footprint.y; ty += 1) {
      for (let tx = x; tx < x + config.footprint.x; tx += 1) {
        this.tiles[ty][tx].structureId = structure.id;
        this.tiles[ty][tx].sceneryId = undefined;
        this.tiles[ty][tx].path = false;
      }
    }

    this.selection = { type: "structure", structureId: structure.id, x, y };
    this.logEvent(`${config.label} placed. Connect a path to the glowing entrance tile.`);
  }

  private eraseAt(x: number, y: number): void {
    const tile = this.tiles[y][x];

    if (tile.structureId !== undefined) {
      const structure = this.structures.get(tile.structureId);
      if (!structure) {
        return;
      }
      const config = STRUCTURES[structure.typeId];
      const refund = Math.round(config.cost * 0.55);
      this.money += refund;
      for (let ty = structure.y; ty < structure.y + config.footprint.y; ty += 1) {
        for (let tx = structure.x; tx < structure.x + config.footprint.x; tx += 1) {
          this.tiles[ty][tx].structureId = undefined;
        }
      }
      for (const guestId of [...structure.queue, ...structure.riders]) {
        const guest = this.guests.get(guestId);
        if (!guest) {
          continue;
        }
        guest.state = "thinking";
        guest.targetStructureId = undefined;
        guest.rideTimer = 0.5;
      }
      this.structures.delete(structure.id);
      this.selection = { type: null };
      this.logEvent(`${config.label} removed for a ${formatMoney(refund)} refund.`);
      return;
    }

    if (tile.sceneryId) {
      const refund = Math.round(SCENERY[tile.sceneryId].cost * 0.55);
      tile.sceneryId = undefined;
      this.money += refund;
      this.selection = { type: "tile", x, y };
      return;
    }

    if (tile.path) {
      tile.path = false;
      tile.litter = 0;
      this.money += 3;
      this.selection = { type: "tile", x, y };
      return;
    }

    if (tile.terrain === "water") {
      tile.terrain = "grass";
      this.selection = { type: "tile", x, y };
    }
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  }

  private findRoute(start: Point, goal: Point): Point[] | null {
    if (!this.inBounds(start.x, start.y) || !this.inBounds(goal.x, goal.y)) {
      return null;
    }

    const key = (point: Point) => `${point.x}:${point.y}`;
    const frontier: Point[] = [start];
    const cameFrom = new Map<string, Point | null>();
    cameFrom.set(key(start), null);
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    while (frontier.length) {
      const current = frontier.shift()!;
      if (current.x === goal.x && current.y === goal.y) {
        const path: Point[] = [goal];
        let cursor: Point | null = cameFrom.get(key(goal)) ?? null;
        while (cursor) {
          path.push(cursor);
          cursor = cameFrom.get(key(cursor)) ?? null;
        }
        return path.reverse();
      }

      for (const direction of directions) {
        const next = { x: current.x + direction.x, y: current.y + direction.y };
        if (!this.inBounds(next.x, next.y)) {
          continue;
        }
        if (!(this.tiles[next.y][next.x].path || (next.x === goal.x && next.y === goal.y))) {
          continue;
        }
        const nextKey = key(next);
        if (cameFrom.has(nextKey)) {
          continue;
        }
        cameFrom.set(nextKey, current);
        frontier.push(next);
      }
    }

    return null;
  }

  private averageHappiness(): number {
    if (this.guests.size === 0) {
      return 72;
    }
    let total = 0;
    for (const guest of this.guests.values()) {
      total += guest.happiness;
    }
    return total / this.guests.size;
  }

  private cleanlinessScore(): number {
    let litter = 0;
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        litter += this.tiles[y][x].litter;
      }
    }
    const score = 100 - litter * 4.5 + this.totalBinPower() * 4 - this.guests.size * 0.18;
    return clamp(score, 38, 100);
  }

  private parkLevel(): number {
    return 1 + Math.floor((this.lifetimeRevenue + this.parkGrowth * 18 + this.attractionCount() * 120) / 1350);
  }

  private attractionCount(): number {
    return this.structures.size;
  }

  private pathCount(): number {
    let count = 0;
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        if (this.tiles[y][x].path) {
          count += 1;
        }
      }
    }
    return count;
  }

  private maxGuestCapacity(): number {
    return 10 + this.parkLevel() * 7 + this.attractionCount() * 3;
  }

  private totalBinPower(): number {
    let total = 0;
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const sceneryId = this.tiles[y][x].sceneryId;
        if (sceneryId && SCENERY[sceneryId].binPower) {
          total += SCENERY[sceneryId].binPower ?? 0;
        }
      }
    }
    return total;
  }

  private localBinPower(x: number, y: number): number {
    let total = 0;
    for (let yy = y - 2; yy <= y + 2; yy += 1) {
      for (let xx = x - 2; xx <= x + 2; xx += 1) {
        if (!this.inBounds(xx, yy)) {
          continue;
        }
        const sceneryId = this.tiles[yy][xx].sceneryId;
        if (sceneryId && SCENERY[sceneryId].binPower) {
          total += SCENERY[sceneryId].binPower ?? 0;
        }
      }
    }
    return total;
  }

  private guestQueuePressure(): number {
    if (this.structures.size === 0) {
      return 0;
    }
    const total = Array.from(this.structures.values()).reduce((sum, structure) => sum + structure.queue.length, 0);
    return total / this.structures.size;
  }

  private addLitterAround(x: number, y: number, chance: number): void {
    if (rand(this.time * 100 + x * 7 + y * 11) > chance) {
      return;
    }
    const offsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];
    const chosen = offsets[Math.floor(rand(this.time * 250 + x * 13 + y * 5) * offsets.length)];
    const nx = x + chosen.x;
    const ny = y + chosen.y;
    if (this.inBounds(nx, ny) && this.tiles[ny][nx].path) {
      this.tiles[ny][nx].litter = clamp(this.tiles[ny][nx].litter + 0.6, 0, 8);
    }
  }

  private localBeauty(x: number, y: number): number {
    let total = 0;
    for (let yy = y - 2; yy <= y + 2; yy += 1) {
      for (let xx = x - 2; xx <= x + 2; xx += 1) {
        if (!this.inBounds(xx, yy)) {
          continue;
        }
        const sceneryId = this.tiles[yy][xx].sceneryId;
        if (sceneryId) {
          total += SCENERY[sceneryId].beauty;
        }
      }
    }
    return total;
  }

  private getTileDebug(x: number, y: number): Tile | null {
    if (!this.inBounds(x, y)) {
      return null;
    }
    return { ...this.tiles[y][x] };
  }

  private canPlaceStructure(typeId: StructureTypeId, x: number, y: number): boolean {
    const config = STRUCTURES[typeId];
    const entrance = { x: x + Math.floor(config.footprint.x / 2), y: y + config.footprint.y };

    if (!this.inBounds(entrance.x, entrance.y)) {
      return false;
    }

    for (let ty = y; ty < y + config.footprint.y; ty += 1) {
      for (let tx = x; tx < x + config.footprint.x; tx += 1) {
        if (!this.inBounds(tx, ty)) {
          return false;
        }
        const tile = this.tiles[ty][tx];
        if (tile.terrain !== "grass" || tile.path || tile.structureId !== undefined) {
          return false;
        }
      }
    }

    const entryTile = this.tiles[entrance.y][entrance.x];
    return entryTile.terrain !== "water" && entryTile.structureId === undefined;
  }

  private logEvent(message: string): void {
    if (this.eventLog[0] === message) {
      return;
    }
    this.eventLog.unshift(message);
    this.eventLog = this.eventLog.slice(0, 8);
  }

  private getSelectionMarkup(): string {
    if (!this.selection.type) {
      return `
        <div class="selection-card">
          <h3 class="selection-title">Park Overview</h3>
          <p class="selection-subtitle">Balanced routes, short queues, and bins near food stalls keep the park thriving.</p>
          <div class="detail-grid">
            <div class="detail-chip">
              <div class="detail-label">Best Build</div>
              <div class="detail-value">${this.bestBuildSuggestion()}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Pressure</div>
              <div class="detail-value">${this.queuePressureLabel()}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Scenery</div>
              <div class="detail-value">${this.sceneryScore()} charm</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Revenue</div>
              <div class="detail-value">${formatMoney(this.dailyRevenue)}</div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.selection.type === "structure" && this.selection.structureId !== undefined) {
      const structure = this.structures.get(this.selection.structureId);
      if (!structure) {
        return "";
      }
      const config = STRUCTURES[structure.typeId];
      return `
        <div class="selection-card">
          <h3 class="selection-title">${config.label}</h3>
          <p class="selection-subtitle">${config.category === "ride" ? "Ride" : "Food Stall"} at tile ${structure.x},${structure.y}</p>
          <div class="detail-grid">
            <div class="detail-chip">
              <div class="detail-label">Status</div>
              <div class="detail-value">${structure.status}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Queue</div>
              <div class="detail-value">${structure.queue.length} guests</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Cycle</div>
              <div class="detail-value">${Math.max(0, structure.cycle).toFixed(1)}s</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Revenue</div>
              <div class="detail-value">${formatMoney(structure.lifetimeRevenue)}</div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.selection.type === "scenery" && this.selection.x !== undefined && this.selection.y !== undefined) {
      const sceneryId = this.tiles[this.selection.y][this.selection.x].sceneryId;
      if (!sceneryId) {
        return "";
      }
      const config = SCENERY[sceneryId];
      return `
        <div class="selection-card">
          <h3 class="selection-title">${config.label}</h3>
          <p class="selection-subtitle">Scenery at tile ${this.selection.x},${this.selection.y}</p>
          <div class="detail-grid">
            <div class="detail-chip">
              <div class="detail-label">Charm</div>
              <div class="detail-value">+${config.beauty}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Special</div>
              <div class="detail-value">${config.binPower ? "Cuts litter" : config.glow ? "Night glow" : "Visual appeal"}</div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.selection.type === "tile" && this.selection.x !== undefined && this.selection.y !== undefined) {
      const tile = this.tiles[this.selection.y][this.selection.x];
      return `
        <div class="selection-card">
          <h3 class="selection-title">Tile ${this.selection.x},${this.selection.y}</h3>
          <p class="selection-subtitle">${tile.path ? "Path tile" : tile.terrain === "water" ? "Water tile" : "Meadow tile"}</p>
          <div class="detail-grid">
            <div class="detail-chip">
              <div class="detail-label">Terrain</div>
              <div class="detail-value">${tile.terrain}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Litter</div>
              <div class="detail-value">${tile.litter.toFixed(1)}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Path</div>
              <div class="detail-value">${tile.path ? "Connected" : "No"}</div>
            </div>
            <div class="detail-chip">
              <div class="detail-label">Scenery</div>
              <div class="detail-value">${tile.sceneryId ? SCENERY[tile.sceneryId].label : "None"}</div>
            </div>
          </div>
        </div>
      `;
    }

    return "";
  }

  private bestBuildSuggestion(): string {
    if (this.structures.size === 0) {
      return "Start with a Carousel";
    }
    if (this.cleanlinessScore() < 68) {
      return "Add bins and lamps";
    }
    if (this.averageHappiness() < 72) {
      return "Plant more scenery";
    }
    if (this.structures.size < 4) {
      return "Expand with food";
    }
    return "Push a new loop of paths";
  }

  private queuePressureLabel(): string {
    const queue = this.guestQueuePressure();
    if (queue > 3) {
      return "Crowded";
    }
    if (queue > 1.2) {
      return "Busy";
    }
    return "Comfortable";
  }

  private sceneryScore(): number {
    let total = 0;
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const sceneryId = this.tiles[y][x].sceneryId;
        if (sceneryId) {
          total += SCENERY[sceneryId].beauty;
        }
      }
    }
    return total;
  }

  private getSnapshot(): Snapshot {
    const statusSummary = Array.from(this.structures.values())
      .slice(0, 6)
      .map((structure) => {
        const config = STRUCTURES[structure.typeId];
        return `${config.label}:${structure.status}:${structure.queue.length}`;
      });

    return {
      money: Math.round(this.money),
      guests: this.guests.size,
      attractions: this.attractionCount(),
      rideCount: Array.from(this.structures.values()).filter((structure) => STRUCTURES[structure.typeId].category === "ride").length,
      pathTiles: this.pathCount(),
      cleanliness: Math.round(this.cleanlinessScore()),
      happiness: Math.round(this.averageHappiness()),
      parkLevel: this.parkLevel(),
      activeQueues: Array.from(this.structures.values()).reduce((sum, structure) => sum + structure.queue.length, 0),
      statusSummary
    };
  }

  private updateUi(): void {
    const happiness = Math.round(this.averageHappiness());
    const cleanliness = Math.round(this.cleanlinessScore());
    const growth = this.parkLevel();
    const queuePressure = this.queuePressureLabel();

    this.topBar.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Money</div>
        <div class="stat-value">${formatMoney(this.money)}</div>
        <div class="stat-sub">${formatMoney(this.dailyRevenue)} gross</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Guests</div>
        <div class="stat-value">${this.guests.size}/${this.maxGuestCapacity()}</div>
        <div class="stat-sub">${queuePressure} flow</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Happiness</div>
        <div class="stat-value">${happiness}%</div>
        <div class="stat-sub">${this.guestsServed} guests served</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cleanliness</div>
        <div class="stat-value">${cleanliness}%</div>
        <div class="stat-sub">${this.totalBinPower().toFixed(1)} bin cover</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Park Level</div>
        <div class="stat-value">${growth}</div>
        <div class="stat-sub">${this.attractionCount()} attractions live</div>
      </div>
    `;

    const grouped = new Map<ToolCategory, ToolDef[]>();
    for (const tool of TOOLS) {
      if (!grouped.has(tool.category)) {
        grouped.set(tool.category, []);
      }
      grouped.get(tool.category)!.push(tool);
    }

    this.leftPanel.innerHTML = `
      <section class="panel-hero panel-hero-build">
        <div class="panel-hero-copy">
          <div class="panel-kicker">Planner Desk</div>
          <h2 class="panel-title">Build Palette</h2>
          <p class="panel-copy">Premium parkmaking with clear isometric placement, playful management, and fast iteration.</p>
        </div>
      </section>
      ${Array.from(grouped.entries())
        .map(([category, tools]) => `
          <section class="tool-section">
            <h3 class="panel-title">${category}</h3>
            <div class="tool-grid">
              ${tools
                .map((tool) => `
                  <button class="tool-button ${tool.id === this.selectedTool ? "active" : ""}" data-tool="${tool.id}">
                    <div class="tool-header">
                      <span class="tool-icon">${buildIconSvg(tool.id)}</span>
                      <div>
                        <div class="tool-name">${tool.label}</div>
                        <div class="tool-cost">${tool.cost ? formatMoney(tool.cost) : "Free"} · ${tool.description}</div>
                      </div>
                    </div>
                  </button>
                `)
                .join("")}
            </div>
          </section>
        `)
        .join("")}
    `;

    this.leftPanel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.onclick = () => {
        const tool = button.dataset.tool as ToolId;
        this.selectedTool = tool;
        this.updateUi();
      };
    });

    const attractions = Array.from(this.structures.values())
      .sort((a, b) => b.queue.length - a.queue.length)
      .slice(0, 5)
      .map((structure) => {
        const config = STRUCTURES[structure.typeId];
        const queueClass = structure.queue.length > 5 ? "bad" : structure.queue.length > 2 ? "alert" : "good";
        return `
          <div class="list-card">
            <div class="list-title"><span>${config.label}</span><span>${structure.status}</span></div>
            <div class="list-meta">Queue ${structure.queue.length} · Revenue ${formatMoney(structure.lifetimeRevenue)} · Guests ${structure.lifetimeGuests}</div>
            <div class="badge-row">
              <span class="badge ${queueClass}">${structure.queue.length > 5 ? "Long wait" : structure.queue.length > 2 ? "Steady line" : "Smooth loading"}</span>
              <span class="badge">${config.category === "ride" ? `${config.excitement} thrill` : `${config.appetite} hunger relief`}</span>
            </div>
          </div>
        `;
      })
      .join("");

    const guestFeed = Array.from(this.guests.values())
      .sort((a, b) => b.happiness - a.happiness)
      .slice(0, 5)
      .map((guest) => `
        <div class="list-card">
          <div class="list-title"><span>Guest ${guest.id + 1}</span><span>${Math.round(guest.happiness)}%</span></div>
          <div class="list-meta">${guest.activity}</div>
          <div class="badge-row">
            <span class="badge">${Math.round(guest.hunger)} hunger</span>
            <span class="badge">${Math.round(guest.patience)} patience</span>
          </div>
        </div>
      `)
      .join("");

    this.rightPanel.innerHTML = `
      <section class="panel-hero panel-hero-ops">
        <div class="panel-hero-copy">
          <div class="panel-kicker">Guest Flow</div>
          <h2 class="panel-title">Operations</h2>
          <p class="panel-copy">Guests follow path-connected entrances, react to queue length, and notice trash or beauty around them.</p>
        </div>
      </section>
      <div class="detail-copy">Park mood</div>
      <div class="meter"><div class="meter-fill" style="width: ${clamp((happiness + cleanliness) * 0.5, 0, 100)}%"></div></div>
      <section class="tool-section">
        <h3 class="panel-title">Selected</h3>
        ${this.getSelectionMarkup()}
      </section>
      <section class="tool-section">
        <h3 class="panel-title">Ride Status</h3>
        <div class="list">${attractions || `<div class="list-card"><div class="list-meta">Place your first attraction to start activity.</div></div>`}</div>
      </section>
      <section class="tool-section">
        <h3 class="panel-title">Guest Activity</h3>
        <div class="list">${guestFeed || `<div class="list-card"><div class="list-meta">Guests will arrive as soon as the park has viable paths.</div></div>`}</div>
      </section>
      <section class="tool-section">
        <h3 class="panel-title">Park Log</h3>
        <div class="list">
          ${this.eventLog
            .slice(0, 5)
            .map((entry) => `<div class="list-card"><div class="list-meta">${entry}</div></div>`)
            .join("")}
        </div>
      </section>
    `;

    this.bottomStrip.innerHTML = `
      <div>
        <div class="instruction-line">Left click builds. Drag with left mouse to paint paths or terrain. Right click or hold Alt while dragging to pan. Mouse wheel zooms.</div>
        <div class="instruction-line">Connect rides to the path network using the entrance tile directly in front of each structure.</div>
      </div>
      <div class="cta-cluster">
        <div class="pill">Queue pressure: ${queuePressure}</div>
        <div class="pill">Suggestion: ${this.bestBuildSuggestion()}</div>
      </div>
    `;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderBackdrop(ctx);

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    const entities: Array<{ depth: number; draw: () => void }> = [];

    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const tile = this.tiles[y][x];
        const isoX = (x - y) * (TILE_W / 2);
        const isoY = (x + y) * (TILE_H / 2);

        this.drawTerrainTile(ctx, tile, isoX, isoY, x, y);

        entities.push({
          depth: x + y + 0.1,
          draw: () => {
            if (tile.path) {
              this.drawPathTile(ctx, isoX, isoY, tile.litter);
            }
            if (tile.sceneryId) {
              this.drawScenery(ctx, tile.sceneryId, isoX, isoY);
            }
            if (this.hoverTile?.x === x && this.hoverTile?.y === y) {
              this.drawTileOutline(ctx, isoX, isoY, "#f6b95f", 0.85);
            }
          }
        });
      }
    }

    for (const structure of this.structures.values()) {
      entities.push({
        depth: structure.x + structure.y + STRUCTURES[structure.typeId].footprint.x + STRUCTURES[structure.typeId].footprint.y,
        draw: () => this.drawStructure(ctx, structure)
      });
    }

    for (const guest of this.guests.values()) {
      entities.push({
        depth: guest.tile.x + guest.tile.y + 0.9,
        draw: () => this.drawGuest(ctx, guest)
      });
    }

    entities.sort((a, b) => a.depth - b.depth);
    for (const entity of entities) {
      entity.draw();
    }

    if (this.hoverTile) {
      this.drawPreview(ctx, this.hoverTile.x, this.hoverTile.y);
    }

    ctx.restore();
  }

  private renderBackdrop(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#f9e9c9");
    gradient.addColorStop(0.55, "#f5dab1");
    gradient.addColorStop(1, "#e8c08f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const shellBackdrop = this.getArtAsset("shellBackdrop");
    if (shellBackdrop) {
      const scale = Math.max(this.width / shellBackdrop.width, this.height / shellBackdrop.height);
      const width = shellBackdrop.width * scale;
      const height = shellBackdrop.height * scale;
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.drawImage(shellBackdrop, (this.width - width) * 0.5, (this.height - height) * 0.38, width, height);
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let index = 0; index < 5; index += 1) {
      const x = this.width * (0.12 + index * 0.18);
      const y = 80 + Math.sin(this.time * 0.1 + index) * 18;
      ctx.beginPath();
      ctx.ellipse(x, y, 80, 24, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 34, y + 6, 56, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 36, y + 4, 46, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTerrainTile(ctx: CanvasRenderingContext2D, tile: Tile, isoX: number, isoY: number, x: number, y: number): void {
    ctx.save();
    ctx.translate(isoX, isoY);

    const colorTop = tile.terrain === "grass" ? "#78b364" : "#63b9cb";
    const colorLeft = tile.terrain === "grass" ? "#5f944e" : "#4290a8";
    const colorRight = tile.terrain === "grass" ? "#8fc777" : "#7bcfdf";

    const surface = new Path2D();
    surface.moveTo(0, 0);
    surface.lineTo(TILE_W / 2, TILE_H / 2);
    surface.lineTo(0, TILE_H);
    surface.lineTo(-TILE_W / 2, TILE_H / 2);
    surface.closePath();

    const fill = ctx.createLinearGradient(0, 0, 0, TILE_H);
    fill.addColorStop(0, colorTop);
    fill.addColorStop(1, colorRight);
    ctx.fillStyle = fill;
    ctx.fill(surface);

    const terrainTexture = tile.terrain === "grass" ? this.getArtAsset("grassTexture") : this.getArtAsset("waterTexture");
    if (terrainTexture) {
      this.drawTexturedShape(
        ctx,
        surface,
        terrainTexture,
        x,
        y,
        { x: -TILE_W / 2 - 4, y: -2, width: TILE_W + 8, height: TILE_H + 8 },
        tile.terrain === "grass" ? 0.22 : 0.4,
        tile.terrain === "water" ? Math.sin(this.time * 0.9 + x * 0.4 + y * 0.35) * 2.5 : 0
      );
    }

    ctx.beginPath();
    ctx.moveTo(-TILE_W / 2, TILE_H / 2);
    ctx.lineTo(0, TILE_H);
    ctx.lineTo(0, TILE_H + 14);
    ctx.lineTo(-TILE_W / 2, TILE_H / 2 + 14);
    ctx.closePath();
    ctx.fillStyle = colorLeft;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(TILE_W / 2, TILE_H / 2);
    ctx.lineTo(0, TILE_H);
    ctx.lineTo(0, TILE_H + 14);
    ctx.lineTo(TILE_W / 2, TILE_H / 2 + 14);
    ctx.closePath();
    ctx.fillStyle = colorRight;
    ctx.fill();

    ctx.strokeStyle = "rgba(40, 65, 36, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke(surface);

    if (tile.terrain === "grass") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let i = 0; i < 5; i += 1) {
        const px = -20 + rand(x * 17 + y * 31 + i) * 40;
        const py = 6 + rand(x * 23 + y * 11 + i) * 20;
        ctx.fillRect(px, py, 2, 2);
      }
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.08 * Math.sin(this.time * 2 + x * 0.6 + y * 0.4)})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-18, 15 + Math.sin(this.time * 2 + x) * 1.8);
      ctx.quadraticCurveTo(0, 11 + Math.sin(this.time * 2 + x + 1) * 2.4, 18, 15 + Math.sin(this.time * 2 + x + 2) * 1.8);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPathTile(ctx: CanvasRenderingContext2D, isoX: number, isoY: number, litter: number): void {
    ctx.save();
    ctx.translate(isoX, isoY);
    const pathShape = new Path2D();
    pathShape.moveTo(0, 4);
    pathShape.lineTo(28, 17);
    pathShape.lineTo(0, 30);
    pathShape.lineTo(-28, 17);
    pathShape.closePath();
    const fill = ctx.createLinearGradient(0, 4, 0, 30);
    fill.addColorStop(0, "#f2ead8");
    fill.addColorStop(1, "#ddceb4");
    ctx.fillStyle = fill;
    ctx.fill(pathShape);

    const pathTexture = this.getArtAsset("pathTexture");
    if (pathTexture) {
      this.drawTexturedShape(
        ctx,
        pathShape,
        pathTexture,
        isoX,
        isoY,
        { x: -30, y: 2, width: 60, height: 30 },
        0.32
      );
    }

    ctx.strokeStyle = "rgba(86, 64, 33, 0.14)";
    ctx.stroke(pathShape);

    ctx.strokeStyle = "rgba(135, 108, 74, 0.18)";
    for (let i = -18; i <= 18; i += 9) {
      ctx.beginPath();
      ctx.moveTo(i, 12 + Math.abs(i) * 0.1);
      ctx.lineTo(i + 6, 20 + Math.abs(i) * 0.05);
      ctx.stroke();
    }

    if (litter > 0.1) {
      ctx.fillStyle = "rgba(184, 106, 72, 0.55)";
      ctx.fillRect(-4, 16, 4, 3);
      if (litter > 0.8) {
        ctx.fillRect(7, 20, 5, 3);
      }
    }
    ctx.restore();
  }

  private drawScenery(ctx: CanvasRenderingContext2D, id: SceneryTypeId, isoX: number, isoY: number): void {
    ctx.save();
    ctx.translate(isoX, isoY);
    ctx.shadowColor = "rgba(42, 28, 18, 0.18)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    switch (id) {
      case "tree":
        ctx.fillStyle = "rgba(41, 70, 39, 0.2)";
        ctx.beginPath();
        ctx.ellipse(0, 24, 18, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#6c4b2d";
        ctx.fillRect(-3, -2, 6, 24);
        ctx.fillStyle = "#4f9958";
        for (const [dx, dy, radius] of [[0, -10, 15], [-10, -4, 11], [10, -3, 12], [0, 4, 12]] as Array<[number, number, number]>) {
          ctx.beginPath();
          ctx.arc(dx, dy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "flower":
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#5da15b";
        ctx.beginPath();
        ctx.ellipse(0, 17, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [dx, dy, color] of [[-7, 14, "#ef6c7f"], [0, 12, "#f2c34a"], [7, 15, "#7bc3dd"], [2, 19, "#f29db6"]] as Array<[number, number, string]>) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(dx, dy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "fountain":
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#cfd6df";
        ctx.beginPath();
        ctx.ellipse(0, 22, 17, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#97d8e5";
        ctx.beginPath();
        ctx.ellipse(0, 22, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7cc2d4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.quadraticCurveTo(1 + Math.sin(this.time * 3) * 2, 3, 0, 6);
        ctx.stroke();
        break;
      case "bench":
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#7d5434";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-10, 14);
        ctx.lineTo(10, 14);
        ctx.moveTo(-8, 9);
        ctx.lineTo(8, 9);
        ctx.moveTo(-8, 14);
        ctx.lineTo(-6, 22);
        ctx.moveTo(8, 14);
        ctx.lineTo(6, 22);
        ctx.stroke();
        break;
      case "bin":
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#59a48d";
        ctx.fillRect(-7, 8, 14, 14);
        ctx.fillStyle = "#315247";
        ctx.fillRect(-9, 8, 18, 3);
        break;
      case "lamp":
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#6b4a31";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 3);
        ctx.lineTo(0, 23);
        ctx.stroke();
        ctx.fillStyle = "#f6df88";
        ctx.beginPath();
        ctx.moveTo(-6, 6);
        ctx.lineTo(0, 2);
        ctx.lineTo(6, 6);
        ctx.lineTo(3, 12);
        ctx.lineTo(-3, 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(246, 223, 136, 0.16)";
        ctx.beginPath();
        ctx.ellipse(0, 13, 18, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  private drawStructure(ctx: CanvasRenderingContext2D, structure: StructureInstance): void {
    const config = STRUCTURES[structure.typeId];
    const origin = this.tileToWorld(structure.x, structure.y);
    const w = config.footprint.x;
    const h = config.footprint.y;
    const width = (w + h) * TILE_W * 0.25;
    const baseY = origin.y + TILE_H * 0.5;
    const entrance = structureEntrance(structure);
    const entranceWorld = this.tileToWorld(entrance.x, entrance.y);

    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.shadowColor = "rgba(48, 25, 8, 0.22)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "rgba(74, 50, 29, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, h * 14 + 32, width * 0.82, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const [main, accent, trim] = config.palette;
    this.drawIsoPlatform(ctx, w, h, main, trim);

    switch (structure.typeId) {
      case "carousel":
        this.drawCarousel(ctx, structure, main, accent, trim);
        break;
      case "ferris":
        this.drawFerris(ctx, structure, main, accent, trim);
        break;
      case "coaster":
        this.drawCoaster(ctx, structure, main, accent, trim);
        break;
      case "swing":
        this.drawSwing(ctx, structure, main, accent, trim);
        break;
      case "burger":
      case "gelato":
      case "coffee":
        this.drawStall(ctx, structure, main, accent, trim);
        break;
    }

    ctx.restore();

    ctx.save();
    ctx.translate(entranceWorld.x, entranceWorld.y);
    if (this.tiles[entrance.y][entrance.x].path) {
      ctx.fillStyle = "rgba(84, 190, 164, 0.25)";
    } else {
      ctx.fillStyle = "rgba(241, 182, 86, 0.3)";
    }
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(16, 11);
    ctx.lineTo(0, 19);
    ctx.lineTo(-16, 11);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(57, 47, 36, 0.74)";
    ctx.font = "600 11px 'Avenir Next', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${config.label} · ${structure.queue.length} in queue`, 0, -6);
    ctx.restore();
  }

  private drawIsoPlatform(ctx: CanvasRenderingContext2D, w: number, h: number, main: string, trim: string): void {
    const totalWidth = (w + h) * TILE_W * 0.25;
    const totalHeight = (w + h) * TILE_H * 0.24;
    ctx.fillStyle = main;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(totalWidth, totalHeight);
    ctx.lineTo(0, totalHeight * 2);
    ctx.lineTo(-totalWidth, totalHeight);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-totalWidth, totalHeight);
    ctx.lineTo(0, totalHeight * 2);
    ctx.lineTo(0, totalHeight * 2 + 18);
    ctx.lineTo(-totalWidth, totalHeight + 18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(totalWidth, totalHeight);
    ctx.lineTo(0, totalHeight * 2);
    ctx.lineTo(0, totalHeight * 2 + 18);
    ctx.lineTo(totalWidth, totalHeight + 18);
    ctx.closePath();
    ctx.fill();
  }

  private drawCarousel(ctx: CanvasRenderingContext2D, structure: StructureInstance, main: string, accent: string, trim: string): void {
    const spin = this.time * 1.7;
    ctx.translate(0, 14);
    ctx.fillStyle = trim;
    ctx.fillRect(-6, -8, 12, 42);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-44, -12);
    ctx.lineTo(0, -34);
    ctx.lineTo(44, -12);
    ctx.lineTo(0, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f9f1de";
    for (let i = 0; i < 8; i += 1) {
      const angle = spin + (Math.PI * 2 * i) / 8;
      const x = Math.cos(angle) * 30;
      const y = Math.sin(angle) * 12;
      ctx.fillRect(x - 2, y - 3, 4, 24);
      ctx.fillStyle = i % 2 === 0 ? main : trim;
      ctx.beginPath();
      ctx.ellipse(x, y + 18, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f9f1de";
    }
  }

  private drawFerris(ctx: CanvasRenderingContext2D, structure: StructureInstance, main: string, accent: string, trim: string): void {
    const spin = this.time * 0.7;
    ctx.translate(0, -10);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-28, 62);
    ctx.lineTo(-8, 18);
    ctx.lineTo(8, 18);
    ctx.lineTo(28, 62);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 10, 40, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const angle = spin + (Math.PI * 2 * i) / 8;
      const x = Math.cos(angle) * 40;
      const y = Math.sin(angle) * 40;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      ctx.fillStyle = i % 2 === 0 ? main : trim;
      ctx.fillRect(x - 7, y + 6, 14, 9);
    }
  }

  private drawCoaster(ctx: CanvasRenderingContext2D, structure: StructureInstance, main: string, accent: string, trim: string): void {
    const cartPos = (Math.sin(this.time * 1.2) + 1) * 0.5;
    ctx.translate(0, 4);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-70, 42);
    ctx.lineTo(-30, -10);
    ctx.lineTo(-5, 8);
    ctx.lineTo(34, -20);
    ctx.lineTo(70, 38);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-70, 42);
    ctx.lineTo(-30, -10);
    ctx.lineTo(-5, 8);
    ctx.lineTo(34, -20);
    ctx.lineTo(70, 38);
    ctx.stroke();
    for (let i = -70; i <= 70; i += 18) {
      ctx.strokeStyle = trim;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(i, 44);
      ctx.lineTo(i, 68);
      ctx.stroke();
    }
    const carX = lerp(-54, 48, cartPos);
    const carY = lerp(18, -4, Math.sin(cartPos * Math.PI));
    ctx.fillStyle = main;
    ctx.fillRect(carX - 14, carY, 28, 11);
  }

  private drawSwing(ctx: CanvasRenderingContext2D, structure: StructureInstance, main: string, accent: string, trim: string): void {
    const sway = Math.sin(this.time * 2.3) * 0.48;
    ctx.translate(0, 10);
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-10, 54);
    ctx.lineTo(0, -18);
    ctx.lineTo(10, 54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(0, -14, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8 + sway;
      const anchorX = Math.cos(angle) * 18;
      const anchorY = Math.sin(angle) * 6 - 14;
      const seatX = anchorX + Math.cos(angle) * 18;
      const seatY = anchorY + 28;
      ctx.strokeStyle = "#f8f2e7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(seatX, seatY);
      ctx.stroke();
      ctx.fillStyle = i % 2 === 0 ? main : "#f6d8a2";
      ctx.fillRect(seatX - 4, seatY, 8, 5);
    }
  }

  private drawStall(ctx: CanvasRenderingContext2D, structure: StructureInstance, main: string, accent: string, trim: string): void {
    ctx.translate(0, 12);
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-28, 22);
    ctx.lineTo(0, 8);
    ctx.lineTo(28, 22);
    ctx.lineTo(0, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = main;
    ctx.fillRect(-24, -8, 48, 30);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-28, -8);
    ctx.lineTo(0, -22);
    ctx.lineTo(28, -8);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f8f1e7";
    ctx.fillRect(-12, 4, 24, 12);
  }

  private drawGuest(ctx: CanvasRenderingContext2D, guest: Guest): void {
    const world = this.getGuestDrawPosition(guest);
    ctx.save();
    ctx.translate(world.x, world.y);
    ctx.fillStyle = "rgba(55, 38, 19, 0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 24, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = guest.color;
    ctx.beginPath();
    ctx.arc(0, 15, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8e7d1";
    ctx.beginPath();
    ctx.arc(0, 8, 4.4, 0, Math.PI * 2);
    ctx.fill();

    if (guest.state === "queueing") {
      ctx.fillStyle = "rgba(55, 47, 35, 0.72)";
      ctx.font = "600 10px 'Avenir Next', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${guest.queueSlot + 1}`, 0, -4);
    }
    ctx.restore();
  }

  private getGuestDrawPosition(guest: Guest): Point {
    if (guest.targetStructureId !== undefined) {
      const structure = this.structures.get(guest.targetStructureId);
      if (structure) {
        const entrance = structureEntrance(structure);
        const entranceWorld = this.tileToWorld(entrance.x, entrance.y);

        if (guest.state === "queueing") {
          return {
            x: entranceWorld.x - guest.queueSlot * 9,
            y: entranceWorld.y + 18 + guest.queueSlot * 4
          };
        }

        if (guest.state === "riding") {
          const t = this.time * 1.5 + guest.id * 0.7;
          switch (structure.typeId) {
            case "carousel":
              return {
                x: this.tileToWorld(structure.x, structure.y).x + Math.cos(t) * 24,
                y: this.tileToWorld(structure.x, structure.y).y + 18 + Math.sin(t) * 8
              };
            case "ferris":
              return {
                x: this.tileToWorld(structure.x, structure.y).x + Math.cos(t * 0.7) * 30,
                y: this.tileToWorld(structure.x, structure.y).y - 4 + Math.sin(t * 0.7) * 30
              };
            case "coaster":
              return {
                x: this.tileToWorld(structure.x, structure.y).x + lerp(-52, 48, (Math.sin(t) + 1) * 0.5),
                y: this.tileToWorld(structure.x, structure.y).y + 10 + Math.sin(t * 1.4) * 12
              };
            case "swing":
              return {
                x: this.tileToWorld(structure.x, structure.y).x + Math.sin(t * 1.7) * 24,
                y: this.tileToWorld(structure.x, structure.y).y + 4 + Math.cos(t * 1.7) * 6
              };
            default:
              return {
                x: entranceWorld.x + (guest.id % 2 === 0 ? -7 : 7),
                y: entranceWorld.y + 10
              };
          }
        }
      }
    }

    return this.tileToWorld(guest.tile.x + guest.screenOffset.x, guest.tile.y + guest.screenOffset.y);
  }

  private drawTileOutline(ctx: CanvasRenderingContext2D, isoX: number, isoY: number, color: string, alpha = 1): void {
    ctx.save();
    ctx.translate(isoX, isoY);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(TILE_W / 2, TILE_H / 2);
    ctx.lineTo(0, TILE_H);
    ctx.lineTo(-TILE_W / 2, TILE_H / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawPreview(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.selectedTool in STRUCTURES) {
      const config = STRUCTURES[this.selectedTool as StructureTypeId];
      let valid = true;
      for (let ty = y; ty < y + config.footprint.y; ty += 1) {
        for (let tx = x; tx < x + config.footprint.x; tx += 1) {
          if (!this.inBounds(tx, ty) || this.tiles[ty][tx].terrain !== "grass" || this.tiles[ty][tx].path || this.tiles[ty][tx].structureId !== undefined) {
            valid = false;
          }
          if (this.inBounds(tx, ty)) {
            const world = this.tileToWorld(tx, ty);
            this.drawTileOutline(ctx, world.x, world.y, valid ? "#6bd0ac" : "#d45f52", 0.92);
          }
        }
      }
      const entrance = { x: x + Math.floor(config.footprint.x / 2), y: y + config.footprint.y };
      if (this.inBounds(entrance.x, entrance.y)) {
        const world = this.tileToWorld(entrance.x, entrance.y);
        this.drawTileOutline(ctx, world.x, world.y, this.tiles[entrance.y][entrance.x].path ? "#6bd0ac" : "#f0b04d", 0.94);
      }
      return;
    }

    const world = this.tileToWorld(x, y);
    this.drawTileOutline(ctx, world.x, world.y, "#f7d074");
  }

  private tileToWorld(x: number, y: number): Point {
    return {
      x: (x - y) * (TILE_W / 2),
      y: (x + y) * (TILE_H / 2)
    };
  }
}
