/**
 * 高级版：3D 粒子 Soul + 手势控制爆炸星云
 */

const CFG = {
  GAP: 2,                  // 文本采样间距
  MAX_PARTICLES: 13000,    // 粒子上限
  DENSITY: 0.78,           // 采样稀释
  AMBIENT_COUNT: 260,      // 背景星点
  RETURN_SPEED: 0.06,      // 回 Soul 
  SCATTER_SPEED: 0.06,     // 向散开目标插值速度
  OPEN_THRESHOLD: 1.02     // 手张开判定阈值
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

let particles = [];
let ambient = [];
let mode = "SOUL";       // "SOUL" | "STARS"
let lastTime = performance.now();
let prevOpen = null;

const scatterTags = document.getElementById("scatterTags");
const soulTagline = document.getElementById("soulTagline");

const off = document.createElement("canvas");
const octx = off.getContext("2d");

const rand = (a,b) => a + Math.random() * (b - a);
function hash01(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/* =========== 背景星空 =========== */
function initAmbient() {
  ambient = [];
  for (let i = 0; i < CFG.AMBIENT_COUNT; i++) {
    const layer = Math.floor(Math.random() * 3); // 0,1,2
    const speedBase = 0.03 + layer * 0.03;
    const r =
      layer === 0 ? rand(0.4, 0.9) :
      layer === 1 ? rand(0.7, 1.5) :
                    rand(1.2, 1.9);
    const alpha =
      layer === 0 ? rand(0.02, 0.04) :
      layer === 1 ? rand(0.03, 0.06) :
                    rand(0.04, 0.09);

    ambient.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * speedBase,
      vy: (Math.random() - 0.5) * speedBase,
      r,
      a: alpha,
      layer
    });
  }
}

/* =========== 采样 Soul 文本，构建 3D 粒子 =========== */
function buildSOUL() {
  initAmbient();

  const base = Math.min(W, H * 1.3);
  const OW = Math.floor(base * 0.72);
  const OH = Math.floor(base * 0.26);

  off.width = OW;
  off.height = OH;
  octx.clearRect(0,0,OW,OH);

  const fontSize = Math.floor(OH * 0.92);
  octx.fillStyle = "#fff";
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  octx.font = `900 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  octx.fillText("Soul", OW / 2, OH * 0.55);

  const img = octx.getImageData(0,0,OW,OH).data;
  const pts = [];
  for (let y=0; y<OH; y+=CFG.GAP) {
    for (let x=0; x<OW; x+=CFG.GAP) {
      const a = img[(y*OW+x)*4+3];
      if (a>150) {
        const nx = x / OW;           // 0~1
        const isL = nx > 0.77;       // 右侧 23% 识别为 l（调过的正确范围）

        const cx = W/2 - OW/2 + x;
        const cy = H*0.45 - OH/2 + y;

        pts.push({x:cx, y:cy, isL});
      }
    }
  }

  let list = pts.filter(()=>Math.random() < CFG.DENSITY);
  if (list.length === 0) list = pts;
  if (list.length > CFG.MAX_PARTICLES) list.length = CFG.MAX_PARTICLES;

  particles = list.map((p,i)=>{
    const layer = Math.floor(Math.random()*3);      // 0(back) 1(mid) 2(front)
    const depth = (layer-1) * 18;                   // -18,0,18
    const homeX = p.x + depth*0.28;
    const homeY = p.y + depth*0.9;

    return {
      idx: i,
      layer,
      depth,
      homeX,
      homeY,
      x: homeX + rand(-8,8),
      y: homeY + rand(-8,8),
      size: rand(0.7, 1.2) + layer*0.15,
      phase: Math.random()*Math.PI*2,
      isL: p.isL,
      scatterX: homeX,
      scatterY: homeY
    };
  });
}

/* =========== 计算爆炸后的目标位置（星云） =========== */
function computeScatterTargets() {
  const cx = W / 2;
  const cy = H * 0.45;
  const maxR = Math.max(W, H) * 0.6;

  particles.forEach(p=>{
    // 从 Soul 中心出发的方向
    let dx = p.homeX - cx;
    let dy = p.homeY - cy;
    let len = Math.sqrt(dx*dx + dy*dy) || 1;
    let ux = dx/len, uy = dy/len;

    // 半径缩放：中心密集、外围稀疏
    const baseScale = 1.2 + Math.pow(Math.random(), 0.65)*3.0; // 1.2~4.2
    let r = len * baseScale;

    // 上下略微偏移，让整体有点倾斜
    const tilt = (p.homeX - cx) / (W*0.3);
    r *= (1 + tilt * 0.15);

    // 径向随机 + 垂直随机，打破完美对称
    const radialJitter = (hash01(p.idx*3.17)-0.5) * 0.35 * r;
    const px = -uy, py = ux;
    const tangentJitter = (hash01(p.idx*5.91)-0.5) * 0.6 * r;

    let tx = cx + ux*(r + radialJitter) + px*tangentJitter;
    let ty = cy + uy*(r + radialJitter) + py*tangentJitter*0.4;

    // l 轻微往右上偏一点，让右侧更亮
    if (p.isL) {
      tx += W * 0.04;
      ty -= H * 0.02;
    }

    // 限制到略大于画面范围
    tx = Math.max(-W*0.2, Math.min(W*1.2, tx));
    ty = Math.max(-H*0.2, Math.min(H*1.2, ty));

    p.scatterX = tx;
    p.scatterY = ty;
  });
}

/* =========== 标签随机布局 =========== */
function layoutScatterTagsRandom() {
  if (!scatterTags) return;
  const tags = Array.from(scatterTags.children);
  if (!tags.length) return;

  const placements = [
    {x:0.20, y:0.72},
    {x:0.80, y:0.22},
    {x:0.24, y:0.24},
    {x:0.79, y:0.68}
  ];

  tags.forEach((el,i)=>{
    const base = placements[i % placements.length];
    const jx = (Math.random()-0.5)*0.06;
    const jy = (Math.random()-0.5)*0.06;
    el.style.left = (base.x + jx)*100 + "%";
    el.style.top  = (base.y + jy)*100 + "%";
  });
}

/* =========== 状态切换 =========== */
function setStarsMode() {
  mode = "STARS";
  computeScatterTargets();    // 重新计算爆炸目标
  // 起爆起点：所有粒子先回到 Soul 中心附近
  const cx = W/2, cy = H*0.45;
  particles.forEach(p=>{
    p.x = cx + rand(-10,10);
    p.y = cy + rand(-10,10);
  });
  layoutScatterTagsRandom();
  if (scatterTags) scatterTags.classList.add("visible");
  if (soulTagline) soulTagline.style.opacity = "0";
}

function setSoulMode() {
  mode = "SOUL";
  if (scatterTags) scatterTags.classList.remove("visible");
  if (soulTagline) soulTagline.style.opacity = "1";
}

/* =========== 渲染循环 =========== */
function render(t) {
  const dt = Math.min(3, (t - lastTime) / 16.67);
  lastTime = t;

  // 背景渐变
  const g = ctx.createRadialGradient(
    W*0.1, H*0.1, 0,
    W*0.5, H*0.95, Math.max(W,H)
  );
  g.addColorStop(0, "#272f57");
  g.addColorStop(0.45, "#090b1d");
  g.addColorStop(1, "#020108");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // 背景星空
  ambient.forEach(a=>{
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (a.x < -40) a.x = W+40;
    if (a.x > W+40) a.x = -40;
    if (a.y < -40) a.y = H+40;
    if (a.y > H+40) a.y = -40;

    let color;
    if (a.layer === 0) color = "rgba(143, 170, 255, 1)";
    else if (a.layer === 1) color = "rgba(190, 186, 255, 1)";
    else color = "rgba(246, 186, 255, 1)";

    ctx.globalAlpha = a.a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI*2);
    ctx.fill();
  });

  // 粒子：分三层渲染，保证前后遮挡感
  for (let pass=0; pass<3; pass++) {
    particles.forEach(p=>{
      if (p.layer !== pass) return;

      if (mode === "STARS") {
        // 向散开目标插值 + 漂移
        const driftA = 6 + p.layer*2;
        const dx = p.scatterX - p.x;
        const dy = p.scatterY - p.y;
        p.x += dx * CFG.SCATTER_SPEED * dt;
        p.y += dy * CFG.SCATTER_SPEED * dt;
        p.x += Math.cos(t/900 + p.phase)*driftA*0.05;
        p.y += Math.sin(t/1100 + p.phase*1.3)*driftA*0.05;
      } else {
        // 回到 Soul 形状 + 呼吸
        const wobble = 0.8 + p.layer*0.35;
        const wobbleX = Math.cos(t/1300 + p.phase)*wobble;
        const wobbleY = Math.sin(t/1500 + p.phase*1.1)*wobble;
        const tx = p.homeX + wobbleX;
        const ty = p.homeY + wobbleY;
        p.x += (tx - p.x) * CFG.RETURN_SPEED * dt;
        p.y += (ty - p.y) * CFG.RETURN_SPEED * dt;
      }

      let color = p.isL ? "#19e0d8" : "#ffffff"; // Sou 白, l 蓝绿
      let alpha =
        p.layer === 0 ? 0.55 :
        p.layer === 1 ? 0.8  : 1.0;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
    });
  }

  requestAnimationFrame(render);
}

/* =========== 启动 =========== */
buildSOUL();
requestAnimationFrame(render);

window.addEventListener("resize", ()=>{
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  buildSOUL();
});

/* =========== 手势识别 =========== */

const video = document.createElement("video");
video.style.display = "none";
document.body.appendChild(video);

let hands = null;
let cam = null;

if (window.Hands && window.Camera) {
  hands = new Hands({
    locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6
  });
  hands.onResults(onHandsResults);

  cam = new Camera(video, {
    onFrame: async () => {
      await hands.send({image: video});
    },
    width: 640,
    height: 480
  });
  cam.start().catch(err=>{
    console.warn("摄像头启动失败，启用点击切换模式", err);
    canvas.addEventListener("click", toggleMode);
  });
} else {
  console.warn("MediaPipe 未加载，启用点击切换模式");
  canvas.addEventListener("click", toggleMode);
}

function dist(a,b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

function onHandsResults(res) {
  if (!res.multiHandLandmarks || res.multiHandLandmarks.length === 0) return;
  const lm = res.multiHandLandmarks[0];
  const wrist = lm[0];
  const base = dist(wrist, lm[9]) || 0.0001;

  const tips = [4,8,12,16,20];
  let sum = 0;
  tips.forEach(i=>sum += dist(wrist, lm[i]));
  const openness = sum / tips.length / base;
  const isOpen = openness > CFG.OPEN_THRESHOLD;

  if (prevOpen === null) {
    prevOpen = isOpen;
    return;
  }
  if (isOpen === prevOpen) return;
  prevOpen = isOpen;

  if (isOpen) {
    setStarsMode();
  } else {
    setSoulMode();
  }
}

/* 点击画面也可切换，调试方便 */
function toggleMode() {
  if (mode === "SOUL") setStarsMode();
  else setSoulMode();
}
canvas.addEventListener("click", toggleMode);

/* =========== 底部按钮进入交个朋友网站 =========== */
const enterBtn = document.getElementById("enterBtn");
if (enterBtn) {
  enterBtn.addEventListener("click", () => {
    // 这里跳到你做的社交网站页面
    window.location.href = "social.html";
  });
}
