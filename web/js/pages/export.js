// S9 预览与导出：章节勾选、按所选语言出版式，打印 / 存为 PDF，导出备份（F31–F34）
import { h, download } from "../ui.js";
import { t, fmtDate, fmtDuration, LANGS, getLang } from "../i18n.js";
import { S, commit, fileUrl, api, flush } from "../store.js";
import { promptDlg, toast } from "../ui.js";
import * as M from "../model.js";
import { renderLayout, labels } from "../canvas.js";
import { issuesList, checkText, personName, lookName, setupName, cameraName, poseName, sceneName } from "./common.js";

const SECTIONS = ["cover", "overview", "schedule", "people", "gear", "layout", "shots"];

export function render(ctx) {
  const p = S.project;
  const o = p.exportOpts;
  const L = o.lang || getLang();
  const setOpt = patch => commit(q => Object.assign(q.exportOpts, patch), { force: true });
  const list = M.checks(p);
  const opts = h("div.opts",
    h("div.card", h("h3", t("ex.sections")),
      SECTIONS.map(k => h("label.row", { style: { padding: "3px 0" } }, h("input", { type: "checkbox", checked: o.sections[k] !== false, onchange: e => setOpt({ sections: { ...o.sections, [k]: e.target.checked } }) }), t("ex.sec." + k)))),
    h("div.card", h("h3", t("ex.options")),
      h("div.field", h("label", t("ex.lang")), h("select", { onchange: e => setOpt({ lang: e.target.value }) }, LANGS.map(([v, l]) => h("option", { value: v, selected: v === L || null }, l)))),
      h("label.row", { style: { marginTop: "8px" } }, h("input", { type: "checkbox", checked: o.refs !== false, onchange: e => setOpt({ refs: e.target.checked }) }), t("ex.refs"))),
    h("div.card", h("h3", t("ex.output")),
      h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        h("button.primary", { onclick: () => window.print() }, t("ex.print")),
        h("p.small.mut", { style: { margin: 0 } }, t("ex.printHelp")),
        h("button", { onclick: () => download(`${p.name || "plan"}.portrait-guidance.json`, new Blob([JSON.stringify(p, null, 1)], { type: "application/json" })) }, t("ex.backup")),
        h("button", { onclick: async () => { const n = await promptDlg(t("ex.saveTpl"), { value: p.name, help: t("ex.tplHelp") }); if (n == null) return; await flush(); await api("POST", `projects/${p.id}/template`, { name: n }); toast(t("ex.tplSaved")); } }, t("ex.saveTpl")),
        h("button", { disabled: true, title: t("common.deferredP1") }, t("ex.onset")),
        h("button", { disabled: true, title: t("common.deferred") }, t("ex.share")))));
  const panel = h("div", h("h4", t("ex.preflight")), h("p.small.mut", t("ex.preflightHelp")), issuesList(p, list, ctx.go));
  return { main: h("div", h("h2.pt.noprint", t("step.export")), h("p.sub.noprint", t("ex.sub")), h("div.export-wrap", opts, h("div", buildDoc(p, L, o)))), panel };
}

export function buildDoc(p, L, o) {
  const T = (k, params) => t(k, params, L);
  const sec = o.sections;
  const nos = M.shotNumbers(p);
  const sch = M.schedule(p);
  const out = h("div.doc", { lang: L });
  const H2 = k => h("h2", T("ex.sec." + k));
  if (sec.cover !== false) {
    out.append(h("div.cover",
      h("div.meta", "portrait-guidance · " + T("app.name")),
      h("h1", p.name || T("proj.untitled")),
      h("div", p.overview.keywords.join(" · ")),
      h("div.meta", [p.time.date && fmtDate(p.time.date, L), p.time.start && `${p.time.start}–${p.time.end}`, p.venue.name].filter(Boolean).join("　|　")),
      h("div.meta", `${T("status." + p.status)} · ${T("proj.completeness", { n: M.completeness(p) })}`)));
  }
  if (sec.overview !== false) {
    out.append(h("section", H2("overview"),
      p.overview.theme ? h("p", { style: { whiteSpace: "pre-wrap" } }, p.overview.theme) : null,
      h("table", h("tr", h("th", T("ov.keywords")), h("td", p.overview.keywords.join("、") || "—")),
        p.overview.client ? h("tr", h("th", T("ov.client")), h("td", p.overview.client)) : null,
        p.overview.purpose ? h("tr", h("th", T("ov.purpose")), h("td", p.overview.purpose)) : null),
      p.mood.length ? h("div.moodgrid", p.mood.slice(0, 16).map(m => h("img", { src: fileUrl(m.file), alt: m.note || "" }))) : null));
  }
  if (sec.schedule !== false && p.shots.length) {
    const calls = M.callTimes(p);
    out.append(h("section", H2("schedule"),
      h("p", [p.time.date && fmtDate(p.time.date, L), T("sch.total") + " " + fmtDuration(sch.totalMin, L), T("sch.avail") + " " + fmtDuration(sch.avail.minutes, L), sch.overMin ? T("sch.over") + " " + fmtDuration(sch.overMin, L) : ""].filter(Boolean).join(" · ")),
      h("table", h("tr", h("th", T("ex.time")), h("th", T("ex.item")), h("th", T("layout.setup")), h("th", T("shots.model"))),
        calls.map(c => h("tr", h("td", M.fmtMin(c.at)), h("td", c.role === "setup" ? T("time.setupCrew") : `${personName(p, c.personId)} · ${T("ex.call")}`), h("td", ""), h("td", ""))),
        sch.items.filter(i => i.type !== "gap").map(i => {
          if (i.type === "buffer") return h("tr", h("td", M.fmtMin(i.start)), h("td", { colspan: 3, style: { color: "#74726c" } }, `${i.reasons.map(r => T("sch.buf." + r)).join(" + ")} · ${i.end - i.start}′`));
          const s = p.shots.find(x => x.id === i.shotId), r = M.resolveShot(p, s);
          return h("tr", h("td", `${M.fmtMin(i.start)}–${M.fmtMin(i.end)}`), h("td", `${nos.get(s.id)} ${poseName(s.poseId) || ""}${s.priority === "opt" ? " (" + T("pri.opt") + ")" : ""}`),
            h("td", setupName(p, r.setupId, L)), h("td", r.personIds.map(id => personName(p, id)).join("、")));
        }))));
  }
  if (sec.people !== false && p.people.length) {
    out.append(h("section", H2("people"),
      M.models(p).length ? h("table", h("tr", ["time.name", "time.height", "time.size", "time.looks", "time.availTo"].map(k => h("th", T(k)))),
        M.models(p).map(m => h("tr", h("td", m.name), h("td", m.height ? m.height + " cm" : ""), h("td", m.size || ""), h("td", (m.looks || []).map(l => l.name).join("、")), h("td", [m.availFrom, m.availTo].filter(Boolean).join("–"))))) : null,
      M.staff(p).length ? h("table", h("tr", ["time.name", "time.role", "time.contact"].map(k => h("th", T(k)))), M.staff(p).map(x => h("tr", h("td", x.name), h("td", x.role || ""), h("td", x.contact || "")))) : null));
  }
  if (sec.gear !== false) {
    const used = M.gearUsedMax(p);
    const gl = M.gearList(p);
    out.append(h("section", H2("gear"),
      gl.length ? h("table", h("tr", ["gear.type", "gear.model", "gear.qty", "gear.source", "gear.used"].map(k => h("th", T(k)))),
        gl.map(g => h("tr", h("td", T("gear.type." + g.type)), h("td", g.model || ""), h("td", g.qty || 0), h("td", T("gear.src." + g.source)), h("td", `${used.get(g.key) || 0} / ${g.qty || 0}`)))) : h("p", "—"),
      p.props.length ? h("table", h("tr", ["prop.name", "gear.qty", "prop.size", "gear.source", "prop.owner", "prop.status"].map(k => h("th", T(k)))),
        p.props.map(x => h("tr", h("td", x.name), h("td", x.qty), h("td", x.size || ""), h("td", T("gear.src." + x.source)), h("td", x.owner || ""), h("td", T("prop." + x.status))))) : null));
  }
  if (sec.layout !== false) {
    const s2 = h("section", H2("layout"));
    for (const st of p.layout.setups) {
      if (!st.elements.length && !p.layout.base.length) continue;
      const svg = renderLayout(p, st.id, { literal: true, legend: true, underlayUrl: fileUrl, lang: L });
      svg.setAttribute("class", "layout-svg"); svg.setAttribute("width", "100%");
      const lab = labels(st);
      const lights = st.elements.filter(e => e.kind === "light");
      s2.append(h("div", { style: { breakInside: "avoid" } }, h("h3", { style: { fontSize: "14px", margin: "14px 0 6px" } }, `${T("layout.setup")} ${st.name}`), svg),
        lights.length ? h("table", h("tr", h("th", "#"), h("th", T("gear.model")), h("th", T("layout.modifier")), h("th", T("layout.power")), h("th", T("layout.beam"))),
          lights.map(e => { const g = e.ref && M.gearByKey(p, e.ref); return h("tr", h("td", lab.get(e.id)), h("td", g ? g.model : "—"), h("td", e.modifier || ""), h("td", e.power || ""), h("td", (e.beam || "") + "°")); })) : null);
    }
    out.append(s2);
  }
  if (sec.shots !== false && p.shots.length) {
    const s3 = h("section", H2("shots"));
    for (const sc of p.scenes) {
      const list = M.shotsOfScene(p, sc.id);
      if (!list.length) continue;
      s3.append(h("h3", { style: { fontSize: "14px", margin: "14px 0 4px" } }, sceneName(p, sc, L),
        h("span", { style: { fontWeight: 400, color: "#74726c" } }, " · " + [setupName(p, sc.setupId, L), sc.personIds.map(id => personName(p, id)).join("、")].filter(Boolean).join(" · "))),
        h("table", h("tr", h("th", T("col.no")), o.refs !== false ? h("th", T("col.ref")) : null, h("th", T("col.size")), h("th", T("shots.model")), h("th", T("col.pose")), h("th", T("col.props")), h("th", T("col.min")), h("th", T("col.notes"))),
          list.map(s => {
            const r = M.resolveShot(p, s);
            return h("tr", h("td", h("b", nos.get(s.id)), s.priority === "opt" ? h("div", { style: { color: "#74726c" } }, T("pri.opt")) : null),
              o.refs !== false ? h("td", (s.refs || []).slice(0, 2).map(f => h("img.refimg", { src: fileUrl(f), alt: "" }))) : null,
              h("td", [s.size && T("size." + s.size), s.focal && s.focal + "mm", cameraName(p, r.setupId, r.cameraId, L)].filter(Boolean).join(" · ")),
              h("td", [r.personIds.map(id => personName(p, id)).join("、"), r.lookIds.map(id => (M.lookById(p, id) || {}).name).filter(Boolean).join("、")].filter(Boolean).join(" · ")),
              h("td", h("div", poseName(s.poseId)), s.cue ? h("div", { style: { color: "#74726c" } }, s.cue) : null),
              h("td", (s.props || []).map(id => (p.props.find(x => x.id === id) || {}).name).filter(Boolean).join("、")),
              h("td", (s.minutes || 0) + "′"), h("td", { style: { whiteSpace: "pre-wrap" } }, s.notes || ""));
          })));
    }
    out.append(s3);
  }
  return out;
}
