type Orientation = "HORIZONTAL" | "VERTICAL";
type CellState = "WATER" | "SHIP" | "HIT" | "MISS" | "SONAR_DETECTED";
type FireMode = "CANNON" | "MISSILE" | "SONAR";

interface ShipBlueprint {
  id: string;
  name: string;
  shipClass: string;
  width: number;
  length: number;
  maxHp: number;
}

interface DeployedShip extends ShipBlueprint {
  currentHp: number;
  isDestroyed: boolean;
  orientation: Orientation;
  occupiedCoords: Set<string>;
  hitCoords: Set<string>;
}

interface AttackReport {
  x: number;
  y: number;
  result: "OUT_OF_BOUNDS" | "ALREADY_SHOT" | "MISS" | "HIT" | "SUNK";
  damageDealt: number;
  shipHit?: string;
  shipRemainingHp?: number;
  fleetRemaining: number;
  gameOver: boolean;
}

class ModernWarshipsBattleship {
  public readonly GRID_SIZE = 100;
  public grid: CellState[][] = [];
  public fleet: DeployedShip[] = [];
  private coordToShipMap: Map<string, DeployedShip> = new Map();
  public totalShots = 0;
  public totalHits = 0;

  private readonly FLEET_BLUEPRINTS: ShipBlueprint[] = [
    { id: "CV-01", name: "USS Gerald R. Ford", shipClass: "CV",   width: 4, length: 12, maxHp: 1500 },
    { id: "BB-02", name: "JS Yamato",          shipClass: "BB",   width: 4, length: 10, maxHp: 1200 },
    { id: "CG-03", name: "RF Lider",           shipClass: "CG",   width: 3, length: 9,  maxHp: 900  },
    { id: "DDG-04", name: "USS Zumwalt",       shipClass: "DDG",  width: 3, length: 8,  maxHp: 750  },
    { id: "SSBN-05", name: "RF Belgorod",      shipClass: "SSBN", width: 2, length: 8,  maxHp: 600  },
    { id: "FFG-06", name: "Admiral Gorshkov",  shipClass: "FFG",  width: 2, length: 6,  maxHp: 450  },
    { id: "FS-07", name: "Karakurt",           shipClass: "FS",   width: 2, length: 4,  maxHp: 300  },
  ];

  constructor() {
    this.resetGame();
  }

  public resetGame(): void {
    this.grid = Array.from({ length: this.GRID_SIZE }, () =>
      Array<CellState>(this.GRID_SIZE).fill("WATER")
    );
    this.fleet = [];
    this.coordToShipMap.clear();
    this.totalShots = 0;
    this.totalHits = 0;
    this.deployFleetRandomly();
  }

  private coordKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  private deployFleetRandomly(): void {
    for (const blueprint of this.FLEET_BLUEPRINTS) {
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 2000) {
        attempts++;
        const orientation: Orientation = Math.random() < 0.5 ? "HORIZONTAL" : "VERTICAL";
        const spanX = orientation === "HORIZONTAL" ? blueprint.length : blueprint.width;
        const spanY = orientation === "HORIZONTAL" ? blueprint.width : blueprint.length;

        const startX = Math.floor(Math.random() * (this.GRID_SIZE - spanX + 1));
        const startY = Math.floor(Math.random() * (this.GRID_SIZE - spanY + 1));

        if (this.canPlaceShip(startX, startY, spanX, spanY)) {
          const occupiedCoords = new Set<string>();
          const deployedShip: DeployedShip = {
            ...blueprint,
            currentHp: blueprint.maxHp,
            isDestroyed: false,
            orientation,
            occupiedCoords,
            hitCoords: new Set<string>(),
          };

          for (let dx = 0; dx < spanX; dx++) {
            for (let dy = 0; dy < spanY; dy++) {
              const cx = startX + dx;
              const cy = startY + dy;
              const key = this.coordKey(cx, cy);
              this.grid[cy][cx] = "SHIP";
              occupiedCoords.add(key);
              this.coordToShipMap.set(key, deployedShip);
            }
          }

          this.fleet.push(deployedShip);
          placed = true;
        }
      }
    }
  }

  private canPlaceShip(startX: number, startY: number, spanX: number, spanY: number): boolean {
    for (let dx = 0; dx < spanX; dx++) {
      for (let dy = 0; dy < spanY; dy++) {
        if (this.grid[startY + dy][startX + dx] !== "WATER") {
          return false;
        }
      }
    }
    return true;
  }

  public fireAt(x: number, y: number, weaponDamage: number): AttackReport {
    if (x < 0 || x >= this.GRID_SIZE || y < 0 || y >= this.GRID_SIZE) {
      return { x, y, result: "OUT_OF_BOUNDS", damageDealt: 0, fleetRemaining: this.getRemainingShipsCount(), gameOver: this.isFleetDestroyed() };
    }

    const cell = this.grid[y][x];
    if (cell === "HIT" || cell === "MISS") {
      return { x, y, result: "ALREADY_SHOT", damageDealt: 0, fleetRemaining: this.getRemainingShipsCount(), gameOver: this.isFleetDestroyed() };
    }

    this.totalShots++;
    const key = this.coordKey(x, y);

    if (cell === "WATER") {
      this.grid[y][x] = "MISS";
      return { x, y, result: "MISS", damageDealt: 0, fleetRemaining: this.getRemainingShipsCount(), gameOver: false };
    }

    this.totalHits++;
    this.grid[y][x] = "HIT";
    const ship = this.coordToShipMap.get(key)!;
    ship.hitCoords.add(key);

    ship.currentHp = Math.max(0, ship.currentHp - weaponDamage);
    if (ship.currentHp === 0 || ship.hitCoords.size >= ship.occupiedCoords.size) {
      ship.currentHp = 0;
      ship.isDestroyed = true;
      ship.occupiedCoords.forEach((coord) => {
        const [sx, sy] = coord.split(",").map(Number);
        this.grid[sy][sx] = "HIT";
      });
    }

    const remaining = this.getRemainingShipsCount();
    return {
      x,
      y,
      result: ship.isDestroyed ? "SUNK" : "HIT",
      damageDealt: weaponDamage,
      shipHit: `${ship.name} (${ship.shipClass})`,
      shipRemainingHp: ship.currentHp,
      fleetRemaining: remaining,
      gameOver: remaining === 0,
    };
  }

  public fireMissileSalvo(centerX: number, centerY: number, damagePerHit: number): AttackReport[] {
    const reports: AttackReport[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        reports.push(this.fireAt(centerX + dx, centerY + dy, damagePerHit));
      }
    }
    return reports;
  }

  public sonarScan(centerX: number, centerY: number): number {
    let detected = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = centerX + dx;
        const ny = centerY + dy;
        if (nx >= 0 && nx < this.GRID_SIZE && ny >= 0 && ny < this.GRID_SIZE) {
          if (this.grid[ny][nx] === "SHIP") {
            this.grid[ny][nx] = "SONAR_DETECTED";
            detected++;
          }
        }
      }
    }
    return detected;
  }

  public getRemainingShipsCount(): number {
    return this.fleet.filter((s) => !s.isDestroyed).length;
  }

  public isFleetDestroyed(): boolean {
    return this.getRemainingShipsCount() === 0;
  }
}

// ============================================================================
// CONEXIÓN CON EL DOM (HTML & CANVAS)
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  const game = new ModernWarshipsBattleship();
  const canvas = document.getElementById("battleGridCanvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const cellPixelSize = canvas.width / game.GRID_SIZE; // 4px por celda en canvas 400x400

  let currentMode: FireMode = "MISSILE";
  let hoverPos: { x: number; y: number } | null = null;

  const form = document.getElementById("warshipForm") as HTMLFormElement;
  const resetGameBtn = document.getElementById("resetGameBtn") as HTMLButtonElement;
  const btnModeCannon = document.getElementById("btnModeCannon") as HTMLButtonElement;
  const btnModeMissile = document.getElementById("btnModeMissile") as HTMLButtonElement;
  const btnSonarScan = document.getElementById("btnSonarScan") as HTMLButtonElement;
  const combatModeBadge = document.getElementById("combatModeBadge")!;
  const hoverCoords = document.getElementById("hoverCoords")!;
  const shotsStats = document.getElementById("shotsStats")!;
  const combatLog = document.getElementById("combatLog")!;
  const enemyFleetList = document.getElementById("enemyFleetList")!;
  const fleetCounter = document.getElementById("fleetCounter")!;
  const fleetAlert = document.getElementById("fleetAlert")!;
  const playerShipLabel = document.getElementById("playerShipLabel")!;

  function addLog(message: string, type: "info" | "hit" | "sunk" | "victory" = "info"): void {
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.textContent = `> ${message}`;
    combatLog.prepend(entry);
  }

  function renderFleetList(): void {
    enemyFleetList.innerHTML = "";
    for (const ship of game.fleet) {
      const li = document.createElement("li");
      if (ship.isDestroyed) li.classList.add("destroyed");
      const statusText = ship.isDestroyed ? "HUNDIDO" : `${ship.currentHp}/${ship.maxHp} HP`;
      li.innerHTML = `<span>[${ship.shipClass}] ${ship.name} (${ship.width}x${ship.length})</span><strong>${statusText}</strong>`;
      enemyFleetList.appendChild(li);
    }

    const rem = game.getRemainingShipsCount();
    fleetCounter.textContent = `${rem} / 7`;
    fleetAlert.textContent = rem === 0 ? "FLOTA ANIQUILADA" : `${rem} OBJETIVOS ACTIVOS`;
    shotsStats.textContent = `DISPAROS: ${game.totalShots} | IMPACTOS: ${game.totalHits}`;
  }

  function drawGrid(): void {
    ctx.fillStyle = "#030811";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar estado de cada celda 100x100
    for (let y = 0; y < game.GRID_SIZE; y++) {
      for (let x = 0; x < game.GRID_SIZE; x++) {
        const state = game.grid[y][x];
        if (state === "MISS") {
          ctx.fillStyle = "rgba(0, 243, 255, 0.22)";
          ctx.fillRect(x * cellPixelSize, y * cellPixelSize, cellPixelSize, cellPixelSize);
        } else if (state === "HIT") {
          ctx.fillStyle = "#ff2a6d";
          ctx.fillRect(x * cellPixelSize, y * cellPixelSize, cellPixelSize, cellPixelSize);
        } else if (state === "SONAR_DETECTED") {
          ctx.fillStyle = "#fcee0a";
          ctx.fillRect(x * cellPixelSize, y * cellPixelSize, cellPixelSize, cellPixelSize);
        }
      }
    }

    // Líneas de cuadrícula cada 10 celdas para orientación táctica
    ctx.strokeStyle = "rgba(0, 243, 255, 0.14)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= game.GRID_SIZE; i += 10) {
      const pos = i * cellPixelSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    // Retícula de apuntado al pasar el ratón
    if (hoverPos) {
      const radius = currentMode === "CANNON" ? 0 : currentMode === "MISSILE" ? 1 : 2;
      ctx.strokeStyle = currentMode === "SONAR" ? "#fcee0a" : "#00f3ff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        (hoverPos.x - radius) * cellPixelSize,
        (hoverPos.y - radius) * cellPixelSize,
        (radius * 2 + 1) * cellPixelSize,
        (radius * 2 + 1) * cellPixelSize
      );
    }
  }

  function setMode(mode: FireMode): void {
    currentMode = mode;
    btnModeCannon.classList.toggle("active", mode === "CANNON");
    btnModeMissile.classList.toggle("active", mode === "MISSILE");
    btnSonarScan.classList.toggle("active", mode === "SONAR");
    combatModeBadge.textContent = mode === "CANNON" ? "CAÑÓN 1x1" : mode === "MISSILE" ? "SALVA 3x3" : "SONAR 5x5";
    drawGrid();
  }

  btnModeCannon.addEventListener("click", () => setMode("CANNON"));
  btnModeMissile.addEventListener("click", () => setMode("MISSILE"));
  btnSonarScan.addEventListener("click", () => setMode("SONAR"));

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = game.GRID_SIZE / rect.width;
    const scaleY = game.GRID_SIZE / rect.height;
    const gx = Math.floor((e.clientX - rect.left) * scaleX);
    const gy = Math.floor((e.clientY - rect.top) * scaleY);
    hoverPos = { x: Math.max(0, Math.min(99, gx)), y: Math.max(0, Math.min(99, gy)) };
    hoverCoords.textContent = `CURSOR: X:${hoverPos.x} Y:${hoverPos.y}`;
    drawGrid();
  });

  canvas.addEventListener("mouseleave", () => {
    hoverPos = null;
    hoverCoords.textContent = "CURSOR: X:-- Y:--";
    drawGrid();
  });

  canvas.addEventListener("click", () => {
    if (!hoverPos || game.isFleetDestroyed()) return;

    const cannonDmg = Number((document.getElementById("mainCannon") as HTMLSelectElement).value);
    const missileDmg = Number((document.getElementById("missiles") as HTMLSelectElement).value);

    if (currentMode === "SONAR") {
      const found = game.sonarScan(hoverPos.x, hoverPos.y);
      addLog(`SONAR en (${hoverPos.x}, ${hoverPos.y}): ${found} secciones enemigas detectadas.`, found > 0 ? "hit" : "info");
    } else if (currentMode === "CANNON") {
      const rep = game.fireAt(hoverPos.x, hoverPos.y, cannonDmg);
      processReports([rep]);
    } else {
      const reps = game.fireMissileSalvo(hoverPos.x, hoverPos.y, missileDmg);
      processReports(reps);
    }

    renderFleetList();
    drawGrid();
  });

  function processReports(reports: AttackReport[]): void {
    let hits = 0;
    for (const r of reports) {
      if (r.result === "HIT") hits++;
      if (r.result === "SUNK") {
        addLog(`¡OBJETIVO HUNDIDO! ${r.shipHit} destruido en (${r.x}, ${r.y}).`, "sunk");
      }
      if (r.gameOver) {
        addLog("🏆 ¡VICTORIA TOTAL! Los 7 buques enemigos han sido destruidos.", "victory");
        break;
      }
    }
    if (hits > 0 && !game.isFleetDestroyed()) {
      addLog(`Impacto confirmado (${hits} celdas alcanzadas).`, "hit");
    }
  }

  // Vinculación con el formulario de configuración del buque
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const shipName = (document.getElementById("shipName") as HTMLInputElement).value.trim() || "UNIDAD SIN NOMBRE";
    const shipClass = (document.getElementById("shipClass") as HTMLSelectElement).value;
    playerShipLabel.textContent = `MANDO: ${shipName.toUpperCase()} [${shipClass}]`;
    addLog(`Unidad "${shipName}" desplegada en combate. Selecciona coordenadas en el radar 100x100.`, "hit");
  });

  resetGameBtn.addEventListener("click", () => {
    setTimeout(() => {
      game.resetGame();
      combatLog.innerHTML = "";
      addLog("Mapa 100x100 reiniciado. 7 nuevos buques enemigos desplegados en secreto.", "info");
      renderFleetList();
      drawGrid();
    }, 10);
  });

  // Inicializar interfaz
  renderFleetList();
  drawGrid();
});