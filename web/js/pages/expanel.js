// EX 光比与光效：右侧面板、画布标注（T14）。
// 布置数据与 S6 场地图是同一份，这里只换了右侧计算和画布上的光比标注。
import { h, s } from "../ui.js";
import { t } from "../i18n.js";
import { commit, readonly, refresh } from "../store.js";
import * as M from "../model.js";
import { labels } from "../canvas.js";
import { catalogCache, loadCatalogs } from "../gear-presets.js";
import { fld, sel } from "./common.js";

const fmtF = n => "f/" + (n >= 10 ? n.toFixed(0) : n.toFixed(1));
const fmtLux = n => Math.round(n).toLocaleString() + " lx";
const fmtEv = ev => (ev > 0 ? "+" : ev < 0 ? "−" : "±") + Math.abs(ev).toFixed(1) + " EV";
const fmtVal = v => !v ? "—" : v.unit === "f" ? fmtF(v.value) : v.unit === "lux" ? fmtLux(v.value) : t("lr.relOnly");

/** 当前布光方案的光比结果（目录没加载完时先按无目录算，加载后重绘） */
export function ratiosFor(p, setup, rerender) {
  const cat = catalogCache();
  if (!cat && rerender) loadCatalogs().then(() => rerender());
  const ex = setup.ex || {};
  return M.lightRatios(p, setup.id, { catalog: cat, subjectId: ex.subjectId, keyId: ex.keyId, iso: ex.iso || 100 });
}

/** 在布置图上标出每盏灯相对主光的 EV，以及灯到被摄者的连线 */
export function annotate(svg, res) {
  if (!res.subject) return;
  const g = s("g", { "pointer-events": "none" });
  for (const r of res.rows) {
    const e = r.el, isKey = res.key && r.id === res.key.id;
    g.append(s("line", { x1: e.x, y1: e.y, x2: res.subject.x, y2: res.subject.y, stroke: r.inBeam ? "var(--focus)" : "var(--y)", "stroke-width": 0.02, "stroke-dasharray": "0.06 0.06", opacity: 0.55 }));
    // 和主光不能比的灯（单位不同）就标它自己的读数或估算
    const own = r.meas || r.est;
    const txt = isKey ? t("lr.keyShort") : r.evRel != null ? `${fmtEv(r.evRel)} · ${M.ratioText(r.evRel)}` : own && own.unit !== "rel" ? fmtVal(own) : "?";
    const w = Math.max(0.5, txt.length * 0.13);
    g.append(s("rect", { x: e.x - w / 2, y: e.y - 0.66, width: w, height: 0.3, rx: 0.08, fill: isKey ? "var(--fg)" : "var(--panel)", stroke: "var(--line)", "stroke-width": 0.02 }));
    g.append(s("text", { x: e.x, y: e.y - 0.45, "font-size": 0.19, "font-weight": 600, "text-anchor": "middle", fill: isKey ? "var(--panel)" : r.evRel == null ? "var(--y)" : "var(--fg)" }, txt));
  }
  svg.append(g);
}

/** 未选中元素时的面板：被摄者、主光、ISO、每盏灯的估算与实测、提示 */
export function summaryPanel(p, setup, res, { select, go }) {
  const ro = readonly();
  const lab = labels(setup);
  const setEx = (k, v) => commit(q => { const st = M.setupById(q, setup.id); st.ex = { ...(st.ex || {}), [k]: v }; }, { force: true });
  const pName = e => { const pe = e.ref && M.personById(p, e.ref); return pe ? pe.name : t("el.person"); };
  const ex = setup.ex || {};
  const others = res.rows.filter(r => res.key && r.id !== res.key.id && r.evRel != null).sort((a, b) => b.evRel - a.evRel);
  const fill = others[0];
  const head = res.key && fill ? h("div.lr-head",
    h("div.small.mut", t("lr.keyFill", { key: lab.get(res.key.id), fill: lab.get(fill.id) })),
    h("div.lr-big", M.ratioText(fill.evRel)),
    h("div.small.mut", t("lr.diff", { ev: Math.abs(fill.evRel).toFixed(1) }) + (fill.evRelMeas != null ? " · " + t("lr.byMeas") : " · " + t("lr.byEst"))))
    : null;

  const card = r => {
    const isKey = res.key && r.id === res.key.id;
    const name = r.gear ? r.gear.model : t("layout.unbound");
    const modName = r.mod ? r.mod.model : (r.el.modifier || "");
    const warn = res.warnings.filter(w => w.id === r.id);
    return h("div.lr-card" + (isKey ? ".key" : ""), { tabindex: 0, onclick: () => select(r.id), onkeydown: e => { if (e.key === "Enter") select(r.id); } },
      h("div.lr-t", h("b", lab.get(r.id)), h("span", name), isKey ? h("span.lr-badge", t("lr.key")) : null),
      h("div.small.mut", [r.d != null ? t("lr.dist", { d: r.d.toFixed(2) }) : null, r.el.power || t("lr.noPower"), modName, t("lr.kind." + r.kind)].filter(Boolean).join(" · ")),
      h("div.lr-grid",
        h("span.mut", t("lr.est")), h("span", fmtVal(r.est)),
        h("span.mut", t("lr.meas")), h("span", r.meas ? fmtVal(r.meas) : h("span.mut", t("lr.notMeasured"))),
        h("span.mut", t("lr.vsKey")), h("span", isKey ? "—" : r.evRel != null ? `${M.ratioText(r.evRel)}（${fmtEv(r.evRel)}）` : h("span.mut", t("lr.cannot")))),
      warn.length ? h("div.lr-warn", warn.map(w => h("div", "▲ " + t("lr.w." + w.code, { deg: w.deg, ev: w.ev != null ? fmtEv(w.ev) : "" })))) : null);
  };

  const subjOpts = res.subjects.map(e => [e.id, pName(e)]);
  const keyOpts = res.rows.map(r => [r.id, `${lab.get(r.id)} · ${r.gear ? r.gear.model : t("layout.unbound")}`]);
  const general = res.warnings.filter(w => !w.id);
  return h("div",
    h("h4", t("lr.title"), h("span.small.mut", `${t("layout.setup")} ${setup.name}`)),
    h("p.small.mut", t("lr.syncNote")),
    !res.rows.length ? h("p.small", t("lr.noLights")) : null,
    head,
    h("div.grid2",
      fld(t("lr.subject"), sel(subjOpts, res.subject ? res.subject.id : "", v => setEx("subjectId", v), { emptyLabel: t("lr.auto") })),
      fld(t("lr.keyPick"), sel(keyOpts, ex.keyId || "", v => setEx("keyId", v), { emptyLabel: t("lr.auto") }))),
    fld(t("lr.iso"), h("input", { type: "number", min: 25, max: 12800, step: 1, value: ex.iso || 100, disabled: ro || null, onchange: e => setEx("iso", Number(e.target.value) || 100) })),
    general.map(w => h("p.small", { style: { color: "var(--y)" } }, "▲ " + t("lr.w." + w.code))),
    res.rows.map(card),
    h("h4", t("lr.howTitle")),
    h("p.small.mut", t("lr.how")),
    catalogCache() ? null : h("p.small.mut", t("common.loading")),
    h("button.sm", { style: { marginTop: "6px" }, onclick: () => go("layout") }, t("lr.openPlan")));
}

/** 选中一盏灯时在属性面板里插入的「测光读数」块；EX 里还显示估算和设为主光 */
export function readingBlock(p, setup, e, findEl, { mode, res, go }) {
  const r = res && res.rows.find(x => x.id === e.id);
  // 测光读数在拍摄当天填，方案定稿后也允许改（和进度看板一样）
  const g = "rd:" + e.id + ":";
  const num = k => h("input", { type: "number", step: k === "faceFstop" ? 0.1 : 1, min: 0, value: e[k] ?? "",
    oninput: ev => commit(q => { findEl(q, e.id).e[k] = ev.target.value === "" ? "" : Number(ev.target.value); }, { soft: true, group: g + k, force: true }),
    onchange: () => refresh() });
  const txt = (k, ph) => h("input", { type: "text", value: e[k] ?? "", placeholder: t(ph),
    oninput: ev => commit(q => { findEl(q, e.id).e[k] = ev.target.value; }, { soft: true, group: g + k, force: true }),
    onchange: () => refresh() });
  return [
    h("h4", t("layout.luxTitle")),
    h("p.small.mut", t("layout.luxHelp")),
    h("div.grid2",
      fld(t("lr.faceFstop") + ` (ISO ${(setup.ex || {}).iso || 100})`, num("faceFstop")),
      fld(t("layout.faceLux") + " (lux)", num("faceLux"))),
    h("div.grid2",
      fld(t("layout.exitLux") + " (lux)", num("exitLux")),
      fld(t("layout.luxMeter"), txt("luxMeter", "layout.luxMeterPh"))),
    fld(t("layout.luxNote"), txt("luxNote", "layout.luxNotePh")),
    mode === "ex" && r ? h("div.lr-grid", { style: { marginTop: "8px" } },
      h("span.mut", t("lr.est")), h("span", fmtVal(r.est) + (r.est && r.est.basis ? ` · ${r.est.basis}` : "")),
      h("span.mut", t("lr.vsKey")), h("span", res.key && res.key.id === r.id ? t("lr.key") : r.evRel != null ? `${M.ratioText(r.evRel)}（${fmtEv(r.evRel)}）` : "—"),
      r.gap != null ? [h("span.mut", t("lr.gap")), h("span", fmtEv(r.gap))] : null) : null,
    mode === "ex" && r && !(res.key && res.key.id === r.id) ? h("button.sm", { style: { marginTop: "8px" }, disabled: readonly() || null,
      onclick: () => commit(q => { const st = M.setupById(q, setup.id); st.ex = { ...(st.ex || {}), keyId: e.id }; }, { force: true }) }, t("lr.makeKey")) : null,
    mode !== "ex" ? h("button.sm.ghost", { style: { marginTop: "6px" }, onclick: () => go("ex", { selected: e.id }) }, t("lr.openEx")) : null,
  ];
}
