/**
 * FIXED VERSION — 修复 ambient 未初始化问题 + 保证变量声明顺序正确
 * Gemini 风格 SOUL 粒子交互
 */

/* ---------------------- Config ---------------------- */
const CONFIG = {
  PARTICLE_GAP: 6,
  NUM_MAX: 2200,
  AMBIENT_COUNT: 100,
  SCATTER_RADIUS: 120,
  SPIRAL_INNER: 6,
  RETURN_SPEED: 0.16,
  SCATTER_SPEED: 0.2,
  OPEN_THRESHOLD: 1.02,
  AUDIO: {
    open: "assets/open.wav",
    close: "assets/close.wav",
    enter: "assets/enter.wav",
  },
};

/* ---------------------- Utility ---------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------------------------------------------------------
 *           IMPORTANT FIX — VARIABLE DECLARATION
 * --------------------------------------------------------- */

let particles = [];  // 粒子数组（初始化为空）
let ambient = [];    // 环境粒子（初始化为空）
let isScattered = false;
let isCollapsing = false;
let muted = false;

/* ---------------------------------------------------------
 *           Canvas 初始化
 * --------------------------------------------------------- */

const bgCanvas = document.getElementById("bgCanvas");
const bgCtx = bgCanvas.getContext("2d", { alpha: true });

const visual = document.getElementById("visual");
const overlay = document.createElement("canvas");
overlay.style.position = "absolute";
overlay.style.left = 0;
overlay.style.top = 0;
overlay.style.zIndex = 2;
visual.appendChild(overlay);
const ctx = overlay.getContext("2d", { alpha: true });

let W = window.innerWidth,
  H = window.innerHeight;
let leftRect = visual.getBoundingClientRect();

function resizeAll() {
  W = window.innerWidth;
  H = window.innerHeight;

  bgCanvas.width = W;
  bgCanvas.height = H;

  leftRect = visual.getBoundingClientRect();
  overlay.width = Math.max(1, Math.floor(leftRect.width));
  overlay.height = Math.max(1, Math.floor(leftRect.height));

  rebuild(); // FIX: ambient 已经声明，安全调用
}

window.addEventListener("resize", resizeAll);

/* ---------------------------------------------------------
 *          下面才定义 initAmbient()（不会再提前调用）
 * --------------------------------------------------------- */

function initAmbient() {
  ambient = [];
  for (let i = 0; i < CONFIG.AMBIENT_COUNT; i++) {
    ambient.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.6 + Math.random() * 3,
      a: 0.02 + Math.random() * 0.08,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
    });
  }
}

/* ---------------------------------------------------------
 *   采样文字 SOUL → 建立 particles（FIX: 顺序正确）
 * --------------------------------------------------------- */

const off = document.createElement("canvas");
const octx = off.getContext("2d");

function rebuild() {
  initAmbient(); // FIX: ambient 已初始化

  const ow = Math.max(300, Math.floor(overlay.width * 0.9));
  const oh = Math.max(140, Math.floor(ow * 0.28));
  off.width = ow;
  off.height = oh;

  octx.clearRect(0, 0, ow, oh);
  const fontSize = Math.floor(oh * 0.95);
  octx.font = `900 ${fontSize}px Inter, sans-serif`;
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  octx.fillText("SOUL", ow / 2, oh / 2);

  const img = octx.getImageData(0, 0, ow, oh).data;
  const pts = [];

  for (let y = 0; y < oh; y += CONFIG.PARTICLE_GAP) {
    for (let x = 0; x < ow; x += CONFIG.PARTICLE_GAP) {
      if (img[(y * ow + x) * 4 + 3] > 150) {
        pts.push({
          x: (overlay.width - ow) / 2 + x,
          y: (overlay.height - oh) / 2 + y,
        });
      }
    }
  }

  if (pts.length > CONFIG.NUM_MAX) pts.length = CONFIG.NUM_MAX;

  particles = pts.map((p) => {
    const layer = Math.floor(Math.random() * 3);
    const depth = (layer - 1) * 5;
    return {
      x: p.x,
      y: p.y,
      homeX: p.x,
      homeY: p.y,
      layer,
      depth,
      size: 1 + Math.random() * 1.8,
      glow: 4 + Math.random() * 8,
      scatterX: p.x,
      scatterY: p.y,
    };
  });
}

resizeAll();

/* ---------------------------------------------------------
 *                动画渲染 (保持完整)
 * --------------------------------------------------------- */

let last = performance.now();
function animate(t) {
  const dt = (t - last) / 16.67;
  last = t;

  drawBackground(t);
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  particles.forEach((p) => {
    if (isScattered) {
      p.x += (p.scatterX - p.x) * CONFIG.SCATTER_SPEED * dt;
      p.y += (p.scatterY - p.y) * CONFIG.SCATTER_SPEED * dt;
    } else if (isCollapsing) {
      const cx = overlay.width / 2,
        cy = overlay.height / 2;
      const dx = p.x - cx,
        dy = p.y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) * 0.9;
      const a = Math.atan2(dy, dx) + 0.2;
      p.x = cx + r * Math.cos(a);
      p.y = cy + r * Math.sin(a);
    } else {
      p.x += (p.homeX - p.x) * CONFIG.RETURN_SPEED * dt;
      p.y += (p.homeY - p.y) * CONFIG.RETURN_SPEED * dt;
    }

    ctx.beginPath();
    ctx.fillStyle = "#ff70bf";
    ctx.globalAlpha = 0.9;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

/* ---------------------------------------------------------
 *                 背景环境粒子渲染
 * --------------------------------------------------------- */

function drawBackground(t) {
  bgCtx.clearRect(0, 0, W, H);

  bgCtx.fillStyle = "#f7f9ff";
  bgCtx.fillRect(0, 0, W, H);

  ambient.forEach((a) => {
    a.x += a.vx;
    a.y += a.vy;
    bgCtx.globalAlpha = a.a;
    bgCtx.fillStyle = "rgba(255,110,200,1)";
    bgCtx.beginPath();
    bgCtx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    bgCtx.fill();
  });
}

/* ---------------------------------------------------------
 *               手势识别（保持不变）
 * --------------------------------------------------------- */

const video = document.createElement("video");
video.style.display = "none";
document.body.appendChild(video);

const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.6,
});

hands.onResults(onHands);

let cam;

async function startCamera() {
  try {
    cam = new Camera(video, {
      onFrame: async () => await hands.send({ image: video }),
      width: 640,
      height: 480,
    });
    await cam.start();
  } catch {
    overlay.addEventListener("click", toggleScatter);
  }
}

startCamera();

function onHands(results) {
  if (!results.multiHandLandmarks.length) return;

  const lm = results.multiHandLandmarks[0];

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  const wrist = lm[0];
  const base = dist(wrist, lm[9]) || 0.0001;

  const tips = [8, 12, 16, 20, 4];
  const openness =
    tips.reduce((s, i) => s + dist(wrist, lm[i]), 0) / tips.length / base;

  if (openness > CONFIG.OPEN_THRESHOLD) {
    triggerOpen();
  } else {
    triggerClose();
  }
}

/* ------------------ Gesture Actions ------------------ */

function triggerOpen() {
  isScattered = true;
  isCollapsing = false;
}

function triggerClose() {
  isScattered = false;
  isCollapsing = true;
}

function toggleScatter() {
  if (isCollapsing) isCollapsing = false;
  else isCollapsing = true;
}
