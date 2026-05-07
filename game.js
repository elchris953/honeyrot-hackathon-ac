const GRID_SIZE = 8;
const TILE_SIZE = 80;
const FLOWER_MAX_LIFE = 115;
const MAX_ROT = 8;
const INITIAL_SPAWN_INTERVAL = 3000;
const MIN_SPAWN_INTERVAL = 620;

const FLOWER_SPAWN_PULSE_TIME = 650;
const LOW_LIFE_WARNING_RATIO = 0.28;
const SCREEN_SHAKE_TIME = 260;
const FLOATING_TEXT_LIFE = 900;
const PARTICLE_LIFE = 520;
const WITHER_DURATION = 7800;
const WITHERED_DECAY_MULTIPLIER = 2.35;
const STARTING_FLOWER_DENSITY = 1;
const MAX_DECAYING_FLOWERS = 15;
const DECAY_LIMIT_RAMP_START = 120000;
const DECAY_LIMIT_RAMP_DURATION = 180000;
const PETAL_COUNT = 8;
const PETAL_DROP_BASE_RATE = 0.00005;
const PETAL_PARTICLE_LIFE = 1500;
const MAX_PETAL_PARTICLES = 120;
const REVIVE_DURATION = 2500;
const FLOWER_RESET_SCORE = 1;
const RANDOM_DECAY_INTERVAL = 3200;
const RANDOM_DECAY_VARIANCE = 1700;
const INITIAL_CLUSTERS_MIN = 2;
const INITIAL_CLUSTERS_MAX = 3;
const CLUSTER_SIZE_MIN = 3;
const CLUSTER_SIZE_MAX = 5;

const DIFFICULTIES = {
  Easy: {
    decayMultiplier: 0.78,
    spawnMultiplier: 1.22,
    rampDuration: 130000,
    clusterChance: 0.24,
    clusterDecayMultiplier: 0.055,
    startingDecayLimit: 2,
    finalDecayLimit: 9,
    witherInterval: 11000,
    witherVariance: 4500
  },
  Normal: {
    decayMultiplier: 1,
    spawnMultiplier: 1,
    rampDuration: 105000,
    clusterChance: 0.42,
    clusterDecayMultiplier: 0.08,
    startingDecayLimit: 3,
    finalDecayLimit: 12,
    witherInterval: 8200,
    witherVariance: 3400
  },
  Hard: {
    decayMultiplier: 1.23,
    spawnMultiplier: 0.78,
    rampDuration: 80000,
    clusterChance: 0.62,
    clusterDecayMultiplier: 0.11,
    startingDecayLimit: 4,
    finalDecayLimit: 15,
    witherInterval: 5800,
    witherVariance: 2600
  }
};

const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const rotCountEl = document.getElementById("rot-count");
const timeEl = document.getElementById("time");
const difficultyEl = document.getElementById("difficulty");
const restartButton = document.getElementById("restart");

canvas.width = GRID_SIZE * TILE_SIZE;
canvas.height = GRID_SIZE * TILE_SIZE;

// Central game state. Keeping mutable data in one object makes restart and
// update/render boundaries easier to reason about.
const state = {
  mode: "difficulty",
  selectedDifficulty: "Normal",
  bee: { x: 0, y: 0 },
  flowers: [],
  rottenFlowers: [],
  particles: [],
  petalParticles: [],
  floatingTexts: [],
  score: 0,
  lastTime: 0,
  worldTime: 0,
  gameplayTime: 0,
  spawnTimer: 0,
  spawnInterval: INITIAL_SPAWN_INTERVAL,
  decayTimer: 0,
  nextDecayAt: 0,
  witherTimer: 0,
  nextWitherAt: 0,
  revive: null,
  screenShakeTimer: 0
};

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

function resetGame(nextMode = "playing", difficultyName = state.selectedDifficulty) {
  state.mode = nextMode;
  state.selectedDifficulty = difficultyName;
  state.bee = {
    x: Math.floor(GRID_SIZE / 2),
    y: Math.floor(GRID_SIZE / 2)
  };
  state.flowers = [];
  state.rottenFlowers = [];
  state.particles = [];
  state.petalParticles = [];
  state.floatingTexts = [];
  state.score = 0;
  state.lastTime = 0;
  state.worldTime = 0;
  state.gameplayTime = 0;
  state.spawnTimer = 0;
  state.spawnInterval = INITIAL_SPAWN_INTERVAL;
  state.decayTimer = 0;
  state.nextDecayAt = getNextRandomDecayDelay();
  state.witherTimer = 0;
  state.nextWitherAt = getNextWitherDelay();
  state.spawnInterval = getCurrentSpawnInterval();
  state.revive = null;
  state.screenShakeTimer = 0;

  if (nextMode === "playing") {
    seedStartingGarden();
  }

  updateHud();
}

function gameLoop(timestamp) {
  const deltaTime = state.lastTime ? Math.min(timestamp - state.lastTime, 80) : 0;
  state.lastTime = timestamp;
  state.worldTime += deltaTime;
  state.screenShakeTimer = Math.max(0, state.screenShakeTimer - deltaTime);

  updateEffects(deltaTime);

  if (state.mode === "playing") {
    updateGame(deltaTime);
  }

  renderGame();
  requestAnimationFrame(gameLoop);
}

function updateHud() {
  scoreEl.textContent = state.score;
  rotCountEl.textContent = `${state.rottenFlowers.length} / ${MAX_ROT}`;
  timeEl.textContent = formatTime(state.gameplayTime);
  difficultyEl.textContent = state.mode === "difficulty"
    ? "-"
    : `${state.selectedDifficulty} ${(state.spawnInterval / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function handleKeyDown(event) {
  const key = event.key.toLowerCase();

  if (state.mode === "difficulty") {
    const difficultyFromKey = getDifficultyFromKey(key);

    if (difficultyFromKey) {
      event.preventDefault();
      startGame(difficultyFromKey);
    }

    return;
  }

  if (key === "r") {
    resetGame("playing");
    return;
  }

  if ((key === " " || key === "enter") && state.mode === "gameover") {
    event.preventDefault();
    resetGame("playing");
    return;
  }

  const direction = getMovementDirection(key);
  if (!direction) {
    return;
  }

  event.preventDefault();
  moveBee(direction.x, direction.y);
}

function getDifficultyFromKey(key) {
  const keyMap = {
    1: "Easy",
    2: "Normal",
    3: "Hard",
    e: "Easy",
    n: "Normal",
    h: "Hard"
  };

  return keyMap[key];
}

function startGame(difficultyName) {
  resetGame("playing", difficultyName);
}

function getMovementDirection(key) {
  const directions = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 }
  };

  return directions[key];
}

function moveBee(dx, dy) {
  if (state.mode !== "playing") {
    return;
  }

  const nextX = state.bee.x + dx;
  const nextY = state.bee.y + dy;

  if (!isInsideGrid(nextX, nextY)) {
    return;
  }

  state.bee.x = nextX;
  state.bee.y = nextY;
  resetReviveProgress();
  updateHud();
}

// ---------------------------------------------------------------------------
// Update logic
// ---------------------------------------------------------------------------

function updateGame(deltaTime) {
  state.gameplayTime += deltaTime;

  updateSpawnSystem(deltaTime);
  updateRandomDecaySystem(deltaTime);
  updateWitherSystem(deltaTime);
  updateReviveSystem(deltaTime);
  updateFlowers(deltaTime);

  if (state.rottenFlowers.length >= MAX_ROT) {
    state.mode = "gameover";
  }

  updateHud();
}

function updateSpawnSystem(deltaTime) {
  state.spawnInterval = getCurrentSpawnInterval();
  state.spawnTimer += deltaTime;

  if (state.spawnTimer < state.spawnInterval) {
    return;
  }

  state.spawnTimer -= state.spawnInterval;

  if (state.flowers.length < getMaxActiveFlowers()) {
    spawnFlowerGroup();
  }
}

function updateFlowers(deltaTime) {
  for (let i = state.flowers.length - 1; i >= 0; i--) {
    const flower = state.flowers[i];

    flower.age += deltaTime;

    if (shouldFlowerDecay(flower)) {
      const decayRate = getFlowerDecayRate(flower);
      flower.currentLife -= decayRate * (deltaTime / 1000);
      maybeShedPetal(flower, deltaTime);
    }

    if (isFlowerWithered(flower) && state.gameplayTime >= flower.witheredUntil) {
      flower.witheredUntil = 0;
    }

    if (flower.currentLife <= 0) {
      turnFlowerRotten(i);
    }
  }
}

function updateRandomDecaySystem(deltaTime) {
  state.decayTimer += deltaTime;

  if (state.decayTimer < state.nextDecayAt) {
    return;
  }

  state.decayTimer = 0;
  state.nextDecayAt = getNextRandomDecayDelay();
  startRandomFlowerDecay();
}

function updateWitherSystem(deltaTime) {
  state.witherTimer += deltaTime;

  if (state.witherTimer < state.nextWitherAt) {
    return;
  }

  state.witherTimer = 0;
  state.nextWitherAt = getNextWitherDelay();
  witherRandomFlower();
}

function updateReviveSystem(deltaTime) {
  if (hasRottenFlowerAt(state.bee.x, state.bee.y)) {
    resetReviveProgress();
    return;
  }

  const flower = getFlowerAt(state.bee.x, state.bee.y);
  if (!flower || !isFlowerDamaged(flower)) {
    resetReviveProgress();
    return;
  }

  if (!state.revive || state.revive.x !== flower.x || state.revive.y !== flower.y) {
    state.revive = {
      x: flower.x,
      y: flower.y,
      progress: 0,
      shouldScore: isFlowerDamaged(flower)
    };
  }

  state.revive.progress += deltaTime;

  if (state.revive.progress >= REVIVE_DURATION) {
    completeFlowerRevive(flower, state.revive.shouldScore);
    state.revive = null;
  }
}

function completeFlowerRevive(flower, shouldScore) {
  const center = getTileCenter(flower.x, flower.y);

  flower.currentLife = flower.maxLife;
  flower.age = 0;
  flower.decaying = false;
  flower.witheredUntil = 0;

  if (shouldScore) {
    state.score += FLOWER_RESET_SCORE;
    addFloatingText(center.x, center.y, "+1 revive");
  }

  addParticleBurst(center.x, center.y);
}

function resetReviveProgress() {
  state.revive = null;
}

function turnFlowerRotten(flowerIndex) {
  const flower = state.flowers[flowerIndex];

  state.flowers.splice(flowerIndex, 1);

  if (state.rottenFlowers.length < MAX_ROT && !hasRottenFlowerAt(flower.x, flower.y)) {
    state.rottenFlowers.push({
      x: flower.x,
      y: flower.y,
      bornAt: state.worldTime
    });
  }

  state.screenShakeTimer = SCREEN_SHAKE_TIME;
}

// ---------------------------------------------------------------------------
// Spawning and balance
// ---------------------------------------------------------------------------

function seedStartingGarden() {
  const targetFlowerCount = Math.floor((GRID_SIZE * GRID_SIZE - 1) * STARTING_FLOWER_DENSITY);

  while (state.flowers.length < targetFlowerCount && spawnSingleFlower(true)) {
    // Fill every valid tile with healthy flowers while preserving the bee tile.
  }
}

function spawnFlowerGroup() {
  const shouldSpawnCluster = Math.random() < getDifficultyConfig().clusterChance;

  if (shouldSpawnCluster) {
    spawnFlowerCluster(randomInt(CLUSTER_SIZE_MIN, CLUSTER_SIZE_MAX));
    return;
  }

  spawnSingleFlower();
}

function spawnSingleFlower(isInitial = false) {
  const openTiles = getOpenFlowerTiles();
  if (openTiles.length === 0) {
    return false;
  }

  const tile = openTiles[Math.floor(Math.random() * openTiles.length)];
  state.flowers.push(createFlower(tile.x, tile.y, isInitial));
  return true;
}

function spawnFlowerCluster(targetSize = randomInt(CLUSTER_SIZE_MIN, CLUSTER_SIZE_MAX), isInitial = false) {
  const openTiles = getOpenFlowerTiles();
  if (openTiles.length === 0) {
    return false;
  }

  const origin = openTiles[Math.floor(Math.random() * openTiles.length)];
  const clusterTiles = growClusterFrom(origin, targetSize);

  if (clusterTiles.length === 0) {
    return spawnSingleFlower(isInitial);
  }

  clusterTiles.forEach((tile) => {
    state.flowers.push(createFlower(tile.x, tile.y, isInitial));
  });

  return true;
}

function growClusterFrom(origin, targetSize) {
  const clusterTiles = [origin];
  let frontier = [origin];

  while (clusterTiles.length < targetSize && frontier.length > 0) {
    const source = frontier[Math.floor(Math.random() * frontier.length)];
    const neighbors = shuffle(getNeighborTiles(source.x, source.y));
    const nextTile = neighbors.find((tile) => canSpawnFlowerAt(tile.x, tile.y, clusterTiles));

    if (!nextTile) {
      frontier = frontier.filter((tile) => tile !== source);
      continue;
    }

    clusterTiles.push(nextTile);
    frontier.push(nextTile);
  }

  return clusterTiles;
}

function createFlower(x, y, isInitial = false) {
  const ramp = getDifficultyRamp();
  const lifeBonus = Math.round(22 * (1 - ramp));
  const maxLife = FLOWER_MAX_LIFE + lifeBonus;

  return {
    x,
    y,
    maxLife,
    currentLife: maxLife,
    age: isInitial ? FLOWER_SPAWN_PULSE_TIME : 0,
    decaying: false,
    witheredUntil: 0
  };
}

function getOpenFlowerTiles() {
  const tiles = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (canSpawnFlowerAt(x, y)) {
        tiles.push({ x, y });
      }
    }
  }

  return tiles;
}

function canSpawnFlowerAt(x, y, reservedTiles = []) {
  return isInsideGrid(x, y)
    && !isBeeAt(x, y)
    && !hasFlowerAt(x, y)
    && !hasRottenFlowerAt(x, y)
    && !reservedTiles.some((tile) => tile.x === x && tile.y === y);
}

function getDifficultyRamp() {
  return clamp(state.gameplayTime / getDifficultyConfig().rampDuration, 0, 1);
}

function getDifficultyConfig() {
  return DIFFICULTIES[state.selectedDifficulty];
}

function getCurrentSpawnInterval() {
  const ramp = getDifficultyRamp();
  const easedRamp = easeInOutCubic(ramp);
  const baseInterval = INITIAL_SPAWN_INTERVAL - (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * easedRamp;
  return Math.max(MIN_SPAWN_INTERVAL, baseInterval * getDifficultyConfig().spawnMultiplier);
}

function getMaxActiveFlowers() {
  const ramp = getDifficultyRamp();
  return Math.floor(52 + ramp * 10);
}

function getBaseDecayRate() {
  const ramp = getDifficultyRamp();
  return (1.35 + ramp * 4.55) * getDifficultyConfig().decayMultiplier;
}

function getRotDecayBonus() {
  const ramp = getDifficultyRamp();
  return (3.6 + ramp * 5.8) * getDifficultyConfig().decayMultiplier;
}

function getFlowerDecayRate(flower) {
  const adjacentFlowers = countAdjacentFlowers(flower.x, flower.y);
  const adjacentRot = countAdjacentRottenFlowers(flower.x, flower.y);
  const clusterBonus = adjacentFlowers * getDifficultyConfig().clusterDecayMultiplier;
  const witherBonus = isFlowerWithered(flower) ? WITHERED_DECAY_MULTIPLIER : 1;

  return (getBaseDecayRate() + adjacentRot * getRotDecayBonus()) * (1 + clusterBonus) * witherBonus;
}

function getNextRandomDecayDelay() {
  const ramp = getDifficultyRamp();
  const softStart = state.gameplayTime < 25000 ? 1.8 : 1;
  const pressureDelay = RANDOM_DECAY_INTERVAL * (1 - ramp * 0.45) * getDifficultyConfig().spawnMultiplier * softStart;

  return Math.max(1300, pressureDelay + randomBetween(-RANDOM_DECAY_VARIANCE, RANDOM_DECAY_VARIANCE));
}

function getNextWitherDelay() {
  const config = getDifficultyConfig();
  const ramp = getDifficultyRamp();
  const pressureDelay = config.witherInterval * (1 - ramp * 0.38);

  return Math.max(2200, pressureDelay + randomBetween(-config.witherVariance, config.witherVariance));
}

function startRandomFlowerDecay() {
  if (countDecayingFlowers() >= getMaxDecayingFlowers()) {
    return;
  }

  const candidates = state.flowers.filter((flower) => !flower.decaying && !isFlowerWithered(flower));

  if (candidates.length === 0) {
    return;
  }

  const flower = candidates[Math.floor(Math.random() * candidates.length)];
  flower.decaying = true;
}

function witherRandomFlower() {
  if (countDecayingFlowers() >= getMaxDecayingFlowers()) {
    return;
  }

  const candidates = state.flowers.filter((flower) => !flower.decaying && !isFlowerWithered(flower));

  if (candidates.length === 0) {
    return;
  }

  const flower = candidates[Math.floor(Math.random() * candidates.length)];
  flower.decaying = true;
  flower.witheredUntil = state.gameplayTime + WITHER_DURATION;

  const center = getTileCenter(flower.x, flower.y);
  addFloatingText(center.x, center.y, "wither!");
}

function countDecayingFlowers() {
  return state.flowers.filter((flower) => shouldFlowerDecay(flower)).length;
}

function getMaxDecayingFlowers() {
  const config = getDifficultyConfig();
  const ramp = clamp((state.gameplayTime - DECAY_LIMIT_RAMP_START) / DECAY_LIMIT_RAMP_DURATION, 0, 1);
  const easedRamp = easeInOutCubic(ramp);
  const limit = Math.round(config.startingDecayLimit + (config.finalDecayLimit - config.startingDecayLimit) * easedRamp);

  return Math.min(MAX_DECAYING_FLOWERS, limit);
}

function countAdjacentRottenFlowers(x, y) {
  let count = 0;

  state.rottenFlowers.forEach((rot) => {
    const dx = Math.abs(rot.x - x);
    const dy = Math.abs(rot.y - y);

    if (dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0)) {
      count += 1;
    }
  });

  return count;
}

function countAdjacentFlowers(x, y) {
  let count = 0;

  state.flowers.forEach((flower) => {
    const dx = Math.abs(flower.x - x);
    const dy = Math.abs(flower.y - y);

    if (dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0)) {
      count += 1;
    }
  });

  return count;
}

function isFlowerWithered(flower) {
  return flower.witheredUntil > state.gameplayTime;
}

function shouldFlowerDecay(flower) {
  return flower.decaying || isFlowerWithered(flower);
}

// ---------------------------------------------------------------------------
// Particles and effects
// ---------------------------------------------------------------------------

function updateEffects(deltaTime) {
  updateParticles(deltaTime);
  updatePetalParticles(deltaTime);
  updateFloatingTexts(deltaTime);
}

function updateParticles(deltaTime) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const particle = state.particles[i];
    particle.age += deltaTime;
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vy += 0.0007 * deltaTime;

    if (particle.age >= particle.life) {
      state.particles.splice(i, 1);
    }
  }
}

function updatePetalParticles(deltaTime) {
  for (let i = state.petalParticles.length - 1; i >= 0; i--) {
    const petal = state.petalParticles[i];
    petal.age += deltaTime;
    petal.x += petal.vx * deltaTime + Math.sin((petal.age + petal.swayOffset) * 0.006) * 0.18;
    petal.y += petal.vy * deltaTime;
    petal.rotation += petal.spin * deltaTime;
    petal.vy += 0.00012 * deltaTime;

    if (petal.age >= petal.life) {
      state.petalParticles.splice(i, 1);
    }
  }
}

function updateFloatingTexts(deltaTime) {
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const text = state.floatingTexts[i];
    text.age += deltaTime;
    text.y -= 0.035 * deltaTime;

    if (text.age >= text.life) {
      state.floatingTexts.splice(i, 1);
    }
  }
}

function addFloatingText(x, y, text) {
  state.floatingTexts.push({
    x,
    y: y - 22,
    text,
    age: 0,
    life: FLOATING_TEXT_LIFE
  });
}

function addParticleBurst(x, y) {
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.035 + Math.random() * 0.08;

    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.035,
      radius: 2 + Math.random() * 3,
      color: Math.random() > 0.45 ? "#ffe84d" : "#fff3a3",
      age: 0,
      life: PARTICLE_LIFE + Math.random() * 180
    });
  }
}

function maybeShedPetal(flower, deltaTime) {
  const lifeRatio = clamp(flower.currentLife / flower.maxLife, 0, 1);
  const decayAmount = 1 - lifeRatio;

  if (decayAmount < 0.08) {
    return;
  }

  const witherBoost = isFlowerWithered(flower) ? 1.8 : 1;
  const chance = PETAL_DROP_BASE_RATE * deltaTime * (0.35 + decayAmount * 2.4) * witherBoost;

  if (state.petalParticles.length < MAX_PETAL_PARTICLES && Math.random() < chance) {
    addFallingPetal(flower, getFlowerDecayColor(lifeRatio));
  }
}

function addFallingPetal(flower, color) {
  const center = getTileCenter(flower.x, flower.y);
  const angle = Math.random() * Math.PI * 2;
  const distance = randomBetween(8, 18);

  state.petalParticles.push({
    x: center.x + Math.cos(angle) * distance,
    y: center.y + Math.sin(angle) * distance,
    vx: randomBetween(-0.018, 0.018),
    vy: randomBetween(0.018, 0.052),
    rotation: angle,
    spin: randomBetween(-0.006, 0.006),
    width: randomBetween(6, 10),
    height: randomBetween(3, 5),
    color,
    age: 0,
    life: PETAL_PARTICLE_LIFE + randomBetween(-300, 420),
    swayOffset: randomBetween(0, 1000)
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  applyScreenShake();
  drawGarden();
  drawRottenFlowers();
  drawFlowers();
  drawPetalParticles();
  drawParticles();
  drawBee();
  drawFloatingTexts();
  ctx.restore();

  if (state.mode === "difficulty") {
    drawDifficultyScreen();
  }

  if (state.mode === "gameover") {
    drawGameOver();
  }
}

function applyScreenShake() {
  if (state.screenShakeTimer <= 0) {
    return;
  }

  const intensity = 7 * (state.screenShakeTimer / SCREEN_SHAKE_TIME);
  ctx.translate(randomBetween(-intensity, intensity), randomBetween(-intensity, intensity));
}

function drawGarden() {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      const isLight = (x + y) % 2 === 0;
      const gardenBreath = 0.04 + Math.sin(state.worldTime * 0.0014 + x * 0.7 + y) * 0.025;

      ctx.fillStyle = isLight ? "#5a3d2e" : "#493126";
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = `rgba(123, 184, 78, ${gardenBreath})`;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.strokeStyle = "rgba(28, 18, 13, 0.42)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

      drawGrassTuft(px, py, x, y);
    }
  }
}

function drawGrassTuft(px, py, x, y) {
  const seed = (x * 17 + y * 29) % 41;
  const sway = Math.sin(state.worldTime * 0.004 + seed) * 2.4;
  const tuftX = px + 12 + (seed % 48);
  const tuftY = py + 18 + ((seed * 3) % 42);

  ctx.strokeStyle = "rgba(139, 207, 100, 0.34)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tuftX, tuftY + 9);
  ctx.lineTo(tuftX - 4 + sway, tuftY);
  ctx.moveTo(tuftX, tuftY + 9);
  ctx.lineTo(tuftX + 5 + sway, tuftY + 1);
  ctx.stroke();
}

function drawFlowers() {
  state.flowers.forEach((flower) => {
    const center = getTileCenter(flower.x, flower.y);
    const lifeRatio = clamp(flower.currentLife / flower.maxLife, 0, 1);
    const petalColor = getFlowerDecayColor(lifeRatio);
    const spawnPulse = getSpawnPulse(flower.age);
    const warningPulse = getWarningPulse(lifeRatio);
    const witherPulse = isFlowerWithered(flower) ? 0.5 + Math.sin(state.worldTime * 0.02) * 0.5 : 0;
    const visiblePetals = getVisiblePetalCount(lifeRatio);
    const petalDistance = 15 + spawnPulse * 4;

    drawStem(center.x, center.y);

    if (isFlowerWithered(flower)) {
      drawWitheredMark(center.x, center.y, witherPulse);
    }

    if (warningPulse > 0) {
      drawWarningRing(center.x, center.y, warningPulse);
    }

    if (isRevivingFlower(flower)) {
      drawReviveProgressRing(center.x, center.y, state.revive.progress / REVIVE_DURATION);
    }

    for (let i = 0; i < PETAL_COUNT; i++) {
      if (i >= visiblePetals) {
        continue;
      }

      const petalAngle = (Math.PI * 2 * i) / PETAL_COUNT;
      const petalWidth = 9 + spawnPulse * 3 + warningPulse;
      const petalHeight = 16 + spawnPulse * 4 + warningPulse * 2;
      const finalColor = isFlowerWithered(flower) ? blendColors(petalColor, "#6b2b69", 0.42) : petalColor;

      drawPetal(
        center.x + Math.cos(petalAngle) * petalDistance,
        center.y + Math.sin(petalAngle) * petalDistance,
        petalWidth,
        petalHeight,
        petalAngle,
        finalColor
      );
    }

    drawCircle(center.x, center.y, 9 + spawnPulse * 2, blendColors("#fff3a3", petalColor, 0.3));
    drawLifeBar(flower.x, flower.y, lifeRatio);
  });
}

function getFlowerDecayColor(lifeRatio) {
  const stages = [
    { stop: 1, color: "#ffe84d" },
    { stop: 0.68, color: "#ff9f1c" },
    { stop: 0.34, color: "#9f5a2d" },
    { stop: 0, color: "#5f646c" }
  ];

  for (let i = 0; i < stages.length - 1; i++) {
    const current = stages[i];
    const next = stages[i + 1];

    if (lifeRatio <= current.stop && lifeRatio >= next.stop) {
      const range = current.stop - next.stop;
      return blendColors(current.color, next.color, (current.stop - lifeRatio) / range);
    }
  }

  return stages[stages.length - 1].color;
}

function getSpawnPulse(age) {
  if (age >= FLOWER_SPAWN_PULSE_TIME) {
    return 0;
  }

  const progress = age / FLOWER_SPAWN_PULSE_TIME;
  return Math.sin(progress * Math.PI) * (1 - progress * 0.45);
}

function getWarningPulse(lifeRatio) {
  if (lifeRatio > LOW_LIFE_WARNING_RATIO) {
    return 0;
  }

  return 0.5 + Math.sin(state.worldTime * 0.018) * 0.5;
}

function getVisiblePetalCount(lifeRatio) {
  if (lifeRatio > 0.72) {
    return PETAL_COUNT;
  }

  return Math.max(2, Math.ceil(PETAL_COUNT * (0.18 + lifeRatio * 0.82)));
}

function drawPetal(x, y, width, height, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWarningRing(centerX, centerY, pulse) {
  ctx.strokeStyle = `rgba(255, 48, 36, ${0.3 + pulse * 0.46})`;
  ctx.lineWidth = 3 + pulse * 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 27 + pulse * 8, 0, Math.PI * 2);
  ctx.stroke();
}

function drawReviveProgressRing(centerX, centerY, progress) {
  const clampedProgress = clamp(progress, 0, 1);

  ctx.strokeStyle = "rgba(255, 247, 209, 0.34)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 35, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#f6be34";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clampedProgress);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawWitheredMark(centerX, centerY, pulse) {
  ctx.strokeStyle = `rgba(116, 31, 112, ${0.62 + pulse * 0.26})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX - 23, centerY - 20);
  ctx.lineTo(centerX + 23, centerY + 20);
  ctx.moveTo(centerX + 20, centerY - 22);
  ctx.lineTo(centerX - 20, centerY + 22);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 190, 67, ${0.32 + pulse * 0.32})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 31 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawStem(centerX, centerY) {
  ctx.strokeStyle = "#5fab43";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + 6);
  ctx.lineTo(centerX, centerY + 27);
  ctx.stroke();
}

function drawLifeBar(tileX, tileY, ratio) {
  const x = tileX * TILE_SIZE + 14;
  const y = tileY * TILE_SIZE + TILE_SIZE - 14;
  const width = TILE_SIZE - 28;

  ctx.fillStyle = "rgba(26, 18, 14, 0.56)";
  ctx.fillRect(x, y, width, 6);
  ctx.fillStyle = ratio > 0.4 ? "#8ee05d" : "#ef8354";
  ctx.fillRect(x, y, width * ratio, 6);
}

function drawRottenFlowers() {
  state.rottenFlowers.forEach((rot) => {
    const center = getTileCenter(rot.x, rot.y);
    const age = state.worldTime - rot.bornAt;
    const pulse = 0.5 + Math.sin(age * 0.006) * 0.5;
    const coreRadius = 21 + pulse * 3;

    ctx.fillStyle = `rgba(28, 7, 28, ${0.18 + pulse * 0.14})`;
    ctx.beginPath();
    ctx.arc(center.x, center.y + 4, 30 + pulse * 5, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      const angle = -0.2 + i * 0.28;
      drawPetal(
        center.x - 18 + i * 9,
        center.y + 18 + Math.sin(i) * 3,
        10,
        19,
        angle,
        i % 2 === 0 ? "#241820" : "#342632"
      );
    }

    drawCircle(center.x, center.y + 8, coreRadius, "#211721");
    drawCircle(center.x - 9, center.y, 8 + pulse * 2, "#4a3b31");
    drawCircle(center.x + 8, center.y - 3, 7 + pulse * 1.5, "#3e3330");
    drawCircle(center.x + 2, center.y + 12, 5 + pulse * 2, "#151017");

    ctx.strokeStyle = "#0f0b10";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(center.x - 14, center.y + 23);
    ctx.lineTo(center.x + 12, center.y - 12);
    ctx.stroke();

    ctx.strokeStyle = `rgba(119, 70, 123, ${0.32 + pulse * 0.24})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x - 22, center.y + 4);
    ctx.quadraticCurveTo(center.x - 4, center.y - 16, center.x + 18, center.y + 1);
    ctx.moveTo(center.x - 13, center.y + 22);
    ctx.quadraticCurveTo(center.x + 8, center.y + 6, center.x + 24, center.y + 18);
    ctx.stroke();
  });
}

function drawParticles() {
  state.particles.forEach((particle) => {
    const progress = particle.age / particle.life;

    ctx.globalAlpha = 1 - progress;
    drawCircle(particle.x, particle.y, particle.radius * (1 - progress * 0.4), particle.color);
    ctx.globalAlpha = 1;
  });
}

function drawPetalParticles() {
  state.petalParticles.forEach((petal) => {
    const progress = petal.age / petal.life;

    ctx.globalAlpha = 1 - progress;
    drawPetal(petal.x, petal.y, petal.width, petal.height, petal.rotation, petal.color);
    ctx.globalAlpha = 1;
  });
}

function drawBee() {
  const center = getTileCenter(state.bee.x, state.bee.y);
  const centerY = center.y + Math.sin(state.worldTime * 0.008) * 2;
  const wingHeight = 13 + Math.abs(Math.sin(state.worldTime * 0.04)) * 7;

  drawBeeWing(center.x - 13, centerY - 11, -0.55, wingHeight);
  drawBeeWing(center.x + 13, centerY - 11, 0.55, wingHeight);

  ctx.fillStyle = "#f6be34";
  ctx.beginPath();
  ctx.ellipse(center.x, centerY, 22, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#211914";
  ctx.beginPath();
  ctx.ellipse(center.x - 17, centerY, 5, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(center.x, centerY, 5, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(center.x + 16, centerY, 4, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  drawCircle(center.x - 8, centerY - 6, 3, "#17100e");
  drawCircle(center.x + 8, centerY - 6, 3, "#17100e");

  ctx.strokeStyle = "#17100e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, centerY + 1, 8, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = "#211914";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center.x - 8, centerY - 17);
  ctx.quadraticCurveTo(center.x - 15, centerY - 28, center.x - 21, centerY - 25);
  ctx.moveTo(center.x + 8, centerY - 17);
  ctx.quadraticCurveTo(center.x + 15, centerY - 28, center.x + 21, centerY - 25);
  ctx.stroke();
}

function drawBeeWing(x, y, rotation, height) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "rgba(226, 245, 255, 0.76)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFloatingTexts() {
  state.floatingTexts.forEach((text) => {
    const progress = text.age / text.life;

    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = "#fff7d1";
    ctx.strokeStyle = "rgba(35, 24, 15, 0.76)";
    ctx.lineWidth = 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.strokeText(text.text, text.x, text.y);
    ctx.fillText(text.text, text.x, text.y);
    ctx.globalAlpha = 1;
  });
}

function drawDifficultyScreen() {
  ctx.fillStyle = "rgba(20, 12, 15, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#f6be34";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 58px Georgia, serif";
  ctx.fillText("Honeyrot", canvas.width / 2, 126);

  ctx.fillStyle = "#fff7d1";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("Choose difficulty", canvas.width / 2, 184);

  ctx.fillStyle = "rgba(255, 247, 209, 0.82)";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText("Hold still on a damaged flower to revive it before petals fall away.", canvas.width / 2, 222);
  ctx.fillText("Clusters decay faster together. Random wither marks accelerate decay.", canvas.width / 2, 246);

  getDifficultyButtonRects().forEach((button, index) => {
    const isSelected = button.name === state.selectedDifficulty;

    ctx.fillStyle = isSelected ? "#f6be34" : "rgba(255, 247, 209, 0.13)";
    ctx.strokeStyle = isSelected ? "#fff7d1" : "rgba(255, 247, 209, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(button.x, button.y, button.width, button.height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isSelected ? "#241b18" : "#fff7d1";
    ctx.font = "800 24px system-ui, sans-serif";
    ctx.fillText(button.name, button.x + button.width / 2, button.y + 30);

    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText(`${index + 1} / ${button.key}`, button.x + button.width / 2, button.y + 58);
  });

  ctx.fillStyle = "#fff7d1";
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillText("Click a difficulty or press 1, 2, 3", canvas.width / 2, 526);
}

function drawGameOver() {
  drawOverlayPanel(
    "Garden Lost",
    `Score: ${state.score} nectar  Time: ${formatTime(state.gameplayTime)}`,
    "Press R or Restart"
  );
}

function drawOverlayPanel(title, lineOne, lineTwo) {
  ctx.fillStyle = "rgba(20, 12, 15, 0.78)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#fff7d1";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 58px Georgia, serif";
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 52);

  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(lineOne, canvas.width / 2, canvas.height / 2 + 8);

  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText(lineTwo, canvas.width / 2, canvas.height / 2 + 52);
}

// ---------------------------------------------------------------------------
// Tile helpers and utilities
// ---------------------------------------------------------------------------

function getDifficultyButtonRects() {
  const width = 150;
  const height = 86;
  const gap = 22;
  const startX = (canvas.width - width * DIFFICULTY_NAMES.length - gap * (DIFFICULTY_NAMES.length - 1)) / 2;
  const y = 328;

  return DIFFICULTY_NAMES.map((name, index) => ({
    name,
    key: name[0],
    x: startX + index * (width + gap),
    y,
    width,
    height
  }));
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function getDifficultyAtPoint(point) {
  return getDifficultyButtonRects().find((button) => {
    return point.x >= button.x
      && point.x <= button.x + button.width
      && point.y >= button.y
      && point.y <= button.y + button.height;
  });
}

function isInsideGrid(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

function getTileCenter(x, y) {
  return {
    x: x * TILE_SIZE + TILE_SIZE / 2,
    y: y * TILE_SIZE + TILE_SIZE / 2
  };
}

function getNeighborTiles(x, y) {
  const tiles = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nextX = x + dx;
      const nextY = y + dy;

      if (isInsideGrid(nextX, nextY)) {
        tiles.push({ x: nextX, y: nextY });
      }
    }
  }

  return tiles;
}

function isBeeAt(x, y) {
  return state.bee.x === x && state.bee.y === y;
}

function getFlowerAt(x, y) {
  return state.flowers.find((flower) => flower.x === x && flower.y === y);
}

function hasFlowerAt(x, y) {
  return state.flowers.some((flower) => flower.x === x && flower.y === y);
}

function hasRottenFlowerAt(x, y) {
  return state.rottenFlowers.some((rot) => rot.x === x && rot.y === y);
}

function isFlowerDamaged(flower) {
  return flower.currentLife < flower.maxLife - 0.5 || flower.decaying || isFlowerWithered(flower);
}

function isRevivingFlower(flower) {
  return state.revive
    && state.revive.x === flower.x
    && state.revive.y === flower.y;
}

function drawCircle(x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function blendColors(startHex, endHex, amount) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const clampedAmount = clamp(amount, 0, 1);
  const r = Math.round(start.r + (end.r - start.r) * clampedAmount);
  const g = Math.round(start.g + (end.g - start.g) * clampedAmount);
  const b = Math.round(start.b + (end.b - start.b) * clampedAmount);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function shuffle(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

window.addEventListener("keydown", handleKeyDown);

canvas.addEventListener("click", (event) => {
  if (state.mode === "difficulty") {
    const button = getDifficultyAtPoint(getCanvasPoint(event));

    if (button) {
      startGame(button.name);
    }

    return;
  }

  if (state.mode === "gameover") {
    resetGame("playing");
  }
});

restartButton.addEventListener("click", () => resetGame("playing"));

resetGame("difficulty");
requestAnimationFrame(gameLoop);
