"use strict";

const SIZE = 8;
const START = { x: 0.5, y: 0.5 };
const EXIT = { x: SIZE - 0.5, y: SIZE + 0.22 };
const BALL_RADIUS = 0.17;
const WALL_WIDTH = 0.075;
const RECORD_KEY = "microbit-maze-times-v1";
const STEP = 1 / 120;
const directions = [
  { dx: 0, dy: -1, wall: 1, opposite: 4 },
  { dx: 1, dy: 0, wall: 2, opposite: 8 },
  { dx: 0, dy: 1, wall: 4, opposite: 1 },
  { dx: -1, dy: 0, wall: 8, opposite: 2 },
];

function makeMaze(seed) {
  const cells = Array.from({ length: SIZE * SIZE }, () => 15);
  const visited = new Set([0]);
  const path = [0];
  while (path.length) {
    const current = path.at(-1);
    const x = current % SIZE;
    const y = Math.floor(current / SIZE);
    const choices = directions.filter(({ dx, dy }) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && !visited.has(ny * SIZE + nx);
    });
    if (!choices.length) {
      path.pop();
      continue;
    }
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const direction = choices[Math.floor(seed / 4294967296 * choices.length)];
    const next = current + direction.dy * SIZE + direction.dx;
    cells[current] &= ~direction.wall;
    cells[next] &= ~direction.opposite;
    visited.add(next);
    path.push(next);
  }
  cells[cells.length - 1] &= ~4;
  return cells;
}

function buildWalls(cells) {
  const segments = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = cells[y * SIZE + x];
      if (cell & 1) segments.push([x, y, x + 1, y]);
      if (cell & 8) segments.push([x, y, x, y + 1]);
      if (x === SIZE - 1 && cell & 2) segments.push([x + 1, y, x + 1, y + 1]);
      if (y === SIZE - 1 && cell & 4) segments.push([x, y + 1, x + 1, y + 1]);
    }
  }
  return segments
    .map(([x1, y1, x2, y2]) => ({
      left: x1 - WALL_WIDTH / 2,
      top: y1 - WALL_WIDTH / 2,
      right: x2 + WALL_WIDTH / 2,
      bottom: y2 + WALL_WIDTH / 2,
    }))
    .sort((a, b) => a.bottom - b.bottom);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hitsWall(x, y, walls) {
  return walls.some(wall => {
    const dx = x - clamp(x, wall.left, wall.right);
    const dy = y - clamp(y, wall.top, wall.bottom);
    return dx * dx + dy * dy < BALL_RADIUS * BALL_RADIUS;
  });
}

function moveBall(ball, tilt, walls) {
  const drag = Math.exp(-2.65 * STEP);
  ball.vx = (ball.vx + tilt.x * 14 * STEP) * drag;
  ball.vy = (ball.vy + tilt.y * 14 * STEP) * drag;
  const x = ball.x + ball.vx * STEP;
  const y = ball.y + ball.vy * STEP;
  if (hitsWall(x, ball.y, walls)) ball.vx = 0;
  else ball.x = x;
  if (hitsWall(ball.x, y, walls)) ball.vy = 0;
  else ball.y = y;
}

function reachedExit(ball) {
  return ball.y >= EXIT.y && ball.x > SIZE - 1 && ball.x < SIZE;
}

function loadTimes() {
  const valid = value => Number.isFinite(value) && value > 0;
  try {
    const saved = JSON.parse(localStorage.getItem(RECORD_KEY));
    const recent = Array.isArray(saved?.recent) ? saved.recent.filter(valid).slice(0, 5) : [];
    const best = Math.min(valid(saved?.best) ? saved.best : Infinity, ...recent);
    return { recent, best };
  } catch {
    return { recent: [], best: Infinity };
  }
}

const byId = id => document.getElementById(id);
const canvas = byId("maze");
const context = canvas.getContext("2d");
const walls = buildWalls(makeMaze(28473));
const times = loadTimes();
const ball = { ...START, vx: 0, vy: 0 };
const boardTilt = { x: 0, y: 0 };
const tiltKeys = new Map([
  ["ArrowUp", "ArrowUp"], ["w", "ArrowUp"],
  ["ArrowLeft", "ArrowLeft"], ["a", "ArrowLeft"],
  ["ArrowDown", "ArrowDown"], ["s", "ArrowDown"],
  ["ArrowRight", "ArrowRight"], ["d", "ArrowRight"],
]);
const keys = new Set();
const taps = new Map();
const dpad = [...document.querySelectorAll("[data-key]")];
let acceleration = null;
let accelerationAt = 0;
let zero = { x: 0, y: 0 };
let connectionState = "idle";
let started = null;
let elapsed = 0;
let finished = false;
let previousFrame = null;
let accumulator = 0;

const formatTime = milliseconds => (milliseconds / 1000).toFixed(3);

function showTimes() {
  byId("best").textContent = Number.isFinite(times.best) ? formatTime(times.best) : "—";
  byId("empty-history").hidden = times.recent.length > 0;
  byId("scores").replaceChildren(...times.recent.map(time => {
    const item = document.createElement("li");
    const number = document.createElement("span");
    number.textContent = formatTime(time);
    item.append(number, " s");
    return item;
  }));
}

function finishRound() {
  finished = true;
  times.recent.unshift(elapsed);
  times.recent.length = Math.min(times.recent.length, 5);
  times.best = Math.min(times.best, elapsed);
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(times));
  } catch {
    // The current page still retains scores if storage is disabled.
  }
  showTimes();
  byId("message").textContent = "Exit reached";
  byId("finish-score").textContent = formatTime(elapsed) + " s";
  byId("finish").hidden = false;
  byId("again").focus({ preventScroll: true });
}

function resetRound() {
  Object.assign(ball, START, { vx: 0, vy: 0 });
  started = null;
  elapsed = 0;
  accumulator = 0;
  finished = false;
  keys.clear();
  taps.clear();
  byId("timer").textContent = "0.000";
  byId("message").textContent = "Move the ball to start the timer";
  byId("finish").hidden = true;
  canvas.focus({ preventScroll: true });
}

function readInput(now) {
  const active = new Set([...keys].map(key => tiltKeys.get(key)));
  for (const value of taps.values()) active.add(value);
  for (const button of dpad) button.dataset.pressed = active.has(button.dataset.key);
  if (active.size) {
    const x = Number(active.has("ArrowRight")) - Number(active.has("ArrowLeft"));
    const y = Number(active.has("ArrowDown")) - Number(active.has("ArrowUp"));
    const scale = x && y ? Math.SQRT1_2 : 1;
    return { x: x * scale, y: y * scale };
  }
  if (acceleration && now - accelerationAt < 900) {
    const response = value => Math.abs(value) < 0.04 ? 0 : clamp(value / 0.52, -1, 1);
    return { x: response(acceleration.x - zero.x), y: response(acceleration.y - zero.y) };
  }
  return { x: 0, y: 0 };
}

function project(x, y, z = 0) {
  const horizontal = x - SIZE / 2;
  const vertical = y - SIZE / 2;
  const perspective = 1 + vertical * 0.026 + horizontal * boardTilt.x * 0.012;
  return [
    380 + (horizontal * 70 + vertical * boardTilt.x * 4) * perspective,
    270 + vertical * (51 + boardTilt.y * 4) + horizontal * boardTilt.x * 5 - z * perspective,
  ];
}

function polygon(points, color, stroke) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = color;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function plate(left, top, right, bottom, color, z = 0, stroke) {
  polygon([project(left, top, z), project(right, top, z), project(right, bottom, z), project(left, bottom, z)], color, stroke);
}

function drawWall({ left, top, right, bottom }) {
  const height = 13;
  const a = project(left, bottom, height);
  const b = project(right, bottom, height);
  const c = project(right, top, height);
  const d = project(left, top, height);
  polygon([b, c, project(right, top), project(right, bottom)], "#397054");
  polygon([a, b, project(right, bottom), project(left, bottom)], "#497d5e");
  polygon([a, b, c, d], "#a9cc9d", "#a8cb9c");
}

function drawBall() {
  const [x, y] = project(ball.x, ball.y, 14);
  const [shadowX, shadowY] = project(ball.x + 0.045, ball.y + 0.055);
  const radius = BALL_RADIUS * 70 * (0.9 + ball.y / 40);
  context.beginPath();
  context.ellipse(shadowX, shadowY, radius * 1.13, radius * 0.53, 0, 0, 2 * Math.PI);
  context.fillStyle = "#101f16a0";
  context.fill();
  const glow = context.createRadialGradient(x - radius * 0.34, y - radius * 0.42, 0, x, y, radius);
  glow.addColorStop(0, "#ffe7bb");
  glow.addColorStop(0.37, "#ffab72");
  glow.addColorStop(0.75, "#f1754f");
  glow.addColorStop(1, "#a9412a");
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fillStyle = glow;
  context.fill();
}

function drawBoard() {
  context.clearRect(0, 0, 760, 552);
  context.save();
  context.shadowColor = "#07150eb0";
  context.shadowBlur = 25;
  context.shadowOffsetY = 13;
  plate(-0.18, -0.18, SIZE + 0.18, SIZE + 0.18, "#263d30", -12);
  context.restore();
  polygon([
    project(-0.16, SIZE + 0.16), project(SIZE + 0.16, SIZE + 0.16),
    project(SIZE + 0.18, SIZE + 0.18, -12), project(-0.18, SIZE + 0.18, -12),
  ], "#38664c");
  plate(-0.16, -0.16, SIZE + 0.16, SIZE + 0.16, "#234535", 0, "#628f72");

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const floor = (x + y) % 2 ? "#315642" : "#355b47";
      plate(x, y, x + 1, y + 1, floor, 0, "#284936");
    }
  }
  plate(0.15, 0.15, 0.85, 0.85, "#7b9e52", 0, "#d6f66d");
  const [startX, startY] = project(START.x, START.y);
  context.beginPath();
  context.ellipse(startX, startY, 17, 11, 0, 0, Math.PI * 2);
  context.strokeStyle = "#e5f8a7";
  context.stroke();

  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 6; column++) {
      const x = SIZE - 0.88 + column * 0.125;
      const y = SIZE - 0.28 + row * 0.125;
      plate(x, y, x + 0.126, y + 0.126, (row + column) % 2 ? "#594e33" : "#f5c579");
    }
  }
  const [exitX, exitY] = project(SIZE - 0.5, SIZE + 0.66);
  context.fillStyle = "#f5c579";
  context.textAlign = "center";
  context.font = "bold 17px system-ui, sans-serif";
  context.fillText("↓ Exit", exitX, exitY);

  const occludingWall = walls.findIndex(wall => wall.bottom > ball.y + 0.1);
  const split = occludingWall === -1 ? walls.length : occludingWall;
  for (let index = 0; index < split; index++) drawWall(walls[index]);
  drawBall();
  for (let index = split; index < walls.length; index++) drawWall(walls[index]);
}

function startRound(now) {
  if (started !== null || finished) return;
  started = now;
  byId("message").textContent = "Timer running · Roll to the exit";
}

function update(now) {
  const tilt = readInput(now);
  if (previousFrame === null) previousFrame = now;
  const frame = Math.min((now - previousFrame) / 1000, 0.05);
  previousFrame = now;
  const blend = 1 - Math.exp(-9 * frame);
  boardTilt.x += (tilt.x - boardTilt.x) * blend;
  boardTilt.y += (tilt.y - boardTilt.y) * blend;

  if (!finished) {
    if (tilt.x || tilt.y) startRound(now);
    if (started !== null) {
      elapsed = Math.max(0, now - started);
      accumulator += frame;
      while (accumulator >= STEP && !finished) {
        moveBall(ball, tilt, walls);
        accumulator -= STEP;
        if (reachedExit(ball)) finishRound();
      }
      byId("timer").textContent = formatTime(elapsed);
    }
  }
  drawBoard();
  requestAnimationFrame(update);
}

function updateConnection(state, message) {
  if (state === connectionState && byId("ble-status").textContent === message) return;
  connectionState = state;
  const connected = state === "waiting" || state === "ready";
  byId("connect").disabled = state === "connecting";
  byId("connect-label").textContent = connected ? "Disconnect micro:bit" : "Connect micro:bit";
  byId("ble-status").textContent = message;
  byId("ble-dot").dataset.state = state;
  byId("calibrate").hidden = state !== "ready";
  byId("tilt").hidden = state !== "ready";
  if (!connected) {
    acceleration = null;
    zero = { x: 0, y: 0 };
  }
}

const bluetooth = new MicrobitConnection(updateConnection, (sample, at) => {
  acceleration = sample;
  accelerationAt = at;
  for (const axis of ["x", "y", "z"]) byId("axis-" + axis).textContent = sample[axis].toFixed(2) + " g";
});

byId("connect").addEventListener("click", () => {
  if (bluetooth.device) bluetooth.close();
  else bluetooth.connect();
});
byId("calibrate").addEventListener("click", () => {
  if (!acceleration || performance.now() - accelerationAt >= 900) return;
  zero = { x: acceleration.x, y: acceleration.y };
  ball.vx = 0;
  ball.vy = 0;
  byId("message").textContent = "Level calibrated";
});
byId("reset").addEventListener("click", resetRound);
byId("again").addEventListener("click", resetRound);
document.querySelector(".guide-link").addEventListener("click", () => { byId("setup").open = true; });

function pulseDirection(direction, duration) {
  startRound(performance.now());
  const tap = Symbol();
  taps.set(tap, direction);
  setTimeout(() => taps.delete(tap), duration);
}

window.addEventListener("keydown", event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!tiltKeys.has(key) || event.altKey || event.ctrlKey || event.metaKey || event.target.matches?.("input, textarea, select, [contenteditable]")) return;
  event.preventDefault();
  if (!keys.has(key)) pulseDirection(tiltKeys.get(key), 85);
  keys.add(key);
});
window.addEventListener("keyup", event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener("blur", () => {
  keys.clear();
  taps.clear();
});

for (const button of dpad) {
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    taps.set(event.pointerId, button.dataset.key);
    pulseDirection(button.dataset.key, 85);
    if (button.hasPointerCapture(event.pointerId) === false) button.setPointerCapture(event.pointerId);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, event => taps.delete(event.pointerId));
  }
  button.addEventListener("click", event => {
    pulseDirection(button.dataset.key, event.detail === 0 ? 240 : 85);
  });
}

function sizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  context.setTransform(canvas.width / 760, 0, 0, canvas.height / 552, 0, 0);
  drawBoard();
}

showTimes();
sizeCanvas();
window.addEventListener("resize", sizeCanvas);
requestAnimationFrame(update);
