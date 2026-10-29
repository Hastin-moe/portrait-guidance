// 布置图（俯视布光图）绘制：S5 编辑器、S6 缩略图、导出共用一套。坐标单位是米。
import { s } from "./ui.js";
import * as M from "./model.js";
import { t } from "./i18n.js";

const VAR = { fg: "var(--fg)", mut: "var(--mut)", line: "var(--line)", grid: "var(--grid)", gridMajor: "var(--grid-major)", panel: "var(--panel)",
  acc: "var(--focus)", warn: "var(--y)", window: "#7fb3e6", backdrop: "#d9d3c4", soft: "var(--soft)" };
const LIT = { fg: "#1c1c1a", mut: "#74726c", line: "#cfcdc6", grid: "#ebe9e4", gridMajor: "#dad8d1", panel: "#ffffff",
  acc: "#3b6fd8", warn: "#b8860b", window: "#7fb3e6", backdrop: "#d9d3c4", soft: "#efede8" };

export function venueSize(p) {
  const w = Number(p.venue.w) > 0 ? Number(p.venue.w) : 8;
  const d = Number(p.venue.d) > 0 ? Number(p.venue.d) : 6;
  return { w, d };
}

const wedge = (x, y, rot, deg, len) => {
  const a1 = (rot - deg / 2) * Math.PI / 180, a2 = (rot + deg / 2) * Math.PI / 180;
  const large = deg > 180 ? 1 : 0;
  return `M${x} ${y} L${x + len * Math.cos(a1)} ${y + len * Math.sin(a1)} A${len} ${len} 0 ${large} 1 ${x + len * Math.cos(a2)} ${y + len * Math.sin(a2)} Z`;
};

// 标号：灯 L1…，机位 C1…（按在方案里的顺序）
export function labels(setup) {
  const out = new Map();
  let l = 0, c = 0;
  for (const e of setup ? setup.elements : []) {
    if (e.kind === "light") out.set(e.id, "L" + (++l));
    if (e.kind === "camera") out.set(e.id, "C" + (++c));
  }
  return out;
}

export function elementLabel(p, setup, e, lab = labels(setup), lang) {
  if (e.kind === "light") { const g = e.ref && M.gearByKey(p, e.ref); return lab.get(e.id) + (g ? " · " + g.model : ""); }
  if (e.kind === "camera") return lab.get(e.id) + " · " + (e.focal || 50) + "mm";
  if (e.kind === "person") { const ps = e.ref && M.personById(p, e.ref); return ps ? ps.name : t("el.person", null, lang); }
  if (e.kind === "mark") {
    const ps = M.personById(p, e.personId || e.ref);
    const base = ps ? ps.name : t("el.mark", null, lang);
    return e.label ? `${base} · ${e.label}` : base + " · " + t("el.mark", null, lang);
  }
  if (e.kind === "prop") { const pr = e.ref && p.props.find(x => x.id === e.ref); return pr ? pr.name : t("el.prop", null, lang); }
  if (e.kind === "board") { const g = e.ref && M.gearByKey(p, e.ref); return g ? (g.model || t("el.board", null, lang)) : t("el.board", null, lang); }
  if (e.kind === "text") return e.label || "";
  return t("el." + e.kind, null, lang);
}

const polar = (cx, cy, deg, r) => {
  const a = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

/** 量角器扇形：从被摄者朝向扫到目标（存储系 SVG，顺时针为正） */
function protractorPath(from, to, headingStorage, r) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return null;
  const radius = r ?? Math.min(1.15, Math.max(0.4, d * 0.38));
  const a0 = Number(headingStorage) || 0;
  let a1 = Math.atan2(dy, dx) * 180 / Math.PI;
  let sweep = a1 - a0;
  while (sweep > 180) sweep -= 360;
  while (sweep <= -180) sweep += 360;
  a1 = a0 + sweep;
  const p0 = polar(from.x, from.y, a0, radius);
  const p1 = polar(from.x, from.y, a1, radius);
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const sweepFlag = sweep >= 0 ? 1 : 0; // SVG y↓ 顺时针 = 1
  return {
    radius, a0, a1, sweep,
    tip: polar(from.x, from.y, a0, radius + 0.18),
    mid: polar(from.x, from.y, a0 + sweep / 2, radius * 0.72),
    d: `M${from.x} ${from.y} L${p0.x} ${p0.y} A${radius} ${radius} 0 ${large} ${sweepFlag} ${p1.x} ${p1.y} Z`,
  };
}

/** 清空并重画关系叠加层（距离线 + 量角器弧）；拖动时也可调用 */
export function paintRelationLayer(svg, arcs = [], distances = [], opts = {}) {
  const C = opts.literal ? LIT : VAR;
  let g = svg.querySelector("g[data-rel-layer]");
  if (!g) {
    g = s("g", { "data-rel-layer": "1", "pointer-events": "none" });
    svg.append(g);
  }
  while (g.firstChild) g.removeChild(g.firstChild);
  for (const dd of distances || []) {
    const mx = (dd.from.x + dd.to.x) / 2, my = (dd.from.y + dd.to.y) / 2;
    g.append(s("line", { x1: dd.from.x, y1: dd.from.y, x2: dd.to.x, y2: dd.to.y, stroke: C.acc, "stroke-width": 0.025, "stroke-dasharray": "0.1 0.06" }));
    g.append(s("text", { x: mx, y: my - 0.08, "font-size": 0.22, fill: C.acc, "text-anchor": "middle", "font-weight": 600 }, (dd.d ?? 0).toFixed(1) + " m"));
  }
  for (const arc of arcs || []) {
    const geo = protractorPath(arc.from, arc.to, arc.headingStorage);
    if (!geo || Math.abs(geo.sweep) < 1e-3) continue;
    g.append(s("path", { d: geo.d, fill: C.acc, opacity: 0.14 }));
    g.append(s("line", {
      x1: arc.from.x, y1: arc.from.y,
      x2: geo.tip.x, y2: geo.tip.y,
      stroke: C.acc, "stroke-width": 0.02, "stroke-dasharray": "0.06 0.04",
    }));
    const bits = [];
    if (arc.label) bits.push(arc.label);
    bits.push(`${arc.alphaDeg}°`);
    if (arc.sideLabel) bits.push(arc.sideLabel);
    if (arc.keyLabel) bits.push(arc.keyLabel);
    if (arc.viewLabelText) bits.push(arc.viewLabelText);
    if (arc.elevDeg != null) bits.push(`β ${arc.elevDeg}°`);
    g.append(s("text", {
      x: geo.mid.x, y: geo.mid.y, "font-size": 0.2, fill: C.acc,
      "text-anchor": "middle", "font-weight": 600,
    }, bits.join(" · ")));
  }
  return g;
}

/**
 * opts: { literal, selectedId, highlight, grid, labels, legend, distances, arcs, pad, underlayUrl }
 */
export function renderLayout(p, setupId, opts = {}) {
  const C = opts.literal ? LIT : VAR;
  const { w, d } = venueSize(p);
  const pad = opts.pad ?? 0.6;
  const legendH = opts.legend ? 0.9 : 0;
  const svg = s("svg", { viewBox: `${-pad} ${-pad} ${w + pad * 2} ${d + pad * 2 + legendH}`, xmlns: "http://www.w3.org/2000/svg",
    preserveAspectRatio: "xMidYMid meet", "font-family": "-apple-system, 'PingFang SC', 'Hiragino Sans', 'Apple SD Gothic Neo', sans-serif" });
  const setup = M.setupById(p, setupId);
  const lab = labels(setup);
  const hl = opts.highlight || null;
  const dim = id => hl && !(hl.cameraId === id || (hl.lightIds && hl.lightIds.has(id)));

  svg.append(s("rect", { x: 0, y: 0, width: w, height: d, fill: C.panel, stroke: C.line, "stroke-width": 0.03 }));
  const u = p.layout.underlay;
  if (u && u.file && opts.underlayUrl) {
    svg.append(s("image", { href: opts.underlayUrl(u.file), x: u.x || 0, y: u.y || 0, width: u.wm || w, opacity: u.opacity ?? 0.5, preserveAspectRatio: "xMinYMin meet", "data-underlay": "1" }));
  }
  if (opts.grid !== false) {
    const step = Number(opts.gridM) || 0.5;
    const g = s("g", { "pointer-events": "none" });
    for (let x = 0; x <= w + 1e-6; x += step) g.append(s("line", { x1: x, y1: 0, x2: x, y2: d, stroke: Math.abs(x % 1) < 1e-6 ? C.gridMajor : C.grid, "stroke-width": 0.012 }));
    for (let y = 0; y <= d + 1e-6; y += step) g.append(s("line", { x1: 0, y1: y, x2: w, y2: y, stroke: Math.abs(y % 1) < 1e-6 ? C.gridMajor : C.grid, "stroke-width": 0.012 }));
    svg.append(g);
    if (opts.rulers !== false) {
      // 标尺显示棚左下角系：X 同存储；Y 标成 venue.d − y_storage
      for (let x = 0; x <= w + 1e-6; x += 1) svg.append(s("text", { x, y: -0.15, "font-size": 0.18, fill: C.mut, "text-anchor": "middle" }, x + (x === 0 ? " m" : "")));
      for (let y = 0; y <= d + 1e-6; y += 1) {
        const yDisp = Math.round((d - y) * 1000) / 1000;
        svg.append(s("text", { x: -0.15, y: y + 0.06, "font-size": 0.18, fill: C.mut, "text-anchor": "end" }, yDisp));
      }
    }
  }
  const layer = s("g", {});
  const els = [...p.layout.base.map(e => ({ e, base: true })), ...(setup ? setup.elements : []).map(e => ({ e, base: false }))];
  // 先画光束和视角，再画实体，避免遮挡
  for (const { e } of els) {
    if (e.kind === "light") {
      // T23：修饰器画在灯前；光束从修饰器开口发出（无修饰器则从灯心）
      const mod = e.modifierRef && M.gearByKey(p, e.modifierRef);
      const rad = (e.rot || 0) * Math.PI / 180;
      let bx = e.x, by = e.y;
      if (mod) {
        const { depth, width } = M.modifierSizeM(mod);
        const cx = e.x + Math.cos(rad) * (depth / 2 + 0.22);
        const cy = e.y + Math.sin(rad) * (depth / 2 + 0.22);
        bx = e.x + Math.cos(rad) * (depth + 0.22);
        by = e.y + Math.sin(rad) * (depth + 0.22);
        const g = s("g", { transform: `translate(${cx} ${cy}) rotate(${e.rot || 0})`, "pointer-events": "none", opacity: dim(e.id) ? 0.25 : 0.9 });
        g.append(s("rect", { x: -depth / 2, y: -width / 2, width: depth, height: width, fill: C.panel, stroke: C.acc, "stroke-width": 0.035 }));
        layer.append(g);
      }
      layer.append(s("path", { d: wedge(bx, by, e.rot || 0, Number(e.beam) || 60, 1.6), fill: e.ref ? C.acc : C.warn, opacity: dim(e.id) ? 0.04 : 0.13, "pointer-events": "none" }));
    }
    if (e.kind === "camera") layer.append(s("path", { d: wedge(e.x, e.y, e.rot || 0, M.fovDeg(e.focal), 2.4), fill: "none", stroke: C.fg, "stroke-width": 0.02, "stroke-dasharray": "0.08 0.06", opacity: dim(e.id) ? 0.15 : 0.7, "pointer-events": "none" }));
  }
  for (const { e, base } of els) {
    const sel = opts.selectedId === e.id;
    const g = s("g", { transform: `translate(${e.x} ${e.y}) rotate(${e.rot || 0})`, "data-id": e.id, "data-base": base ? "1" : "", class: "el", opacity: dim(e.id) ? 0.35 : 1, cursor: opts.editable ? "move" : null });
    const selStroke = sel ? { stroke: C.acc, "stroke-width": 0.06 } : null;
    const rect = (fill, extra = {}) => s("rect", { x: -(e.w || 0.5) / 2, y: -(e.h || 0.5) / 2, width: e.w || 0.5, height: e.h || 0.5, fill, ...extra, ...(selStroke || {}) });
    switch (e.kind) {
      case "wall": g.append(rect(C.fg)); break;
      case "window": g.append(rect(C.window, { stroke: C.fg, "stroke-width": 0.02 })); break;
      case "door":
        g.append(rect(C.panel, { stroke: C.fg, "stroke-width": 0.02 }));
        g.append(s("path", { d: `M${-(e.w || .9) / 2} 0 A${e.w || .9} ${e.w || .9} 0 0 1 ${(e.w || .9) / 2} ${e.w || .9}`, fill: "none", stroke: C.mut, "stroke-width": 0.015, "stroke-dasharray": "0.05 0.04" })); break;
      case "pillar": g.append(rect(C.mut)); break;
      case "backdrop": g.append(rect(C.backdrop, { stroke: C.fg, "stroke-width": 0.02 })); break;
      case "prop": g.append(rect(C.soft, { stroke: e.ref ? C.fg : C.warn, "stroke-width": 0.03, "stroke-dasharray": "0.08 0.05" })); break;
      case "board": {
        const gear = e.ref && M.gearByKey(p, e.ref);
        const sz = M.boardSizeM(gear);
        const bw = e.w || sz.w, bh = e.h || sz.h;
        g.append(s("rect", { x: -bw / 2, y: -bh / 2, width: bw, height: bh, fill: "#111", stroke: "#fff", "stroke-width": sel ? 0.05 : 0.03 }));
        break;
      }
      case "light":
        g.append(s("circle", { r: 0.2, fill: C.panel, stroke: e.ref ? C.acc : C.warn, "stroke-width": sel ? 0.07 : 0.05 }));
        g.append(s("path", { d: "M0.2 -0.09 L0.34 0 L0.2 0.09 Z", fill: e.ref ? C.acc : C.warn })); break;
      case "camera":
        g.append(s("rect", { x: -0.2, y: -0.14, width: 0.32, height: 0.28, rx: 0.04, fill: C.fg, ...(selStroke || {}) }));
        g.append(s("rect", { x: 0.12, y: -0.08, width: 0.12, height: 0.16, fill: C.fg })); break;
      case "person":
        g.append(s("circle", { r: 0.22, fill: C.fg, ...(selStroke || {}) }));
        g.append(s("path", { d: "M0.2 -0.07 L0.32 0 L0.2 0.07 Z", fill: C.fg })); break;
      case "mark":
        g.append(s("circle", { r: 0.18, fill: "none", stroke: C.acc, "stroke-width": sel ? 0.06 : 0.04 }));
        g.append(s("circle", { r: 0.06, fill: C.acc }));
        g.append(s("path", { d: "M0.16 -0.06 L0.28 0 L0.16 0.06 Z", fill: C.acc })); break;
      case "text":
        g.append(s("text", { "font-size": 0.26, fill: C.fg, "text-anchor": "middle", y: 0.09 }, e.label || t("el.text", null, opts.lang)));
        if (sel) g.append(s("rect", { x: -0.6, y: -0.2, width: 1.2, height: 0.4, fill: "none", stroke: C.acc, "stroke-width": 0.03 })); break;
    }
    // 命中区域：细长的墙和窗也容易点中
    if (opts.editable) g.append(s("rect", { x: -Math.max(e.w || 0.5, 0.5) / 2, y: -Math.max(e.h || 0.5, 0.5) / 2, width: Math.max(e.w || 0.5, 0.5), height: Math.max(e.h || 0.5, 0.5), fill: "transparent" }));
    layer.append(g);
    if (opts.labels !== false && (e.kind === "light" || e.kind === "camera" || e.kind === "person" || e.kind === "mark" || e.kind === "prop" || e.kind === "board")) {
      const txt = e.kind === "light" || e.kind === "camera" ? lab.get(e.id) : elementLabel(p, setup, e, lab, opts.lang);
      let lx = e.x, ly = e.y + 0.48, anchor = "middle";
      if (e.kind === "board") {
        // 吸光板标签放在长边外侧，不压在板上，也不挤到旁边灯的标签（T11-B6）
        const gear = e.ref && M.gearByKey(p, e.ref), sz = M.boardSizeM(gear);
        const bh = e.h || sz.h, rad = (Number(e.rot) || 0) * Math.PI / 180;
        let nx = -Math.sin(rad), ny = Math.cos(rad);
        if (ny < -0.01 || (Math.abs(ny) <= 0.01 && nx < 0)) { nx = -nx; ny = -ny; }   // 统一朝右下
        const off = bh / 2 + 0.16;
        lx = e.x + nx * off; ly = e.y + ny * off + (Math.abs(ny) > 0.7 ? 0.16 : 0.07);
        anchor = Math.abs(nx) > 0.7 ? "start" : "middle";
      }
      layer.append(s("text", { x: lx, y: ly, "font-size": 0.2, fill: (e.kind === "light" || e.kind === "board") && !e.ref ? C.warn : C.fg, "text-anchor": anchor, opacity: dim(e.id) ? 0.35 : 1, "pointer-events": "none" }, txt));
    }
  }
  svg.append(layer);
  // T24：距离线 + 量角器弧
  paintRelationLayer(svg, opts.arcs || [], opts.distances || [], opts);
  if (opts.legend && setup) {
    const y = d + pad * 0.6 + 0.3;
    const items = setup.elements.filter(e => e.kind === "light" || e.kind === "camera" || e.kind === "board").map(e => {
      let s = elementLabel(p, setup, e, lab, opts.lang);
      if (e.kind === "light") {
        const mod = e.modifierRef && M.gearByKey(p, e.modifierRef);
        if (mod) s += " · " + (mod.model || "");
        else if (e.modifier) s += " · " + e.modifier;
      }
      return s;
    });
    svg.append(s("text", { x: 0, y, "font-size": 0.22, fill: C.fg }, `${t("layout.setup", null, opts.lang)} ${setup.name}: ` + items.join("   ")));
  }
  return svg;
}

// 导出 PNG（带图例和距离标注）
export async function svgToPng(svg, widthPx = 1800) {
  const vb = svg.getAttribute("viewBox").split(" ").map(Number);
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", widthPx);
  clone.setAttribute("height", Math.round(widthPx * vb[3] / vb[2]));
  // 内嵌底图，避免跨文档引用丢失
  for (const img of clone.querySelectorAll("image")) {
    try {
      const b = await (await fetch(img.getAttribute("href"))).blob();
      img.setAttribute("href", await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }));
    } catch { img.remove(); }
  }
  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const im = new Image();
  await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(im, 0, 0);
  return await new Promise(r => cv.toBlob(r, "image/png"));
}
