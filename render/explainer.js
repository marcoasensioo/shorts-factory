// Shorts Factory — "explainer3d" şablonu: her konuya uyan 3D bilgi videosu.
// Her sahnede: temaya göre 3D ortam + ortada prosedürel 3D nesne + kinetik başlık + karaoke altyazı.
// Her kare yalnızca t'nin fonksiyonudur (deterministik, parça parça render edilebilir).
import * as THREE from "./vendor/three.module.js";

const TL = await (await fetch(window.TIMELINE_URL || "timeline.json")).json();
const LAND = await (await fetch("land.json")).json();
const W = TL.W, H = TL.H;
const YATAY = !!TL.landscape, DW = 1080, DH = 1920;   // yazı düzeni dikey tasarım alanında çizilir

// ------------------------------------------------------------------ yardımcılar
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
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
const NZ = makeNoise(17);
const fbm = (x, y, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * NZ(x * f, y * f); a *= .5; f *= 2.03; } return s; };
const n3 = (x, y, z) => (NZ(x + z * 1.7, y - z * 0.9) + NZ(y + 3.1, z + x * 0.7)) * 0.5;

// ------------------------------------------------------------------ temalar
const THEMES = {
  space:  { top: "#04020f", mid: "#170c3d", bot: "#3b1253", accent: "#8be9ff", rim: "#7c5cff", particles: "stars", nebula: 1 },
  ocean:  { top: "#1185c4", mid: "#0a4a7a", bot: "#02111f", accent: "#3ee0ff", rim: "#46d5ff", particles: "bubbles", rays: 1 },
  lab:    { top: "#071a20", mid: "#0c2f38", bot: "#03080a", accent: "#2ef2b0", rim: "#2ef2b0", particles: "dust", grid: 1 },
  nature: { top: "#103d2c", mid: "#1f6e46", bot: "#07150e", accent: "#a6ff5c", rim: "#ffd27a", particles: "bokeh" },
  warm:   { top: "#1a0b2e", mid: "#7a2a4a", bot: "#f08a5d", accent: "#ffb020", rim: "#ff7a1a", particles: "dust" },
  mind:   { top: "#11052a", mid: "#4b1a7d", bot: "#c0367d", accent: "#ff7ad9", rim: "#b06bff", particles: "bokeh", nebula: 0.5 },
  body:   { top: "#22040a", mid: "#6b0f22", bot: "#12030a", accent: "#ff5577", rim: "#ff3355", particles: "bokeh" },
  storm:  { top: "#04060e", mid: "#1b2142", bot: "#3b4066", accent: "#ffe14d", rim: "#8fb3ff", particles: "dust", nebula: 0.35 },
  earth:  { top: "#02040d", mid: "#0b1d44", bot: "#123d6b", accent: "#ffd23f", rim: "#4fb3ff", particles: "stars" },
};

// ------------------------------------------------------------------ three kurulum
const glc = document.createElement("canvas"); glc.width = W; glc.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(YATAY ? 34 : 40, W / H, 0.1, 400);
if (YATAY) camera.setViewOffset(W, H, -W * 0.2, 0, W, H);

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
              rim: { value: new THREE.Color() }, neb: { value: 0 }, time: { value: 0 } },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform vec3 top,mid,bot,rim; uniform float neb,time; varying vec3 vD;
    float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    float fb(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5;} return s; }
    void main(){ float y=vD.y; vec3 c=mix(bot,mid,smoothstep(-0.38,0.0,y)); c=mix(c,top,smoothstep(0.0,0.36,y));
      vec2 uv=vec2(atan(vD.z,vD.x)*1.2, y*2.2)+vec2(time*0.01,0.);
      float f=fb(uv*2.0); c+=rim*neb*pow(f,3.0)*0.9; c+=mid*neb*smoothstep(.55,.9,fb(uv*3.5+4.))*0.35;
      gl_FragColor=vec4(c,1.); }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), skyMat));
const keyL = new THREE.DirectionalLight("#fff3e6", 2.6); keyL.position.set(-4, 6, 6); scene.add(keyL);
const rimL = new THREE.DirectionalLight("#ffffff", 2.2); rimL.position.set(5, 2, -6); scene.add(rimL);
const fillL = new THREE.HemisphereLight("#cfe0ff", "#20141a", 0.9); scene.add(fillL);
{ // nötr stüdyo ortamı (metal ve parlak yüzeyler için yansıma)
  const env = new THREE.Scene(), sg = new THREE.SphereGeometry(10, 32, 16), col = [], pos = sg.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10, c = new THREE.Color().setRGB(0.25 + 0.75 * Math.max(0, y), 0.25 + 0.7 * Math.max(0, y), 0.3 + 0.7 * Math.max(0, y)); col.push(c.r, c.g, c.b); }
  sg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  env.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  for (const [x, y, z, w] of [[-6, 4, 5, 3], [6, 2, 4, 2], [0, 6, -6, 4]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide })); b.position.set(x, y, z); b.lookAt(0, 0, 0); env.add(b); }
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.04).texture; scene.environmentIntensity = 0.55;
}
const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();

// parçacıklar (tema türüne göre davranır)
const PN = 900, pSeed = new Float32Array(PN * 4);
{ const r = mulberry32(31); for (let i = 0; i < PN * 4; i++) pSeed[i] = r(); }
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PN * 3), 3));
const pMat = new THREE.PointsMaterial({ size: 0.06, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffffff" });
const particles = new THREE.Points(pGeo, pMat); scene.add(particles);
// ışık hüzmeleri (okyanus)
const rays = new THREE.Group(); scene.add(rays);
{ const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); const tx = new THREE.CanvasTexture(c);
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 16), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(-5 + i * 1.7, 4, -6 - (i % 3)); m.rotation.z = 0.35; m.userData.p = i; rays.add(m); } }
const grid = new THREE.GridHelper(60, 60, "#2ef2b0", "#1a5a4a"); grid.position.y = -1.35; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);

// ------------------------------------------------------------------ 3D nesne kütüphanesi
const P = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.2, ...o });
const S = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.0, ...o });
const mesh = (g, m) => new THREE.Mesh(g, m);
const glow = (color, size, op = 0.8) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(size, size, 1); return s; };
const canvasTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

const OBJ = {
  heart() {
    const s = new THREE.Shape(); s.moveTo(0, -1); s.bezierCurveTo(-0.15, -0.75, -1.05, -0.35, -1.0, 0.25); s.bezierCurveTo(-0.95, 0.85, -0.2, 0.95, 0, 0.45);
    s.bezierCurveTo(0.2, 0.95, 0.95, 0.85, 1.0, 0.25); s.bezierCurveTo(1.05, -0.35, 0.15, -0.75, 0, -1);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.22, bevelSegments: 10, curveSegments: 40 }); g.center();
    const grp = new THREE.Group(); grp.add(mesh(g, P("#e3203c", { sheen: 0.5 }))); grp.add(glow("#ff4060", 4.5, 0.35));
    grp.userData.update = (t) => { const b = 1 + 0.07 * Math.pow(Math.max(0, Math.sin(t * 7.5)), 8) + 0.04 * Math.pow(Math.max(0, Math.sin(t * 7.5 - 0.9)), 8); grp.children[0].scale.setScalar(b); };
    return grp;
  },
  octopus() {
    const grp = new THREE.Group(), skin = P("#e8673a", { roughness: 0.45, sheen: 1, sheenColor: new THREE.Color("#ffb08a") });
    const head = mesh(new THREE.SphereGeometry(0.8, 48, 32), skin); head.scale.set(1, 1.25, 1); head.position.y = 0.75; grp.add(head);
    for (const sx of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(0.17, 24, 16), S("#fff7e8", { roughness: 0.2 })); e.position.set(0.32 * sx, 0.42, 0.66); grp.add(e);
      const pu = mesh(new THREE.SphereGeometry(0.09, 16, 12), S("#111")); pu.position.set(0.33 * sx, 0.42, 0.8); grp.add(pu);
    }
    const arms = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, root = new THREE.Group(); root.position.set(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45);
      root.rotation.y = -a + Math.PI / 2; grp.add(root);
      let parent = root; const segs = [];
      for (let j = 0; j < 13; j++) {
        const r = 0.17 * (1 - j / 14) + 0.025, seg = new THREE.Group(); seg.position.y = j ? -0.19 : 0;
        const c = mesh(new THREE.CapsuleGeometry(r, 0.2, 6, 14), skin); c.position.y = -0.1; seg.add(c);
        parent.add(seg); segs.push(seg); parent = seg;
      }
      arms.push({ segs, i });
    }
    grp.userData.update = (t) => {
      for (const { segs, i } of arms) segs.forEach((sg, j) => {
        sg.rotation.x = (j === 0 ? -0.75 : 0.07) + Math.sin(t * 2.2 + i * 0.8 - j * 0.45) * 0.1;
        sg.rotation.z = Math.sin(t * 1.7 + i * 1.3 - j * 0.3) * 0.08;
      });
      head.scale.set(1 + 0.03 * Math.sin(t * 2), 1.25 - 0.03 * Math.sin(t * 2), 1);
    };
    grp.position.y = 0.3;
    return grp;
  },
  planet(color = "#e8b26a", opt = {}) {
    const N = makeNoise(5), tex = canvasTex(512, 256, (g, w, h) => {
      const base = new THREE.Color(color);
      for (let y = 0; y < h; y++) { const v = 0.75 + 0.25 * Math.sin(y * 0.11) + 0.15 * N(0.5, y * 0.05); const c = base.clone().multiplyScalar(v); g.fillStyle = `#${c.getHexString()}`; g.fillRect(0, y, w, 1); }
    });
    const grp = new THREE.Group(); grp.add(mesh(new THREE.SphereGeometry(1, 64, 48), S("#fff", { map: tex, roughness: 0.8 })));
    const rt = canvasTex(512, 8, (g, w) => { for (let x = 0; x < w; x++) { const a = 0.25 + 0.5 * Math.abs(Math.sin(x * 0.09)) * (x > 40 ? 1 : 0); g.fillStyle = `rgba(240,220,190,${a})`; g.fillRect(x, 0, 1, 8); } });
    const rg = new THREE.RingGeometry(1.35, 2.15, 128); if (opt.rings !== false) { const uv = rg.attributes.uv, pos = rg.attributes.position;
    for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 1.35) / 0.8, 0.5); }
    const ring = mesh(rg, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -1.25; grp.add(ring); }
    grp.rotation.z = 0.35;
    grp.userData.update = (t) => { grp.children[0].rotation.y = t * 0.3; };
    return grp;
  },
  venus() {
    const N = makeNoise(21), tex = canvasTex(512, 256, (g, w, h) => { for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = 0.65 + 0.35 * (0.5 + 0.5 * N(x * 0.012 + y * 0.004, y * 0.05)); g.fillStyle = `rgb(${Math.floor(235 * v)},${Math.floor(190 * v)},${Math.floor(120 * v)})`; g.fillRect(x, y, 2, 2); } });
    const grp = new THREE.Group(), m = mesh(new THREE.SphereGeometry(1, 64, 48), S("#fff", { map: tex, roughness: 0.9 })); grp.add(m); grp.add(glow("#ffcf8a", 3.0, 0.25));
    grp.userData.update = (t) => { m.rotation.y = -t * 0.12; }; return grp;
  },
  earth() {
    const tex = canvasTex(2048, 1024, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0b3f77"); gr.addColorStop(0.5, "#1167b1"); gr.addColorStop(1, "#0b3f77"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#3e8a3a"; g.strokeStyle = "#cfe8b0"; g.lineWidth = 2;
      for (const ring of LAND) { g.beginPath(); ring.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * w, y = (90 - la) / 180 * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); }
      g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(0, 0, w, h * 0.04); g.fillRect(0, h * 0.95, w, h * 0.05);
    });
    const grp = new THREE.Group(), e = mesh(new THREE.SphereGeometry(1, 96, 64), S("#fff", { map: tex, roughness: 0.6 })); grp.add(e);
    const atm = mesh(new THREE.SphereGeometry(1.08, 64, 48), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);} `,
      fragmentShader: `varying vec3 vN; void main(){ float i=pow(0.75-dot(vN,vec3(0,0,1.)),3.0); gl_FragColor=vec4(0.35,0.7,1.0,1.)*i*0.9; }` }));
    grp.add(atm); grp.rotation.z = 0.41;
    grp.userData.update = (t) => { e.rotation.y = 0.6 + t * 0.25; };
    return grp;
  },
  moon() {
    const r = mulberry32(8), tex = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = "#9a9a9e"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h, s = r() * 3; g.fillStyle = `rgba(${r() > .5 ? 255 : 40},${r() > .5 ? 255 : 40},${r() > .5 ? 255 : 40},0.06)`; g.fillRect(x, y, s * 6, s * 6); }
      for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * h, rad = 3 + Math.pow(r(), 3) * 40; g.fillStyle = "rgba(60,60,66,0.35)"; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.strokeStyle = "rgba(220,220,225,0.35)"; g.lineWidth = rad * 0.15; g.beginPath(); g.arc(x - rad * 0.1, y - rad * 0.1, rad, 0, 7); g.stroke(); }
    });
    const grp = new THREE.Group(), m = mesh(new THREE.SphereGeometry(1, 96, 64), S("#fff", { map: tex, bumpMap: tex, bumpScale: 0.03, roughness: 0.95 })); grp.add(m);
    grp.userData.update = (t) => { m.rotation.y = t * 0.15; }; return grp;
  },
  sun() {
    const N = makeNoise(9), tex = canvasTex(512, 256, (g, w, h) => { for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = 0.5 + 0.5 * N(x * 0.03, y * 0.03) * 0.6 + 0.2 * N(x * 0.1, y * 0.1); g.fillStyle = `rgb(255,${Math.floor(120 + v * 110)},${Math.floor(20 + v * 50)})`; g.fillRect(x, y, 2, 2); } });
    const grp = new THREE.Group(), m = mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ map: tex })); grp.add(m);
    grp.add(glow("#ffb347", 4.2, 0.9)); grp.add(glow("#ff6a00", 6.5, 0.45));
    grp.userData.update = (t) => { m.rotation.y = t * 0.2; grp.children[1].scale.setScalar(4.2 + 0.15 * Math.sin(t * 3)); }; return grp;
  },
  brain() {
    const g = new THREE.SphereGeometry(1, 160, 120), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const ridge = 1 - Math.abs(n3(v.x * 3.2, v.y * 3.2, v.z * 3.2)); let d = 0.07 * Math.pow(ridge, 3);
      if (Math.abs(v.x) < 0.06 && v.y > -0.2) d -= 0.12 * (1 - Math.abs(v.x) / 0.06);
      v.multiplyScalar(1 + d); v.x *= 0.85; v.z *= 1.18; v.y *= 0.82; p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const grp = new THREE.Group(), mat = P("#f3a1b3", { roughness: 0.42, sheen: 1, sheenColor: new THREE.Color("#ffd0dc") });
    grp.add(mesh(g, mat)); const cb = mesh(new THREE.SphereGeometry(0.42, 48, 32), mat); cb.position.set(0, -0.55, -0.72); cb.scale.set(1.4, 0.7, 0.8); grp.add(cb);
    const st = mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.7, 24), mat); st.position.set(0, -0.85, -0.35); st.rotation.x = 0.3; grp.add(st);
    // nöron ışıkları
    const r = mulberry32(4), sparks = [];
    for (let i = 0; i < 26; i++) { const s = glow("#ff9ee8", 0.35, 0); const u = r() * 6.28, w = r() * 1.2 - 0.3; s.position.set(Math.cos(u) * 0.86 * Math.cos(w), Math.sin(w) * 0.82, Math.sin(u) * 1.18 * Math.cos(w)); grp.add(s); sparks.push([s, r() * 6]); }
    grp.rotation.y = -0.6;
    grp.userData.update = (t) => { for (const [s, ph] of sparks) s.material.opacity = Math.pow(Math.max(0, Math.sin(t * 2.5 + ph)), 12) * 0.95; };
    return grp;
  },
  dna() {
    const grp = new THREE.Group(), a = P("#4fb3ff"), b = P("#ff6bb5"), rung = S("#e8e8f0", { roughness: 0.4 });
    const n = 34;
    for (let i = 0; i < n; i++) {
      const y = (i - n / 2) * 0.11, ang = i * 0.42, x = Math.cos(ang) * 0.55, z = Math.sin(ang) * 0.55;
      const s1 = mesh(new THREE.SphereGeometry(0.1, 20, 14), a); s1.position.set(x, y, z); grp.add(s1);
      const s2 = mesh(new THREE.SphereGeometry(0.1, 20, 14), b); s2.position.set(-x, y, -z); grp.add(s2);
      if (i % 2 === 0) { const c = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), i % 4 ? a : b); c.position.set(0, y, 0); c.rotation.z = Math.PI / 2; c.rotation.y = -ang; grp.add(c); }
    }
    grp.rotation.z = 0.25; grp.userData.update = (t) => { grp.rotation.y = t * 0.6; }; return grp;
  },
  atom() {
    const grp = new THREE.Group(), r = mulberry32(3);
    for (let i = 0; i < 14; i++) { const s = mesh(new THREE.SphereGeometry(0.17, 24, 16), P(i % 2 ? "#ff5a5a" : "#5aa8ff")); s.position.set((r() - .5) * 0.38, (r() - .5) * 0.38, (r() - .5) * 0.38); grp.add(s); }
    const orbits = [];
    for (let k = 0; k < 3; k++) {
      const o = new THREE.Group(); o.rotation.set(k * 1.05, k * 0.6, k * 0.4); grp.add(o);
      o.add(mesh(new THREE.TorusGeometry(1.35, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: "#8be9ff", transparent: true, opacity: 0.6 })));
      const e = mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: "#bff6ff" })); e.add(glow("#8be9ff", 0.7, 0.9)); o.add(e); orbits.push([e, k]);
    }
    grp.userData.update = (t) => { for (const [e, k] of orbits) { const a = t * (2.2 + k * 0.5) + k * 2; e.position.set(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0); } grp.rotation.y = t * 0.2; };
    return grp;
  },
  lightbulb() {
    const grp = new THREE.Group();
    const glass = lathe([[0, 1.25], [0.35, 1.2], [0.62, 1.02], [0.74, 0.72], [0.7, 0.38], [0.5, 0.05], [0.34, -0.2], [0.32, -0.38]]);
    grp.add(mesh(glass, new THREE.MeshStandardMaterial({ color: "#fff6d8", emissive: "#ffcc55", emissiveIntensity: 0.55, transparent: true, opacity: 0.55, roughness: 0.1 })));
    const coil = new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => new THREE.Vector3(Math.cos(i * 1.2) * 0.12, 0.3 + i * 0.012, Math.sin(i * 1.2) * 0.12)));
    grp.add(mesh(new THREE.TubeGeometry(coil, 120, 0.018, 8), new THREE.MeshBasicMaterial({ color: "#fff2a0" })));
    const base = lathe([[0.32, -0.38], [0.34, -0.45], [0.31, -0.52], [0.34, -0.59], [0.31, -0.66], [0.34, -0.73], [0.28, -0.82], [0.12, -0.9], [0, -0.92]]);
    grp.add(mesh(base, S("#b9bcc4", { metalness: 0.9, roughness: 0.3 })));
    grp.add(glow("#ffd75e", 3.6, 0.6));
    grp.userData.update = (t) => { grp.children[3].material.opacity = 0.55 + 0.1 * Math.sin(t * 9) * Math.sin(t * 3.1); }; return grp;
  },
  hourglass() {
    const grp = new THREE.Group(), glassM = new THREE.MeshStandardMaterial({ color: "#dff4ff", transparent: true, opacity: 0.3, roughness: 0.05 });
    grp.add(mesh(lathe([[0.62, 1.0], [0.6, 0.6], [0.35, 0.25], [0.07, 0.02], [0.35, -0.25], [0.6, -0.6], [0.62, -1.0]]), glassM));
    const wood = S("#8a5a32", { roughness: 0.6 });
    for (const y of [1.08, -1.08]) { const c = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 48), wood); c.position.y = y; grp.add(c); }
    for (let i = 0; i < 3; i++) { const a = i * 2.094, p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 12), wood); p.position.set(Math.cos(a) * 0.76, 0, Math.sin(a) * 0.76); grp.add(p); }
    const sand = S("#e9c46a", { roughness: 0.9 });
    const top = mesh(new THREE.ConeGeometry(0.5, 0.55, 40), sand); top.rotation.x = Math.PI; grp.add(top);
    const bot = mesh(new THREE.ConeGeometry(0.55, 0.5, 40), sand); grp.add(bot);
    const stream = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), sand); grp.add(stream);
    grp.userData.update = (t) => { const k = (t * 0.06) % 1; top.scale.setScalar(1 - k * 0.8); top.position.y = 0.32 + (1 - top.scale.y) * 0.1; bot.scale.setScalar(0.25 + k * 0.75); bot.position.y = -0.93 + bot.scale.y * 0.25; stream.position.y = -0.4; };
    return grp;
  },
  drop() {
    const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40, y = 1.2 - u * 2.1, r = u < 0.55 ? Math.pow(u / 0.55, 1.4) * 0.72 * Math.sin(u / 0.55 * Math.PI / 2) : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.55) / 0.45, 2))) * 0.72; pts.push([Math.max(0.0001, r), y]); }
    const grp = new THREE.Group(); grp.add(mesh(lathe(pts, 96), P("#47b8ff", { transparent: true, opacity: 0.85, roughness: 0.05, emissive: "#0a3a66", emissiveIntensity: 0.4 })));
    const hl = mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8 })); hl.position.set(-0.28, -0.05, 0.6); hl.scale.set(1, 1.8, 0.4); grp.add(hl);
    grp.userData.update = (t) => { grp.children[0].scale.set(1 + 0.03 * Math.sin(t * 4), 1 - 0.03 * Math.sin(t * 4), 1); }; return grp;
  },
  lightning() {
    const s = new THREE.Shape(); [[0.15, 1.2], [-0.55, -0.05], [-0.05, -0.05], [-0.3, -1.2], [0.6, 0.25], [0.1, 0.25], [0.45, 1.2]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }); g.center();
    const grp = new THREE.Group(); grp.add(mesh(g, new THREE.MeshStandardMaterial({ color: "#ffe14d", emissive: "#ffcc00", emissiveIntensity: 1.2, roughness: 0.3 })));
    grp.add(glow("#ffe14d", 4, 0.6));
    grp.userData.update = (t) => { const f = Math.sin(t * 23) > 0.7 ? 1 : 0.55; grp.children[1].material.opacity = 0.35 + 0.4 * f; }; return grp;
  },
  virus() {
    const grp = new THREE.Group(), N = makeNoise(12);
    const tex = canvasTex(256, 128, (g, w, h) => { for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = 0.6 + 0.4 * N(x * 0.06, y * 0.06); g.fillStyle = `rgb(${Math.floor(90 * v)},${Math.floor(200 * v)},${Math.floor(120 * v)})`; g.fillRect(x, y, 2, 2); } });
    grp.add(mesh(new THREE.SphereGeometry(0.85, 64, 48), S("#fff", { map: tex, roughness: 0.5 })));
    const spike = S("#ff6b6b", { roughness: 0.4 }), n = 46, up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996, dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      const sp = new THREE.Group(); const c = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 8), spike); c.position.y = 0.16; sp.add(c);
      const k = mesh(new THREE.SphereGeometry(0.075, 12, 8), spike); k.position.y = 0.34; sp.add(k);
      sp.position.copy(dir.clone().multiplyScalar(0.82)); sp.quaternion.setFromUnitVectors(up, dir); grp.add(sp);
    }
    grp.userData.update = (t) => { grp.rotation.x = t * 0.2; }; return grp;
  },
  eye() {
    const iris = canvasTex(512, 512, (g, w) => {
      const c = w / 2, gr = g.createRadialGradient(c, c, 40, c, c, c); gr.addColorStop(0, "#1c6b4a"); gr.addColorStop(0.65, "#2fa58e"); gr.addColorStop(1, "#0d3b44");
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
      g.strokeStyle = "rgba(200,255,230,0.3)"; g.lineWidth = 3; for (let i = 0; i < 140; i++) { const a = i * 0.0449; g.beginPath(); g.moveTo(c + Math.cos(a) * 90, c + Math.sin(a) * 90); g.lineTo(c + Math.cos(a) * (c - 6), c + Math.sin(a) * (c - 6)); g.stroke(); }
      g.fillStyle = "#050505"; g.beginPath(); g.arc(c, c, 92, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)"; g.beginPath(); g.arc(c - 50, c - 55, 26, 0, 7); g.fill();
    });
    const grp = new THREE.Group(), ball = new THREE.Group(); grp.add(ball);
    ball.add(mesh(new THREE.SphereGeometry(1, 96, 64), P("#f7f3ee", { roughness: 0.25 })));
    const ir = mesh(new THREE.SphereGeometry(1.004, 64, 32, 0, Math.PI * 2, 0, 0.5), new THREE.MeshStandardMaterial({ map: iris, roughness: 0.2 }));
    const uv = ir.geometry.attributes.uv, ps = ir.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + ps.getX(i) / 0.96, 0.5 - ps.getZ(i) / 0.96);
    ir.rotation.x = Math.PI / 2; ball.add(ir);
    grp.userData.update = (t) => { ball.rotation.y = 0.3 * Math.sin(t * 0.9); ball.rotation.x = 0.12 * Math.sin(t * 0.7); };
    return grp;
  },
  clock() {
    const grp = new THREE.Group();
    const face = canvasTex(512, 512, (g, w) => { const c = w / 2; g.fillStyle = "#fbf7ef"; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill(); g.fillStyle = "#222"; for (let i = 0; i < 60; i++) { const a = i * Math.PI / 30, L = i % 5 ? 12 : 34, Wd = i % 5 ? 4 : 10; g.save(); g.translate(c, c); g.rotate(a); g.fillRect(-Wd / 2, -c + 18, Wd, L); g.restore(); } });
    const d = mesh(new THREE.CylinderGeometry(1, 1, 0.12, 96), [S("#d8b24a", { metalness: 0.8, roughness: 0.3 }), S("#fff", { map: face }), S("#d8b24a")]); d.rotation.x = Math.PI / 2; grp.add(d);
    const rim = mesh(new THREE.TorusGeometry(1.02, 0.08, 16, 96), S("#d8b24a", { metalness: 0.9, roughness: 0.25 })); grp.add(rim);
    const hand = (len, w, col) => { const h = new THREE.Group(); const m = mesh(new THREE.BoxGeometry(w, len, 0.03), S(col)); m.position.y = len / 2 - 0.08; h.add(m); h.position.z = 0.09; grp.add(h); return h; };
    const hh = hand(0.55, 0.07, "#222"), mh = hand(0.82, 0.045, "#222"), sh = hand(0.9, 0.02, "#e63946");
    grp.userData.update = (t) => { sh.rotation.z = -t * 6; mh.rotation.z = -t * 0.5; hh.rotation.z = -t * 0.04 - 1; }; return grp;
  },
  tree() {
    const grp = new THREE.Group(); const tr = mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.1, 16), S("#7a4e2d")); tr.position.y = -0.55; grp.add(tr);
    const leaf = S("#3fae5a", { flatShading: true, roughness: 0.7 }), r = mulberry32(6);
    for (let i = 0; i < 6; i++) { const b = mesh(new THREE.IcosahedronGeometry(0.45 + r() * 0.2, 1), leaf); b.position.set((r() - .5) * 0.9, 0.35 + r() * 0.6, (r() - .5) * 0.9); grp.add(b); }
    grp.userData.update = (t) => { grp.rotation.z = 0.03 * Math.sin(t * 1.3); }; return grp;
  },
  book() {
    const grp = new THREE.Group(), page = S("#fbf6e9", { roughness: 0.8 }), cover = S("#8b1e3f", { roughness: 0.5 });
    const L = mesh(new THREE.BoxGeometry(1.0, 0.12, 1.35), page); L.position.set(-0.52, 0, 0); L.rotation.z = 0.12; grp.add(L);
    const R = mesh(new THREE.BoxGeometry(1.0, 0.12, 1.35), page); R.position.set(0.52, 0, 0); R.rotation.z = -0.12; grp.add(R);
    const C = mesh(new THREE.BoxGeometry(2.2, 0.05, 1.45), cover); C.position.y = -0.1; grp.add(C);
    const flip = new THREE.Group(); grp.add(flip); const fp = mesh(new THREE.PlaneGeometry(1.0, 1.3, 8, 1), new THREE.MeshStandardMaterial({ color: "#fffaf0", side: THREE.DoubleSide })); fp.position.x = 0.5; fp.rotation.x = -Math.PI / 2; flip.add(fp); flip.position.y = 0.07;
    grp.rotation.x = 0.55;
    grp.userData.update = (t) => { flip.rotation.z = Math.PI * eInOut((t * 0.6) % 1); }; return grp;
  },
  coin() {
    const grp = new THREE.Group(), gold = S("#f1c232", { metalness: 0.85, roughness: 0.25, emissive: "#3a2600", emissiveIntensity: 0.4 });
    const c = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.14, 96), gold); c.rotation.x = Math.PI / 2; grp.add(c);
    const ring = mesh(new THREE.TorusGeometry(0.8, 0.04, 12, 96), gold); ring.position.z = 0.07; grp.add(ring);
    const ring2 = ring.clone(); ring2.position.z = -0.07; grp.add(ring2);
    grp.add(glow("#ffd75e", 3.2, 0.35));
    grp.userData.update = (t) => { c.rotation.z = 0; grp.rotation.y = t * 2.0; }; return grp;
  },
  question() {
    const curve = new THREE.CatmullRomCurve3([[-0.55, 0.55], [-0.45, 0.95], [0, 1.15], [0.48, 0.95], [0.55, 0.55], [0.3, 0.2], [0, 0.0], [0, -0.35]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const grp = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: "#ffd23f", emissive: "#ff9f1c", emissiveIntensity: 0.5, roughness: 0.3 });
    grp.add(mesh(new THREE.TubeGeometry(curve, 120, 0.16, 24), m)); const d = mesh(new THREE.SphereGeometry(0.19, 24, 16), m); d.position.y = -0.8; grp.add(d);
    grp.add(glow("#ffd23f", 3.4, 0.35)); grp.position.y = -0.1;
    grp.userData.update = (t) => { grp.rotation.y = Math.sin(t * 1.4) * 0.6; }; return grp;
  },
  rocket() {
    const grp = new THREE.Group();
    grp.add(mesh(lathe([[0, 1.3], [0.2, 1.05], [0.34, 0.7], [0.38, 0.2], [0.38, -0.5], [0.3, -0.75], [0, -0.75]]), P("#f4f4f8")));
    const nose = mesh(lathe([[0, 1.32], [0.2, 1.06], [0.25, 0.95], [0, 0.95]]), P("#e63946")); grp.add(nose);
    const win = mesh(new THREE.TorusGeometry(0.13, 0.03, 12, 32), S("#9aa3b5", { metalness: 0.8 })); win.position.set(0, 0.45, 0.36); grp.add(win);
    const glass = mesh(new THREE.CircleGeometry(0.12, 32), new THREE.MeshStandardMaterial({ color: "#4fb3ff", emissive: "#1a4d80" })); glass.position.set(0, 0.45, 0.375); grp.add(glass);
    const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0.45, -0.45); fs.lineTo(0.45, -0.75); fs.lineTo(0, -0.45);
    for (let i = 0; i < 3; i++) { const f = mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.05, bevelEnabled: false }), P("#e63946")); f.position.y = -0.2; const g = new THREE.Group(); f.position.x = 0.33; g.add(f); g.rotation.y = i * 2.094; grp.add(g); }
    const flame = mesh(new THREE.ConeGeometry(0.22, 0.8, 24), new THREE.MeshBasicMaterial({ color: "#ffb020", transparent: true, opacity: 0.9 })); flame.rotation.x = Math.PI; flame.position.y = -1.15; grp.add(flame);
    { const gl = glow("#ff8a00", 2, 0.8); gl.position.set(0, -1.2, 0); grp.add(gl); }
    grp.rotation.z = -0.35;
    grp.userData.update = (t) => { flame.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(t * 31)), 1); grp.position.y = 0.06 * Math.sin(t * 9); }; return grp;
  },
  fish() {
    const grp = new THREE.Group(), body = mesh(new THREE.SphereGeometry(0.75, 48, 32), P("#ff8f3a")); body.scale.set(1.6, 1, 0.55); grp.add(body);
    const ts = new THREE.Shape(); ts.moveTo(0, 0); ts.lineTo(0.7, 0.55); ts.lineTo(0.55, 0); ts.lineTo(0.7, -0.55); ts.lineTo(0, 0);
    const tail = new THREE.Group(); tail.position.x = -1.1; const tm = mesh(new THREE.ExtrudeGeometry(ts, { depth: 0.06, bevelEnabled: false }), P("#ff6a1a")); tm.rotation.y = Math.PI; tm.position.z = 0.03; tail.add(tm); grp.add(tail);
    for (const z of [0.33, -0.33]) { const e = mesh(new THREE.SphereGeometry(0.12, 16, 12), S("#fff")); e.position.set(0.75, 0.15, z); grp.add(e); const p = mesh(new THREE.SphereGeometry(0.06, 12, 8), S("#111")); p.position.set(0.82, 0.16, z * 1.18); grp.add(p); }
    grp.userData.update = (t) => { tail.rotation.y = Math.sin(t * 8) * 0.45; grp.rotation.y = 0.5 + Math.sin(t * 0.8) * 0.25; }; return grp;
  },
  jar() {
    const grp = new THREE.Group();
    grp.add(mesh(lathe([[0, -0.95], [0.7, -0.95], [0.8, -0.8], [0.82, 0.45], [0.6, 0.7], [0.55, 0.85]]), new THREE.MeshStandardMaterial({ color: "#fff6e0", transparent: true, opacity: 0.35, roughness: 0.05 })));
    grp.add(mesh(lathe([[0, -0.9], [0.66, -0.9], [0.76, -0.78], [0.78, 0.35], [0, 0.35]]), new THREE.MeshStandardMaterial({ color: "#f2a900", emissive: "#a35c00", emissiveIntensity: 0.45, roughness: 0.15, transparent: true, opacity: 0.92 })));
    const lid = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 48), S("#d4a017", { metalness: 0.7, roughness: 0.35 })); lid.position.y = 0.95; grp.add(lid);
    return grp;
  },
  mountain() {
    const grp = new THREE.Group(), g = new THREE.ConeGeometry(1.1, 1.6, 9, 4), p = g.attributes.position, r = mulberry32(4);
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.75) { p.setX(i, p.getX(i) * (0.9 + r() * 0.2)); p.setZ(i, p.getZ(i) * (0.9 + r() * 0.2)); }
    g.computeVertexNormals();
    grp.add(mesh(g, S("#7a6a5c", { flatShading: true })));
    const cap = mesh(new THREE.ConeGeometry(0.42, 0.62, 9, 1), S("#f4f8ff", { flatShading: true })); cap.position.y = 0.5; grp.add(cap);
    return grp;
  },
  phone() {
    const s = new THREE.Shape(), w = 0.6, h = 1.2, r = 0.14;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4 }); g.center();
    const grp = new THREE.Group(); grp.add(mesh(g, S("#1b1d24", { metalness: 0.6, roughness: 0.3 })));
    const scr = canvasTex(256, 512, (c, W2, H2) => { const gr = c.createLinearGradient(0, 0, W2, H2); gr.addColorStop(0, "#ff4fd8"); gr.addColorStop(1, "#3a7bff"); c.fillStyle = gr; c.fillRect(0, 0, W2, H2); c.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 5; i++) { c.fillRect(30, 90 + i * 80, 196, 50); } });
    const sc = mesh(new THREE.PlaneGeometry(1.08, 2.2), new THREE.MeshBasicMaterial({ map: scr })); sc.position.z = 0.09; grp.add(sc);
    grp.userData.update = (t) => { grp.rotation.y = Math.sin(t * 0.9) * 0.5; }; return grp;
  },
  dumbbell() {
    const grp = new THREE.Group(), metal = S("#3a4152", { metalness: 0.6, roughness: 0.3 }), bar = S("#c9ccd3", { metalness: 1, roughness: 0.2 });
    const b = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 24), bar); b.rotation.z = Math.PI / 2; grp.add(b);
    for (const x of [-0.75, -0.58, 0.58, 0.75]) { const d = mesh(new THREE.CylinderGeometry(0.5 - Math.abs(Math.abs(x) - 0.58) * 0.8, 0.5 - Math.abs(Math.abs(x) - 0.58) * 0.8, 0.14, 40), metal); d.rotation.z = Math.PI / 2; d.position.x = x; grp.add(d); }
    grp.rotation.set(0.3, 0.4, 0.2); return grp;
  },
  bed() { // uyku: ay + yıldızlar
    const grp = OBJ.moon();
    for (const [x, y, sz] of [[1.25, 0.9, 0.9], [1.6, 0.2, 0.6], [-1.3, 1.0, 0.7]]) { const st = glow("#fff3c4", sz, 0.9); st.position.set(x, y, 0.3); grp.add(st); }
    return grp;
  },
};


// ---------------- gerçekçi gezegenler ve yeni nesneler (v2)
// küre yüzeyi için kesintisiz doku: fn(lon, lat, x, y, z) -> [r,g,b]
const sphTex = (w, h, fn) => canvasTex(w, h, (g) => {
  const d = g.createImageData(w, h);
  for (let j = 0; j < h; j++) { const lat = (0.5 - (j + 0.5) / h) * Math.PI, cl = Math.cos(lat), sy = Math.sin(lat);
    for (let i = 0; i < w; i++) { const lon = ((i + 0.5) / w) * Math.PI * 2, x = Math.cos(lon) * cl, z = Math.sin(lon) * cl;
      const c = fn(lon, lat, x, sy, z), k = (j * w + i) * 4; d.data[k] = c[0]; d.data[k + 1] = c[1]; d.data[k + 2] = c[2]; d.data[k + 3] = 255; } }
  g.putImageData(d, 0, 0);
});
const f3 = (x, y, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * n3(x * f, y * f, z * f); a *= 0.5; f *= 2.1; } return s; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ball = (tex, o = {}) => mesh(new THREE.SphereGeometry(1, 128, 96), S("#fff", { map: tex, roughness: o.r ?? 0.9, ...(o.bump ? { bumpMap: tex, bumpScale: o.bump } : {}) }));
const craterLayer = (g, w, h, seed, n, dark, light) => { const r = mulberry32(seed);
  for (let i = 0; i < n; i++) { const x = r() * w, y = h * (0.08 + r() * 0.84), rad = 2 + Math.pow(r(), 3) * w * 0.035;
    g.fillStyle = dark; g.beginPath(); g.ellipse(x, y, rad, rad, 0, 0, 7); g.fill();
    g.strokeStyle = light; g.lineWidth = Math.max(1, rad * 0.18); g.beginPath(); g.ellipse(x - rad * 0.12, y - rad * 0.12, rad, rad, 0, 0, 7); g.stroke(); } };
const spin = (grp, m, sp = 0.2, tilt = 0.25) => { grp.rotation.z = tilt; grp.userData.update = (t) => { m.rotation.y = t * sp; }; return grp; };
const ringMesh = (r0, r1, tex, op = 1) => { const rg = new THREE.RingGeometry(r0, r1, 192, 1), uv = rg.attributes.uv, pos = rg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - r0) / (r1 - r0), 0.5);
  return mesh(rg, new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 })); };
const bodyMat = (c, o = {}) => P(c, { roughness: 0.5, clearcoat: 0.3, ...o });
const ellip = (r, sx, sy, sz, m) => { const e = mesh(new THREE.SphereGeometry(r, 48, 32), m); e.scale.set(sx, sy, sz); return e; };
const shapeMesh = (pts, depth, m, bevel = 0.02) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 }); g.translate(0, 0, -depth / 2); return mesh(g, m); };

const bound = (grp, r) => { const b = mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); grp.add(b); return grp; };
Object.assign(OBJ, {
  mercury() {
    const tex = canvasTex(1024, 512, (g, w, h) => {
      const d = g.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const lon = i / w * 6.283, lat = (0.5 - j / h) * 3.1416, v = 0.55 + 0.35 * f3(Math.cos(lon) * Math.cos(lat) * 3, Math.sin(lat) * 3, Math.sin(lon) * Math.cos(lat) * 3), k = (j * w + i) * 4; d.data[k] = 150 * v; d.data[k + 1] = 140 * v; d.data[k + 2] = 132 * v; d.data[k + 3] = 255; }
      g.putImageData(d, 0, 0); craterLayer(g, w, h, 11, 420, "rgba(60,55,52,0.3)", "rgba(215,210,200,0.12)");
    });
    const grp = new THREE.Group(), m = ball(tex, { bump: 0.04, r: 0.95 }); grp.add(m); return spin(grp, m, 0.12, 0.02);
  },
  mars() {
    const tex = sphTex(1024, 512, (lon, lat, x, y, z) => {
      const n = f3(x * 2.2, y * 2.2, z * 2.2, 5), dark = Math.max(0, f3(x * 1.3 + 5, y * 1.3, z * 1.3, 4)) * 1.6;
      let c = mixc([193, 98, 52], [226, 150, 92], 0.5 + n); c = mixc(c, [96, 50, 34], Math.min(1, dark));
      const canyon = Math.exp(-Math.pow((lat + 0.12 + 0.04 * Math.sin(lon * 3)) / 0.06, 2)) * Math.max(0, Math.sin((lon - 1.0) / 1.4 * Math.PI)) * (lon > 1.0 && lon < 2.4 ? 1 : 0); c = mixc(c, [110, 52, 34], canyon * 0.45);
      const cap = Math.max(0, (Math.abs(lat) - 1.22 - 0.06 * n) / 0.12); return mixc(c, [245, 240, 235], Math.min(1, cap));
    });
    const grp = new THREE.Group(), m = ball(tex, { bump: 0.02 }); grp.add(m); grp.add(glow("#ff9a6a", 2.7, 0.18)); return spin(grp, m, 0.18, 0.44);
  },
  jupiter() {
    const tex = sphTex(1024, 512, (lon, lat, x, y, z) => {
      const tw = f3(x * 3, y * 9, z * 3, 4) * 0.35, b = Math.sin((y + tw * 0.25) * 22) * 0.5 + 0.5, b2 = Math.sin((y + tw * 0.15) * 7.3) * 0.5 + 0.5;
      let c = mixc([236, 222, 196], [176, 120, 80], b * 0.75); c = mixc(c, [205, 170, 135], b2 * 0.35);
      const dx = (lon - 1.75) / 0.32, dy = (lat + 0.38) / 0.12, e = dx * dx + dy * dy;
      if (e < 1) c = mixc(c, mixc([196, 84, 50], [220, 120, 80], e), Math.min(1, (1 - e) * 2.2));
      return c;
    });
    const grp = new THREE.Group(), m = ball(tex, { r: 0.75 }); m.scale.y = 0.935; grp.add(m); return spin(grp, m, 0.12, 0.05);
  },
  saturn() {
    const tex = sphTex(1024, 512, (lon, lat, x, y, z) => { const tw = f3(x * 2, y * 8, z * 2, 3) * 0.2, b = Math.sin((y + tw * 0.2) * 16) * 0.5 + 0.5; return mixc([232, 214, 168], [196, 164, 112], b * 0.6 + Math.max(0, Math.abs(y) - 0.75) * 1.2); });
    const rt = canvasTex(1024, 4, (g, w) => { const r = mulberry32(14); for (let x = 0; x < w; x++) { const u = x / w; let a = 0.55 + 0.35 * r();
        if (u < 0.12) a *= 0.25; if (u > 0.58 && u < 0.63) a = 0.04; if (u > 0.95) a *= 0.4; const c = u < 0.58 ? [222, 205, 170] : [200, 186, 158]; g.fillStyle = `rgba(${c},${a})`; g.fillRect(x, 0, 1, 4); } });
    const grp = new THREE.Group(), m = ball(tex, { r: 0.8 }); m.scale.y = 0.9; grp.add(m);
    const ring = ringMesh(1.22, 2.3, rt); ring.rotation.x = -Math.PI / 2 + 0.42; grp.add(ring); grp.rotation.z = 0.32;
    grp.userData.update = (t) => { m.rotation.y = t * 0.3; }; return grp;
  },
  uranus() {
    const tex = sphTex(512, 256, (lon, lat, x, y, z) => mixc([175, 225, 232], [140, 200, 214], Math.abs(y) * 0.6 + f3(x * 2, y * 6, z * 2, 2) * 0.15));
    const rt = canvasTex(256, 4, (g, w) => { for (let x = 0; x < w; x++) { const a = (x % 40 < 3) ? 0.55 : 0.04; g.fillStyle = `rgba(200,220,230,${a})`; g.fillRect(x, 0, 1, 4); } });
    const grp = new THREE.Group(), m = ball(tex, { r: 0.6 }); grp.add(m); grp.add(glow("#9fe8f0", 2.6, 0.18));
    const ring = ringMesh(1.5, 2.0, rt); ring.rotation.y = Math.PI / 2 - 0.25; grp.add(ring); grp.rotation.z = 1.71 - Math.PI / 2;
    grp.userData.update = (t) => { m.rotation.x = t * 0.25; }; m.rotation.z = Math.PI / 2; return grp;
  },
  neptune() {
    const tex = sphTex(1024, 512, (lon, lat, x, y, z) => {
      const tw = f3(x * 2, y * 7, z * 2, 3), b = Math.sin((y + tw * 0.08) * 12) * 0.5 + 0.5; let c = mixc([46, 86, 196], [70, 120, 220], b * 0.6);
      const dx = (lon - 1.9) / 0.28, dy = (lat + 0.35) / 0.12, e = dx * dx + dy * dy; if (e < 1) c = mixc(c, [22, 40, 110], (1 - e));
      const cl = Math.max(0, f3(x * 3 + 7, y * 12, z * 3, 3) - 0.28) * 3 * (Math.abs(lat + 0.15) < 0.25 ? 1 : 0.3); return mixc(c, [235, 242, 255], Math.min(0.9, cl));
    });
    const grp = new THREE.Group(), m = ball(tex, { r: 0.7 }); grp.add(m); grp.add(glow("#6c9cff", 2.6, 0.2)); return spin(grp, m, 0.25, 0.49);
  },
  blackhole() {
    const grp = new THREE.Group(); grp.add(mesh(new THREE.SphereGeometry(0.6, 64, 48), new THREE.MeshBasicMaterial({ color: "#000" })));
    const dt = canvasTex(1024, 4, (g, w) => { for (let x = 0; x < w; x++) { const u = x / w, a = Math.pow(1 - u, 1.6) * (u < 0.03 ? u / 0.03 : 1); g.fillStyle = `rgba(255,${Math.floor(120 + 135 * (1 - u))},${Math.floor(60 + 120 * (1 - u) * (1 - u))},${a})`; g.fillRect(x, 0, 1, 4); } });
    const disk = ringMesh(0.72, 2.4, dt); disk.material = new THREE.MeshBasicMaterial({ map: dt, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    disk.rotation.x = -Math.PI / 2 + 0.22; grp.add(disk);
    const halo = mesh(new THREE.TorusGeometry(0.66, 0.035, 16, 128), new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })); grp.add(halo);
    const arc = mesh(new THREE.TorusGeometry(0.85, 0.09, 16, 128, Math.PI), new THREE.MeshBasicMaterial({ color: "#ffae5a", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); arc.position.z = -0.2; grp.add(arc);
    grp.add(glow("#ff9040", 3.6, 0.3)); grp.userData.update = (t) => { disk.rotation.z = t * 0.6; }; bound(grp, 1.5); return grp;
  },
  star() { // nötron yıldızı / pulsar
    const grp = new THREE.Group(); grp.add(mesh(new THREE.SphereGeometry(0.42, 48, 32), new THREE.MeshBasicMaterial({ color: "#e8f4ff" })));
    grp.add(glow("#9fd0ff", 2.2, 0.95)); grp.add(glow("#4f8cff", 4.2, 0.4));
    const beams = new THREE.Group(); grp.add(beams);
    for (const s of [1, -1]) { const c = mesh(new THREE.ConeGeometry(0.28, 2.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: "#a8d8ff", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); c.position.y = s * 1.15; if (s > 0) c.rotation.x = Math.PI; beams.add(c); }
    beams.rotation.z = 0.5; grp.userData.update = (t) => { beams.rotation.y = t * 2.4; }; bound(grp, 1.6); return grp;
  },
  galaxy() {
    const N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), r = mulberry32(21), c = new THREE.Color();
    for (let i = 0; i < N; i++) { const arm = i % 2, d = Math.pow(r(), 0.7) * 2.1, a = d * 2.6 + arm * Math.PI + (r() - 0.5) * 0.5 / (d + 0.3);
      pos[i * 3] = Math.cos(a) * d + (r() - .5) * 0.12; pos[i * 3 + 1] = (r() - .5) * 0.12 * (1.2 - d * 0.4); pos[i * 3 + 2] = Math.sin(a) * d + (r() - .5) * 0.12;
      c.set(d < 0.5 ? "#ffe2a8" : (r() < 0.6 ? "#9cc4ff" : "#ff9ad5")); col.set([c.r, c.g, c.b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const grp = new THREE.Group(), inner = new THREE.Group(); inner.add(pts); inner.add(glow("#ffd9a0", 2.2, 0.9)); inner.add(glow("#8f7cff", 4.5, 0.25));
    const core = mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff3d0" })); inner.add(core); grp.add(inner); inner.rotation.x = 0.55;
    grp.userData.update = (t) => { inner.rotation.y = t * 0.15; }; bound(grp, 2.1); return grp;
  },
  comet() {
    const grp = new THREE.Group(), g = new THREE.IcosahedronGeometry(0.35, 3), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + 0.25 * n3(v.x * 4, v.y * 4, v.z * 4)); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals();
    const head = mesh(g, S("#9aa4ad", { flatShading: true })); grp.add(head); grp.add(glow("#bfe8ff", 1.6, 0.8));
    for (let i = 0; i < 6; i++) { const tail = mesh(new THREE.ConeGeometry(0.28 + i * 0.04, 1.8 + i * 0.12, 24, 1, true), new THREE.MeshBasicMaterial({ color: i % 2 ? "#9fd8ff" : "#ffffff", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); tail.rotation.z = -Math.PI / 2 + (i - 2.5) * 0.03; tail.position.x = 0.95; grp.add(tail); }
    grp.rotation.z = 0.35; grp.userData.update = (t) => { head.rotation.y = t; }; bound(grp, 1.6); return grp;
  },
  asteroid() {
    const g = new THREE.IcosahedronGeometry(1, 5), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.28 * n3(v.x * 1.6, v.y * 1.6, v.z * 1.6) + 0.04 * n3(v.x * 5, v.y * 5, v.z * 5); v.multiplyScalar(k); v.x *= 1.35; p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); const grp = new THREE.Group(), m = mesh(g, S("#6e655c", { roughness: 1 })); grp.add(m);
    grp.userData.update = (t) => { m.rotation.set(t * 0.2, t * 0.3, 0); }; return grp;
  },
  astronaut() {
    const grp = new THREE.Group(), suit = S("#f2f2f0", { roughness: 0.7 }), dark = S("#5a6070");
    const torso = mesh(new THREE.CapsuleGeometry(0.42, 0.45, 8, 24), suit); grp.add(torso);
    const pack = mesh(new THREE.BoxGeometry(0.75, 0.85, 0.35), S("#e4e4e0")); pack.position.set(0, 0.05, -0.42); grp.add(pack);
    const helm = mesh(new THREE.SphereGeometry(0.38, 48, 32), suit); helm.position.y = 0.78; grp.add(helm);
    const visor = mesh(new THREE.SphereGeometry(0.385, 48, 32, 0.5, 2.15, 0.85, 1.2), new THREE.MeshPhysicalMaterial({ color: "#d4a017", metalness: 1, roughness: 0.08, clearcoat: 1 })); visor.position.set(0, 0.78, 0); visor.rotation.y = 0; grp.add(visor);
    const limb = (x, y, rz, len) => { const l = mesh(new THREE.CapsuleGeometry(0.15, len, 6, 16), suit); l.position.set(x, y, 0); l.rotation.z = rz; grp.add(l); return l; };
    const la = limb(-0.58, 0.12, -0.5, 0.45), ra = limb(0.58, 0.12, 0.7, 0.45); limb(-0.22, -0.78, 0.08, 0.5); limb(0.22, -0.78, -0.08, 0.5);
    for (const x of [-0.22, 0.22]) { const b = mesh(new THREE.BoxGeometry(0.3, 0.16, 0.38), dark); b.position.set(x, -1.18, 0.05); grp.add(b); }
    const flag = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.02), S("#3a7bff")); flag.position.set(-0.18, 0.28, 0.43); grp.add(flag);
    grp.userData.update = (t) => { grp.position.y = 0.08 * Math.sin(t * 1.2); grp.rotation.z = 0.08 * Math.sin(t * 0.8); ra.rotation.z = 0.7 + 0.25 * Math.sin(t * 2); }; return grp;
  },
  lander() { // Ay modülü
    const grp = new THREE.Group(), foil = S("#d9a520", { metalness: 0.9, roughness: 0.35 }), grey = S("#b7b9be", { metalness: 0.4, roughness: 0.5 });
    const desc = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.55, 8), foil); desc.position.y = -0.2; grp.add(desc);
    const asc = mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.6, 6), grey); asc.position.y = 0.38; grp.add(asc);
    const win = mesh(new THREE.BoxGeometry(0.28, 0.2, 0.05), S("#1c2433", { metalness: 0.8, roughness: 0.1 })); win.position.set(0, 0.42, 0.55); win.rotation.x = -0.15; grp.add(win);
    const dish = mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, 6.3, 0, 1.2), grey); dish.position.set(0.45, 0.85, -0.1); dish.rotation.x = 0.6; grp.add(dish);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, lg = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), grey);
      const p0 = new THREE.Vector3(Math.cos(a) * 0.7, -0.25, Math.sin(a) * 0.7), p1 = new THREE.Vector3(Math.cos(a) * 1.2, -1.0, Math.sin(a) * 1.2), dv = p1.clone().sub(p0);
      lg.scale.y = dv.length(); lg.position.copy(p0).add(p1).multiplyScalar(0.5); lg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize()); grp.add(lg);
      const pad = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 24), grey); pad.position.set(Math.cos(a) * 1.2, -1.02, Math.sin(a) * 1.2); grp.add(pad); }
    const noz = mesh(new THREE.ConeGeometry(0.22, 0.3, 24, 1, true), S("#555")); noz.position.y = -0.6; grp.add(noz);
    grp.rotation.y = 0.5; grp.userData.update = (t) => { grp.rotation.y = 0.5 + 0.3 * Math.sin(t * 0.5); }; return grp;
  },
  rover() {
    const grp = new THREE.Group(), white = S("#e9e6df", { roughness: 0.6 }), metal = S("#8b8f96", { metalness: 0.7, roughness: 0.4 }), tire = S("#3a3a3c", { roughness: 0.9 });
    const body = mesh(new THREE.BoxGeometry(1.5, 0.35, 1.0), white); body.position.y = 0.1; grp.add(body);
    const deck = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), metal); deck.position.y = 0.32; grp.add(deck);
    const wheels = [];
    for (const x of [-0.6, 0, 0.6]) for (const z of [-0.62, 0.62]) { const w = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 24), tire); w.rotation.x = Math.PI / 2; w.position.set(x, -0.3, z); grp.add(w); wheels.push(w);
      const arm = mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), metal); arm.position.set(x, -0.08, z * 0.85); grp.add(arm); }
    const mast = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12), metal); mast.position.set(0.5, 0.75, 0.3); grp.add(mast);
    const head = mesh(new THREE.BoxGeometry(0.32, 0.2, 0.22), white); head.position.set(0.5, 1.25, 0.3); grp.add(head);
    for (const z of [0.22, 0.38]) { const eye = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16), S("#111")); eye.rotation.z = Math.PI / 2; eye.position.set(0.68, 1.25, z); grp.add(eye); }
    const arm = mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), metal); arm.position.set(1.05, 0.1, -0.2); grp.add(arm);
    grp.rotation.y = -0.6; grp.userData.update = (t) => { grp.rotation.y = -0.6 + 0.35 * Math.sin(t * 0.5); head.rotation.y = 0.4 * Math.sin(t * 0.9); }; return grp;
  },
  helicopter() { // Ingenuity tarzı
    const grp = new THREE.Group(), metal = S("#9a9da3", { metalness: 0.6, roughness: 0.4 });
    const body = mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), S("#d9cfa0", { metalness: 0.5, roughness: 0.4 })); body.position.y = -0.3; grp.add(body);
    const mast = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12), metal); mast.position.y = 0.25; grp.add(mast);
    const panel = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.4), S("#1a2a55", { metalness: 0.6, roughness: 0.2 })); panel.position.y = 0.72; grp.add(panel);
    const rotors = [];
    for (const y of [0.25, 0.48]) { const r = new THREE.Group(); r.position.y = y; for (const s of [1, -1]) { const b = mesh(new THREE.BoxGeometry(1.2, 0.03, 0.2), S("#cfd2d6", { metalness: 0.4 })); b.position.x = s * 0.6; r.add(b); } grp.add(r); rotors.push(r); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78, l = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), metal); l.position.set(Math.cos(a) * 0.4, -0.75, Math.sin(a) * 0.4); l.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); grp.add(l); }
    grp.userData.update = (t) => { rotors[0].rotation.y = t * 30; rotors[1].rotation.y = -t * 30; grp.position.y = 0.1 * Math.sin(t * 1.5); }; return grp;
  },
  satellite() {
    const grp = new THREE.Group(); grp.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.8), S("#d9a520", { metalness: 0.9, roughness: 0.35 })));
    const pt = canvasTex(256, 128, (g, w, h) => { g.fillStyle = "#13235a"; g.fillRect(0, 0, w, h); g.strokeStyle = "#8fb3ff"; g.lineWidth = 2; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
    for (const s of [1, -1]) { const p = mesh(new THREE.BoxGeometry(1.3, 0.02, 0.6), S("#fff", { map: pt, metalness: 0.5, roughness: 0.25 })); p.position.x = s * 1.0; grp.add(p); }
    const dish = mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, 6.3, 0, 1.1), S("#eee", { side: THREE.DoubleSide })); dish.position.set(0, 0.45, 0); grp.add(dish);
    grp.rotation.set(0.4, 0.3, 0.2); grp.userData.update = (t) => { grp.rotation.y = 0.3 + t * 0.3; }; return grp;
  },
  flag(color = "#e30a17") {
    const grp = new THREE.Group(), pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 12), S("#d0d3d8", { metalness: 0.8, roughness: 0.3 })); pole.position.x = -0.9; grp.add(pole);
    const g = new THREE.PlaneGeometry(1.5, 0.95, 30, 6), cloth = mesh(g, S(color, { side: THREE.DoubleSide, roughness: 0.8 })); cloth.position.set(-0.15, 0.7, 0); grp.add(cloth);
    const base = g.attributes.position.array.slice();
    grp.userData.update = (t) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = base[i * 3] + 0.75; p.setZ(i, Math.sin(x * 4 - t * 4) * 0.08 * x); } p.needsUpdate = true; g.computeVertexNormals(); }; return grp;
  },
  footprint() {
    const grp = new THREE.Group(), r = mulberry32(5);
    const tex = canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#8e8e92"; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() > .5 ? 255 : 0},${r() > .5 ? 255 : 0},${r() > .5 ? 255 : 0},0.05)`; g.fillRect(r() * w, r() * h, 3, 3); }
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.2); g.fillStyle = "rgba(40,40,44,0.75)"; g.beginPath(); g.ellipse(0, -60, 70, 110, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0, 120, 58, 70, 0, 0, 7); g.fill();
      g.strokeStyle = "rgba(170,170,175,0.6)"; g.lineWidth = 9; for (let y = -150; y < 180; y += 26) { g.beginPath(); g.moveTo(-60, y); g.lineTo(60, y); g.stroke(); } g.restore(); });
    const ground = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 64), [S("#77777b"), S("#fff", { map: tex, bumpMap: tex, bumpScale: 0.05, roughness: 1 }), S("#77777b")]); grp.add(ground);
    grp.rotation.x = 0.9; grp.userData.update = (t) => { grp.rotation.y = 0.2 * Math.sin(t * 0.6); }; return grp;
  },
  ship() { // klasik okyanus gemisi (4 bacalı)
    const grp = new THREE.Group(), hullS = new THREE.Shape(); hullS.moveTo(-1.6, 0.3); hullS.lineTo(1.75, 0.3); hullS.lineTo(1.55, -0.2); hullS.lineTo(-1.45, -0.2); hullS.lineTo(-1.6, 0.3);
    const hg = new THREE.ExtrudeGeometry(hullS, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 }); hg.translate(0, 0, -0.21);
    const ht = canvasTex(512, 128, (g, w, h) => { g.fillStyle = "#16161a"; g.fillRect(0, 0, w, h); g.fillStyle = "#a8261c"; g.fillRect(0, h * 0.78, w, h * 0.22); g.fillStyle = "#e8e2d0"; g.fillRect(0, 0, w, h * 0.06); g.fillStyle = "#f6e7a8"; for (let x = 20; x < w - 20; x += 14) g.fillRect(x, h * 0.25, 4, 4); });
    ht.wrapS = ht.wrapT = THREE.RepeatWrapping; ht.repeat.set(0.29, 2); ht.offset.set(0.47, -0.4);
    grp.add(mesh(hg, S("#fff", { map: ht, roughness: 0.6 })));
    const sup = mesh(new THREE.BoxGeometry(2.4, 0.28, 0.36), S("#f1ede2")); sup.position.set(0.05, 0.47, 0); grp.add(sup);
    const sup2 = mesh(new THREE.BoxGeometry(1.8, 0.14, 0.3), S("#f1ede2")); sup2.position.set(0.05, 0.66, 0); grp.add(sup2);
    for (let i = 0; i < 4; i++) { const f = mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 24), S("#d9a441")); f.position.set(-0.75 + i * 0.5, 0.98, 0); f.rotation.z = 0.12; grp.add(f);
      const top = mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.12, 24), S("#1a1a1a")); top.position.set(-0.72 + i * 0.5, 1.22, 0); top.rotation.z = 0.12; grp.add(top); }
    for (const x of [-1.35, 1.45]) { const m = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 6), S("#5a4a3a")); m.position.set(x, 0.9, 0); grp.add(m); }
    grp.rotation.set(0.12, -0.85, 0); grp.userData.update = (t) => { grp.rotation.z = 0.015 * Math.sin(t * 1.3); grp.rotation.y = -0.85 + 0.15 * Math.sin(t * 0.4); grp.position.y = 0.02 * Math.sin(t * 1.1); }; return grp;
  },
  iceberg() {
    const grp = new THREE.Group(), mk = (r, hgt, seed, y0) => { const g = new THREE.ConeGeometry(r, hgt, 9, 5), p = g.attributes.position, rr = mulberry32(seed);
      for (let i = 0; i < p.count; i++) { const k = 0.75 + rr() * 0.4; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, p.getY(i) + (rr() - 0.5) * 0.08); } g.computeVertexNormals(); const m = mesh(g, S("#f3fbff", { flatShading: true, roughness: 0.35 })); m.position.y = y0; return m; };
    const top = mk(0.9, 1.1, 3, 0.4); grp.add(top); const top2 = mk(0.45, 0.8, 7, 0.55); top2.position.x = 0.55; grp.add(top2);
    const under = mk(1.5, 1.9, 9, -1.0); under.rotation.x = Math.PI; under.material = S("#7fc7e8", { flatShading: true, transparent: true, opacity: 0.55, roughness: 0.2 }); grp.add(under);
    const water = mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshStandardMaterial({ color: "#1a5d86", transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.y = -0.12; grp.add(water);
    grp.rotation.x = 0.15; grp.userData.update = (t) => { grp.rotation.y = t * 0.15; }; return grp;
  },
  anchor() {
    const grp = new THREE.Group(), m = S("#6d7580", { metalness: 0.85, roughness: 0.35 });
    const shaft = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 16), m); grp.add(shaft);
    const ring = mesh(new THREE.TorusGeometry(0.2, 0.05, 12, 32), m); ring.position.y = 1.08; grp.add(ring);
    const bar = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), m); bar.rotation.z = Math.PI / 2; bar.position.y = 0.6; grp.add(bar);
    const arc = mesh(new THREE.TorusGeometry(0.75, 0.07, 12, 48, Math.PI), m); arc.rotation.z = Math.PI; arc.position.y = -0.15; grp.add(arc);
    for (const s of [1, -1]) { const tip = mesh(new THREE.ConeGeometry(0.14, 0.3, 4), m); tip.position.set(s * 0.75, -0.05, 0); tip.rotation.z = s * 0.5; grp.add(tip); }
    grp.userData.update = (t) => { grp.rotation.z = 0.12 * Math.sin(t * 1.1); }; return grp;
  },
  submarine() {
    const grp = new THREE.Group(), y = P("#f2c230"); grp.add(ellip(0.6, 2.0, 0.8, 0.8, y));
    const tower = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 24), y); tower.position.set(0.2, 0.55, 0); grp.add(tower);
    for (const x of [-0.4, 0.2, 0.8]) { const w = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24), S("#1b4f7a", { metalness: 0.5, roughness: 0.1 })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.05, 0.47); grp.add(w); }
    const prop = new THREE.Group(); prop.position.x = -1.25; for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.03, 0.4, 0.1), S("#888", { metalness: 0.8 })); b.rotation.x = i * 2.09; prop.add(b); } grp.add(prop);
    grp.userData.update = (t) => { prop.rotation.x = t * 8; grp.position.y = 0.05 * Math.sin(t); }; return grp;
  },
  whale() {
    const grp = new THREE.Group(), skin = bodyMat("#3c4f66"), belly = bodyMat("#c9d3dc");
    const body = ellip(0.6, 2.2, 0.8, 0.85, skin); grp.add(body); const b2 = ellip(0.55, 2.0, 0.5, 0.75, belly); b2.position.set(0.15, -0.18, 0); grp.add(b2);
    const tail = new THREE.Group(); tail.position.x = -1.3; grp.add(tail); const stock = ellip(0.25, 1.6, 0.6, 0.6, skin); stock.position.x = -0.2; tail.add(stock);
    const fl = shapeMesh([[0, 0], [-0.3, 0.6], [-0.55, 0.65], [-0.35, 0], [-0.55, -0.65], [-0.3, -0.6]], 0.05, skin); fl.rotation.x = Math.PI / 2; fl.position.x = -0.45; tail.add(fl);
    for (const s of [1, -1]) { const fin = ellip(0.35, 2.0, 0.15, 0.5, skin); fin.position.set(0.55, -0.35, s * 0.55); fin.rotation.set(s * 0.9, s * 0.5, -0.6); grp.add(fin); }
    const eye = mesh(new THREE.SphereGeometry(0.05, 12, 8), S("#111")); eye.position.set(1.0, -0.02, 0.43); grp.add(eye);
    grp.rotation.set(0.4, 0.45, 0); grp.userData.update = (t) => { tail.rotation.z = 0.25 * Math.sin(t * 1.6); grp.position.y = 0.06 * Math.sin(t * 1.6 + 1); }; return grp;
  },
  shark() {
    const grp = new THREE.Group(), skin = bodyMat("#6f8193"), belly = bodyMat("#eef1f4");
    grp.add(ellip(0.5, 2.3, 0.62, 0.62, skin)); const b = ellip(0.46, 2.1, 0.35, 0.55, belly); b.position.y = -0.14; grp.add(b);
    const dorsal = shapeMesh([[0, 0], [0.25, 0.6], [0.45, 0]], 0.06, skin); dorsal.position.set(0.05, 0.25, 0); grp.add(dorsal);
    const tail = new THREE.Group(); tail.position.x = -1.1; grp.add(tail); tail.add(shapeMesh([[0, 0], [-0.45, 0.6], [-0.3, 0], [-0.4, -0.35]], 0.05, skin));
    for (const s of [1, -1]) { const pf = shapeMesh([[0, 0], [-0.35, -0.45], [0.1, -0.05]], 0.04, skin); pf.position.set(0.4, -0.2, s * 0.28); pf.rotation.x = s * 0.6; grp.add(pf); }
    for (const s of [1, -1]) { const e = mesh(new THREE.SphereGeometry(0.045, 12, 8), S("#0a0a0a")); e.position.set(0.88, 0.08, s * 0.24); grp.add(e); }
    for (let i = 0; i < 4; i++) { const gl = mesh(new THREE.BoxGeometry(0.015, 0.16, 0.01), S("#4a5866")); gl.position.set(0.55 - i * 0.07, 0.0, 0.3); gl.rotation.y = -0.3; grp.add(gl); }
    grp.rotation.y = 0.4; grp.userData.update = (t) => { tail.rotation.y = 0.4 * Math.sin(t * 3); grp.rotation.y = 0.4 + 0.12 * Math.sin(t * 3 + 1.4); }; return grp;
  },
  turtle() {
    const grp = new THREE.Group(), skin = bodyMat("#6c8b4f");
    const shellT = canvasTex(512, 256, (g, w, h) => { g.fillStyle = "#4a3a22"; g.fillRect(0, 0, w, h); g.strokeStyle = "#d8b878"; g.lineWidth = 6; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const cx = i * 90 + (j % 2) * 45, cy = 40 + j * 80; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * 1.047; g.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 36); } g.closePath(); g.stroke(); } });
    const shell = mesh(new THREE.SphereGeometry(0.85, 48, 24, 0, 6.3, 0, 1.45), S("#fff", { map: shellT, roughness: 0.5 })); shell.scale.set(1.25, 0.6, 1); grp.add(shell);
    const plate = ellip(0.85, 1.25, 0.08, 1, S("#d8c58e")); grp.add(plate);
    const head = ellip(0.25, 1.4, 0.95, 1, skin); head.position.set(1.15, 0.05, 0); grp.add(head);
    for (const s of [1, -1]) { const e = mesh(new THREE.SphereGeometry(0.04, 10, 8), S("#111")); e.position.set(1.38, 0.12, s * 0.13); grp.add(e); }
    const flips = [];
    for (const [x, s, L] of [[0.55, 1, 0.9], [0.55, -1, 0.9], [-0.7, 1, 0.45], [-0.7, -1, 0.45]]) { const f = new THREE.Group(); f.position.set(x, 0, s * 0.75); const m = ellip(0.25, L * 3, 0.25, 1.2, skin); m.position.set(-0.1, 0, s * L * 0.3); m.rotation.y = s * 0.9; f.add(m); grp.add(f); flips.push([f, s]); }
    grp.rotation.set(0.35, 0.5, 0); grp.userData.update = (t) => { for (const [f, s] of flips) f.rotation.x = s * 0.35 * Math.sin(t * 1.8); }; return grp;
  },
  jellyfish() {
    const grp = new THREE.Group(), m = new THREE.MeshPhysicalMaterial({ color: "#ff9ee8", emissive: "#a0287a", emissiveIntensity: 0.5, transparent: true, opacity: 0.65, roughness: 0.1, side: THREE.DoubleSide });
    const bell = mesh(new THREE.SphereGeometry(0.85, 48, 24, 0, 6.3, 0, 1.6), m); bell.scale.y = 0.75; grp.add(bell);
    const tent = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, pts = []; for (let j = 0; j < 10; j++) pts.push(new THREE.Vector3(Math.cos(a) * 0.6, -j * 0.2, Math.sin(a) * 0.6));
      const c = new THREE.CatmullRomCurve3(pts), t = mesh(new THREE.TubeGeometry(c, 40, 0.025, 6), m); grp.add(t); tent.push([t, i]); }
    grp.add(glow("#ff7ad9", 3, 0.35)); grp.userData.update = (t) => { bell.scale.set(1 + 0.06 * Math.sin(t * 2.5), 0.75 - 0.06 * Math.sin(t * 2.5), 1 + 0.06 * Math.sin(t * 2.5)); for (const [tt, i] of tent) tt.rotation.y = 0.15 * Math.sin(t * 1.5 + i); grp.position.y = 0.4 + 0.1 * Math.sin(t * 2.5); }; return grp;
  },
  butterfly() {
    const grp = new THREE.Group();
    const wt = canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#121212"; g.fillRect(0, 0, w, h); g.fillStyle = "#f28c1c"; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.38, h * 0.36, 0, 0, 7); g.fill();
      g.strokeStyle = "#121212"; g.lineWidth = 14; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * (0.1 + i * 0.16)); g.stroke(); }
      g.fillStyle = "#fff"; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(w * (0.06 + 0.88 * (i / 13)), (i % 2) ? h * 0.06 : h * 0.94, 9, 0, 7); g.fill(); } });
    const wm = new THREE.MeshStandardMaterial({ map: wt, side: THREE.DoubleSide, roughness: 0.6, alphaTest: 0.5 });
    const wing = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); const g = new THREE.ShapeGeometry(s, 24); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.3, 0.5 + p.getY(i) / 2.2); return mesh(g, wm); };
    const L = new THREE.Group(), R = new THREE.Group(); grp.add(L); grp.add(R);
    for (const [side, sgn] of [[R, 1], [L, -1]]) { const up = wing([[0, 0.05], [0.35, 0.75], [1.0, 1.0], [1.25, 0.7], [1.0, 0.25], [0.2, 0]]); const lo = wing([[0, -0.05], [0.9, -0.3], [0.95, -0.75], [0.55, -0.95], [0.15, -0.6]]);
      side.add(up); side.add(lo); side.scale.x = sgn; }
    const body = mesh(new THREE.CapsuleGeometry(0.06, 0.8, 6, 12), S("#1a1a1a")); grp.add(body);
    for (const s of [1, -1]) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(s * 0.12, 0.75, 0.05), new THREE.Vector3(s * 0.25, 0.9, 0.1)]); grp.add(mesh(new THREE.TubeGeometry(c, 12, 0.012, 6), S("#1a1a1a"))); }
    grp.rotation.x = -0.5; grp.userData.update = (t) => { const a = 0.25 + 0.45 * Math.sin(t * 6); R.rotation.y = -a; L.rotation.y = a; grp.position.y = 0.08 * Math.sin(t * 6 + 1); }; return grp;
  },
  bird() { // deniz kuşu (sumru)
    const grp = new THREE.Group(), white = bodyMat("#f4f6f8"), grey = bodyMat("#c3cad2"), black = S("#151515");
    const body = ellip(0.35, 2.0, 0.85, 0.85, white); grp.add(body);
    const head = mesh(new THREE.SphereGeometry(0.22, 24, 16), white); head.position.set(0.72, 0.15, 0); grp.add(head);
    const cap = mesh(new THREE.SphereGeometry(0.225, 24, 16, 0, 6.3, 0, 1.3), black); cap.position.copy(head.position); cap.rotation.z = -0.5; grp.add(cap);
    const beak = mesh(new THREE.ConeGeometry(0.06, 0.38, 12), S("#e0242a")); beak.rotation.z = -Math.PI / 2; beak.position.set(1.05, 0.12, 0); grp.add(beak);
    const tail = shapeMesh([[0, 0], [-0.55, 0.18], [-0.35, 0], [-0.55, -0.18]], 0.02, white); tail.rotation.x = Math.PI / 2; tail.position.x = -0.6; grp.add(tail);
    const wings = [];
    for (const s of [1, -1]) { const w = new THREE.Group(); w.position.set(0.1, 0.12, s * 0.15); const m = shapeMesh([[0.25, 0], [-0.15, 0], [-0.6, 1.25], [-0.4, 1.35]], 0.03, grey); m.rotation.x = s * Math.PI / 2; w.add(m); grp.add(w); wings.push([w, s]); }
    grp.rotation.set(0.7, -0.4, 0); grp.userData.update = (t) => { for (const [w, s] of wings) w.rotation.x = s * (0.1 + 0.35 * Math.sin(t * 5)); grp.position.y = -0.1 * Math.sin(t * 5); }; return grp;
  },
  volcano() {
    const grp = new THREE.Group(), g = new THREE.CylinderGeometry(0.35, 1.4, 1.4, 24, 6, true), p = g.attributes.position, r = mulberry32(2);
    for (let i = 0; i < p.count; i++) { const k = 0.9 + r() * 0.2; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals();
    grp.add(mesh(g, S("#4a3a32", { flatShading: true, side: THREE.DoubleSide })));
    const lava = mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshBasicMaterial({ color: "#ff5a1a" })); lava.rotation.x = -Math.PI / 2; lava.position.y = 0.62; grp.add(lava);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4, st = mesh(new THREE.BoxGeometry(0.07, 0.9, 0.02), new THREE.MeshBasicMaterial({ color: "#ff7a1a" })); st.position.set(Math.cos(a) * 0.65, 0.2, Math.sin(a) * 0.65); st.lookAt(0, 0.2, 0); st.rotation.x += 0.75; grp.add(st); }
    const lg = glow("#ff6a00", 2.0, 0.9); lg.position.y = 0.7; grp.add(lg);
    const smoke = []; for (let i = 0; i < 6; i++) { const s = mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: "#7d7570", transparent: true, opacity: 0.6, roughness: 1 })); grp.add(s); smoke.push([s, i]); }
    grp.userData.update = (t) => { for (const [s, i] of smoke) { const k = ((t * 0.25 + i / 6) % 1); s.position.set(Math.sin(i * 2 + t * 0.5) * 0.2 * k, 0.8 + k * 1.2, 0); s.scale.setScalar(0.6 + k * 1.4); s.material.opacity = 0.65 * (1 - k); } lg.material.opacity = 0.7 + 0.2 * Math.sin(t * 7); }; return grp;
  },
  snowflake() {
    const grp = new THREE.Group(), m = P("#dff4ff", { transmission: 0.3, roughness: 0.1, emissive: "#5fb7ff", emissiveIntensity: 0.25 });
    for (let i = 0; i < 6; i++) { const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 3; const a = mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), m); a.position.y = 0.55; arm.add(a);
      for (const y of [0.45, 0.75]) for (const s of [1, -1]) { const b = mesh(new THREE.BoxGeometry(0.05, 0.32 - y * 0.15, 0.05), m); b.position.set(s * 0.1, y + 0.08, 0); b.rotation.z = -s * 0.8; arm.add(b); } grp.add(arm); }
    grp.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 6), m)); grp.children.at(-1).rotation.x = Math.PI / 2; grp.add(glow("#bfe6ff", 3, 0.3));
    grp.userData.update = (t) => { grp.rotation.z = t * 0.3; grp.rotation.y = 0.3 * Math.sin(t * 0.7); }; return grp;
  },
  flame() {
    const grp = new THREE.Group(), layers = [];
    for (const [r, h, c, o] of [[0.6, 1.8, "#ff3d00", 0.85], [0.42, 1.4, "#ff9100", 0.9], [0.24, 0.9, "#ffe57f", 0.95]]) { const g = lathe(Array.from({ length: 20 }, (_, i) => { const u = i / 19; return [r * Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - u * 0.3), -0.6 + u * h]; }), 48);
      const m = mesh(g, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); grp.add(m); layers.push(m); }
    grp.add(glow("#ff7a1a", 4, 0.5)); grp.userData.update = (t) => { layers.forEach((m, i) => { m.scale.set(1 + 0.06 * Math.sin(t * 11 + i), 1 + 0.12 * Math.sin(t * 7 + i * 2), 1); m.rotation.y = t * (1 + i); }); }; return grp;
  },
  flower() {
    const grp = new THREE.Group(); const stem = mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 12), S("#3c8d3a")); stem.position.y = -0.7; grp.add(stem);
    const lf = ellip(0.25, 1.6, 0.3, 0.8, S("#4caf50")); lf.position.set(0.25, -0.8, 0); lf.rotation.z = 0.6; grp.add(lf);
    const head = new THREE.Group(); grp.add(head);
    for (let i = 0; i < 12; i++) { const p = ellip(0.22, 2.2, 0.25, 1, P("#ff5c8a")); const a = i / 12 * 6.283; p.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0); p.rotation.z = a; head.add(p); }
    const c = mesh(new THREE.SphereGeometry(0.26, 32, 16), S("#ffc83d", { roughness: 0.9 })); c.scale.z = 0.6; c.position.z = 0.05; head.add(c);
    grp.userData.update = (t) => { head.rotation.z = 0.1 * Math.sin(t); grp.rotation.y = 0.3 * Math.sin(t * 0.6); }; return grp;
  },
  paw() {
    const grp = new THREE.Group(), m = P("#f2a65a");
    grp.add(ellip(0.5, 1.15, 1, 0.45, m)); for (const [x, y] of [[-0.62, 0.55], [-0.22, 0.85], [0.22, 0.85], [0.62, 0.55]]) { const t = ellip(0.22, 1, 1.25, 0.45, m); t.position.set(x, y, 0); grp.add(t); }
    grp.position.y = -0.2; grp.userData.update = (t) => { grp.rotation.y = 0.4 * Math.sin(t * 0.9); }; return grp;
  },
  dinosaur() { // uzun boyunlu otçul
    const grp = new THREE.Group(), skin = bodyMat("#6e8b5a"), belly = bodyMat("#b9c493");
    grp.add(ellip(0.6, 1.7, 1.0, 0.95, skin)); const bl = ellip(0.55, 1.5, 0.6, 0.85, belly); bl.position.y = -0.22; grp.add(bl);
    const neck = new THREE.CatmullRomCurve3([[0.8, 0.2, 0], [1.2, 0.7, 0], [1.4, 1.3, 0], [1.55, 1.7, 0]].map((a) => new THREE.Vector3(...a))); grp.add(mesh(new THREE.TubeGeometry(neck, 40, 0.17, 16), skin));
    const head = ellip(0.18, 1.6, 0.9, 1, skin); head.position.set(1.72, 1.78, 0); grp.add(head);
    for (const s of [1, -1]) { const e = mesh(new THREE.SphereGeometry(0.035, 10, 8), S("#111")); e.position.set(1.8, 1.85, s * 0.13); grp.add(e); }
    const tailC = new THREE.CatmullRomCurve3([[-0.85, 0.1, 0], [-1.5, -0.05, 0], [-2.1, 0.0, 0.1], [-2.6, 0.15, 0.25]].map((a) => new THREE.Vector3(...a)));
    const tg = new THREE.TubeGeometry(tailC, 40, 0.2, 16); { const p = tg.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = Math.max(0.1, 1 - (-v.x - 0.85) / 1.9); p.setY(i, 0.05 + (v.y - 0.05) * k); p.setZ(i, v.z * k); } tg.computeVertexNormals(); } grp.add(mesh(tg, skin));
    const legs = []; for (const [x, z] of [[0.55, 0.4], [0.55, -0.4], [-0.55, 0.4], [-0.55, -0.4]]) { const l = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.8, 16), skin); l.position.set(x, -0.75, z); grp.add(l); legs.push(l); }
    grp.rotation.y = -0.35; grp.userData.update = (t) => { head.position.y = 1.78 + 0.04 * Math.sin(t * 1.3); grp.rotation.y = -0.35 + 0.1 * Math.sin(t * 0.5); }; return grp;
  },
  bone() {
    const grp = new THREE.Group(), m = P("#f3ead3", { roughness: 0.6 });
    const s = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 24), m); s.rotation.z = Math.PI / 2; grp.add(s);
    for (const x of [-0.95, 0.95]) for (const y of [-0.18, 0.18]) { const k = mesh(new THREE.SphereGeometry(0.28, 24, 16), m); k.position.set(x, y, 0); grp.add(k); }
    grp.rotation.z = 0.4; grp.userData.update = (t) => { grp.rotation.y = t * 0.6; }; return grp;
  },
  tooth() {
    const grp = new THREE.Group(), m = P("#f4efe2", { roughness: 0.45, clearcoat: 0.4 });
    const crown = mesh(lathe([[0, 0.75], [0.35, 0.72], [0.55, 0.55], [0.6, 0.2], [0.5, -0.05], [0, -0.05]]), m); grp.add(crown);
    for (const s of [1, -1]) { const r = mesh(new THREE.ConeGeometry(0.26, 0.85, 20), m); r.rotation.z = Math.PI + s * 0.1; r.position.set(s * 0.3, -0.45, 0); r.scale.set(0.8, 1, 0.8); grp.add(r); }
    grp.userData.update = (t) => { grp.rotation.y = t * 0.6; }; return grp;
  },
  lungs() {
    const grp = new THREE.Group(), m = P("#f27a8a", { roughness: 0.5, sheen: 1, sheenColor: new THREE.Color("#ffc0c8") });
    const L = ellip(0.5, 0.9, 1.6, 0.8, m), R = ellip(0.5, 0.9, 1.6, 0.8, m); L.position.x = -0.55; R.position.x = 0.55; grp.add(L); grp.add(R);
    const tr = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 16), S("#e8d3c8")); tr.position.y = 0.95; grp.add(tr);
    for (const s of [1, -1]) { const b = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12), S("#e8d3c8")); b.position.set(s * 0.22, 0.45, 0); b.rotation.z = s * 0.8; grp.add(b); }
    grp.userData.update = (t) => { const k = 1 + 0.06 * Math.sin(t * 1.8); L.scale.set(0.9 * k, 1.6 * k, 0.8 * k); R.scale.set(0.9 * k, 1.6 * k, 0.8 * k); }; return grp;
  },
  thermometer() {
    const grp = new THREE.Group(), glass = new THREE.MeshStandardMaterial({ color: "#e8f6ff", transparent: true, opacity: 0.3, roughness: 0.05 });
    const tube = mesh(new THREE.CapsuleGeometry(0.16, 1.9, 8, 24), glass); tube.position.y = 0.2; grp.add(tube);
    const bulb = mesh(new THREE.SphereGeometry(0.3, 32, 24), S("#e3262b", { emissive: "#600", emissiveIntensity: 0.5 })); bulb.position.y = -0.95; grp.add(bulb);
    const liq = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 16), S("#e3262b", { emissive: "#600", emissiveIntensity: 0.5 })); grp.add(liq);
    for (let i = 0; i < 9; i++) { const tk = mesh(new THREE.BoxGeometry(i % 2 ? 0.1 : 0.18, 0.02, 0.02), S("#333")); tk.position.set(0.2, -0.5 + i * 0.2, 0.1); grp.add(tk); }
    grp.userData.update = (t) => { const h = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 0.8)); liq.scale.y = h; liq.position.y = -0.75 + h / 2; }; return grp;
  },
  magnet() {
    const grp = new THREE.Group(); const u = mesh(new THREE.TorusGeometry(0.7, 0.25, 24, 48, Math.PI), P("#e63946")); u.rotation.z = Math.PI; grp.add(u);
    for (const s of [1, -1]) { const leg = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 24), P("#e63946")); leg.position.set(s * 0.7, 0.25, 0); grp.add(leg); const tip = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 24), S("#d7dbe0", { metalness: 0.9, roughness: 0.2 })); tip.position.set(s * 0.7, 0.65, 0); grp.add(tip); }
    const sp = []; for (let i = 0; i < 6; i++) { const g2 = glow("#8be9ff", 0.4, 0.8); grp.add(g2); sp.push([g2, i]); }
    grp.userData.update = (t) => { for (const [g2, i] of sp) { const a = ((t * 0.6 + i / 6) % 1) * Math.PI; g2.position.set(Math.cos(a) * 0.7, 0.9 + Math.sin(a) * 0.5, 0); } }; return grp;
  },
  compass() {
    const grp = new THREE.Group(), face = canvasTex(512, 512, (g, w) => { const c = w / 2; g.fillStyle = "#f6efe0"; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill(); g.fillStyle = "#222"; g.font = "bold 70px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      [["K", 0], ["D", 90], ["G", 180], ["B", 270]].forEach(([s, a]) => { const r = a * Math.PI / 180; g.fillText(s, c + Math.sin(r) * 190, c - Math.cos(r) * 190); }); for (let i = 0; i < 72; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI / 36); g.fillRect(-2, -c + 12, 4, i % 2 ? 14 : 26); g.restore(); } });
    const d = mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.15, 96), S("#b08d57", { metalness: 0.8, roughness: 0.3 })); d.rotation.x = Math.PI / 2; grp.add(d);
    const fc = mesh(new THREE.CircleGeometry(0.97, 96), S("#fff", { map: face, roughness: 0.6 })); fc.position.z = 0.08; grp.add(fc);
    const needle = new THREE.Group(); needle.position.z = 0.12; grp.add(needle);
    const n1 = mesh(new THREE.ConeGeometry(0.1, 0.7, 4), S("#e63946")); n1.position.y = 0.35; needle.add(n1); const n2 = mesh(new THREE.ConeGeometry(0.1, 0.7, 4), S("#2b2d42")); n2.position.y = -0.35; n2.rotation.z = Math.PI; needle.add(n2);
    grp.rotation.x = 0.3; grp.userData.update = (t) => { needle.rotation.z = 0.5 * Math.sin(t * 1.3) * Math.exp(-((t % 6) * 0.3)); }; return grp;
  },
  telescope() {
    const grp = new THREE.Group(), m = S("#2b3a67", { metalness: 0.5, roughness: 0.35 }), metal = S("#c9ccd3", { metalness: 0.9, roughness: 0.25 });
    const tube = new THREE.Group(); tube.position.y = 0.3; tube.rotation.z = 0.6; grp.add(tube);
    const t1 = mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.8, 32), m); t1.rotation.z = Math.PI / 2; tube.add(t1);
    const lens = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 32), metal); lens.rotation.z = Math.PI / 2; lens.position.x = 0.92; tube.add(lens);
    const ep = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 16), metal); ep.rotation.z = Math.PI / 2; ep.position.x = -1.0; tube.add(ep);
    for (let i = 0; i < 3; i++) { const a = i * 2.094, l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), metal); l.position.set(Math.cos(a) * 0.35, -0.45, Math.sin(a) * 0.35); l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); grp.add(l); }
    grp.userData.update = (t) => { grp.rotation.y = 0.4 * Math.sin(t * 0.5); }; return grp;
  },
  pyramid() {
    const grp = new THREE.Group(), tex = canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#d9b778"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(120,90,50,0.6)"; g.lineWidth = 3; for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 24 % 2) * 20; x < w; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke(); } } });
    const p = mesh(new THREE.ConeGeometry(1.3, 1.7, 4, 1), S("#fff", { map: tex, flatShading: true, roughness: 0.9 })); p.rotation.y = Math.PI / 4; grp.add(p);
    const sand = mesh(new THREE.CircleGeometry(1.5, 48), S("#c9a56a", { roughness: 1 })); sand.rotation.x = -Math.PI / 2; sand.position.y = -0.85; grp.add(sand);
    grp.rotation.x = 0.15; grp.userData.update = (t) => { grp.rotation.y = t * 0.2; }; return grp;
  },
  crown() {
    const grp = new THREE.Group(), gold = S("#f1c232", { metalness: 0.95, roughness: 0.2 });
    const band = mesh(new THREE.CylinderGeometry(0.85, 0.8, 0.45, 48, 1, true), gold); band.material.side = THREE.DoubleSide; grp.add(band);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, sp = mesh(new THREE.ConeGeometry(0.16, 0.55, 12), gold); sp.position.set(Math.cos(a) * 0.82, 0.48, Math.sin(a) * 0.82); grp.add(sp);
      const b = mesh(new THREE.SphereGeometry(0.06, 12, 8), gold); b.position.set(Math.cos(a) * 0.82, 0.78, Math.sin(a) * 0.82); grp.add(b);
      const gem = mesh(new THREE.OctahedronGeometry(0.1), P(i % 2 ? "#e0115f" : "#1f75fe", { transmission: 0.2 })); gem.position.set(Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86); grp.add(gem); }
    grp.add(glow("#ffd75e", 3, 0.3)); grp.rotation.x = 0.35; grp.userData.update = (t) => { grp.rotation.y = t * 0.5; }; return grp;
  },
  cloud() {
    const grp = new THREE.Group(), m = S("#f4f7fb", { roughness: 0.95 });
    for (const [x, y, r] of [[0, 0.2, 0.6], [-0.6, 0, 0.45], [0.6, 0, 0.5], [-0.25, -0.15, 0.45], [0.3, -0.15, 0.45], [0.25, 0.45, 0.4]]) { const s = mesh(new THREE.SphereGeometry(r, 32, 24), m); s.position.set(x, y, 0); grp.add(s); }
    const drops = []; for (let i = 0; i < 7; i++) { const d = mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 8), new THREE.MeshStandardMaterial({ color: "#4fb3ff", emissive: "#1a5a99", emissiveIntensity: 0.5 })); grp.add(d); drops.push([d, i]); }
    grp.userData.update = (t) => { for (const [d, i] of drops) { const k = (t * 0.9 + i / 7) % 1; d.position.set(-0.7 + i * 0.23, -0.5 - k * 1.1, 0.1); d.material.opacity = 1; } grp.position.y = 0.3; }; return grp;
  },
  pill() {
    const grp = new THREE.Group(), a = mesh(new THREE.CapsuleGeometry(0.35, 0.6, 8, 32), P("#e63946")), cut = mesh(new THREE.CylinderGeometry(0.352, 0.352, 0.6, 32), P("#f4f4f8"));
    grp.add(a); cut.position.y = -0.3; grp.add(cut); const capb = mesh(new THREE.SphereGeometry(0.352, 32, 16, 0, 6.3, Math.PI / 2, Math.PI / 2), P("#f4f4f8")); capb.position.y = -0.6; grp.add(capb);
    grp.rotation.z = 0.8; grp.userData.update = (t) => { grp.rotation.y = t * 0.8; }; return grp;
  },
  bacteria() {
    const grp = new THREE.Group(), m = P("#7ed957", { roughness: 0.4, transmission: 0.1 }); const b = mesh(new THREE.CapsuleGeometry(0.4, 1.3, 12, 32), m); b.rotation.z = Math.PI / 2; grp.add(b);
    const fl = []; for (let i = 0; i < 5; i++) { const pts = []; for (let j = 0; j < 12; j++) pts.push(new THREE.Vector3(-1.05 - j * 0.06, Math.sin(j * 0.9 + i) * 0.12 + (i - 2) * 0.12, Math.cos(j * 0.9) * 0.08)); const f = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.015, 6), S("#c7f2a8")); grp.add(f); fl.push(f); }
    grp.userData.update = (t) => { fl.forEach((f, i) => { f.rotation.x = 0.3 * Math.sin(t * 6 + i); }); grp.rotation.y = 0.3 * Math.sin(t * 0.7); }; return grp;
  },
  strawberry() {
    const grp = new THREE.Group(), body = mesh(lathe([[0, -0.95], [0.3, -0.75], [0.6, -0.25], [0.72, 0.2], [0.6, 0.5], [0.3, 0.62], [0, 0.62]]), P("#e0152e", { roughness: 0.35 })); grp.add(body);
    const seed = S("#f6d860"), r = mulberry32(4); for (let i = 0; i < 70; i++) { const y = -0.8 + r() * 1.3, rad = y < -0.25 ? 0.3 + (y + 0.95) * 0.43 : 0.72 - Math.max(0, y - 0.2) * 0.9, a = r() * 6.283; const s = mesh(new THREE.SphereGeometry(0.025, 8, 6), seed); s.position.set(Math.cos(a) * rad * 0.98, y, Math.sin(a) * rad * 0.98); s.scale.y = 1.6; grp.add(s); }
    for (let i = 0; i < 7; i++) { const l = ellip(0.12, 3, 0.3, 1, S("#3a9a3a")); const a = i / 7 * 6.283; l.position.set(Math.cos(a) * 0.3, 0.64, Math.sin(a) * 0.3); l.rotation.y = -a; l.rotation.z = 0.3; grp.add(l); }
    grp.userData.update = (t) => { grp.rotation.y = t * 0.5; }; return grp;
  },
  battery() {
    const grp = new THREE.Group(); grp.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 48, 1, true), new THREE.MeshStandardMaterial({ color: "#1d1f26", transparent: true, opacity: 0.35, side: THREE.DoubleSide })));
    const tip = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.15, 24), S("#c9ccd3", { metalness: 0.9 })); tip.position.y = 0.88; grp.add(tip);
    const lv = mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 48), new THREE.MeshStandardMaterial({ color: "#2ee86b", emissive: "#0f7a33", emissiveIntensity: 0.8 })); grp.add(lv);
    grp.userData.update = (t) => { const k = 0.15 + 0.85 * ((t * 0.25) % 1); lv.scale.y = k * 1.5; lv.position.y = -0.78 + k * 0.75; lv.material.color.set(k < 0.3 ? "#ff4d4d" : "#2ee86b"); }; return grp;
  },
});
// eski adlar: "planet" + renk yerine artık gerçek gezegenleri kullan (mercury, mars, jupiter, saturn, uranus, neptune)
window.OBJ_LIST = Object.keys(OBJ);

// sahne başına nesneler (önceden kurulur, boyut normalize edilir)
function buildObject(name, color, opt = {}) {
  const f = OBJ[name] || OBJ.question;
  const obj = f(color, opt);
  const holder = new THREE.Group(); holder.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), sz = new THREE.Vector3();
  obj.traverse((m) => { if (m.isMesh && !(m.material && m.material.blending === THREE.AdditiveBlending)) box.expandByObject(m, true); });
  if (box.isEmpty()) box.setFromObject(obj);
  box.getSize(sz);
  const k = 2.0 / Math.max(sz.x, sz.y, sz.z * 0.8); obj.scale.multiplyScalar(k);
  const c = new THREE.Vector3(); box.getCenter(c); obj.position.sub(c.multiplyScalar(k));
  holder.visible = false; scene.add(holder);
  return { holder, obj };
}
const scenes = TL.scenes;
const SC = TL.spec_scenes;
const objects = scenes.map((s) => {
  const d = s.type === "hook" ? TL.hook : s.type === "outro" ? TL.outro : SC[s.k];
  return buildObject(d.object || "question", d.color, d);
});
const themeOf = (s) => THEMES[(s.type === "hook" ? TL.hook.theme : s.type === "outro" ? TL.outro.theme : SC[s.k].theme) || TL.theme] || THEMES.space;

// ------------------------------------------------------------------ 2D katman
const out = document.getElementById("out"); out.width = W; out.height = H;
const ctx = out.getContext("2d");
const grain = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); const d = g.createImageData(256, 256); const r = mulberry32(3); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); return c; })();
function txt(s, x, y, { size = 60, font = "Mont", weight = 900, fill = "#fff", stroke = null, sw = 10, align = "left", glow = null, glowBlur = 30, ls = 0, alpha = 1, base = "alphabetic" } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = `${ls}px`; ctx.lineJoin = "round";
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = glowBlur; } ctx.strokeText(s, x, y); ctx.shadowBlur = 0; } else if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = glowBlur; }
  ctx.fillStyle = fill; ctx.fillText(s, x, y); ctx.restore();
}
function measure(s, size, font = "Mont", weight = 900, ls = 0) { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; ctx.letterSpacing = `${ls}px`; const w = ctx.measureText(s).width; ctx.restore(); return w; }
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function wrapLines(text, maxChars) {
  const words = text.split(/\s+/), lines = []; let cur = "";
  for (const w of words) { if (cur && (cur + " " + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  if (cur) lines.push(cur); return lines;
}
function pill(s, x, y, { size = 40, bg = "#ff7a1a", fg = "#fff", k = 1, ls = 2 } = {}) {
  const fw = measure(s, size, "Mont", 900, ls) + size * 1.4, h = size * 1.9;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  rrect(-fw / 2, -h / 2, fw, h, h / 2); ctx.fillStyle = bg; ctx.shadowColor = bg; ctx.shadowBlur = 35; ctx.fill(); ctx.shadowBlur = 0;
  txt(s, 0, size * 0.36, { size, align: "center", fill: fg, ls }); ctx.restore();
}

function drawCaptions(t, yC = 1390, cx = W / 2, sc = 1) {
  const c = TL.captions.find((c) => t >= c.t0 && t < c.t1);
  if (!c) return;
  const age = t - c.t0, pop = eOutBack(age / 0.16, 2.2), size = 76, gap = 36;
  const words = c.words.map((w) => UP(w.w)), widths = words.map((w) => measure(w, size));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1), scale = Math.min(1, 960 / total);
  ctx.save(); ctx.translate(cx, yC); ctx.scale(sc * scale * lerp(0.82, 1, pop), sc * scale * lerp(0.82, 1, pop)); ctx.globalAlpha = clamp(age / 0.08);
  let x = -total / 2;
  words.forEach((w, i) => {
    const ww = c.words[i], active = t >= ww.t0 - 0.03 && t < ww.t1 + 0.02;
    const s = active ? lerp(1, 1.08, eOutBack(clamp((t - ww.t0) / 0.12))) : 1;
    ctx.save(); ctx.translate(x + widths[i] / 2, 0); ctx.scale(s, s);
    txt(w, 0, 0, { size, align: "center", base: "middle", stroke: "#000", sw: 16, glow: "rgba(0,0,0,0.6)", glowBlur: 18, fill: active ? "#ffd23f" : "#ffffff" });
    ctx.restore(); x += widths[i] + gap;
  });
  ctx.restore();
}

// ------------------------------------------------------------------ 3D sahne
function sceneAt(t) { let i = 0; for (let k = 0; k < scenes.length; k++) if (t >= scenes[k].t0) i = k; return i; }
const WHIP = 0.42;
function applyTheme(th, t, k) {
  skyMat.uniforms.top.value.set(th.top); skyMat.uniforms.mid.value.set(th.mid); skyMat.uniforms.bot.value.set(th.bot); skyMat.uniforms.rim.value.set(th.rim);
  skyMat.uniforms.neb.value = th.nebula || 0; skyMat.uniforms.time.value = t;
  rimL.color.set(th.rim); fillL.color.set(th.top).lerp(new THREE.Color("#ffffff"), 0.6);
  rays.visible = !!th.rays; grid.visible = !!th.grid; grid.material.color.set(th.accent);
  rays.children.forEach((m) => { m.rotation.z = 0.35 + 0.08 * Math.sin(t * 0.5 + m.userData.p); m.material.opacity = 0.12 + 0.06 * Math.sin(t * 0.8 + m.userData.p * 2); });
  const P2 = pGeo.attributes.position, kind = th.particles;
  pMat.color.set(kind === "bubbles" ? "#bfefff" : kind === "bokeh" ? th.accent : "#ffffff");
  pMat.size = kind === "stars" ? 0.05 : kind === "bokeh" ? 0.35 : kind === "bubbles" ? 0.12 : 0.05;
  pMat.opacity = kind === "bokeh" ? 0.35 : 0.85;
  for (let i = 0; i < PN; i++) {
    const a = pSeed[i * 4], b = pSeed[i * 4 + 1], c = pSeed[i * 4 + 2], d = pSeed[i * 4 + 3];
    let x = (a - 0.5) * 30, y = (b - 0.5) * 22, z = -3 - c * 25;
    if (kind === "bubbles") { y = ((b * 22 + t * (0.6 + d * 1.2)) % 22) - 11; x += Math.sin(t * 2 + d * 30) * 0.15; }
    else if (kind === "dust" || kind === "bokeh") { x += Math.sin(t * 0.2 + d * 40) * 0.8; y += Math.cos(t * 0.17 + a * 40) * 0.6; }
    else if (kind === "stars") { z = -20 - c * 60; x *= 3; y *= 3; }
    P2.setXYZ(i, x, y, z);
  }
  P2.needsUpdate = true;
}

function renderScene3D(t) {
  const si = sceneAt(t), S0 = scenes[si], next = scenes[si + 1];
  objects.forEach((o) => (o.holder.visible = false));
  const outK = next ? eInCubic((t - (next.t0 - 0.22)) / 0.22) : 0;
  const inK = si > 0 ? 1 - eOutCubic((t - S0.t0) / WHIP) : 0;
  const whip = outK * 1.1 - inK * 1.1;
  const th = themeOf(S0); applyTheme(th, t);
  const o = objects[si], age = t - S0.t0, dur = S0.t1 - S0.t0;
  o.holder.visible = true;
  const ent = eOutBack(age / 0.7, 1.6);
  o.holder.scale.setScalar(Math.max(0.001, ent * (1 - 0.6 * outK)));
  o.holder.rotation.y = -1.4 * (1 - eOutCubic(age / 0.9)) + 0.35 * Math.sin(age * 0.6);
  o.holder.position.y = -0.05 + 0.06 * Math.sin(age * 1.6);
  if (o.obj.userData.update) o.obj.userData.update(age);
  const p = age / dur, az = whip + 0.25 * Math.sin(p * 2.5 + si), D = lerp(7.6, 7.0, eInOut(p));
  camera.position.set(Math.sin(az) * D, 0.45 + 0.15 * Math.sin(p * 3), Math.cos(az) * D);
  camera.lookAt(0, 0.12, 0);
  renderer.render(scene, camera);
  return { si, S: S0, th, blur: Math.max(outK, inK) };
}

// ------------------------------------------------------------------ 2D sahneler
function progress(si, t, th) {
  const n = SC.length, x0 = 80, w = DW - 160, g = 10, sw = (w - g * (n - 1)) / n, y = 190, k = si - 1;
  for (let i = 0; i < n; i++) {
    rrect(x0 + i * (sw + g), y, sw, 10, 5); ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill();
    const on = i < k ? 1 : i === k ? eOutCubic((t - scenes[si].t0) / 0.4) : 0;
    if (on > 0) { rrect(x0 + i * (sw + g), y, sw * on, 10, 5); ctx.fillStyle = i === k ? th.accent : "rgba(255,255,255,0.85)"; ctx.fill(); }
  }
}
function drawTitle(text, t0, t, th, { y = 330, maxSize = 132, maxChars = 13, count = null, cntT = null } = {}) {
  let s = UP(text);
  if (count != null && s.includes("{N}")) s = s.replace("{N}", fmt(count * eOutExpo((t - cntT[0]) / (cntT[1] - cntT[0]))));
  const lines = wrapLines(s, maxChars).slice(0, 3);
  lines.forEach((ln, i) => {
    const last = i === lines.length - 1; let size = last && lines.length > 1 ? maxSize * 1.15 : maxSize;
    while (measure(ln, size, "Mont", 900, -2) > 960 && size > 50) size -= 4;
    const kk = eOutBack((t - t0 - 0.08 - i * 0.09) / 0.32, 2.2); if (kk <= 0) { y += size; return; }
    ctx.save(); ctx.translate(DW / 2, y + size * 0.4); ctx.scale(lerp(1.7, 1, kk), lerp(1.7, 1, kk)); ctx.globalAlpha *= clamp(kk * 3);
    const col = last ? th.accent : "#fff";
    txt(ln, 0, size * 0.35, { size, align: "center", fill: col, stroke: "rgba(5,8,25,0.9)", sw: 14, glow: last ? th.accent : "rgba(0,0,0,0.5)", glowBlur: 40, ls: -2 });
    ctx.restore(); y += size * 0.98;
  });
  return y;
}
function chip(text, y, t0, t, th) {
  const k = eOutBack((t - t0) / 0.4, 1.4); if (k <= 0) return;
  const lines = wrapLines(text, 34).slice(0, 2), size = 40, h = 64 + (lines.length - 1) * 50;
  const w = Math.max(...lines.map((l) => measure(l, size, "InterSB", 600))) + 64;
  ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate(DW / 2, y); ctx.scale(lerp(0.85, 1, k), lerp(0.85, 1, k));
  rrect(-w / 2, 0, w, h + 10, 34); ctx.fillStyle = "rgba(8,10,28,0.62)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = th.accent; rrect(-w / 2, 0, 8, h + 10, 4); ctx.fill();
  lines.forEach((l, i) => txt(l, 0, 50 + i * 50, { size, font: "InterSB", weight: 600, align: "center" }));
  ctx.restore();
}

function overlay(t, info) {
  const S0 = info.S, th = info.th, age = t - S0.t0, left = S0.t1 - t, exit = eInCubic(1 - left / 0.25);
  const tg = ctx.createLinearGradient(0, 0, 0, 760); tg.addColorStop(0, "rgba(3,6,20,0.6)"); tg.addColorStop(1, "rgba(3,6,20,0)"); ctx.fillStyle = tg; if (!YATAY) ctx.fillRect(0, 0, DW, 760);
  const bg = ctx.createLinearGradient(0, 1200, 0, DH); bg.addColorStop(0, "rgba(3,6,20,0)"); bg.addColorStop(1, "rgba(3,6,20,0.55)"); ctx.fillStyle = bg; if (!YATAY) ctx.fillRect(0, 1200, DW, DH - 1200);
  ctx.save(); ctx.globalAlpha = 1 - exit; ctx.translate(0, -exit * 60);
  if (S0.type === "hook") {
    pill(UP(TL.hook.kicker || "BUNU BİLİYOR MUYDUN?"), DW / 2, 285, { size: 44, bg: th.accent === "#ffd23f" ? "#ff7a1a" : "#ff7a1a", k: eOutBack(age / 0.35, 2) });
    drawTitle(TL.hook.headline || TL.title, S0.t0 + 0.15, t, th, { y: 380, maxSize: 124, maxChars: 12 });
  } else if (S0.type === "outro") {
    drawTitle(TL.outro.headline || "SENCE?", S0.t0, t, th, { y: 300, maxSize: 112, maxChars: 14 });
    const ck = eOutBack((age - 1.0) / 0.4, 2);
    if (ck > 0) pill(UP(TL.outro.cta || "Yorumlara yaz"), DW / 2, YATAY ? 900 : 1210, { size: 46, bg: "#ffffff", fg: "#0b1230", k: ck, ls: 1 });
  } else {
    const d = SC[S0.k];
    progress(info.si, t, th);
    if (d.kicker) pill(UP(d.kicker), DW / 2, 262, { size: 30, bg: "rgba(255,255,255,0.14)", k: eOutBack(age / 0.3, 1.8), ls: 3 });
    const yEnd = drawTitle(d.title || "", S0.t0, t, th, { y: 320, count: d.count ?? null, cntT: [S0.count0 ?? S0.t0 + 0.3, S0.count1 ?? S0.t0 + 1.2] });
    if (d.sub) chip(d.sub, Math.min(yEnd + 14, 640), S0.t0 + 0.45, t, th);
  }
  ctx.restore();
}

function post(t) {
  let flash = 0;
  for (const S0 of scenes.slice(1)) { const d = t - S0.t0; if (d > -0.12 && d < 0.4) flash = Math.max(flash, d < 0 ? (d + 0.12) / 0.12 : Math.exp(-d * 9)); }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.35 * flash})`; ctx.fillRect(0, 0, W, H); }
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, H * 0.78); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,10,0.55)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.06; ctx.globalCompositeOperation = "overlay";
  const r = mulberry32(Math.floor(t * 30) + 1), ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
  ctx.translate(-ox, -oy); ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore();
  const k = Math.min(clamp(t / 0.25), clamp((TL.duration - t) / 0.5)); if (k < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - k})`; ctx.fillRect(0, 0, W, H); }
}

let lastT = -1;
window.renderFrame = (t) => {
  const info = renderScene3D(t);
  const contiguous = lastT >= 0 && Math.abs(t - lastT - 1 / TL.fps) < 1e-3;
  ctx.globalAlpha = contiguous && info.blur > 0.05 ? lerp(1, 0.4, info.blur) : 1;
  ctx.drawImage(glc, 0, 0); ctx.globalAlpha = 1;
  if (YATAY) {
    // sol panel: okunabilirlik için koyu geçiş; dikey tasarım alanı 0.56 ölçekle sola yerleşir
    const lg = ctx.createLinearGradient(0, 0, W * 0.55, 0); lg.addColorStop(0, "rgba(3,6,20,0.72)"); lg.addColorStop(1, "rgba(3,6,20,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W * 0.55, H);
    const bgl = ctx.createLinearGradient(0, H - 260, 0, H); bgl.addColorStop(0, "rgba(3,6,20,0)"); bgl.addColorStop(1, "rgba(3,6,20,0.6)");
    ctx.fillStyle = bgl; ctx.fillRect(0, H - 260, W, 260);
    ctx.save(); ctx.translate(90, 20); ctx.scale(0.62, 0.62); overlay(t, info); ctx.restore();
    drawCaptions(t, H - 110, W / 2, 0.82);
  } else { overlay(t, info); drawCaptions(t); }
  post(t);
  lastT = t;
  return out.toDataURL("image/jpeg", 0.92);
};
await document.fonts.load("900 100px Mont"); await document.fonts.load("600 40px InterSB");
window.READY = true;
