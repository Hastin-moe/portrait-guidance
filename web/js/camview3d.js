// 场地图 → 机位第一人称三维预览（原生 Canvas，无外部依赖）。
// 坐标系：平面图 x→世界 X，平面图 y→世界 Z，高度→世界 Y；机位 rot 与平面图一致（0° = +X）。
import * as M from "./model.js";
import { venueSize } from "./canvas.js";

const DEFAULT_FOCAL = 20; // 构图宽视角默认 20mm（全画幅）
const DEFAULT_EYE = 1.55;

export function defaultCamFocal() { return DEFAULT_FOCAL; }

/** 水平视角（度），与 model.fovDeg 一致：35mm 全画幅横向 */
export function hFovDeg(focal = DEFAULT_FOCAL) {
  return M.fovDeg(focal);
}

/**
 * 从布置方案收集简易 3D 盒体（米）。
 * @returns {{ kind, x,y,z, w,h,d, rot, color, label }[]}
 * 盒体局部：中心在 (x,y,z)，绕 Y 旋转 rot°，尺寸 w(沿局部X)×h(高)×d(沿局部Z)
 */
export function buildSceneBoxes(p, setupId) {
  const setup = M.setupById(p, setupId) || p.layout.setups[0];
  const { w: roomW, d: roomD } = venueSize(p);
  const H = Number(p.venue.h) > 0 ? Number(p.venue.h) : 3.0;
  const boxes = [];

  // 地板
  boxes.push({ kind: "floor", x: roomW / 2, y: 0.01, z: roomD / 2, w: roomW, h: 0.02, d: roomD, rot: 0, color: "#c8c4bb", label: "" });
  // 四墙（薄板）
  const wallT = 0.08;
  boxes.push({ kind: "wall", x: roomW / 2, y: H / 2, z: -wallT / 2, w: roomW, h: H, d: wallT, rot: 0, color: "#eceae4", label: "" });
  boxes.push({ kind: "wall", x: roomW / 2, y: H / 2, z: roomD + wallT / 2, w: roomW, h: H, d: wallT, rot: 0, color: "#e4e1da", label: "" });
  boxes.push({ kind: "wall", x: -wallT / 2, y: H / 2, z: roomD / 2, w: wallT, h: H, d: roomD, rot: 0, color: "#e8e5de", label: "" });
  boxes.push({ kind: "wall", x: roomW + wallT / 2, y: H / 2, z: roomD / 2, w: wallT, h: H, d: roomD, rot: 0, color: "#e8e5de", label: "" });

  const els = [...(p.layout.base || []), ...(setup.elements || [])];
  for (const e of els) {
    const rot = Number(e.rot) || 0;
    if (e.kind === "window") {
      const ww = Number(e.w) || 1.2, wh = 1.6;
      boxes.push({ kind: "window", x: e.x, y: 1.2, z: e.y, w: ww, h: wh, d: 0.06, rot, color: "#9ec7e8", label: "" });
    } else if (e.kind === "wall" || e.kind === "door" || e.kind === "backdrop") {
      const ww = Number(e.w) || 2, wd = Math.max(Number(e.h) || 0.1, 0.06);
      boxes.push({ kind: e.kind, x: e.x, y: H / 2, z: e.y, w: ww, h: H * 0.95, d: wd, rot, color: e.kind === "backdrop" ? "#d8d2c8" : "#3a3a36", label: "" });
    } else if (e.kind === "pillar") {
      const s = Math.max(Number(e.w) || 0.4, 0.2);
      boxes.push({ kind: "pillar", x: e.x, y: H / 2, z: e.y, w: s, h: H, d: Math.max(Number(e.h) || s, 0.2), rot, color: "#6a6860", label: "" });
    } else if (e.kind === "person") {
      const pe = e.ref && M.personById(p, e.ref);
      boxes.push({ kind: "person", x: e.x, y: 0.85, z: e.y, w: 0.45, h: 1.7, d: 0.35, rot, color: "#2c2c28", label: pe ? pe.name : "" });
    } else if (e.kind === "light") {
      boxes.push({ kind: "light", x: e.x, y: 1.8, z: e.y, w: 0.22, h: 0.35, d: 0.22, rot, color: "#f0d080", label: "" });
      const mod = e.modifierRef && M.gearByKey(p, e.modifierRef);
      if (mod) {
        const { depth, width } = M.modifierSizeM(mod);
        const rad = rot * Math.PI / 180;
        const cx = e.x + Math.cos(rad) * (depth / 2 + 0.2);
        const cz = e.y + Math.sin(rad) * (depth / 2 + 0.2);
        boxes.push({ kind: "modifier", x: cx, y: 1.8, z: cz, w: depth, h: width * 0.7, d: width, rot, color: "#8ab4d8", label: mod.model || "" });
      }
    } else if (e.kind === "board") {
      const bw = Number(e.w) || 2.4, bt = Math.max(Number(e.h) || 0.05, 0.04);
      boxes.push({ kind: "board", x: e.x, y: 1.1, z: e.y, w: bw, h: 2.0, d: bt, rot, color: "#1a1a18", label: "" });
    } else if (e.kind === "prop" || e.kind === "camera") {
      if (e.kind === "camera") continue; // 观察点本身不画机身挡视野
      const pw = Number(e.w) || 0.6, pd = Math.max(Number(e.h) || 0.6, 0.2);
      boxes.push({ kind: "prop", x: e.x, y: pd / 2, z: e.y, w: pw, h: pd, d: pd, rot, color: "#7a756c", label: "" });
    }
  }
  return boxes;
}

function boxCorners(b) {
  const hw = b.w / 2, hh = b.h / 2, hd = b.d / 2;
  const rad = (b.rot || 0) * Math.PI / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const local = [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd],
    [-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd],
  ];
  return local.map(([lx, ly, lz]) => ({
    x: b.x + lx * c - lz * s,
    y: b.y + ly,
    z: b.z + lx * s + lz * c,
  }));
}

const FACES = [
  [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5],
];

function project(pt, cam, W, H) {
  const dx = pt.x - cam.x, dy = pt.y - cam.eye, dz = pt.z - cam.z;
  const yaw = -cam.yaw * Math.PI / 180;
  const pitch = cam.pitch * Math.PI / 180;
  // yaw around Y
  let x1 = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  let z1 = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  let y1 = dy;
  // pitch around X
  const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);
  if (z2 < 0.08) return null;
  const hfov = (cam.hfovDeg * Math.PI) / 180;
  const f = (W / 2) / Math.tan(hfov / 2);
  return { x: W / 2 + (f * x1) / z2, y: H / 2 - (f * y2) / z2, z: z2 };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

/**
 * 在 canvas 上绘制机位视角。
 * cam: { x, z, yaw, pitch, eye, hfovDeg }
 */
export function drawCamView(canvas, boxes, cam) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#b8d4ea";
  ctx.fillRect(0, 0, W, H);
  // 简单地面渐变
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, "#d5d1c8");
  g.addColorStop(1, "#9e9a90");
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);

  const faces = [];
  for (const box of boxes) {
    const corners = boxCorners(box);
    for (let fi = 0; fi < FACES.length; fi++) {
      const idx = FACES[fi];
      const pts = idx.map(i => corners[i]);
      const proj = pts.map(p => project(p, cam, W, H));
      if (proj.some(p => !p)) continue;
      const zAvg = proj.reduce((a, p) => a + p.z, 0) / proj.length;
      // 面法线粗判朝向（相机空间）
      const ax = proj[1].x - proj[0].x, ay = proj[1].y - proj[0].y;
      const bx = proj[2].x - proj[0].x, by = proj[2].y - proj[0].y;
      const cross = ax * by - ay * bx;
      if (cross >= 0 && box.kind !== "floor") continue; // 背面剔除（canvas Y 向下，符号反过来）
      const shadeK = 0.55 + 0.12 * fi;
      faces.push({ proj, z: zAvg, color: shade(box.color || "#aaa", shadeK), label: box.label, kind: box.kind });
    }
  }
  faces.sort((a, b) => b.z - a.z);
  for (const f of faces) {
    ctx.beginPath();
    f.proj.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = f.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 人物标签
  for (const box of boxes) {
    if (box.kind !== "person" || !box.label) continue;
    const top = project({ x: box.x, y: box.y + box.h / 2 + 0.05, z: box.z }, cam, W, H);
    if (!top || top.z > 12) continue;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(box.label, top.x, top.y);
  }
}

/** 从布置图机位构造初始相机 */
export function cameraFromElement(camEl, focal = DEFAULT_FOCAL, eye = DEFAULT_EYE) {
  return {
    x: Number(camEl.x) || 0,
    z: Number(camEl.y) || 0,
    yaw: Number(camEl.rot) || 0,
    pitch: -4,
    eye,
    hfovDeg: hFovDeg(focal),
    focal: Number(focal) || DEFAULT_FOCAL,
  };
}

export { DEFAULT_FOCAL, DEFAULT_EYE };
