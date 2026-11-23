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
