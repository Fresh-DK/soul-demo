/**
 * Gemini 风格 SOUL 交互主脚本
 * - 单手识别（MediaPipe）
 * - SOUL: 三层粒子模拟体积 (back/mid/front) + 视差 (mouse) -> 立体感
 * - 张开 (palm) -> 粒子短暂弹开（轻散）
 * - 握拳 (fist) -> 螺旋吸入 + 紧缩 + 爆光（动态收拢）
 * - 环境粒子 + 背景柔和渐变
 *
 * 使用：将此文件保存为 plain_html/script.js，index.html 中已引入 MediaPipe CDN
 */

/* ---------------------- 可调参数（你可以在此调整视觉与性能） ---------------------- */
const CONFIG = {
  PARTICLE_GAP: 6,        // 文本采样间隔，越小粒子越多
  NUM_MAX: 2200,          // 粒子上限（防止低端设备卡死）
  AMBIENT_COUNT: 100,     // 背景环境粒子数量
  SCATTER_RADIUS: 120,    // 张开时最大散开量（像素）
  SPIRAL_INNER: 6,        // 收拢时最内圈半径
  RETURN_SPEED: 0.16,
  SCATTER_SPEED: 0.2,
  OPEN_THRESHOLD: 1.02,   // 手掌阈值（>为张开）
  AUDIO: { open: 'assets/open.wav', close: 'assets/close.wav', enter: 'assets/enter.wav' }
};
/* ---------------------------------------------------------------------------------- */

(() => {
  // utility
  const clamp = (v,a,b)=> Math.max(a, Math.min(b,v));
  const rand = (a,b)=> a + Math.random()*(b-a);

  // canvases: background full-screen + overlay for particles inside left card
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx = bgCanvas.getContext('2d', { alpha: true });
  // overlay canvas appended into .left element for crisp visuals (will cover left area)
  const visual = document.getElementById('visual');
  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute';
  overlay.style.left = 0;
  overlay.style.top = 0;
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.zIndex = 2;
  visual.appendChild(overlay);
  const ctx = overlay.getContext('2d', { alpha: true });

  // sizes
  let W = window.innerWidth, H = window.innerHeight;
  let leftRect = visual.getBoundingClientRect();
  function resizeAll(){
    W = window.innerWidth; H = window.innerHeight;
    bgCanvas.width = W; bgCanvas.height = H;
    leftRect = visual.getBoundingClientRect();
    overlay.width = Math.max(1, Math.floor(leftRect.width));
    overlay.height = Math.max(1, Math.floor(leftRect.height));
    rebuild();
  }
  window.addEventListener('resize', resizeAll);
  resizeAll();

  // particles data
  let particles = []; // {x,y,homeX,homeY,layer,scatterX,scatterY,size,glow,angle,spiralPhase}
  let ambient = [];

  // audio toggles
  let muted = false;
  document.getElementById('muteBtn').addEventListener('click', ()=>{
    muted = !muted;
    document.getElementById('muteBtn').textContent = muted ? '取消静音' : '静音';
  });

  // Enter button
  document.getElementById('enterBtn').addEventListener('click', ()=>{
    if(!muted) try{ new Audio(CONFIG.AUDIO.enter).play(); }catch(e){}
    window.location.href = 'https://agent.soulapp.cn';
  });

  // build ambient
  function initAmbient(){
    ambient = [];
    for(let i=0;i<CONFIG.AMBIENT_COUNT;i++){
      ambient.push({
        x: Math.random()*W,
        y: Math.random()*H,
        r: 0.6 + Math.random()*3,
        a: 0.02 + Math.random()*0.08,
        vx: (Math.random()-0.5)*0.15,
        vy: (Math.random()-0.5)*0.15
      });
    }
  }

  // Build SOUL home positions by sampling text on an offscreen canvas
  const off = document.createElement('canvas');
  const octx = off.getContext('2d');

  function rebuild(){
    // ambient across full screen
    initAmbient();

    // prepare offscreen text (relative to left overlay size)
    const ow = Math.max(300, Math.floor(overlay.width * 0.9));
    const oh = Math.max(140, Math.floor(ow * 0.28));
    off.width = ow; off.height = oh;
    octx.clearRect(0,0,ow,oh);
    // heavier font weight for denser sampling
    const fontSize = Math.floor(oh * 0.95);
    octx.fillStyle = '#fff';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.font = `900 ${fontSize}px Inter, sans-serif`;
    octx.fillText('SOUL', ow/2, oh/2 + oh*0.02);

    const img = octx.getImageData(0,0,ow,oh).data;
    const pts = [];
    for(let y=0;y<oh;y+=CONFIG.PARTICLE_GAP){
      for(let x=0;x<ow;x+=CONFIG.PARTICLE_GAP){
        const idx = (y*ow + x)*4;
        if(img[idx+3] > 150){
          // map to overlay coordinates (centered)
          const cx = (overlay.width - ow)/2 + x;
          const cy = (overlay.height - oh)/2 + y;
          pts.push({x:cx,y:cy});
        }
      }
    }
    if(pts.length > CONFIG.NUM_MAX) pts.length = CONFIG.NUM_MAX;

    // create particles with layer attribute (0 back,1 mid,2 front)
    particles = pts.map((p,i)=>{
      const layer = Math.floor(Math.random()*3);
      const depth = (layer - 1) * 5; // -5,0,5 pixel bias for depth
      const homeX = p.x + depth*0.25;
      const homeY = p.y + depth*0.6;
      const angle = Math.random()*Math.PI*2;
      return {
        x: homeX + rand(-16,16),
        y: homeY + rand(-16,16),
        homeX, homeY, layer, depth,
        scatterX: homeX + Math.cos(angle)* rand(20, CONFIG.SCATTER_RADIUS),
        scatterY: homeY + Math.sin(angle)* rand(20, CONFIG.SCATTER_RADIUS),
        size: 1 + Math.random()*1.8,
        glow: 4 + Math.random()*8,
        angle: angle,
        spiralPhase: Math.random()*Math.PI*2
      };
    });
  }

  // initial build
  rebuild();

  // mouse-based slight parallax for extra 3D feel
  const mouse = {x: overlay.width/2, y: overlay.height/2, nx:0, ny:0};
  overlay.addEventListener('mousemove', (e)=>{
    const r = overlay.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.nx = (mouse.x / overlay.width - 0.5) * 2;
    mouse.ny = (mouse.y / overlay.height - 0.5) * 2;
  });

  // animation loop: two layers: bgCanvas (ambient) + overlay (SOUL)
  let last = performance.now();
  function animate(t){
    const dt = (t - last)/16.67; last = t;

    // background gradient subtle animated noise
    drawBackground(t);

    // overlay: clear with subtle vignette
    ctx.clearRect(0,0,overlay.width,overlay.height);

    // draw layered particles: back->mid->front
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<particles.length;i++){
        const p = particles[i];
        if(p.layer !== pass) continue;
        // motion: if scattered -> head to scatter target; if collapsing -> spiral into center (overlay center)
        if(isScattered){
          const tx = p.scatterX + Math.sin((t/1000)+i*0.01)*3;
          const ty = p.scatterY + Math.cos((t/1100)+i*0.01)*3;
          p.x += (tx - p.x) * CONFIG.SCATTER_SPEED * dt;
          p.y += (ty - p.y) * CONFIG.SCATTER_SPEED * dt;
        } else if(isCollapsing){
          // spiral in toward center with easing; center defined as overlay center
          const cx = overlay.width/2, cy = overlay.height/2;
          // polar coords relative to center
          const dx = p.x - cx, dy = p.y - cy;
          const r0 = Math.sqrt(dx*dx + dy*dy) || 1;
          // spiral reduction: reduce radius, rotate angle
          const angle = Math.atan2(dy,dx) + 0.35 * dt; // rotate as it goes in
          const nr = Math.max(CONFIG.SPIRAL_INNER, r0 * 0.88); // shrink radius
          const nx = cx + nr * Math.cos(angle);
          const ny = cy + nr * Math.sin(angle);
          // slight lerp
          p.x += (nx - p.x) * 0.28 * dt;
          p.y += (ny - p.y) * 0.28 * dt;
          // electric jitter for front layer
          if(p.layer === 2 && Math.random() < 0.02) { p.x += rand(-0.6,0.6); p.y += rand(-0.6,0.6); }
        } else {
          // return home (with slight parallax based on mouse)
          const parallaxX = mouse.nx * (p.layer - 1) * 6; // front moves opposite slightly
          const parallaxY = mouse.ny * (p.layer - 1) * 6;
          p.x += ((p.homeX + parallaxX) - p.x) * CONFIG.RETURN_SPEED * dt;
          p.y += ((p.homeY + parallaxY) - p.y) * CONFIG.RETURN_SPEED * dt;
        }

        // draw glow (bigger, lower alpha) then core
        ctx.beginPath();
        const glowAlpha = 0.045 + p.layer*0.02;
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = 'rgba(255,90,170,1)';
        ctx.ellipse(p.x, p.y + p.depth*0.5, p.glow*2.2, p.glow*1.8, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.beginPath();
        ctx.globalAlpha = 1;
        ctx.fillStyle = (p.layer === 2) ? '#ff4fb0' : (p.layer === 1 ? '#ff76c6' : '#ff9bcf');
        ctx.ellipse(p.x, p.y, p.size, p.size, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // if collapsing and particles mostly inside small radius, trigger final micro flash
    if(isCollapsing){
      collapseProgress += 0.01 * dt;
      if(collapseProgress >= 1 && !collapseFlashDone){
        collapseFlash();
        collapseFlashDone = true;
      }
    } else {
      collapseProgress = 0;
      collapseFlashDone = false;
    }

    requestAnimationFrame(animate);
  }

  // background draw function
  let bgNoise = 0;
  function drawBackground(t){
    // clear
    bgCtx.clearRect(0,0,W,H);
    // gentle radial gradient
    const g = bgCtx.createLinearGradient(0,0,W,H);
    g.addColorStop(0, '#f7f9ff');
    g.addColorStop(1, '#eef3ff');
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0,0,W,H);

    // ambient particles
    for(const a of ambient){
      a.x += a.vx;
      a.y += a.vy;
      if(a.x < -40) a.x = W+40;
      if(a.x > W+40) a.x = -40;
      if(a.y < -40) a.y = H+40;
      if(a.y > H+40) a.y = -40;
      bgCtx.beginPath();
      bgCtx.globalAlpha = a.a;
      bgCtx.fillStyle = 'rgba(255,110,200,1)';
      bgCtx.ellipse(a.x, a.y, a.r, a.r, 0, 0, Math.PI*2);
      bgCtx.fill();
    }

    // soft moving gradient overlay to add life
    bgCtx.globalAlpha = 0.06;
    bgCtx.fillStyle = '#f7e7ff';
    const w = W*0.35, h = H*0.35;
    const px = (Math.sin(t/3000)+1)/2 * (W - w);
    const py = (Math.cos(t/3100)+1)/2 * (H - h);
    bgCtx.fillRect(px, py, w, h);
    bgCtx.globalAlpha = 1;
  }

  // collapse flash effect
  let collapseProgress = 0;
  let collapseFlashDone = false;
  function collapseFlash(){
    // quick radial flash in overlay center
    const cx = overlay.width/2, cy = overlay.height/2;
    const maxR = Math.max(overlay.width, overlay.height) * 0.8;
    let t0 = performance.now();
    let dur = 420;
    function flashLoop(now){
      const p = (now - t0) / dur;
      if(p > 1) return;
      const alpha = 0.9 * (1 - p);
      ctx.beginPath();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255,230,255,1)';
      ctx.ellipse(cx, cy, p*maxR, p*maxR, 0, 0, Math.PI*2);
      ctx.fill();
      requestAnimationFrame(flashLoop);
    }
    requestAnimationFrame(flashLoop);
  }

  // state variables for gestures
  let isScattered = false;
  let isCollapsing = false;

  // MediaPipe Hands setup (single hand)
  const video = document.createElement('video');
  video.style.display = 'none';
  document.body.appendChild(video);

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
  hands.onResults(onHands);

  let cam;
  async function startCamera(){
    try{
      cam = new Camera(video, { onFrame: async ()=>{ await hands.send({image: video}); }, width: 640, height: 480 });
      await cam.start();
    }catch(e){
      console.warn('camera failed', e);
      // fallback: allow click to toggle
      overlay.addEventListener('click', ()=> toggleScatter());
    }
  }
  startCamera();

  // gesture processing
  let prevOpen = false;
  function onHands(results){
    if(!results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
      return;
    }
    const lm = results.multiHandLandmarks[0];
    // compute openness
    function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
    const wrist = lm[0], mcp9 = lm[9];
    const base = dist(wrist, mcp9) || 0.0001;
    const tips = [8,12,16,20,4];
    let sum=0; for(const i of tips) sum += dist(wrist, lm[i]);
    const avg = sum / tips.length;
    const openness = avg / base;
    const open = openness > CONFIG.OPEN_THRESHOLD;
    if(open !== prevOpen){
      prevOpen = open;
      if(open){
        triggerOpen();
      } else {
        triggerClose();
      }
    }
  }

  // actions
  function triggerOpen(){
    isScattered = true;
    isCollapsing = false;
    if(!muted) try{ new Audio(CONFIG.AUDIO.open).play(); }catch(e){}
    // set new scatter targets
    for(const p of particles){
      const a = Math.random()*Math.PI*2;
      p.scatterX = p.homeX + Math.cos(a) * rand(40, CONFIG.SCATTER_RADIUS);
      p.scatterY = p.homeY + Math.sin(a) * rand(30, CONFIG.SCATTER_RADIUS);
    }
  }
  function triggerClose(){
    // start collapsing / spiral in
    isScattered = false;
    isCollapsing = true;
    if(!muted) try{ new Audio(CONFIG.AUDIO.close).play(); }catch(e){}
    // optionally tighten homes slightly to accentuate collapse
    for(const p of particles){
      p.homeX += (overlay.width/2 - p.homeX) * 0.02;
      p.homeY += (overlay.height/2 - p.homeY) * 0.02;
    }
  }

  // fallback toggle if camera unavailable
  function toggleScatter(){ if(isCollapsing){ isCollapsing=false; isScattered=true; } else if(isScattered){ isScattered=false; isCollapsing=true; } else { isScattered=true; } }

  // start animation
  requestAnimationFrame(animate);

  // helpful: if overlay clicked while camera not allowed, toggle
  overlay.addEventListener('click', ()=>{ if(!cam) toggleScatter(); });

  // small safety: if user navigates away
  window.addEventListener('blur', ()=>{ /* pause audio/animations if needed */ });

})();
