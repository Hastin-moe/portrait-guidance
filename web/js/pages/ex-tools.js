// EX 暂放工具：T22 共用参考图面板 + 世光 L-858D 测光骨架（含闪光功率曲线查询）
import { h, toast, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, readonly } from "../store.js";
import * as M from "../model.js";
import { openRefPicker } from "../refimages.js";
import {
  loadFlashCurves, listFlashCurves, getFlashCurve, relativeOutput, stopsFromFull, parsePowerLevel,
} from "../flash-power.js";
import { fld, sel, emptyState } from "./common.js";

export const EX_SECTIONS = ["ratios", "refs", "sekonic"];

export function exSectionNav(ctx) {
  const st = ctx.state;
  st.exSection = st.exSection || "ratios";
  return h("div.ex-sec-nav", { role: "tablist", "aria-label": t("exTools.nav") },
    EX_SECTIONS.map(id => h("button.ex-sec" + (st.exSection === id ? ".on" : ""), {
      type: "button", role: "tab", "aria-selected": st.exSection === id ? "true" : "false",
      onclick: () => { st.exSection = id; ctx.rerender(); },
    }, t("exTools.sec." + id))));
}

/** T22 共用参考图：写入 project.exTools.refs，与情绪板/分镜 refs 并存 */
export function renderExRefs(ctx) {
  const p = S.project;
  M.normalize(p);
  const refs = p.exTools.refs;
  const ro = readonly();

  const add = async () => {
    const items = await openRefPicker({ allowMood: true, multiple: true });
    if (!items?.length) return;
    commit(q => {
      M.normalize(q);
      for (const it of items) {
        q.exTools.refs.push({
          id: M.uid(),
          file: it.file,
          source: it.source || "",
          url: it.url || "",
          note: "",
          shotId: "",
          createdAt: new Date().toISOString(),
        });
      }
    }, { force: true });
    toast(t("exTools.refs.added", { n: items.length }));
  };

  const card = (r, i) => {
    const del = async () => {
      if (!await confirmDlg(t("common.deleteTitle"), t("exTools.refs.delBody"), { danger: true, ok: t("common.delete") })) return;
      commit(q => { q.exTools.refs = q.exTools.refs.filter(x => x.id !== r.id); }, { force: true });
    };
    return h("div.ex-ref-card",
      h("div.img", { style: { backgroundImage: `url(${fileUrl(r.file)})` } }),
      r.source === "ai" ? h("span.ai-badge", "AI") : null,
      h("div.bd",
        h("div.small.mut", [r.source || "", r.url ? "URL" : ""].filter(Boolean).join(" · ") || "—"),
        h("input", {
          type: "text", disabled: ro || null, value: r.note || "", placeholder: t("exTools.refs.notePh"),
          oninput: e => commit(q => { q.exTools.refs[i].note = e.target.value; }, { soft: true, group: "exref:" + r.id }),
          onchange: () => ctx.rerender(),
        }),
        fld(t("exTools.refs.linkShot"), sel(
          (p.shots || []).map(s => [s.id, (M.shotNumbers(p).get(s.id) || s.id)]),
          r.shotId || "",
          v => commit(q => { q.exTools.refs[i].shotId = v; }, { force: true }),
          { emptyLabel: t("exTools.refs.noShot") })),
        h("div.row", { style: { marginTop: "6px" } },
          h("button.sm.danger", { disabled: ro || null, onclick: del }, t("common.delete")))));
  };

  const body = !refs.length
    ? emptyState(t("exTools.refs.emptyTitle"), t("exTools.refs.emptyBody"),
      h("button.primary", { disabled: ro || null, onclick: add }, "＋ " + t("exTools.refs.add")))
    : h("div.ex-ref-grid", refs.map(card));

  const main = h("div",
    h("div.row", h("h2.pt", { style: { margin: 0 } }, t("step.ex")), h("span.spacer")),
    exSectionNav(ctx),
    h("p.sub", t("exTools.refs.sub")),
    h("div.toolbar", h("span.spacer"), h("button.primary", { disabled: ro || null, onclick: add }, "＋ " + t("exTools.refs.add"))),
    body);

  const panel = h("div",
    h("h4", t("panel.tips")),
    h("p.small.mut", t("exTools.refs.tip")),
    h("p.small.mut", t("exTools.refs.count", { n: refs.length })),
    h("button.sm", { onclick: () => ctx.go("models") }, t("exTools.refs.openMood")));

  return { main, panel };
}

/** L-858D 测光骨架 + 闪光功率曲线查询 */
export function renderExSekonic(ctx) {
  const p = S.project;
  M.normalize(p);
  const st = ctx.state;
  st.curveKey = st.curveKey || "ideal-proportional";
  st.curveLevel = st.curveLevel || "1/1";
  const sk = p.exTools.sekonic;
  const ro = readonly();

  // 异步加载曲线
  if (!st._curvesLoaded) {
    st._curvesLoaded = true;
    loadFlashCurves().then(() => ctx.rerender());
  }
  const curves = listFlashCurves();
  const curve = getFlashCurve(st.curveKey);
  const level = parsePowerLevel(st.curveLevel, curve) || st.curveLevel;
  const rel = relativeOutput(curve, level);
  const stops = stopsFromFull(curve, level);

  const lights = [];
  for (const setup of p.layout.setups) {
    for (const e of setup.elements || []) {
      if (e.kind !== "light") continue;
      lights.push({ setup, e });
    }
  }

  const addReading = () => {
    commit(q => {
      M.normalize(q);
      q.exTools.sekonic.readings.unshift({
        id: M.uid(),
        setupId: p.layout.activeSetup || "",
        elementId: "",
        shotId: "",
        mode: "flash",
        faceFstop: "",
        faceLux: "",
        iso: (M.setupById(q, q.layout.activeSetup)?.ex || {}).iso || 100,
        shutter: "",
        note: "",
        meter: sk.meter || "Sekonic L-858D",
        importedAt: "",
        createdAt: new Date().toISOString(),
        raw: null,
      });
    }, { force: true });
  };

  const importStub = async () => {
    toast(t("exTools.sekonic.importPending"));
    commit(q => {
      M.normalize(q);
      q.exTools.sekonic.imports.push({
        id: M.uid(),
        name: t("exTools.sekonic.importStubName"),
        note: t("exTools.sekonic.importStubNote"),
        status: "pending_sample",
        createdAt: new Date().toISOString(),
      });
    }, { force: true });
  };

  const applyToLight = (reading) => {
    if (!reading.elementId) return toast(t("exTools.sekonic.needLight"));
    commit(q => {
      for (const setup of q.layout.setups) {
        const e = (setup.elements || []).find(x => x.id === reading.elementId);
        if (!e) continue;
        if (reading.mode === "flash" && reading.faceFstop !== "") e.faceFstop = Number(reading.faceFstop) || reading.faceFstop;
        if (reading.mode === "ambient" && reading.faceLux !== "") e.faceLux = Number(reading.faceLux) || reading.faceLux;
        if (reading.note) e.luxNote = [e.luxNote, reading.note].filter(Boolean).join("；");
        e.luxMeter = reading.meter || "Sekonic L-858D";
        break;
      }
    }, { force: true });
    toast(t("exTools.sekonic.applied"));
  };

  const curveOpts = curves.filter(c => c.status !== "n_a").map(c => [c.id, `${c.brand === "_generic" ? "" : c.brand + " "}${c.model}`.trim()]);

  const readingsBody = !sk.readings.length
    ? h("p.mut", t("exTools.sekonic.noReadings"))
    : sk.readings.map((r, i) => h("div.ex-sk-card",
      h("div.row", h("b", t("exTools.sekonic.reading") + " " + (sk.readings.length - i)), h("span.spacer"),
        h("button.sm.ghost", { disabled: ro || null, onclick: () => commit(q => { q.exTools.sekonic.readings = q.exTools.sekonic.readings.filter(x => x.id !== r.id); }, { force: true }) }, "×")),
      h("div.grid2",
        fld(t("exTools.sekonic.mode"), sel([["flash", t("lr.kind.flash")], ["ambient", t("exTools.sekonic.ambient")]], r.mode, v => commit(q => { q.exTools.sekonic.readings[i].mode = v; }, { force: true }), { allowEmpty: false })),
        fld(t("exTools.sekonic.iso"), h("input", { type: "number", disabled: ro || null, value: r.iso ?? 100, onchange: e => commit(q => { q.exTools.sekonic.readings[i].iso = Number(e.target.value) || 100; }, { force: true }) }))),
      h("div.grid2",
        fld(t("lr.faceFstop"), h("input", { type: "number", step: 0.1, disabled: ro || null, value: r.faceFstop ?? "", onchange: e => commit(q => { q.exTools.sekonic.readings[i].faceFstop = e.target.value === "" ? "" : Number(e.target.value); }, { force: true }) })),
        fld(t("layout.faceLux"), h("input", { type: "number", disabled: ro || null, value: r.faceLux ?? "", onchange: e => commit(q => { q.exTools.sekonic.readings[i].faceLux = e.target.value === "" ? "" : Number(e.target.value); }, { force: true }) }))),
      fld(t("exTools.sekonic.bindLight"), sel(
        lights.map(({ setup, e }) => [e.id, `${setup.name} · ${(e.label || e.kind)} · ${e.power || "—"}`]),
        r.elementId || "",
        v => commit(q => { q.exTools.sekonic.readings[i].elementId = v; }, { force: true }),
        { emptyLabel: "—" },
      )),
      fld(t("layout.luxNote"), h("input", { type: "text", disabled: ro || null, value: r.note || "", onchange: e => commit(q => { q.exTools.sekonic.readings[i].note = e.target.value; }, { force: true }) })),
      h("div.row", { style: { marginTop: "6px" } },
        h("button.sm", { disabled: ro || null, onclick: () => applyToLight(r) }, t("exTools.sekonic.applyLight")))));

  const main = h("div",
    h("div.row", h("h2.pt", { style: { margin: 0 } }, t("step.ex")), h("span.spacer")),
    exSectionNav(ctx),
    h("p.sub", t("exTools.sekonic.sub")),

    h("h4", t("exTools.sekonic.meterTitle")),
    h("p.small.mut", t("exTools.sekonic.meterHelp")),
    fld(t("layout.luxMeter"), h("input", {
      type: "text", disabled: ro || null, value: sk.meter || "Sekonic L-858D",
      onchange: e => commit(q => { q.exTools.sekonic.meter = e.target.value; }, { force: true }),
    })),
    h("div.toolbar",
      h("button.primary", { disabled: ro || null, onclick: addReading }, "＋ " + t("exTools.sekonic.addReading")),
      h("button", { disabled: ro || null, onclick: importStub }, t("exTools.sekonic.importBtn"))),
    readingsBody,

    sk.imports.length ? [h("h4", t("exTools.sekonic.imports")), sk.imports.map(im => h("p.small.mut", `${im.name} · ${im.status} · ${im.note || ""}`))] : null,

    h("h4", t("exTools.curve.title")),
    h("p.small.mut", t("exTools.curve.help")),
    fld(t("exTools.curve.pick"), sel(curveOpts, st.curveKey, v => { st.curveKey = v; ctx.rerender(); }, { allowEmpty: false })),
    fld(t("exTools.curve.level"), h("input", {
      type: "text", value: st.curveLevel, placeholder: t("exTools.curve.levelPh"),
      oninput: e => { st.curveLevel = e.target.value; },
      onchange: () => ctx.rerender(),
    })),
    curve ? h("div.ex-curve-out",
      h("p", h("b", t("exTools.curve.status") + "："), curve.status || "—", " · ", t("exTools.curve.confidence") + " " + (curve.confidence || "—")),
      h("p.small.mut", curve.source || ""),
      stops != null ? h("p", t("exTools.curve.stops", { n: stops.toFixed(2) })) : h("p.mut", t("exTools.curve.badLevel")),
      rel ? h("p", t("exTools.curve.rel", { n: rel.value.toFixed(4) }) + (rel.estimated ? " · " + t("exTools.curve.estimated") : "")) : null,
      curve.notes ? h("p.small.mut", curve.notes) : null)
      : h("p.mut", t("common.loading")));

  const panel = h("div",
    h("h4", t("panel.tips")),
    h("p.small.mut", t("exTools.sekonic.tip")),
    h("p.small.mut", t("exTools.curve.tip")),
    h("button.sm", { onclick: () => { st.exSection = "ratios"; ctx.rerender(); } }, t("exTools.backRatios")));

  return { main, panel };
}
