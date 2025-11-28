/**
 * Fullscreen SOUL particle logo with single-hand control.
 * - Open palm: slight scatter
 * - Fist: dynamic spiral collapse into bright 3D-ish SOUL
 */

const CFG = {
  GAP: 6,
  MAX_PARTICLES: 2200,
  AMBIENT_COUNT: 120,
  SCATTER_RADIUS: 140,
  RETURN_SPEED: 0.16,
  SCATTER_SPEED: 0.22,
  OPEN_THRESHOLD: 1.02,
  AUDIO: {
    open: "assets/open.wav",
    close: "assets/close.wav",
    enter: "assets/enter.wav",
  },
};

let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

let W = window.innerWidth;
let H = window.innerHeight;

canvas.width = W;
canvas.height = H;

window.addEventListener("resize", () => {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  rebuildText();
});

const rand = (a, b) => a + Math.random() * (b - a);

let particles = [];
let ambient = [];
let isScattered = false;
let isCollapsing = false;
let muted = false;

let collapseProgress = 0;

// 初始化环境粒子
function initAmbient() {
  ambient = [];
  for (let i = 0; i < CFG.AMBIENT_COUNT; i++) {
    ambient.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: rand(0.6, 2.4),
      a: rand(0.02, 0.09),
    });
  }
}

// 采样 SOUL 字样生成粒子
const off = document.createElement("canvas");
const octx = off.getContext("2d");

function rebuildText() {
  initAmbient();

  const base = Math.min(W, H) * 0.55;
  const ow = base;
  const oh = base * 0.28;

  off.width = ow;
  off.height = oh;

  octx.clearRect(0, 0, ow, oh);
  const fontSize = Math.floor(oh * 0.9);
  octx.fillStyle = "#fff";
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  octx.font = `900 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  octx.fillText("SOUL", ow / 2, oh / 2 + oh * 0.02);

  const img = octx.getImageData(0, 0, ow, oh).data;
  const pts = [];
  for (let y = 0; y < oh; y += CFG.GAP) {
    for (let x = 0; x < ow; x += CFG.GAP) {
      const a = img[(y * ow + x) * 4 + 3];
      if (a > 160) {
        const cx = W / 2 - ow / 2 + x;
        const cy = H * 0.45 - oh / 2 + y;
        pts.push({ x: cx, y: cy });
      }
    }
  }
  if (pts.length > CFG.MAX_PARTICLES) pts.length = CFG.MAX_PARTICLES;

  particles = pts.map((p, i) => {
    const layer = Math.floor(Math.random() * 3); // 0 back, 1 mid, 2 front
    const depth = (layer - 1) * 6;
    const homeX = p.x + depth * 0.2;
    const homeY = p.y + depth * 0.6;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: homeX + rand(-20, 20),
      y: homeY + rand(-20, 20),
      homeX,
      homeY,
      layer,
      depth,
      size: rand(1.0, 2.3),
      glow: rand(6, 11),
      scatterX: homeX + Math.cos(angle) * rand(40, CFG.SCATTER_RADIUS),
      scatterY: homeY + Math.sin(angle) * rand(30, CFG.SCATTER_RADIUS),
    };
  });
}

rebuildText();

/* ---------------- 渲染主循环 ---------------- */

let last = performance.now();

function render(t) {
  const dt = (t - last) / 16.67;
  last = t;

  // 背景
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createRadialGradient(
    W * 0.15,
    H * 0.15,
    0,
    W * 0.5,
    H * 0.6,
    Math.max(W, H)
  );
  g.addColorStop(0, "#18182f");
  g.addColorStop(0.4, "#070719");
  g.addColorStop(1, "#02020a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 环境粒子
  for (const a of ambient) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (a.x < -40) a.x = W + 40;
    if (a.x > W + 40) a.x = -40;
    if (a.y < -40) a.y = H + 40;
    if (a.y > H + 40) a.y = -40;

    ctx.globalAlpha = a.a;
    ctx.fillStyle = "rgba(180,200,255,1)";
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 粒子层：后 -> 中 -> 前
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.layer !== pass) continue;

      const cx = W / 2;
      const cy = H * 0.45;

      if (isScattered) {
        // 轻微散开，目标为 scatterX/Y
        const tx =
          p.scatterX + Math.sin((t / 900 + i * 0.01)) * 2.0 * (p.layer + 1);
        const ty =
          p.scatterY + Math.cos((t / 1000 + i * 0.013)) * 2.0 * (p.layer + 1);
        p.x += (tx - p.x) * CFG.SCATTER_SPEED * dt;
        p.y += (ty - p.y) * CFG.SCATTER_SPEED * dt;
      } else if (isCollapsing) {
        // 动态收拢：螺旋 + 半径缩小
        const dx = p.x - cx;
        const dy = p.y - cy;
        const r0 = Math.sqrt(dx * dx + dy * dy) || 1;
        const angle = Math.atan2(dy, dx) + 0.3 * dt * (1.2 + p.layer * 0.3);
        const r = Math.max(6 + p.layer * 2, r0 * (0.9 - 0.02 * p.layer));
        const tx = cx + r * Math.cos(angle);
        const ty = cy + r * Math.sin(angle);
        p.x += (tx - p.x) * 0.35 * dt;
        p.y += (ty - p.y) * 0.35 * dt;
      } else {
        // 回到 home (保持立体字样)
        p.x += (p.homeX - p.x) * CFG.RETURN_SPEED * dt;
        p.y += (p.homeY - p.y) * CFG.RETURN_SPEED * dt;
      }

      // glow
      ctx.globalAlpha = 0.05 + p.layer * 0.03;
      ctx.fillStyle = "rgba(255,90,190,1)";
      ctx.beginPath();
      ctx.ellipse(
        p.x,
        p.y + p.depth * 0.4,
        p.glow * 2.3,
        p.glow * 1.8,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // 核心粒子
      ctx.globalAlpha = 1;
      const color =
        p.layer === 2
          ? "#ffe7ff"
          : p.layer === 1
          ? "#ffd0ff"
          : "#b3d4ff";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

/* --------------- 手势识别：单手张开/握拳 --------------- */

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

hands.onResults(onHandsResults);

let cam = null;

async function startCamera() {
  try {
    cam = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480,
    });
    await cam.start();
  } catch (e) {
    console.warn("camera start failed:", e);
    // 如果摄像头失败，可以点击屏幕手动切换动画
    canvas.addEventListener("click", toggleMode);
  }
}

startCamera();

let prevOpen = null;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function onHandsResults(res) {
  if (!res.multiHandLandmarks || res.multiHandLandmarks.length === 0) return;
  const lm = res.multiHandLandmarks[0];

  const wrist = lm[0];
  const base = dist(wrist, lm[9]) || 0.0001;
  const tips = [8, 12, 16, 20, 4];
  let sum = 0;
  for (const i of tips) sum += dist(wrist, lm[i]);
  const avg = sum / tips.length;
  const openness = avg / base;
  const isOpen = openness > CFG.OPEN_THRESHOLD;

  if (prevOpen === null) {
    prevOpen = isOpen;
    return;
  }
  if (isOpen === prevOpen) return;
  prevOpen = isOpen;

  if (isOpen) {
    onOpenPalm();
  } else {
    onFist();
  }
}

/* --------------- 状态切换与音效 ---------------- */

function playSound(kind) {
  const path = CFG.AUDIO[kind];
  if (!path || muted) return;
  try {
    const a = new Audio(path);
    a.play();
  } catch (e) {
    // ignore
  }
}

function onOpenPalm() {
  isScattered = true;
  isCollapsing = false;
  collapseProgress = 0;
  playSound("open");

  for (const p of particles) {
    const angle = Math.random() * Math.PI * 2;
    const radius = rand(40, CFG.SCATTER_RADIUS);
    p.scatterX = p.homeX + Math.cos(angle) * radius;
    p.scatterY = p.homeY + Math.sin(angle) * radius;
  }
}

function onFist() {
  isScattered = false;
  isCollapsing = true;
  collapseProgress = 0;
  playSound("close");
}

function toggleMode() {
  if (isCollapsing) {
    isCollapsing = false;
    isScattered = true;
    onOpenPalm();
  } else if (isScattered) {
    onFist();
  } else {
    onOpenPalm();
  }
}

/* --------------- 进入网站按钮绑定 --------------- */

const enterBtn = document.getElementById("enterBtn");
if (enterBtn) {
  enterBtn.addEventListener("click", () => {
    playSound("enter");
    window.location.href = "social.html"; // 跳转到你的网站页
  });
}
