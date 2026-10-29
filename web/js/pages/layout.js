// S5 布置图：等比网格画布、图元、底图与比例尺标定、多套布光方案、距离、导出 PNG（F15–F22）
import { h, menu, promptDlg, confirmDlg, pickFiles, toast, download, isTyping } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, uploadImages, readonly } from "../store.js";
import * as M from "../model.js";
import { renderLayout, venueSize, labels, elementLabel, svgToPng, paintRelationLayer } from "../canvas.js";
import { inp, fld, sel, issuesList, emptyState, chip } from "./common.js";
import { openCamView3d } from "./camview.js";
import { ratiosFor, annotate, summaryPanel, readingBlock } from "./expanel.js";
import { editShell, editForm } from "../editlayer.js";
import { catalogCache, loadCatalogs } from "../gear-presets.js";

const ARCH = ["wall", "window", "door", "pillar", "text"];
const SET = ["backdrop", "light", "camera", "person", "prop", "board"];
const ICON = { wall: "▬", window: "▭", door: "◜", pillar: "■", text: "T", backdrop: "▤", light: "◉", camera: "◧", person: "●", prop: "◇", board: "▮" };

// 按住空格拖动 = 平移画布
let spaceDown = false;
addEventListener("keydown", e => { if (e.code === "Space" && !isTyping(e) && /\/(layout|ex)$/.test(location.hash)) { spaceDown = true; e.preventDefault(); } });
addEventListener("keyup", e => { if (e.code === "Space") spaceDown = false; });

function findEl(p, id) {
  const b = p.layout.base.find(e => e.id === id);
  if (b) return { e: b, list: p.layout.base, base: true };
  for (const s of p.layout.setups) { const e = s.elements.find(x => x.id === id); if (e) return { e, list: s.elements, setup: s }; }
  return null;
}

function svgPoint(svg, x, y) {
  const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/** 画布弧标签：棚坐标左右 / 光位名 / 景别（已本地化） */
function decorateArcs(arcs) {
  return (arcs || []).map(a => ({
    ...a,
    sideLabel: a.side ? t("layout.side." + a.side) : "",
    keyLabel: a.keyName ? t("layout.key." + a.keyName) : "",
    viewLabelText: a.viewLabel ? t("layout.view." + a.viewLabel) : "",
  }));
}

function relationPack(p, setupId, focusId, overrides = null) {
  const pack = M.relationArcs(p, setupId, focusId, overrides);
  return { ...pack, arcs: decorateArcs(pack.arcs) };
}

export function render(ctx) { return renderLayoutPage(ctx, "plan"); }

/**
 * 布置图页面。mode = "plan"：S6 场地图；mode = "ex"：EX 光比。
 * 两种模式编辑的是同一份 project.layout，所以改灯位两边自动同步；只是画布标注和右侧面板不同。
 */
export function renderLayoutPage(ctx, mode = "plan") {
  const p = S.project, st = ctx.state, ro = readonly();
  const isEx = mode === "ex";
  if (st.setup && M.setupById(p, st.setup)) { p.layout.activeSetup = st.setup; st.setup = null; }
  const setup = M.setupById(p, p.layout.activeSetup) || p.layout.setups[0];
  const grid = Number(S.settings.gridM) || 0.5;
  const { w, d } = venueSize(p);
  const hasSize = Number(p.venue.w) > 0 && Number(p.venue.d) > 0;
  if (!hasSize) {
    return { main: h("div", h("h2.pt", t(isEx ? "step.ex" : "step.layout")), emptyState(t("layout.needSize"), t("layout.needSizeBody"), h("button.primary", { onclick: () => ctx.go("site") }, t("layout.goVenue")))), panel: null };
  }
  if (ctx.edit?.kind === "element") return renderElementEdit(ctx, mode, setup);

  const addAt = (kind, x, y, ref = "") => {
    if (ro) return toast(t("final.locked"));
    const e = M.newElement(kind, Math.round(x / (grid / 2)) * (grid / 2), Math.round(y / (grid / 2)) * (grid / 2));
    if (ref) e.ref = ref;
    if (kind === "camera") { e.rot = 180; }
    if (kind === "board" && ref) {
      const sz = M.boardSizeM(M.gearByKey(p, ref));
      e.w = sz.w; e.h = sz.h;
    }
    commit(q => { (M.BASE_KINDS.has(kind) ? q.layout.base : M.setupById(q, setup.id).elements).push(e); });
    st.selected = e.id; ctx.rerender();
  };

  // ---------- 画布 ----------
  const stage = h("div.stage" + (st.calib ? ".calibrating" : ""));
  const rel0 = st.selected ? relationPack(p, setup.id, st.selected) : { distances: [], arcs: [] };
  const svg = renderLayout(p, setup.id, { editable: true, selectedId: st.selected, underlayUrl: fileUrl, gridM: grid,
    distances: rel0.distances, arcs: rel0.arcs });
  if (st.vb) svg.setAttribute("viewBox", st.vb.join(" "));
  const res = isEx ? ratiosFor(p, setup, ctx.rerender) : null;
  if (isEx) annotate(svg, res);
  stage.append(svg);
  const refreshRel = (overrides = null) => {
    if (!st.selected) { paintRelationLayer(svg, [], [], {}); return; }
    const pack = relationPack(p, setup.id, st.selected, overrides);
    paintRelationLayer(svg, pack.arcs, pack.distances, {});
  };
  // T23 快捷条：选中后出现在画布下方
  if (st.selected && !ro) {
    const sel = findEl(p, st.selected);
    if (sel) {
      stage.append(h("div.quickbar",
        h("span.small.mut", t("el." + sel.e.kind)),
        h("button.sm", { onclick: () => commit(q => { const g = findEl(q, sel.e.id).e; g.rot = M.snapDeg15((g.rot || 0) - 15); }) }, "↺ 15°"),
        h("button.sm", { onclick: () => commit(q => { const g = findEl(q, sel.e.id).e; g.rot = M.snapDeg15((g.rot || 0) + 15); }) }, "↻ 15°"),
        h("button.sm", { onclick: () => dup(sel.e.id) }, t("common.duplicate")),
        h("button.sm.danger", { onclick: () => del(sel.e.id) }, t("common.delete")),
        h("button.sm.primary", { onclick: () => ctx.openEdit("element", sel.e.id) }, t("layout.editMore"))));
    }
  }
  let drag = null, pan = null;

  svg.addEventListener("pointerdown", ev => {
    const pt = svgPoint(svg, ev.clientX, ev.clientY);
    if (st.calib) {                                       // 比例尺标定：在底图上点两下
      st.calib.pts.push(pt);
      if (st.calib.pts.length === 2) finishCalib(); else { toast(t("layout.calib2")); }
      return;
    }
    const g = ev.target.closest("g.el");
    if (!g || spaceDown || ev.button === 1) {               // 空白处拖动 = 平移；单击空白 = 取消选择
      pan = { x: ev.clientX, y: ev.clientY, vb: svg.getAttribute("viewBox").split(" ").map(Number), moved: false, clear: !g };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    const id = g.dataset.id, f = findEl(p, id);
    if (!f) return;
    if (st.selected !== id) { st.selected = id; }
    if (ev.detail === 2) { // 双击进二级编辑
      drag = null;
      ctx.openEdit("element", id);
      return;
    }
    if (ro) { ctx.rerender(); return; }
    drag = { id, g, sx: pt.x, sy: pt.y, ox: f.e.x, oy: f.e.y, nx: f.e.x, ny: f.e.y, moved: false };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", ev => {
    if (drag) {
      const pt = svgPoint(svg, ev.clientX, ev.clientY);
      const snap = ev.altKey ? 0.01 : grid / 2;
      drag.nx = Math.round((drag.ox + pt.x - drag.sx) / snap) * snap;
      drag.ny = Math.round((drag.oy + pt.y - drag.sy) / snap) * snap;
      drag.nx = Math.max(-0.5, Math.min(w + 0.5, drag.nx)); drag.ny = Math.max(-0.5, Math.min(d + 0.5, drag.ny));
      if (Math.abs(drag.nx - drag.ox) + Math.abs(drag.ny - drag.oy) > 0) drag.moved = true;
      const e = findEl(p, drag.id).e;
      drag.g.setAttribute("transform", `translate(${drag.nx} ${drag.ny}) rotate(${e.rot || 0})`);
      refreshRel({ [drag.id]: { x: drag.nx, y: drag.ny } });
    } else if (pan) {
      const r = svg.getBoundingClientRect();
      const k = pan.vb[2] / r.width;
      if (Math.abs(ev.clientX - pan.x) + Math.abs(ev.clientY - pan.y) < 3 && !pan.moved) return;
      pan.moved = true;
      const vb = [pan.vb[0] - (ev.clientX - pan.x) * k, pan.vb[1] - (ev.clientY - pan.y) * k, pan.vb[2], pan.vb[3]];
      svg.setAttribute("viewBox", vb.join(" ")); st.vb = vb;
    }
  });
  svg.addEventListener("pointerup", () => {
    if (drag) {
      const dd = drag; drag = null;
      if (dd.moved) commit(q => { const e = findEl(q, dd.id).e; e.x = +dd.nx.toFixed(3); e.y = +dd.ny.toFixed(3); });
      else ctx.rerender();
    }
    if (pan && !pan.moved && pan.clear && st.selected) { st.selected = null; ctx.rerender(); }
    pan = null;
  });
  svg.addEventListener("wheel", ev => {
    ev.preventDefault();
    const vb = svg.getAttribute("viewBox").split(" ").map(Number);
    const pt = svgPoint(svg, ev.clientX, ev.clientY);
    const k = Math.exp(ev.deltaY * 0.0015);
    const nw = Math.max(1.5, Math.min(80, vb[2] * k)), nh = vb[3] * nw / vb[2];
    const nvb = [pt.x - (pt.x - vb[0]) * nw / vb[2], pt.y - (pt.y - vb[1]) * nh / vb[3], nw, nh];
    svg.setAttribute("viewBox", nvb.join(" ")); st.vb = nvb;
    const z = document.querySelector("[data-zoom]"); if (z) z.textContent = Math.round(100 * (w + 1.2) / nw) + "%";
  }, { passive: false });
  // 从清单拖入画布：灯具、人物、道具自动绑定条目
  stage.addEventListener("dragover", ev => { if (ev.dataTransfer.types.includes("text/x-pg")) ev.preventDefault(); });
  stage.addEventListener("drop", ev => {
    const raw = ev.dataTransfer.getData("text/x-pg");
    if (!raw) return;
    ev.preventDefault();
    const { kind, ref } = JSON.parse(raw);
    const pt = svgPoint(svg, ev.clientX, ev.clientY);
    addAt(kind, pt.x, pt.y, ref);
  });

  async function finishCalib() {
    const [a, b] = st.calib.pts; st.calib = null;
    const measured = Math.hypot(a.x - b.x, a.y - b.y);
    const real = await promptDlg(t("layout.calibTitle"), { help: t("layout.calibHelp", { m: measured.toFixed(2) }), placeholder: "3.0" });
    const r = Number(String(real || "").replace(",", "."));
    if (!(r > 0) || !(measured > 0)) { ctx.rerender(); return; }
    commit(q => { const u = q.layout.underlay; u.wm = (u.wm || w) * r / measured; });
    toast(t("layout.calibDone"));
  }

  // ---------- 布光方案标签 ----------
  const setupTabs = h("div.setups", h("span.small.mut", t("layout.setups") + "："),
    p.layout.setups.map(s => h("button.sm" + (s.id === setup.id ? ".on" : ""), {
      onclick: () => { commit(q => { q.layout.activeSetup = s.id; }, { force: true }); },
      ondblclick: async () => { if (ro) return; const n = await promptDlg(t("layout.renameSetup"), { value: s.name }); if (n) commit(q => { M.setupById(q, s.id).name = n.trim(); }); },
      title: t("layout.setupTip") }, `${t("layout.setup")} ${s.name}`, h("span.small.mut", ` · ${s.elements.length}`))),
    h("button.sm.ghost", { disabled: ro || null, onclick: async () => {
      const n = await promptDlg(t("layout.newSetup"), { value: String.fromCharCode(65 + p.layout.setups.length) }); if (!n) return;
      const id = M.uid(); commit(q => { q.layout.setups.push({ id, name: n.trim(), elements: [], ex: { subjectId: "", keyId: "", iso: 100 } }); q.layout.activeSetup = id; });
    } }, "＋"),
    h("button.sm.ghost", { title: t("layout.more"), onclick: e => menu(e.currentTarget, [
      { value: "dup", label: t("layout.dupSetup"), disabled: ro },
      { value: "rename", label: t("layout.renameSetup"), disabled: ro },
      { value: "compare", label: st.compare ? t("layout.compareOff") : t("layout.compare"), disabled: p.layout.setups.length < 2 },
      { value: "del", label: t("layout.delSetup"), disabled: ro || p.layout.setups.length < 2 },
    ], { onPick: async v => {
      if (v === "dup") { const id = M.uid(); commit(q => { const src = M.setupById(q, setup.id); q.layout.setups.push({ id, name: src.name + "′", elements: src.elements.map(e => ({ ...e, id: M.uid() })), ex: { subjectId: "", keyId: "", iso: (src.ex || {}).iso || 100 } }); q.layout.activeSetup = id; }); }
      if (v === "rename") { const n = await promptDlg(t("layout.renameSetup"), { value: setup.name }); if (n) commit(q => { M.setupById(q, setup.id).name = n.trim(); }); }
      if (v === "compare") { st.compare = !st.compare; ctx.rerender(); }
      if (v === "del") {
        const used = p.scenes.filter(s => s.setupId === setup.id).length + p.shots.filter(s => s.setupId === setup.id).length;
        if (!await confirmDlg(t("layout.delSetup"), used ? t("ref.affects", { n: used }) : t("layout.delSetupBody"), { danger: true, ok: t("common.delete") })) return;
        commit(q => { q.layout.setups = q.layout.setups.filter(s => s.id !== setup.id); q.layout.activeSetup = q.layout.setups[0].id;
          for (const s of [...q.scenes, ...q.shots]) if (s.setupId === setup.id) { s.setupId = ""; s.cameraId = ""; } });
      }
    } }) }, "⋯"));

  // ---------- 左侧图元面板 ----------
  const center = () => { const vb = svg.getAttribute("viewBox").split(" ").map(Number); return [Math.min(w, Math.max(0, vb[0] + vb[2] / 2)), Math.min(d, Math.max(0, vb[1] + vb[3] / 2))]; };
  const dragItem = (label, kind, ref, sub) => h("button.bindable", { draggable: "true", disabled: ro || null, title: t("layout.dragHint"),
    ondragstart: ev => { ev.dataTransfer.setData("text/x-pg", JSON.stringify({ kind, ref })); ev.dataTransfer.effectAllowed = "copy"; },
    onclick: () => addAt(kind, ...center(), ref) }, h("span", ICON[kind]), h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, label), sub ? h("span.small.mut", sub) : null);
  const usage = M.gearUsage(p, setup.id);
  const lights = M.gearList(p).filter(g => g.type === "light");
  const boards = M.gearList(p).filter(g => g.type === "absorb");
  const palette = h("div.palette",
    h("div.hd", t("layout.arch")),
    ARCH.map(k => h("button", { disabled: ro || null, onclick: () => addAt(k, ...center()) }, h("span", ICON[k]), t("el." + k))),
    h("div.hd", t("layout.inSetup")),
    SET.map(k => h("button", { disabled: ro || null, onclick: () => addAt(k, ...center()) }, h("span", ICON[k]), t("el." + k))),
    lights.length ? h("div.hd", t("layout.fromGear")) : null,
    lights.map(g => dragItem(g.model || t("gear.type.light"), "light", g.key, `${usage.get(g.key) || 0}/${g.qty || 0}`)),
    boards.length ? h("div.hd", t("layout.fromAbsorb")) : null,
    boards.map(g => dragItem(g.model || t("gear.type.absorb"), "board", g.key, `${usage.get(g.key) || 0}/${g.qty || 0}`)),
    M.models(p).length ? h("div.hd", t("layout.fromPeople")) : null,
    M.models(p).map(m => dragItem(m.name, "person", m.id)),
    p.props.length ? h("div.hd", t("layout.fromProps")) : null,
    p.props.map(x => dragItem(x.name || "—", "prop", x.id)));

  const u = p.layout.underlay;
  const foot = h("div.canvas-foot",
    h("span", t("layout.scale", { g: grid })), h("span", { "data-zoom": "" }, st.vb ? Math.round(100 * (w + 1.2) / st.vb[2]) + "%" : "100%"),
    h("button.sm.ghost", { onclick: () => { st.vb = null; ctx.rerender(); } }, t("layout.fit")),
    h("span.spacer"),
    h("span.small", t("layout.keys")),
    h("button.sm", { onclick: async () => {
      const ex = renderLayout(p, setup.id, { literal: true, legend: true, underlayUrl: fileUrl, gridM: grid });
      document.body.append(ex); ex.style.position = "absolute"; ex.style.left = "-9999px";
      const blob = await svgToPng(ex); ex.remove();
      download(`${p.name || "layout"}-${t("layout.setup")}${setup.name}.png`, blob);
    } }, t("layout.exportPng")),
    h("button.sm", { disabled: true, title: t("common.deferred") }, "✦ " + t("layout.aiImage")),
    h("button.sm", { disabled: true, title: t("common.deferred") }, "✦ " + t("layout.textToLayout")));

  let canvasArea;
  if (st.compare && p.layout.setups.length > 1) {
    const other = p.layout.setups.find(s => s.id === (st.compareWith || "")) || p.layout.setups.find(s => s.id !== setup.id);
    canvasArea = h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", flex: 1, minHeight: 0 } },
      h("div.canvas-col", h("div.small", h("b", t("layout.setup") + " " + setup.name)), h("div.stage", renderLayout(p, setup.id, { underlayUrl: fileUrl, gridM: grid }))),
      h("div.canvas-col", h("div.small", sel(p.layout.setups.filter(s => s.id !== setup.id).map(s => [s.id, t("layout.setup") + " " + s.name]), other.id, v => { st.compareWith = v; ctx.rerender(); }, { allowEmpty: false })),
        h("div.stage", renderLayout(p, other.id, { underlayUrl: fileUrl, gridM: grid }))));
  } else canvasArea = stage;

  const main = h("div",
    h("div.row", h("h2.pt", { style: { margin: 0 } }, t(isEx ? "step.ex" : "step.layout")), h("span.spacer"),
      isEx ? h("button.sm.ghost", { onclick: () => ctx.go("layout") }, t("lr.openPlan")) : null,
      h("span.small.mut", `${w} × ${d} m`)),
    isEx ? h("p.sub", { style: { margin: "4px 0 0" } }, t("lr.sub")) : null,
    h("div", { style: { height: "8px" } }),
    h("div.layout-wrap", palette, h("div.canvas-col", setupTabs, canvasArea, foot)));

  // ---------- 右侧属性 ----------
  const f = st.selected && findEl(p, st.selected);
  let panel;
  if (f) {
    const e = f.e;
    const upd = (k, type) => inp(() => e[k], (q, v) => { findEl(q, e.id).e[k] = v; }, { type, step: type === "number" ? (k === "rot" ? 15 : 0.1) : null });
    const lab = labels(f.setup || setup);
    const bindOpts = e.kind === "light" ? M.gearList(p).filter(g => g.type === "light").map(g => [g.key, `${g.model || t("gear.type." + g.type)} (${t("gear.src." + g.source)})`])
      : e.kind === "board" ? M.gearList(p).filter(g => g.type === "absorb").map(g => [g.key, `${g.model || t("gear.type.absorb")} (${t("gear.src." + g.source)})`])
      : e.kind === "person" ? M.models(p).map(m => [m.id, m.name]) : e.kind === "prop" ? p.props.map(x => [x.id, x.name || "—"]) : null;
    const modOpts = M.gearList(p).filter(g => g.type === "modifier").map(g => [g.key, g.model || t("gear.type.modifier")]);
    const pack = relationPack(p, setup.id, e.id);
    const used = e.kind === "camera" ? p.scenes.filter(s => s.cameraId === e.id).length + p.shots.filter(s => s.cameraId === e.id).length : 0;
    // 属性面板 X/Y/朝向：棚左下角显示系（§9.2 #10 / §9.4）
    const disp = M.toDisplayXY(p.venue, e.x, e.y);
    const dispRot = M.toDisplayRot(e.rot || 0);
    const setPanelXY = (axis) => h("input", {
      type: "number", step: 0.1, disabled: ro || null, value: axis === "x" ? disp.x : disp.y,
      onchange: ev => {
        const v = Number(ev.target.value);
        const cur = M.toDisplayXY(p.venue, e.x, e.y);
        if (axis === "x") cur.x = v; else cur.y = v;
        const stg = M.fromDisplayXY(p.venue, cur.x, cur.y);
        commit(q => { const el = findEl(q, e.id).e; el.x = +stg.x.toFixed(3); el.y = +stg.y.toFixed(3); });
      },
    });
    const setPanelRot = () => h("input", {
      type: "number", step: 15, disabled: ro || null, value: dispRot,
      onchange: ev => commit(q => { findEl(q, e.id).e.rot = M.fromDisplayRot(M.snapDeg15(ev.target.value)); }),
    });
    const relLines = (() => {
      const rel = pack.rel;
      if (!rel?.subject) return null;
      const lines = [];
      if (e.kind === "light") {
        const L = rel.lights.find(x => x.lightId === e.id);
        if (L) lines.push(M.formatLightHud(L, t("layout.side." + L.side), t("layout.key." + L.keyName)));
      } else if (e.kind === "camera" && rel.camera) {
        const C = rel.camera;
        lines.push(`${C.label} · ${C.dXY.toFixed(2)} m · ${C.azDeg}°（${t("layout.side." + C.side)}）· ${t("layout.view." + C.viewLabel)} ${C.alphaDeg}°`);
      } else if (e.kind === "person" || e.kind === "mark") {
        for (const L of rel.lights) lines.push(M.formatLightHud(L, t("layout.side." + L.side), t("layout.key." + L.keyName)));
        if (rel.camera) {
          const C = rel.camera;
          lines.push(`${C.label} · ${C.dXY.toFixed(2)} m · ${t("layout.view." + C.viewLabel)} ${C.alphaDeg}°（${t("layout.side." + C.side)}）`);
        }
        if (rel.backdrop) lines.push(`${t("dist.personBackdrop")} · ${rel.backdrop.dMin.toFixed(2)} m · ${t("layout.side." + rel.backdrop.side)}`);
        if (rel.window) lines.push(`${t("dist.personWindow")} · ${rel.window.dMin.toFixed(2)} m · ${rel.window.azDeg}°（${t("layout.side." + rel.window.side)}）`);
      } else if (pack.distances.length) {
        for (const x of pack.distances) lines.push(`${t("dist." + x.kind)}：${x.d.toFixed(2)} m`);
      }
      return lines.length ? [h("h4", t("layout.relations")), ...lines.map(txt => h("div.small", txt))] : null;
    })();
    panel = h("div",
      h("h4", `${t("el." + e.kind)}${lab.get(e.id) ? " · " + lab.get(e.id) : ""}`, h("span.small.mut", f.base ? t("layout.baseLayer") : `${t("layout.setup")} ${(f.setup || setup).name}`)),
      bindOpts ? fld(t("layout.bind"), sel(bindOpts, e.ref, v => commit(q => { findEl(q, e.id).e.ref = v; }), { emptyLabel: t("layout.unbound") }),
        !e.ref ? h("span", { style: { color: "var(--y)" } }, "▲ " + t("layout.unboundHelp")) : null) : null,
      e.kind === "text" ? fld(t("layout.label"), upd("label")) : null,
      h("p.small.mut", t("layout.originHelp")),
      h("div.grid2", fld("X (m)", setPanelXY("x")), fld("Y (m)", setPanelXY("y"))),
      fld(t("layout.rot") + " (°)", setPanelRot()),
      e.w != null ? h("div.grid2", fld(t("layout.len") + " (m)", upd("w", "number")), fld(t("layout.thick") + " (m)", upd("h", "number"))) : null,
      e.kind === "light" ? [h("div.grid2", fld(t("layout.beam") + " (°)", upd("beam", "number")), fld(t("layout.power"), upd("power"))),
        fld(t("layout.modifierRef"), sel(modOpts, e.modifierRef || "", v => commit(q => {
          const el = findEl(q, e.id).e; el.modifierRef = v;
        }), { emptyLabel: t("layout.noModifier") })),
        !e.modifierRef ? fld(t("layout.modifier"), inp(() => e.modifier, (q, v) => { findEl(q, e.id).e.modifier = v; }, { placeholder: t("layout.modifierPh") })) : null,
        readingBlock(p, setup, e, findEl, { mode, res, go: ctx.go }),
      ] : null,
      e.kind === "board" && e.ref ? (() => {
        const g = M.gearByKey(p, e.ref); const sz = M.boardSizeM(g);
        return h("button.sm", { onclick: () => commit(q => { const el = findEl(q, e.id).e; el.w = sz.w; el.h = sz.h; }) }, t("layout.syncBoardSize"));
      })() : null,
      e.kind === "camera" ? [fld(t("layout.focal") + " (mm)", upd("focal", "number")), h("p.small.mut", t("layout.fov", { deg: Math.round(M.fovDeg(e.focal)) })),
        h("button.sm.primary", { style: { marginTop: "8px" }, onclick: () => openCamView3d(p, setup.id, e) }, t("cam3d.open")),
        h("p.small.mut", t("cam3d.openHelp")),
        used ? h("p.small.mut", t("layout.camUsed", { n: used })) : null] : null,
      relLines,
      h("div.row", { style: { marginTop: "14px" } },
        h("button.sm", { disabled: ro || null, onclick: () => commit(q => { const g = findEl(q, e.id).e; g.rot = M.snapDeg15((g.rot || 0) + 15); }) }, "↻ 15°"),
        h("button.sm", { disabled: ro || null, onclick: () => dup(e.id) }, t("common.duplicate")),
        h("button.sm.danger", { disabled: ro || null, onclick: () => del(e.id) }, t("common.delete"))));
  } else if (isEx) {
    panel = summaryPanel(p, setup, res, { select: id => { st.selected = id; ctx.rerender(); }, go: ctx.go });
  } else {
    const list = M.checks(p).filter(c => c.page === "layout" || (c.code === "gearOver" && c.setupId === setup.id));
    panel = h("div",
      h("h4", `${t("layout.setup")} ${setup.name}`),
      h("div.small.mut", t("layout.counts", { l: setup.elements.filter(e => e.kind === "light").length, c: setup.elements.filter(e => e.kind === "camera").length, p: setup.elements.filter(e => e.kind === "person").length })),
      h("div.small.mut", t("layout.usedBy", { n: p.scenes.filter(s => s.setupId === setup.id).length })),
      h("h4", t("panel.checks")), issuesList(p, list, ctx.go),
      h("h4", t("layout.underlay")),
      u && u.file ? [
        h("img", { src: fileUrl(u.file), style: { width: "100%", borderRadius: "6px", opacity: u.opacity ?? 0.5 }, alt: "" }),
        fld(t("layout.opacity"), h("input", { type: "range", min: 0, max: 1, step: 0.05, value: u.opacity ?? 0.5, disabled: ro || null, onchange: e => commit(q => { q.layout.underlay.opacity = Number(e.target.value); }) })),
        h("div.grid2", fld(t("layout.uw") + " (m)", inp(() => u.wm, (q, v) => { q.layout.underlay.wm = v; }, { type: "number", step: 0.1 })),
          fld(t("layout.ux"), inp(() => u.x || 0, (q, v) => { q.layout.underlay.x = v; }, { type: "number", step: 0.1 }))),
        h("div.row.wrap", { style: { marginTop: "8px" } },
          h("button.sm", { disabled: ro || null, onclick: () => { st.calib = { pts: [] }; toast(t("layout.calib1")); ctx.rerender(); } }, t("layout.calibrate")),
          h("button.sm.danger", { disabled: ro || null, onclick: () => commit(q => { q.layout.underlay = null; }) }, t("common.remove"))),
      ] : h("div", h("p.small.mut", t("layout.underlayHelp")),
        h("button.sm", { disabled: ro || null, onclick: async () => { const fs = await pickFiles({ multiple: false }); if (!fs.length) return; const [file] = await uploadImages(fs); commit(q => { q.layout.underlay = { file, x: 0, y: 0, wm: w, opacity: 0.5 }; }); } }, t("layout.addUnderlay"))));
  }

  function dup(id) { const nid = M.uid(); commit(q => { const f2 = findEl(q, id); f2.list.push({ ...f2.e, id: nid, x: f2.e.x + grid, y: f2.e.y + grid }); }); st.selected = nid; ctx.rerender(); }
  async function del(id) {
    const f2 = findEl(p, id); if (!f2) return;
    if (f2.e.kind === "camera") {
      const n = p.scenes.filter(s => s.cameraId === id).length + p.shots.filter(s => s.cameraId === id).length;
      if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n }), { danger: true, ok: t("common.delete") })) return;
    }
    st.selected = null;
    commit(q => { const f3 = findEl(q, id); f3.list.splice(f3.list.indexOf(f3.e), 1); for (const s of [...q.scenes, ...q.shots]) if (s.cameraId === id) s.cameraId = ""; });
  }

  const onKey = e => {
    if (e.type !== "keydown" || isTyping(e)) return;
    const id = st.selected; const mod = e.metaKey || e.ctrlKey;
    if (!id || ro) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); del(id); }
    else if (e.key.toLowerCase() === "r" && !mod) { e.preventDefault(); commit(q => { const g = findEl(q, id).e; g.rot = M.snapDeg15((g.rot || 0) + (e.shiftKey ? -15 : 15)); }, { group: "rot" + id }); }
    else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dup(id); }
    else if (e.key === "Enter" && !mod) { e.preventDefault(); ctx.openEdit("element", id); }
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.05;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      commit(q => { const g = findEl(q, id).e; g.x = +(g.x + dx).toFixed(3); g.y = +(g.y + dy).toFixed(3); }, { group: "nudge" + id });
    } else if (e.key === "Escape") { st.selected = null; ctx.rerender(); }
  };
  return { main, panel, onKey };
}

/** T23：图元二级编辑层（灯五标签；其他图元单页表单） */
function renderElementEdit(ctx, mode, setup) {
  const p = S.project, st = ctx.state, ro = readonly();
  const isEx = mode === "ex";
  const f = findEl(p, ctx.edit.id);
  if (!f) { ctx.closeEdit(); return renderLayoutPage(ctx, mode); }
  const e = f.e;
  const lab = labels(f.setup || setup);
  const title = `${t("el." + e.kind)}${lab.get(e.id) ? " · " + lab.get(e.id) : ""}`;
  st.editTab = st.editTab || "pos";
  const LIGHT_TABS = [
    { id: "pos", label: "layout.tab.pos" },
    { id: "head", label: "layout.tab.head" },
    { id: "fx", label: "layout.tab.fx" },
    { id: "power", label: "layout.tab.power" },
    { id: "rel", label: "layout.tab.rel" },
  ];
  if (e.kind === "light" && !LIGHT_TABS.some(tb => tb.id === st.editTab)) st.editTab = "pos";

  const setNum = (k, snap15 = false) => h("input", {
    type: "number", step: snap15 ? 15 : 0.1, disabled: ro || null,
    value: e[k] ?? "",
    onchange: ev => {
      let v = ev.target.value === "" ? "" : Number(ev.target.value);
      if (snap15 && v !== "") v = k === "pitchDeg" ? Math.round(v / 15) * 15 : M.snapDeg15(v);
      if (k === "pitchDeg" && v !== "") {
        // 俯仰可负；夹到合理范围
        v = Math.max(-90, Math.min(90, v));
      }
      commit(q => { findEl(q, e.id).e[k] = v; });
    },
  });

  // 显示系 X/Y
  const disp = M.toDisplayXY(p.venue, e.x, e.y);
  const dispRot = M.toDisplayRot(e.rot || 0);
  const setDispXY = (axis) => h("input", {
    type: "number", step: 0.1, disabled: ro || null, value: axis === "x" ? disp.x : disp.y,
    onchange: ev => {
      const v = Number(ev.target.value);
      const cur = M.toDisplayXY(p.venue, e.x, e.y);
      if (axis === "x") cur.x = v; else cur.y = v;
      const stg = M.fromDisplayXY(p.venue, cur.x, cur.y);
      commit(q => { const el = findEl(q, e.id).e; el.x = +stg.x.toFixed(3); el.y = +stg.y.toFixed(3); });
    },
  });
  const setDispRot = () => h("input", {
    type: "number", step: 15, disabled: ro || null, value: dispRot,
    onchange: ev => {
      const v = M.snapDeg15(ev.target.value);
      commit(q => { findEl(q, e.id).e.rot = M.fromDisplayRot(v); });
    },
  });

  let body;
  if (e.kind === "light") {
    const tab = st.editTab;
    const bindOpts = M.gearList(p).filter(g => g.type === "light").map(g => [g.key, `${g.model || t("gear.type." + g.type)} (${t("gear.src." + g.source)})`]);
    const modOpts = M.gearList(p).filter(g => g.type === "modifier").map(g => [g.key, g.model || t("gear.type.modifier")]);
    const subject = M.resolveSubject(p, f.setup || setup);
    if (tab === "pos") {
      body = editForm([
        h("p.small.mut", t("layout.originHelp")),
        h("div.grid2", fld("X (m)", setDispXY("x")), fld("Y (m)", setDispXY("y"))),
        fld(t("layout.heightM"), setNum("heightM"), t("layout.heightMHelp")),
        h("div.grid2", fld(t("layout.rot") + " (°)", setDispRot()), fld(t("layout.pitch") + " (°)", setNum("pitchDeg", true))),
        subject ? h("button.sm", { disabled: ro || null, onclick: () => commit(q => {
          const el = findEl(q, e.id).e;
          el.rot = M.aimRotStorageToward(q.venue, el, subject);
        }) }, t("layout.aimSubject")) : h("p.small.mut", t("layout.noSubject")),
      ]);
    } else if (tab === "head") {
      loadCatalogs();
      const gear = e.ref ? M.gearByKey(p, e.ref) : null;
      const cat = gear?.presetId && catalogCache() ? catalogCache().get(gear.presetId) : null;
      body = editForm([
        fld(t("layout.bind"), sel(bindOpts, e.ref, v => commit(q => { findEl(q, e.id).e.ref = v; }), { emptyLabel: t("layout.unbound") })),
        gear ? h("div.small", [
          h("div", h("b", gear.model || "—")),
          cat ? h("div.mut", [
            cat.power_ws != null ? t("layout.catPower", { n: cat.power_ws }) + " · " : "",
            cat.gn_100iso != null ? t("layout.catGn", { n: cat.gn_100iso }) + " · " : "",
            cat.lux_1m != null ? t("layout.catLux", { n: cat.lux_1m }) + " · " : "",
            cat.cct != null ? t("layout.catCct", { n: cat.cct }) : "",
          ].filter(Boolean).join("")) : h("div.mut", t("layout.catNone")),
        ]) : h("p.small.mut", t("layout.unboundHelp")),
      ]);
    } else if (tab === "fx") {
      body = editForm([
        fld(t("layout.modifierRef"), sel(modOpts, e.modifierRef || "", v => commit(q => {
          const el = findEl(q, e.id).e; el.modifierRef = v;
          if (v) {
            const mod = M.gearByKey(q, v);
            // 光束角若目录有经验值则带出；否则保留手填
            if (mod && Number(mod.beamDeg) > 0) el.beam = Number(mod.beamDeg);
          }
        }), { emptyLabel: t("layout.noModifier") })),
        !e.modifierRef ? fld(t("layout.modifier"), inp(() => e.modifier, (q, v) => { findEl(q, e.id).e.modifier = v; }, { placeholder: t("layout.modifierPh") })) : null,
        fld(t("layout.beam") + " (°)", setNum("beam")),
        fld(t("layout.honeycomb"), setNum("honeycombDeg", true)),
        fld(t("layout.diffusion"), h("input", {
          type: "number", min: 0, max: 4, step: 1, disabled: ro || null, value: e.diffusionLayers || 0,
          onchange: ev => commit(q => { findEl(q, e.id).e.diffusionLayers = Math.max(0, Math.min(4, Number(ev.target.value) || 0)); }),
        })),
        fld(t("layout.gel"), inp(() => e.gel || "", (q, v) => { findEl(q, e.id).e.gel = v; }, { placeholder: t("layout.gelPh") })),
        h("label.row", h("input", {
          type: "checkbox", checked: !!e.barnDoors || null, disabled: ro || null,
          onchange: ev => commit(q => { findEl(q, e.id).e.barnDoors = !!ev.target.checked; }),
        }), t("layout.barnDoors")),
      ]);
    } else if (tab === "power") {
      body = editForm([
        fld(t("layout.power"), inp(() => e.power, (q, v) => { findEl(q, e.id).e.power = v; }, { placeholder: "1/4+0.3" })),
        readingBlock(p, f.setup || setup, e, findEl, { mode: isEx ? "ex" : "plan", res: isEx ? ratiosFor(p, f.setup || setup, ctx.rerender) : null, go: ctx.go }),
      ]);
    } else {
      const rel = M.relativeAngles(p, (f.setup || setup).id, subject?.id);
      const L = rel.lights.find(x => x.lightId === e.id);
      const rows = L ? [h("tr",
        h("td", L.label),
        h("td", L.dXY.toFixed(2) + " m"),
        h("td", L.dSlant != null ? L.dSlant.toFixed(2) + " m" : "—"),
        h("td", `${L.azDeg}°`),
        h("td", t("layout.side." + L.side)),
        h("td", `${L.alphaDeg}° · ${t("layout.key." + L.keyName)}`),
        h("td", L.elevDeg != null ? L.elevDeg + "°" : "—"),
      )] : [];
      body = editForm([
        h("p.small.mut", t("layout.relHelp")),
        L ? h("p.small", M.formatLightHud(L, t("layout.side." + L.side), t("layout.key." + L.keyName))) : null,
        subject ? h("table.grid",
          h("tr", h("th", "ID"), h("th", t("layout.dxy")), h("th", t("layout.dslant")), h("th", t("layout.az")), h("th", t("layout.lr")), h("th", t("layout.keyName")), h("th", t("layout.elev"))),
          ...rows)
          : h("p.mut", t("layout.noSubject")),
      ]);
    }
    const main = editShell({
      crumb: `${t(isEx ? "step.ex" : "step.layout")} / ${title}`,
      onBack: () => ctx.closeEdit(),
      tabs: LIGHT_TABS.map(tb => ({ id: tb.id, label: t(tb.label) })),
      tab: st.editTab,
      onTab: id => { st.editTab = id; ctx.rerender(); },
      body,
    });
    const panel = h("div",
      h("h4", t("edit.summary")), h("p", h("b", title)),
      h("p.small.mut", `X ${disp.x.toFixed(2)} · Y ${disp.y.toFixed(2)} · ${dispRot}°`),
      e.heightM !== "" && e.heightM != null ? h("p.small.mut", t("layout.heightM") + ": " + e.heightM + " m") : null);
    return { main, panel };
  }

  // 非灯：单页编辑（显示系坐标）+ 机位/人物关系摘要
  const bindOpts = e.kind === "board" ? M.gearList(p).filter(g => g.type === "absorb").map(g => [g.key, g.model || t("gear.type.absorb")])
    : e.kind === "person" ? M.models(p).map(m => [m.id, m.name]) : e.kind === "prop" ? p.props.map(x => [x.id, x.name || "—"]) : null;
  const relSum = (() => {
    if (e.kind !== "camera" && e.kind !== "person" && e.kind !== "mark") return null;
    const rel = M.relativeAngles(p, (f.setup || setup).id, (e.kind === "person" || e.kind === "mark") ? e.id : null);
    if (!rel.subject) return h("p.mut", t("layout.noSubject"));
    const bits = [];
    if (e.kind === "camera" && rel.camera) {
      const C = rel.camera;
      bits.push(h("div.small", `${C.label} · ${C.dXY.toFixed(2)} m · ${C.azDeg}°（${t("layout.side." + C.side)}）· ${t("layout.view." + C.viewLabel)} ${C.alphaDeg}°`));
    }
    if (e.kind === "person" || e.kind === "mark") {
      for (const L of rel.lights) bits.push(h("div.small", M.formatLightHud(L, t("layout.side." + L.side), t("layout.key." + L.keyName))));
      if (rel.camera) bits.push(h("div.small", `${rel.camera.label} · ${rel.camera.dXY.toFixed(2)} m · ${t("layout.view." + rel.camera.viewLabel)} ${rel.camera.alphaDeg}°`));
      if (rel.backdrop) bits.push(h("div.small", `${t("dist.personBackdrop")} · ${rel.backdrop.dMin.toFixed(2)} m`));
      if (rel.window) bits.push(h("div.small", `${t("dist.personWindow")} · ${rel.window.dMin.toFixed(2)} m · ${t("layout.incidence")} ${rel.window.incidenceDeg}°`));
    }
    return [h("h4", t("layout.relations")), h("p.small.mut", t("layout.relHelp")), ...bits];
  })();
  body = editForm([
    bindOpts ? fld(t("layout.bind"), sel(bindOpts, e.ref, v => commit(q => { findEl(q, e.id).e.ref = v; }), { emptyLabel: t("layout.unbound") })) : null,
    e.kind === "text" ? fld(t("layout.label"), inp(() => e.label, (q, v) => { findEl(q, e.id).e.label = v; })) : null,
    h("p.small.mut", t("layout.originHelp")),
    h("div.grid2", fld("X (m)", setDispXY("x")), fld("Y (m)", setDispXY("y"))),
    fld(t("layout.rot") + " (°)", setDispRot()),
    e.w != null ? h("div.grid2", fld(t("layout.len") + " (m)", setNum("w")), fld(t("layout.thick") + " (m)", setNum("h"))) : null,
    e.kind === "camera" ? [fld(t("layout.focal") + " (mm)", setNum("focal")),
      h("button.sm.primary", { onclick: () => openCamView3d(p, (f.setup || setup).id, e) }, t("cam3d.open"))] : null,
    relSum,
  ]);
  return {
    main: editShell({
      crumb: `${t(isEx ? "step.ex" : "step.layout")} / ${title}`,
      onBack: () => ctx.closeEdit(),
      body,
    }),
    panel: h("div", h("h4", t("edit.summary")), h("p", h("b", title))),
  };
}
