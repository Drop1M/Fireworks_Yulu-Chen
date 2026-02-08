// public/sketch.js (CLIENT)
// ------------------------------------------------------
// Multiplayer fireworks:
// - click/tap to launch at position
// - choose colour, size, shape
// - emits "launch" over socket.io
// - receives "launch" from others and renders it
// - renders recent "history" on join

const socket = io();

// --- UI elements (p5 DOM) ---
let colorPicker;
let sizeSlider;
let shapeSelect;

let isPointerDownOnCanvas = false;

// For retina screens: keep the simulation stable
let dpr = 1;

// Local fireworks list (visual only)
const fireworks = [];

// --- Shapes you can choose ---
const SHAPES = [
  { key: "burst", label: "Burst (classic)" },
  { key: "ring", label: "Ring" },
  { key: "star", label: "Star" },
  { key: "spiral", label: "Spiral" },
];

// ------------------------------------------------------
// p5 setup
function setup() {
  dpr = pixelDensity();
  const c = createCanvas(windowWidth, windowHeight);
  c.parent("sketch-holder");

  // Night sky
  background(0);
  noStroke();

  setupUI();

  // Socket events
  socket.on("connect", () => {
    console.log("connected:", socket.id);
  });

  socket.on("history", (history) => {
    // History is an array of "launch" objects
    if (Array.isArray(history)) {
      for (const fw of history) {
        spawnFireworkFromNetwork(fw, true);
      }
    }
  });

  socket.on("launch", (fw) => {
    spawnFireworkFromNetwork(fw, false);
  });
}

// ------------------------------------------------------
// UI
function setupUI() {
  // Colour picker
  colorPicker = createColorPicker("#ffcc33");
  colorPicker.parent("colorPicker");

  // Size slider
  sizeSlider = createSlider(0.4, 2.2, 1.0, 0.05);
  sizeSlider.parent("sizeSlider");

  // Shape select
  shapeSelect = createSelect();
  for (const s of SHAPES) {
    shapeSelect.option(s.label, s.key);
  }
  shapeSelect.selected("burst");
  shapeSelect.parent("shapeSelect");
}

// ------------------------------------------------------
// Draw loop
function draw() {
  // Keep trails with transparent black
  // (Do not clear fully, gives beautiful persistence)
  fill(0, 0, 0, 18);
  rect(0, 0, width, height);

  // Subtle stars
  drawStars();

  // Update fireworks
  for (let i = fireworks.length - 1; i >= 0; i--) {
    fireworks[i].update();
    fireworks[i].draw();
    if (fireworks[i].isDead()) fireworks.splice(i, 1);
  }
}

// ------------------------------------------------------
// Interaction: click/tap to launch
function mousePressed() {
  // If clicked on UI panel, ignore
  if (isOverUI(mouseX, mouseY)) return;
  isPointerDownOnCanvas = true;
  launchAt(mouseX, mouseY);
}

function touchStarted() {
  if (touches.length === 0) return false;
  const tx = touches[0].x;
  const ty = touches[0].y;
  if (isOverUI(tx, ty)) return false;
  isPointerDownOnCanvas = true;
  launchAt(tx, ty);
  return false;
}

function mouseReleased() {
  isPointerDownOnCanvas = false;
}

function touchEnded() {
  isPointerDownOnCanvas = false;
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(0);
}

// ------------------------------------------------------
// Launch: create payload + emit
function launchAt(x, y) {
  // Normalise coordinates so different screen sizes work
  const nx = constrain(x / width, 0, 1);
  const ny = constrain(y / height, 0, 1);

  const col = color(colorPicker.value());
  const payload = {
    // time helps with replay ordering if needed
    t: Date.now(),

    // position normalised
    x: nx,
    y: ny,

    // user parameters
    size: Number(sizeSlider.value()),
    shape: String(shapeSelect.value()),

    // colour as RGB
    col: { r: red(col), g: green(col), b: blue(col) },

    // optional: who launched
    from: socket.id,
  };

  // Emit to server
  socket.emit("launch", payload);

  // (We also render locally when server echoes back,
  // so we don't double-spawn here.)
}

// ------------------------------------------------------
// Spawn from network (history or live)
function spawnFireworkFromNetwork(fw, isHistory) {
  if (!fw || typeof fw !== "object") return;

  const x = (fw.x ?? 0.5) * width;
  const y = (fw.y ?? 0.5) * height;

  // Convert colour
  const c = color(
    fw.col?.r ?? 255,
    fw.col?.g ?? 255,
    fw.col?.b ?? 255
  );

  const size = constrain(Number(fw.size ?? 1.0), 0.4, 2.2);
  const shape = String(fw.shape ?? "burst");

  fireworks.push(new Firework(x, y, c, size, shape, isHistory));
}

// ------------------------------------------------------
// Small helper: detect if pointer is over UI
function isOverUI(x, y) {
  // The UI is top-left 12px, width 240px, approx height ~ 190px
  // Keep it simple (robust enough for workshop)
  const left = 12, top = 12, w = 240, h = 220;
  return x >= left && x <= left + w && y >= top && y <= top + h;
}

// ------------------------------------------------------
// Stars (cheap)
function drawStars() {
  // a few twinkly pixels
  for (let i = 0; i < 10; i++) {
    const sx = random(width);
    const sy = random(height);
    const a = random(20, 80);
    fill(255, 255, 255, a);
    rect(sx, sy, 1, 1);
  }
}

// ------------------------------------------------------
// Firework class (pure client-side visual)
class Firework {
  constructor(x, y, col, size, shape, isHistory) {
    this.x = x;
    this.y = y;
    this.col = col;
    this.size = size;
    this.shape = shape;

    // history fireworks start slightly faded so they don't overpower
    this.baseAlpha = isHistory ? 140 : 220;

    this.particles = [];
    this.life = 0;
    this.maxLife = 90; // frames

    this.createParticles();
  }

  createParticles() {
    const count = Math.floor(80 * this.size);
    const speed = 2.2 * this.size;

    for (let i = 0; i < count; i++) {
      let angle = random(TWO_PI);
      let r = random(0.6, 1.0);

      // Shape variations
      if (this.shape === "ring") {
        r = 1.0; // fixed radius impulse
      } else if (this.shape === "star") {
        // Star spikes: quantize angle a bit
        const spikes = 8;
        angle = (Math.round((angle / TWO_PI) * spikes) / spikes) * TWO_PI + random(-0.08, 0.08);
        r = random(0.8, 1.0);
      } else if (this.shape === "spiral") {
        // spiral: velocity angle rotates with index
        angle = (i / count) * TWO_PI * 3.0;
        r = random(0.7, 1.0);
      }

      const vx = Math.cos(angle) * speed * r;
      const vy = Math.sin(angle) * speed * r;

      this.particles.push({
        px: this.x,
        py: this.y,
        vx,
        vy,
        drag: random(0.97, 0.992),
        grav: random(0.012, 0.03) * this.size,
        alpha: this.baseAlpha,
        size: random(2.0, 4.2) * this.size,
      });
    }
  }

  update() {
    this.life++;

    for (const p of this.particles) {
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.grav;

      p.px += p.vx;
      p.py += p.vy;

      // Fade out
      p.alpha *= 0.965;
    }
  }

  draw() {
    for (const p of this.particles) {
      const a = constrain(p.alpha, 0, 255);
      fill(red(this.col), green(this.col), blue(this.col), a);

      // soft glow by drawing a slightly bigger dot behind
      rect(p.px, p.py, p.size, p.size);
    }
  }

  isDead() {
    return this.life > this.maxLife;
  }
}
