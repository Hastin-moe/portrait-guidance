// 场地图 → 机位第一人称三维预览（原生 Canvas，无外部依赖）。
// 坐标系：平面图 x → 世界 X，平面图 y → 世界 Z，高度 → 世界 Y（向上）。
// 机位 rot 与平面图一致：0° 朝 +X，角度增大朝 +Y（平面图向下）。
// 相机空间：右 = (−sin a, 0, cos a)，上 = (0, 1, 0)，前 = (cos a, 0, sin a)。
import * as M from "./model.js";
import { venueSize, labels } from "./canvas.js";

const DEFAULT_FOCAL = 20; // 构图宽视角默认 20mm（全画幅）
const DEFAULT_EYE = 1.55;
const NEAR = 0.05;

export function defaultCamFocal() { return DEFAULT_FOCAL; }

/** 水平视角（度），与 model.fovDeg 一致：35mm 全画幅横向 */
export function hFovDeg(focal = DEFAULT_FOCAL) {
  return M.fovDeg(focal);
}

/**
 * 从布置方案收集简易 3D 盒体（米）。
 * @returns {{ kind, x,y,z, w,h,d, rot, color, label, shell? }[]}
 * 盒体局部：中心在 (x,y,z)，绕 Y 旋转 rot°，尺寸 w(沿局部X)×h(高)×d(沿局部Z)
 */
export function buildSceneBoxes(p, setupId) {
  const setup = M.setupById(p, setupId) || p.layout.setups[0];
  const { w: roomW, d: roomD } = venueSize(p);
  const H = Number(p.venue.h) > 0 ? Number(p.venue.h) : 3.0;
  const lab = labels(setup);
  const boxes = [];
  const add = b => boxes.push(b);

  // 房间外壳：地板、天花、四墙（法线朝内的面才会被画出）
  const T = 0.08;
  add({ kind: "floor", shell: true, x: roomW / 2, y: -0.01, z: roomD / 2, w: roomW, h: 0.02, d: roomD, rot: 0, color: "#cfcac0", label: "" });
  add({ kind: "ceiling", shell: true, x: roomW / 2, y: H + 0.01, z: roomD / 2, w: roomW, h: 0.02, d: roomD, rot: 0, color: "#f2f0eb", label: "" });
  add({ kind: "wall", shell: true, x: roomW / 2, y: H / 2, z: -T / 2, w: roomW, h: H, d: T, rot: 0, color: "#ebe8e1", label: "" });
  add({ kind: "wall", shell: true, x: roomW / 2, y: H / 2, z: roomD + T / 2, w: roomW, h: H, d: T, rot: 0, color: "#e6e2da", label: "" });
  add({ kind: "wall", shell: true, x: -T / 2, y: H / 2, z: roomD / 2, w: T, h: H, d: roomD, rot: 0, color: "#e9e6df", label: "" });
  add({ kind: "wall", shell: true, x: roomW + T / 2, y: H / 2, z: roomD / 2, w: T, h: H, d: roomD, rot: 0, color: "#e9e6df", label: "" });

  const els = [...(p.layout.base || []), ...(setup ? setup.elements : [])];
  for (const e of els) {
    const rot = Number(e.rot) || 0, x = Number(e.x) || 0, z = Number(e.y) || 0;
    if (e.kind === "window") {
      const ww = Number(e.w) || 1.2, wh = Math.min(1.8, H - 0.9);
      add({ kind: "window", x, y: 0.9 + wh / 2, z, w: ww, h: wh, d: 0.1, rot, color: "#a9cfe9", label: "" });
    } else if (e.kind === "door") {
      const ww = Number(e.w) || 0.9;
      add({ kind: "door", x, y: 1.05, z, w: ww, h: 2.1, d: 0.1, rot, color: "#a08c72", label: "" });
    } else if (e.kind === "wall") {
      const ww = Number(e.w) || 2, wd = Math.max(Number(e.h) || 0.1, 0.06);
      add({ kind: "wall", x, y: H / 2, z, w: ww, h: H, d: wd, rot, color: "#d9d5cc", label: "" });
    } else if (e.kind === "backdrop") {
      const ww = Number(e.w) || 2.7, bh = Math.min(2.8, H - 0.1);
      add({ kind: "backdrop", x, y: bh / 2, z, w: ww, h: bh, d: Math.max(Number(e.h) || 0.05, 0.04), rot, color: "#d6cfc3", label: "" });
    } else if (e.kind === "pillar") {
      const s = Math.max(Number(e.w) || 0.4, 0.2);
      add({ kind: "pillar", x, y: H / 2, z, w: s, h: H, d: Math.max(Number(e.h) || s, 0.2), rot, color: "#b9b4aa", label: "" });
    } else if (e.kind === "person") {
      const pe = e.ref && M.personById(p, e.ref);
      const hgt = pe && Number(pe.height) > 100 ? Number(pe.height) / 100 : 1.68;
      add({ kind: "person", x, y: hgt / 2, z, w: 0.42, h: hgt, d: 0.26, rot, color: "#3b3a36", label: pe ? pe.name : "" });
    } else if (e.kind === "light") {
      const headY = 1.8;
      add({ kind: "stand", x, y: headY / 2, z, w: 0.04, h: headY, d: 0.04, rot: 0, color: "#4a4944", label: "" });
      add({ kind: "light", x, y: headY, z, w: 0.26, h: 0.22, d: 0.22, rot, color: "#e8c46a", label: lab.get(e.id) || "" });
      const mod = e.modifierRef && M.gearByKey(p, e.modifierRef);
      if (mod) {
        const { depth, width } = M.modifierSizeM(mod);
        const rad = rot * Math.PI / 180, off = 0.13 + depth / 2;
        add({ kind: "modifier", x: x + Math.cos(rad) * off, y: headY, z: z + Math.sin(rad) * off, w: Math.max(depth, 0.05), h: width, d: width, rot, color: "#f4f2ec", label: "" });
      }
    } else if (e.kind === "board") {
      const bw = Number(e.w) || 2.4, bt = Math.max(Number(e.h) || 0.05, 0.04), bh = 1.2;
      add({ kind: "board", x, y: bh / 2, z, w: bw, h: bh, d: bt, rot, color: "#2a2a27", label: "" });
    } else if (e.kind === "prop") {
      const pw = Number(e.w) || 0.6, pd = Math.max(Number(e.h) || 0.6, 0.2), ph = Math.min(pw, pd, 0.9);
      add({ kind: "prop", x, y: ph / 2, z, w: pw, h: ph, d: pd, rot, color: "#8c857a", label: "" });
    }
    // 机位本身不画，免得挡住视野
  }
  return boxes;
}

// ---------- 几何 ----------
const FACES = [ // 局部顶点索引 + 局部法线
  { i: [0, 3, 2, 1], n: [0, -1, 0] }, { i: [4, 5, 6, 7], n: [0, 1, 0] },
  { i: [0, 1, 5, 4], n: [0, 0, -1] }, { i: [2, 3, 7, 6], n: [0, 0, 1] },
  { i: [3, 0, 4, 7], n: [-1, 0, 0] }, { i: [1, 2, 6, 5], n: [1, 0, 0] },
];

function boxCorners(b) {
  const hw = b.w / 2, hh = b.h / 2, hd = b.d / 2;
  const rad = (b.rot || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  return [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd],
    [-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd],
  ].map(([lx, ly, lz]) => ({ x: b.x + lx * c - lz * s, y: b.y + ly, z: b.z + lx * s + lz * c }));
}

function rotN(n, rot) {
  const rad = (rot || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  return { x: n[0] * c - n[2] * s, y: n[1], z: n[0] * s + n[2] * c };
}

/** 世界坐标 → 相机空间 { x 右, y 上, z 前 } */
export function toCamera(pt, cam) {
  const a = cam.yaw * Math.PI / 180, pch = (cam.pitch || 0) * Math.PI / 180;
  const dx = pt.x - cam.x, dy = pt.y - cam.eye, dz = pt.z - cam.z;
  const cx = -dx * Math.sin(a) + dz * Math.cos(a);
  const fz = dx * Math.cos(a) + dz * Math.sin(a);
  return { x: cx, y: dy * Math.cos(pch) - fz * Math.sin(pch), z: dy * Math.sin(pch) + fz * Math.cos(pch) };
}

/** 相机空间点 → 屏幕像素（z 必须 > 0） */
function toScreen(c, cam, W, H) {
  const f = (W / 2) / Math.tan((cam.hfovDeg * Math.PI / 180) / 2);
  return { x: W / 2 + f * c.x / c.z, y: H / 2 - f * c.y / c.z, z: c.z };
}

/** 世界点直接投影到屏幕；在相机后面返回 null */
export function projectPoint(pt, cam, W, H) {
  const c = toCamera(pt, cam);
  return c.z > NEAR ? toScreen(c, cam, W, H) : null;
}

// 近裁剪面（Sutherland–Hodgman，只裁 z = NEAR 一个平面）
function clipNear(poly) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const ain = a.z >= NEAR, bin = b.z >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
    }
  }
  return out;
}

const SUN = (() => { const v = { x: -0.35, y: 0.85, z: -0.4 }; const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; })();

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = sh => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * 把盒体投影成要画的多边形（纯函数，便于测试）。
 * 顺序：先房间外壳（由远到近），再室内物体（按盒体由远到近）。
 * @returns {{ pts:{x,y}[], color, kind, depth }[]}
 */
export function projectScene(boxes, cam, W, H) {
  const eye = { x: cam.x, y: cam.eye, z: cam.z };
  const faceList = box => {
    const corners = boxCorners(box), out = [];
    for (const f of FACES) {
      const n = rotN(f.n, box.rot);
      const ws = f.i.map(i => corners[i]);
      const c = ws.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4, z: a.z + q.z / 4 }), { x: 0, y: 0, z: 0 });
      if (n.x * (c.x - eye.x) + n.y * (c.y - eye.y) + n.z * (c.z - eye.z) >= 0) continue; // 背面剔除
      const poly = clipNear(ws.map(q => toCamera(q, cam)));
      if (poly.length < 3) continue;
      const pts = poly.map(q => toScreen(q, cam, W, H));
      const light = 0.72 + 0.28 * Math.max(0, n.x * SUN.x + n.y * SUN.y + n.z * SUN.z);
      out.push({ pts, color: shade(box.color || "#aaaaaa", light), kind: box.kind, shell: !!box.shell, depth: Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) });
    }
    return out;
  };
  const shell = boxes.filter(b => b.shell).flatMap(faceList).sort((a, b) => b.depth - a.depth);
  const dist = b => Math.hypot(b.x - eye.x, b.y - eye.y, b.z - eye.z);
  const inner = boxes.filter(b => !b.shell).sort((a, b) => dist(b) - dist(a)).flatMap(faceList);
  return [...shell, ...inner];
}

/**
 * 在 canvas 上绘制机位视角。
 * cam: { x, z, yaw, pitch, eye, hfovDeg }
 */
export function drawCamView(canvas, boxes, cam) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#e9e6df";
  ctx.fillRect(0, 0, W, H);
  const polys = projectScene(boxes, cam, W, H);
  // 先画外壳，再在地板上画 1 m 网格，最后画室内物体
  const firstInner = polys.findIndex(f => !f.shell);
  const split = firstInner < 0 ? polys.length : firstInner;
  const fill = f => {
    ctx.beginPath();
    f.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = f.color; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = 1; ctx.stroke();
  };
  polys.slice(0, split).forEach(fill);
  const floor = boxes.find(b => b.kind === "floor");
  if (floor) {
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1;
    const line = (a, b) => {
      let ca = toCamera(a, cam), cb = toCamera(b, cam);
      if (ca.z < NEAR && cb.z < NEAR) return;
      if (ca.z < NEAR || cb.z < NEAR) {
        const t = (NEAR - ca.z) / (cb.z - ca.z);
        const m = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, z: NEAR };
        if (ca.z < NEAR) ca = m; else cb = m;
      }
      const sa = toScreen(ca, cam, W, H), sb = toScreen(cb, cam, W, H);
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
    };
    for (let gx = 1; gx < floor.w; gx++) line({ x: gx, y: 0, z: 0 }, { x: gx, y: 0, z: floor.d });
    for (let gz = 1; gz < floor.d; gz++) line({ x: 0, y: 0, z: gz }, { x: floor.w, y: 0, z: gz });
  }
  polys.slice(split).forEach(fill);
  // 标签：人物名、灯号
  ctx.font = "600 13px -apple-system, 'PingFang SC', 'Hiragino Sans', 'Apple SD Gothic Neo', sans-serif";
  ctx.textAlign = "center";
  for (const box of boxes) {
    if (!box.label || (box.kind !== "person" && box.kind !== "light")) continue;
    const top = projectPoint({ x: box.x, y: box.y + box.h / 2 + 0.12, z: box.z }, cam, W, H);
    if (!top || top.x < 0 || top.x > W || top.y < 0 || top.y > H) continue;
    const tw = ctx.measureText(box.label).width + 10;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(top.x - tw / 2, top.y - 15, tw, 19);
    ctx.fillStyle = "#fff";
    ctx.fillText(box.label, top.x, top.y);
  }
}

/** 从布置图机位构造初始相机 */
export function cameraFromElement(camEl, focal = DEFAULT_FOCAL, eye = DEFAULT_EYE) {
  return {
    x: Number(camEl.x) || 0,
    z: Number(camEl.y) || 0,
    yaw: Number(camEl.rot) || 0,
    pitch: -3,
    eye,
    hfovDeg: hFovDeg(focal),
    focal: Number(focal) || DEFAULT_FOCAL,
  };
}

export { DEFAULT_FOCAL, DEFAULT_EYE };
