// Shorts Factory — "countdown3d" şablonu
// Her kare yalnızca t (saniye) fonksiyonudur: deterministik, parça parça/paralel render edilebilir.
import * as THREE from "./vendor/three.module.js";

const TL = await (await fetch(window.TIMELINE_URL || "timeline.json")).json();
const TURKEY = await (await fetch("turkey.json")).json();
const W = TL.W, H = TL.H;

// ------------------------------------------------------------------ yardımcılar
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const eInCubic = (t) => Math.pow(clamp(t), 3);
const eInOut = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
const eOutBack = (t, s = 1.7) => { t = clamp(t) - 1; return t * t * ((s + 1) * t + s) + 1; };
const UP = (s) => s.toLocaleUpperCase("tr-TR");
const fmt = (n) => Math.round(n).toLocaleString("tr-TR");
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNoise(seed) {
  const rnd = mulberry32(seed), perm = [...Array(256).keys()], p = new Uint8Array(512);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
    let n = 0, q;
    q = .5 - x0 * x0 - y0 * y0; if (q > 0) { const g = G[p[ii + p[jj]] & 7]; q *= q; n += q * q * (g[0] * x0 + g[1] * y0); }
    q = .5 - x1 * x1 - y1 * y1; if (q > 0) { const g = G[p[ii + i1 + p[jj + j1]] & 7]; q *= q; n += q * q * (g[0] * x1 + g[1] * y1); }
    q = .5 - x2 * x2 - y2 * y2; if (q > 0) { const g = G[p[ii + 1 + p[jj + 1]] & 7]; q *= q; n += q * q * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}
const fbm = (N, x, y, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * N(x * f, y * f); a *= .5; f *= 2.03; } return s; };
const ridged = (N, x, y, o = 4) => { let s = 0, a = .5, f = 1, w = 1; for (let i = 0; i < o; i++) { let v = 1 - Math.abs(N(x * f, y * f)); v *= v; v *= w; w = clamp(v * 1.6); s += a * v; a *= .5; f *= 2.1; } return s; };

// ------------------------------------------------------------------ three kurulum
const glc = document.createElement("canvas"); glc.width = W; glc.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color("#c9826a");
scene.fog = new THREE.Fog(FOG, 30, 95);
const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 500);

const SUN_DIR = new THREE.Vector3(-0.75, 0.32, -0.55).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color("#070d26") }, mid: { value: new THREE.Color("#2a3566") },
    hor: { value: new THREE.Color("#f0906a") }, sun: { value: SUN_DIR }, sunCol: { value: new THREE.Color("#ffcf9a") },
  },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform vec3 top,mid,hor,sun,sunCol; varying vec3 vD;
    void main(){ float h=vD.y; vec3 c=mix(hor,mid,smoothstep(-0.02,0.22,h)); c=mix(c,top,smoothstep(0.22,0.75,h));
      float s=max(dot(normalize(vD),sun),0.); c+=sunCol*(pow(s,350.)*2.5+pow(s,18.)*0.35+pow(s,4.)*0.12);
      c=mix(c,hor*0.55,smoothstep(0.,-0.25,h)); gl_FragColor=vec4(c,1.); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
scene.add(sky);
{ // yıldızlar
  const r = mulberry32(5), n = 1600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 * Math.PI, v = 0.18 + r() * 0.82, c = Math.sqrt(1 - v * v);
    pos.set([Math.cos(u) * c * 280, v * 280, Math.sin(u) * c * 280], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(stars);
}
const sunL = new THREE.DirectionalLight("#ffd6a8", 3.6);
sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048);
Object.assign(sunL.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
sunL.shadow.bias = -0.0008; sunL.shadow.normalBias = 0.04;
scene.add(sunL, sunL.target);
const hemi = new THREE.HemisphereLight("#b9c6ff", "#4a3424", 1.1); scene.add(hemi);
const rim = new THREE.DirectionalLight("#ff9a6a", 1.4); rim.position.set(30, 18, 25); scene.add(rim);

// ------------------------------------------------------------------ prosedürel dağlar
const HU = (v) => (v / 1000) * 1.7;
function buildTerrain(item, { size = 44, seg = 260, hScale = null, extra = null } = {}) {
  const N = makeNoise(item.seed), rnd = mulberry32(item.seed * 7 + 1);
  const Hm = hScale ?? HU(item.value);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const P = geo.attributes.position, n = P.count, raw = new Float32Array(n);
  const R = 2.4 + Hm * 0.33;
  const peaks = [{ x: 0, z: 0, h: 1, s: R }];
  if (item.shape !== "volcano") {
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2, d = 1.4 + rnd() * R * 1.15;
      peaks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 0.45 + rnd() * 0.35, s: R * (0.5 + rnd() * 0.45) });
    }
  }
  for (const e of (extra || item.extra_peaks || [])) peaks.push({ x: e[0] * R, z: e[1] * R, h: e[2], s: R * e[3], cone: true });
  for (let i = 0; i < n; i++) {
    let x = P.getX(i), z = P.getZ(i);
    const wx = x + 0.9 * fbm(N, x * 0.13 + 9, z * 0.13), wz = z + 0.9 * fbm(N, x * 0.13, z * 0.13 + 9);
    const r = Math.hypot(wx, wz);
    const hills = (fbm(N, x * 0.09 + 3, z * 0.09, 3) * 0.5 + 0.5) * 0.11 + ridged(N, x * 0.2, z * 0.2, 3) * 0.04;
    let h;
    if (item.shape === "volcano") {
      let cone = 1 / (1 + Math.pow(r / R, 2.5));
      for (const p of peaks.slice(1)) { const d = Math.hypot(wx - p.x, wz - p.z); cone = Math.max(cone, p.h / (1 + Math.pow(d / p.s, 2.5))); }
      const ang = Math.atan2(wz, wx);
      const gully = Math.abs(N(Math.cos(ang) * 2.2 + r * 0.05, Math.sin(ang) * 2.2 + r * 0.32));
      h = cone * (1 - 0.09 * gully * sstep(0.15 * R, R, r)) + ridged(N, x * 0.5, z * 0.5, 4) * 0.045 * cone + fbm(N, x * 1.3, z * 1.3, 3) * 0.015;
    } else {
      let b = 0;
      for (const p of peaks) { const d2 = (wx - p.x) ** 2 + (wz - p.z) ** 2; b = Math.max(b, p.h * Math.exp(-d2 / (p.s * p.s))); }
      const rg = ridged(N, x * 0.22 + 11, z * 0.22, 5);
      h = b * (0.72 + 0.38 * rg) + ridged(N, x * 0.9, z * 0.9, 3) * 0.035 * b;
    }
    raw[i] = h + hills * (1 - clamp(h));
  }
  let mx = 0, mi = 0;
  for (let i = 0; i < n; i++) if (raw[i] > mx) { mx = raw[i]; mi = i; }
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), z = P.getZ(i), edge = sstep(size * 0.5, size * 0.36, Math.max(Math.abs(x), Math.abs(z)));
    P.setY(i, (raw[i] / mx) * Hm * (0.25 + 0.75 * edge));
  }
  geo.computeVertexNormals();
  const Nr = geo.attributes.normal, col = new Float32Array(n * 3);
  const cLow = new THREE.Color("#6b6a45"), cRock = new THREE.Color("#7a6a5c"), cDark = new THREE.Color("#3e3530"), cSnow = new THREE.Color("#f1f5ff"), c = new THREE.Color();
  const snowLine = item.shape === "volcano" ? 0.56 : 0.64;
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), z = P.getZ(i), f = P.getY(i) / Hm, ny = Nr.getY(i);
    const nz = fbm(N, x * 0.7 + 50, z * 0.7, 3);
    c.copy(cLow).lerp(cRock, sstep(0.08, 0.3, f + nz * 0.1));
    c.lerp(cDark, sstep(0.82, 0.55, ny) * 0.75 + nz * 0.15);
    const snow = sstep(snowLine - 0.05 + nz * 0.12, snowLine + 0.06 + nz * 0.12, f) * sstep(0.42, 0.72, ny + f * 0.15);
    c.lerp(cSnow, clamp(snow));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData = { Hm, peak: new THREE.Vector3(P.getX(mi), Hm, P.getZ(mi)) };
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

const items = TL.items;
const terrains = items.map((it) => buildTerrain(it));

// bulutlar (yumuşak sprite'lar)
const cloudTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); const r = mulberry32(9);
  for (let i = 0; i < 40; i++) {
    const x = 128 + (r() - .5) * 140, y = 128 + (r() - .5) * 50, rad = 30 + r() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, "rgba(255,255,255,0.22)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const clouds = [];
{
  const r = mulberry32(77);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: "#ffd9c4", transparent: true, opacity: 0.55, depthWrite: false }));
    s.userData = { a: r() * Math.PI * 2, d: 0.45 + r() * 0.7, hy: 0.3 + r() * 0.35, sc: 0.45 + r() * 0.5, sp: 0.02 + r() * 0.03 };
    scene.add(s); clouds.push(s);
  }
}
// kar taneleri
const SNOW_N = 1400;
const snowGeo = new THREE.BufferGeometry(), snowSeed = new Float32Array(SNOW_N * 4);
{ const r = mulberry32(31); for (let i = 0; i < SNOW_N * 4; i++) snowSeed[i] = r(); }
snowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SNOW_N * 3), 3));
const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: "#ffffff", size: 0.09, map: (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })(), transparent: true, opacity: 0.8, depthWrite: false }));
scene.add(snowPts);

// kanca sahnesi: Everest (tel kafes) vs Ağrı
const hook = new THREE.Group(); scene.add(hook);
const evH = HU(8849), agH = HU(5137), halfH = HU(8849 / 2);
const everest = buildTerrain({ seed: 888, shape: "volcano", value: 8849 }, { size: 14, seg: 56, hScale: evH });
everest.material = new THREE.MeshBasicMaterial({ color: "#7fdcff", wireframe: true, transparent: true, opacity: 0.38, fog: false });
everest.castShadow = false; everest.position.x = -4.2; hook.add(everest);
const agriSmall = buildTerrain({ ...items[items.length - 1] }, { size: 12, seg: 170 }); agriSmall.position.x = 4.6; hook.add(agriSmall);
const grid = new THREE.GridHelper(80, 80, "#3fa9ff", "#2a5f9a"); grid.material.transparent = true; grid.material.opacity = 0.35; hook.add(grid);
const halfLine = new THREE.Mesh(new THREE.BoxGeometry(26, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: "#ff8a2a", fog: false }));
halfLine.position.y = halfH; hook.add(halfLine);
hook.visible = false;

// ------------------------------------------------------------------ 2D katman
const out = document.getElementById("out"); out.width = W; out.height = H;
const ctx = out.getContext("2d");
const grain = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); const d = g.createImageData(256, 256); const r = mulberry32(3);
  for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); return c;
})();
const ORANGE = "#ff7a1a", GOLD = "#ffc843";

function txt(s, x, y, { size = 60, font = "Mont", weight = 900, fill = "#fff", stroke = null, sw = 10, align = "left", glow = null, glowBlur = 30, ls = 0, alpha = 1, base = "alphabetic" } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = `${ls}px`;
  ctx.lineJoin = "round";
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = glowBlur; } ctx.strokeText(s, x, y); ctx.shadowBlur = 0; }
  else if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = glowBlur; }
  ctx.fillStyle = fill; ctx.fillText(s, x, y); ctx.restore();
}
function measure(s, size, font = "Mont", weight = 900, ls = 0) { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; ctx.letterSpacing = `${ls}px`; const w = ctx.measureText(s).width; ctx.restore(); return w; }
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function project(v) { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }; }
function pin(x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(0, 14); ctx.bezierCurveTo(-12, 0, -12, -16, 0, -16); ctx.bezierCurveTo(12, -16, 12, 0, 0, 14); ctx.fill();
  ctx.fillStyle = "#0b1230"; ctx.beginPath(); ctx.arc(0, -6, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Türkiye haritası
const LON0 = 25.6, LON1 = 45.0, LAT0 = 35.7, LAT1 = 42.2, KX = Math.cos((39 * Math.PI) / 180);
function mapXY(lon, lat, box) {
  const sx = box.w / ((LON1 - LON0) * KX), sy = box.h / (LAT1 - LAT0), s = Math.min(sx, sy);
  return [box.x + (lon - LON0) * KX * s, box.y + (LAT1 - lat) * s];
}
function drawMap(box, alpha, fn) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (const ring of TURKEY) ring.forEach(([lo, la], i) => { const [x, y] = mapXY(lo, la, box); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.fillStyle = "rgba(20,30,70,0.55)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(1.5, box.w / 220); ctx.lineJoin = "round"; ctx.stroke();
  fn && fn(); ctx.restore();
}

// ------------------------------------------------------------------ altyazı
function drawCaptions(t, yC = 1335) {
  const c = TL.captions.find((c) => t >= c.t0 && t < c.t1);
  if (!c) return;
  const age = t - c.t0, pop = eOutBack(age / 0.16, 2.2), size = 78, gap = 38;
  const words = c.words.map((w) => UP(w.w));
  const widths = words.map((w) => measure(w, size, "Mont", 900));
  let total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  const scale = Math.min(1, 960 / total);
  ctx.save(); ctx.translate(W / 2, yC); ctx.scale(scale * lerp(0.82, 1, pop), scale * lerp(0.82, 1, pop)); ctx.globalAlpha = clamp(age / 0.08);
  let x = -total / 2;
  words.forEach((w, i) => {
    const ww = c.words[i], active = t >= ww.t0 - 0.03 && t < ww.t1 + 0.02, done = t >= ww.t1;
    const s = active ? lerp(1, 1.08, eOutBack(clamp((t - ww.t0) / 0.12))) : 1;
    ctx.save(); ctx.translate(x + widths[i] / 2, 0); ctx.scale(s, s);
    txt(w, 0, 0, { size, align: "center", base: "middle", stroke: "#000", sw: 16, glow: "rgba(0,0,0,0.6)", glowBlur: 18, fill: active ? "#ffd23f" : (done ? "#ffffff" : "rgba(255,255,255,0.92)") });
    ctx.restore();
    x += widths[i] + gap;
  });
  ctx.restore();
}

// ------------------------------------------------------------------ sahne mantığı
const scenes = TL.scenes;
function sceneAt(t) { let i = 0; for (let k = 0; k < scenes.length; k++) if (t >= scenes[k].t0) i = k; return i; }
const WHIP = 0.42;

function placeCamera(Hm, peak, az, distK, t, shakeT0) {
  const target = new THREE.Vector3(peak.x * 0.25, Hm * 0.6, peak.z * 0.25);
  const D = (Hm * 2.25 + 5) * distK, el = 0.16;
  camera.position.set(target.x + Math.cos(az) * Math.cos(el) * D, target.y + Math.sin(el) * D, target.z + Math.sin(az) * Math.cos(el) * D);
  const sh = shakeT0 != null ? Math.exp(-(t - shakeT0) * 9) * (t >= shakeT0 ? 1 : 0) : 0;
  camera.position.x += Math.sin(t * 61) * 0.12 * sh; camera.position.y += Math.sin(t * 47 + 1) * 0.12 * sh;
  camera.lookAt(target);
  return target;
}

function updateEnv(t, center, Hm, gold) {
  { const cd = camera.position.clone().sub(center); cd.y = 0; cd.normalize(); const az = Math.atan2(cd.z, cd.x) + 0.95;
    sunL.position.set(center.x + Math.cos(az) * 50, center.y + 34, center.z + Math.sin(az) * 50); sunL.target.position.copy(center);
    rim.position.set(center.x - Math.cos(az) * 40, center.y + 15, center.z - Math.sin(az) * 40); }
  skyMat.uniforms.hor.value.set(gold ? "#ffa860" : "#f0906a");
  sunL.color.set(gold ? "#ffcc88" : "#ffd6a8");
  clouds.forEach((s) => {
    const u = s.userData, a = u.a + t * u.sp;
    s.position.set(center.x + Math.cos(a) * u.d * Hm, Hm * u.hy, center.z + Math.sin(a) * u.d * Hm);
    s.scale.set(u.sc * Hm * 1.4, u.sc * Hm * 0.5, 1); s.material.opacity = 0.4;
  });
  const P = snowGeo.attributes.position, cp = camera.position;
  for (let i = 0; i < SNOW_N; i++) {
    const a = snowSeed[i * 4], b = snowSeed[i * 4 + 1], c = snowSeed[i * 4 + 2], d = snowSeed[i * 4 + 3];
    const range = 16, y = ((b * range - t * (0.6 + d * 0.8)) % range + range) % range;
    P.setXYZ(i, cp.x + (a - 0.5) * 22 + Math.sin(t * 0.8 + c * 20) * 0.4, cp.y - 8 + y, cp.z + (c - 0.5) * 22);
  }
  P.needsUpdate = true;
}

let prevComposite = false;
function renderScene3D(t) {
  const si = sceneAt(t), S = scenes[si];
  terrains.forEach((m) => (m.visible = false)); hook.visible = false; everest.visible = agriSmall.visible = false;
  snowPts.visible = true; clouds.forEach((c) => (c.visible = true));
  let whip = 0, info = { si, S };
  const nextS = scenes[si + 1];
  const outK = nextS ? eInCubic((t - (nextS.t0 - 0.22)) / 0.22) : 0; // çıkışta hızlanan savrulma
  const inK = 1 - eOutCubic((t - S.t0) / WHIP);                        // girişte yavaşlayan savrulma
  whip = outK * 1.1 - (si > 0 ? inK * 1.1 : 0);
  info.blur = Math.max(outK, si > 0 ? inK : 0);

  if (S.type === "hook" && !TL.hook.compare) { // genel kanca: 1. sıradaki zirvenin geniş çekimi
    const m = terrains[terrains.length - 1], { Hm, peak } = m.userData; m.visible = true;
    m.scale.y = Math.max(0.05, lerp(0.35, 1, eOutCubic(t / 1.4)));
    scene.fog.near = 25 + Hm * 2; scene.fog.far = 80 + Hm * 5;
    const target = placeCamera(Hm, peak, 1.1 + t * 0.07 + whip, lerp(1.6, 1.35, eInOut(t / 4)), t, null);
    updateEnv(t, target, Hm, false);
  } else if (S.type === "hook") {
    hook.visible = everest.visible = agriSmall.visible = true; snowPts.visible = false; clouds.forEach((c) => (c.visible = false));
    scene.fog.near = 40; scene.fog.far = 140;
    const ev = eOutCubic((t - 0.1) / 0.9), ag = eOutBack((t - 0.7) / 1.0, 1.2);
    everest.scale.y = Math.max(0.001, ev); agriSmall.scale.y = Math.max(0.001, ag);
    halfLine.scale.x = Math.max(0.001, eInOut((t - 1.5) / 0.7));
    const slamK = eInOut((t - S.slam) / 1.2);
    const az = Math.PI / 2 + 0.12 * Math.sin(t * 0.4) + whip;
    const target = new THREE.Vector3(0, lerp(12, 13.5, slamK), 0), D = lerp(52, 47, eInOut(t / 3)) + slamK * 6;
    camera.position.set(Math.cos(az) * D, 7.5 + lerp(0, 3, slamK), Math.sin(az) * D);
    camera.lookAt(target);
    updateEnv(t, new THREE.Vector3(), 6, false);
    info.hookAnchors = {
      ev: project(new THREE.Vector3(everest.position.x + everest.userData.peak.x, evH * ev + 0.2, everest.userData.peak.z)),
      ag: project(new THREE.Vector3(agriSmall.position.x + agriSmall.userData.peak.x, agH * Math.max(0, ag) + 0.2, agriSmall.userData.peak.z)),
      line: project(new THREE.Vector3(-8.5, halfH, 0)),
    };
    info.agUp = ag; info.ev = ev;
  } else if (S.type === "item") {
    const m = terrains[S.k], it = items[S.k], { Hm, peak } = m.userData;
    m.visible = true;
    const rise = eOutBack((t - S.t0 + 0.05) / 0.75, 1.1);
    m.scale.y = Math.max(0.02, lerp(0.2, 1, rise));
    scene.fog.near = 22 + Hm * 2; scene.fog.far = 70 + Hm * 5;
    const p = (t - S.t0) / (S.t1 - S.t0);
    const az = 0.8 + S.k * 1.37 + p * 0.42 + whip;
    const distK = lerp(1.1, 0.97, eInOut(p)) * (it.rank === 1 ? lerp(1.25, 1.0, eOutCubic(p * 1.5)) : 1);
    const target = placeCamera(Hm, peak, az, distK, t, S.t0 + 0.02);
    updateEnv(t, target, Hm, it.rank === 1);
    const u = eOutExpo((t - S.count0) / (S.count1 - S.count0));
    info.count = u; info.value = it.value * u; info.item = it;
    info.top = project(new THREE.Vector3(peak.x, lerp(0, Hm, u) * m.scale.y + 0.25, peak.z));
    info.base = project(new THREE.Vector3(peak.x, 0, peak.z));
    info.ticks = [];
    for (let v = 500; v < it.value * u; v += 500) info.ticks.push({ v, p: project(new THREE.Vector3(peak.x, HU(v) * m.scale.y, peak.z)) });
  } else { // outro: zirvenin geniş çekimi
    const m = terrains[terrains.length - 1], { Hm, peak } = m.userData; m.visible = true; m.scale.y = 1;
    scene.fog.near = 25 + Hm * 2; scene.fog.far = 80 + Hm * 5;
    const p = (t - S.t0) / (S.t1 - S.t0);
    const target = placeCamera(Hm, peak, 2.2 + p * 0.3 + whip, 1.35, t, null);
    updateEnv(t, target, Hm, true);
  }
  renderer.render(scene, camera);
  return info;
}

// ------------------------------------------------------------------ sahne katmanları (2D)
function progressBar(k, t, S) {
  const n = items.length, x0 = 80, w = W - 160, g = 10, sw = (w - g * (n - 1)) / n, y = 205;
  for (let i = 0; i < n; i++) {
    const on = i < k ? 1 : i === k ? eOutCubic((t - S.t0) / 0.4) : 0;
    rrect(x0 + i * (sw + g), y, sw, 10, 5); ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill();
    if (on > 0) { rrect(x0 + i * (sw + g), y, sw * on, 10, 5); ctx.fillStyle = i === k ? (items[i].rank === 1 ? GOLD : ORANGE) : "rgba(255,255,255,0.85)"; ctx.fill(); }
  }
}

function drawItemOverlay(t, info) {
  const S = info.S, it = items[S.k], age = t - S.t0, left = S.t1 - t;
  const exit = eInCubic(1 - left / 0.25), gold = it.rank === 1, ACC = gold ? GOLD : ORANGE;
  ctx.save(); ctx.globalAlpha = 1 - exit; ctx.translate(0, -exit * 60);
  progressBar(S.k, t, S);
  // sıra numarası
  const rk = eOutBack(age / 0.38, 2.0);
  ctx.save(); ctx.translate(80, 430); ctx.scale(lerp(1.7, 1, rk), lerp(1.7, 1, rk)); ctx.globalAlpha *= clamp(age / 0.12);
  const g = ctx.createLinearGradient(0, -190, 0, 0); g.addColorStop(0, gold ? "#fff1b0" : "#ffc06a"); g.addColorStop(1, ACC);
  txt(`#${it.rank}`, 0, 0, { size: 210, fill: g, stroke: "rgba(10,12,30,0.85)", sw: 12, glow: ACC, glowBlur: 45 });
  ctx.restore();
  // mini harita (sağ üst)
  const mapA = eOutCubic((age - 0.25) / 0.4);
  const box = { x: 650, y: 268, w: 350, h: 160 };
  drawMap(box, mapA, () => {
    items.forEach((o, i) => {
      if (i > S.k) return; const [x, y] = mapXY(o.lon, o.lat, box);
      if (i < S.k) { ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); }
    });
    const [x, y] = mapXY(it.lon, it.lat, box), pulse = (age * 1.4) % 1;
    ctx.strokeStyle = ACC; ctx.lineWidth = 3; ctx.globalAlpha *= 1 - pulse; ctx.beginPath(); ctx.arc(x, y, 6 + pulse * 26, 0, 7); ctx.stroke();
    ctx.globalAlpha = mapA; ctx.fillStyle = ACC; ctx.shadowColor = ACC; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
  });
  // isim
  const name = UP(it.name);
  let size = 150; while (measure(name, size, "Mont", 900, -2) > 920 && size > 70) size -= 4;
  const nameK = eOutCubic((age - 0.12) / 0.4);
  ctx.save(); ctx.beginPath(); ctx.rect(60, 430, 980 * nameK + 10, 200); ctx.clip();
  txt(name, 80 - (1 - nameK) * 40, 585, { size, ls: -2, stroke: "rgba(5,8,25,0.9)", sw: 14, glow: "rgba(0,0,0,0.5)", glowBlur: 25 });
  ctx.restore();
  // bölge
  const rgK = eOutCubic((age - 0.3) / 0.35);
  ctx.save(); ctx.globalAlpha *= rgK; ctx.translate(0, (1 - rgK) * 20);
  pin(100, 655, 1.35, ACC);
  txt(it.region, 132, 668, { size: 44, font: "InterSB", weight: 600, fill: "rgba(255,255,255,0.95)", stroke: "rgba(0,0,0,0.55)", sw: 8 });
  ctx.restore();
  // bilgi kartı
  const fK = eOutBack((age - 0.5) / 0.4, 1.4);
  if (fK > 0) {
    const fact = it.fact, fw = measure(fact, 38, "InterSB", 600) + 56;
    ctx.save(); ctx.globalAlpha *= clamp(fK); ctx.translate(80, 700); ctx.scale(lerp(0.85, 1, fK), lerp(0.85, 1, fK));
    rrect(0, 0, fw, 70, 35); ctx.fillStyle = "rgba(8,12,32,0.62)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = ACC; rrect(0, 0, 8, 70, 4); ctx.fill();
    txt(fact, 30, 47, { size: 38, font: "InterSB", weight: 600 });
    ctx.restore();
  }
  ctx.restore();
  // yükseklik cetveli + sayaç (3D'ye bağlı)
  if (info.count > 0 && info.top) {
    const a = clamp((t - S.count0) / 0.2) * (1 - exit), { top, base } = info;
    ctx.save(); ctx.globalAlpha = a;
    const lg = ctx.createLinearGradient(0, base.y, 0, top.y); lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(1, ACC);
    ctx.strokeStyle = lg; ctx.lineWidth = 5; ctx.shadowColor = ACC; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke(); ctx.shadowBlur = 0;
    for (const tk of info.ticks) {
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tk.p.x - 12, tk.p.y); ctx.lineTo(tk.p.x + 12, tk.p.y); ctx.stroke();
      if (tk.v % 1000 === 0) txt(`${tk.v / 1000}K`, tk.p.x + 20, tk.p.y + 9, { size: 26, font: "InterSB", weight: 600, fill: "rgba(255,255,255,0.8)", stroke: "rgba(0,0,0,0.6)", sw: 5 });
    }
    const done = t >= S.count1, bump = done ? 1 + 0.18 * Math.exp(-(t - S.count1) * 6) * Math.sin(Math.min(Math.PI, (t - S.count1) * 14)) : 1;
    const label = `${fmt(info.value)} ${TL.unit}`, fs = 70, lw = measure(label, fs) + 54;
    const lx = clamp(top.x, lw / 2 + 30, W - lw / 2 - 30), ly = clamp(top.y - 80, 890, 1160);
    ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(lx, ly + 40); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(top.x, top.y, 8, 0, 7); ctx.fill();
    if (done) { const rp = clamp((t - S.count1) / 0.6); ctx.strokeStyle = ACC; ctx.globalAlpha = a * (1 - rp); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(top.x, top.y, 10 + rp * 70, 0, 7); ctx.stroke(); ctx.globalAlpha = a; }
    ctx.save(); ctx.translate(lx, ly); ctx.scale(bump, bump);
    rrect(-lw / 2, -50, lw, 96, 48); ctx.fillStyle = ACC; ctx.shadowColor = ACC; ctx.shadowBlur = 35; ctx.fill(); ctx.shadowBlur = 0;
    txt(label, 0, 25, { size: fs, align: "center", fill: gold ? "#2a1a00" : "#fff" });
    txt("ZİRVE", 0, -66, { size: 28, font: "InterSB", weight: 600, align: "center", ls: 6, fill: "rgba(255,255,255,0.9)", stroke: "rgba(0,0,0,0.5)", sw: 5 });
    ctx.restore(); ctx.restore();
  }
}

// başlığı satırlara böl: son satır turuncu ve büyük; her satır 960 px'e sığar
function headlineLines(text) {
  const words = UP(text).split(/\s+/), lines = []; let cur = "";
  for (const w of words) { if (cur && (cur + " " + w).length > 13) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  if (cur) lines.push(cur);
  return lines.slice(0, 4).map((s, i, arr) => {
    const last = i === arr.length - 1; let size = last ? 190 : 128;
    while (measure(s, size, "Mont", 900, -2) > 960 && size > 60) size -= 4;
    return [s, last ? ORANGE : "#fff", size];
  });
}

function drawHookOverlay(t, info) {
  const S = info.S, slam = S.slam, pre = t < slam, left = S.t1 - t, exit = eInCubic(1 - left / 0.25);
  ctx.save(); ctx.globalAlpha = 1 - exit;
  // 3D etiketler
  const a = info.hookAnchors, lf = 1 - clamp((t - slam) / 0.25);
  ctx.save(); ctx.globalAlpha *= lf;
  if (a) {
  const lab = (p, l1, l2, col, k) => {
    if (k <= 0) return; ctx.save(); ctx.globalAlpha *= clamp(k);
    p = { x: clamp(p.x, 150, W - 150), y: Math.max(p.y, 700) };
    txt(l1, p.x, p.y - 62, { size: 34, font: "InterSB", weight: 600, align: "center", ls: 3, fill: col, stroke: "rgba(0,0,0,0.6)", sw: 6 });
    txt(l2, p.x, p.y - 12, { size: 52, align: "center", stroke: "rgba(0,0,0,0.75)", sw: 10 });
    ctx.restore();
  };
  lab(a.ev, "EVEREST", `${fmt(8849 * clamp(info.ev))} m`, "#9fe6ff", (t - 0.4) / 0.3);
  lab(a.ag, "AĞRI DAĞI", `${fmt(5137 * clamp(info.agUp))} m`, ORANGE, (t - 0.9) / 0.3);
  const lk = clamp((t - 1.9) / 0.3);
  if (lk > 0) txt("EVEREST'İN YARISI · 4.424 m", a.line.x, a.line.y - 18, { size: 30, font: "InterSB", weight: 600, fill: "#ffb36b", stroke: "rgba(0,0,0,0.7)", sw: 6, alpha: lk });
  }
  ctx.restore();
  // üst metin
  if (pre) {
    const k = eOutBack(t / 0.35, 2);
    const s = UP(TL.hook.kicker || "BUNU BİLİYOR MUYDUN?"), fw = measure(s, 46, "Mont", 900, 2) + 70;
    ctx.save(); ctx.translate(W / 2, 290); ctx.scale(k, k);
    rrect(-fw / 2, -48, fw, 92, 46); ctx.fillStyle = ORANGE; ctx.shadowColor = ORANGE; ctx.shadowBlur = 40; ctx.fill(); ctx.shadowBlur = 0;
    txt(s, 0, 16, { size: 46, align: "center", ls: 2 });
    ctx.restore();
    const q = eOutCubic((t - 0.5) / 0.4);
    const sub = TL.hook.sub || [];
    if (sub[0]) txt(sub[0], W / 2, 420, { size: 50, font: "InterSB", weight: 600, align: "center", alpha: q, stroke: "rgba(0,0,0,0.55)", sw: 8 });
    if (sub[1]) txt(sub[1], W / 2, 488, { size: 50, font: "InterSB", weight: 600, align: "center", alpha: clamp((t - 1.4) / 0.3), fill: "#ffd23f", stroke: "rgba(0,0,0,0.55)", sw: 8 });
  } else {
    const k = (t - slam);
    const L = headlineLines(TL.hook.headline || TL.title);
    let y = 330;
    L.forEach(([s, col, size], i) => {
      const kk = eOutBack((k - i * 0.09) / 0.32, 2.2);
      if (kk <= 0) { y += size * 0.95; return; }
      ctx.save(); ctx.translate(W / 2, y + size * 0.4); ctx.scale(lerp(1.8, 1, kk), lerp(1.8, 1, kk)); ctx.globalAlpha *= clamp(kk * 3);
      txt(s, 0, size * 0.35, { size, align: "center", fill: col, stroke: "rgba(5,8,25,0.9)", sw: 14, glow: col === "#fff" ? "rgba(0,0,0,0.5)" : ORANGE, glowBlur: 40, ls: -2 });
      ctx.restore(); y += size * 0.95;
    });
  }
  ctx.restore();
}

function drawOutroOverlay(t, S) {
  const age = t - S.t0;
  ctx.fillStyle = `rgba(4,8,24,${0.55 * eOutCubic(age / 0.6)})`; ctx.fillRect(0, 0, W, H);
  const box = { x: 70, y: 640, w: 940, h: 430 };
  const mk = eOutCubic((age - 0.1) / 0.6);
  ctx.save(); ctx.translate(W / 2, box.y + box.h / 2); ctx.scale(lerp(0.4, 1, mk), lerp(0.4, 1, mk)); ctx.translate(-W / 2, -(box.y + box.h / 2));
  // etiket konumları: yakın noktaları iterek çakışmayı önle
  const pts = items.map((o) => { const [x, y] = mapXY(o.lon, o.lat, box); return { o, x, y, lx: x, ly: y - 52 }; });
  for (let it = 0; it < 120; it++) for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) {
    if (i === j) continue; const a = pts[i], b = pts[j], dx = a.lx - b.lx, dy = a.ly - b.ly, d = Math.hypot(dx, dy) || 0.01;
    if (d < 62) { a.lx += (dx / d) * (62 - d) * 0.5 + (i - j) * 0.01; a.ly += (dy / d) * (62 - d) * 0.5; }
  }
  drawMap(box, mk, () => {
    const order = [...pts].sort((a, b) => b.o.rank - a.o.rank);
    order.forEach((p, idx) => {
      const k = eOutBack((age - 0.5 - idx * 0.09) / 0.3, 2.2); if (k <= 0) return;
      const col = p.o.rank === 1 ? GOLD : ORANGE;
      ctx.save(); ctx.globalAlpha = mk * clamp(k * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.lx, p.ly); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill();
      ctx.translate(p.lx, p.ly); ctx.scale(k, k);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(0, 0, 27, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      txt(String(p.o.rank), 0, 12, { size: 32, align: "center", fill: p.o.rank === 1 ? "#2a1a00" : "#fff" });
      ctx.restore();
    });
  });
  ctx.restore();
  const hk = eOutBack((age - 0.15) / 0.4, 1.8);
  headlineLines(TL.outro.headline || "SEN HANGİSİNİ SEÇERDİN?").map(([s, col, size]) => [s, Math.min(size, 122), col]).forEach(([s, size, col], i) => {
    const kk = eOutBack((age - 0.15 - i * 0.12) / 0.4, 1.8); if (kk <= 0) return;
    ctx.save(); ctx.translate(W / 2, 330 + i * 140); ctx.scale(kk, kk);
    txt(s, 0, 0, { size, align: "center", fill: col, stroke: "rgba(5,8,25,0.9)", sw: 14, glow: col === ORANGE ? ORANGE : "rgba(0,0,0,.5)", glowBlur: 35, ls: -2 });
    ctx.restore();
  });
  const ck = eOutBack((age - 1.6) / 0.4, 2);
  if (ck > 0) {
    const s = UP(TL.outro.cta || "Yorumlara yaz"), fw = measure(s, 46, "Mont", 900, 1) + 90;
    ctx.save(); ctx.translate(W / 2, 1160); ctx.scale(ck, ck);
    rrect(-fw / 2, -46, fw, 92, 46); ctx.fillStyle = "#fff"; ctx.fill();
    txt(s, 0, 16, { size: 46, align: "center", fill: "#0b1230", ls: 1 });
    ctx.restore();
  }
}

function post(t, info) {
  // geçiş ışığı + flaş
  let flash = 0;
  for (const S of scenes.slice(1)) { const d = t - S.t0; if (d > -0.12 && d < 0.4) flash = Math.max(flash, d < 0 ? (d + 0.12) / 0.12 : Math.exp(-d * 9)); }
  if (flash > 0) {
    const lg = ctx.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, H * 0.9);
    lg.addColorStop(0, `rgba(255,190,120,${0.55 * flash})`); lg.addColorStop(1, "rgba(255,120,60,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,255,255,${0.32 * flash})`; ctx.fillRect(0, 0, W, H);
  }
  // vinyet
  const vg = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.3, W / 2, H * 0.5, H * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,10,0.62)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  // film greni
  ctx.save(); ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = "overlay";
  const r = mulberry32(Math.floor(t * 30) + 1), ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
  ctx.translate(-ox, -oy); ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
  // açılış/kapanış kararması
  const fadeIn = clamp(t / 0.25), fadeOut = clamp((TL.duration - t) / 0.5);
  const k = Math.min(fadeIn, fadeOut);
  if (k < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - k})`; ctx.fillRect(0, 0, W, H); }
}

let lastT = -1;
window.renderFrame = (t) => {
  const info = renderScene3D(t);
  // hareket bulanıklığı: savrulma sırasında önceki kareyle harmanla
  const contiguous = lastT >= 0 && Math.abs(t - lastT - 1 / TL.fps) < 1e-3;
  ctx.globalAlpha = contiguous && info.blur > 0.05 ? lerp(1, 0.38, info.blur) : 1;
  ctx.drawImage(glc, 0, 0); ctx.globalAlpha = 1;
  // üst bilgi alanı için hafif gölge
  const tg = ctx.createLinearGradient(0, 0, 0, 820); tg.addColorStop(0, "rgba(3,6,20,0.55)"); tg.addColorStop(1, "rgba(3,6,20,0)");
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 820);
  const S = info.S;
  if (S.type === "hook") drawHookOverlay(t, info);
  else if (S.type === "item") drawItemOverlay(t, info);
  else drawOutroOverlay(t, S);
  drawCaptions(t);
  post(t, info);
  lastT = t;
  return out.toDataURL("image/jpeg", 0.92);
};

await document.fonts.load("900 100px Mont"); await document.fonts.load("600 40px InterSB");
window.READY = true;
