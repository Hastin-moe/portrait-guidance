// S4 器材与道具：合并器材清单、道具清单、打包清单（F12–F14）
import { h, seg, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, sel, issuesList, emptyState } from "./common.js";
import { gearTable } from "./venue.js";

export function render(ctx) {
  const p = S.project, st = ctx.state, ro = readonly();
  st.tab = st.tab || "gear";
  const usage = M.gearUsedMax(p);
  let body;
  if (st.tab === "gear") {
    body = h("div",
      h("div.card", h("div.row", h("h3", { style: { margin: 0 } }, t("gear.venueGear") + ` (${p.venue.gear.length})`), h("span.spacer"), h("button.sm", { onclick: () => ctx.go("site") }, t("gear.editInVenue"))),
        h("div", { style: { height: "8px" } }),
        p.venue.gear.length ? gearTable(p.venue.gear, "venue", ctx, { usage }) : h("p.small.mut", t("gear.noVenueGear"))),
      h("div.card", h("div.row", h("h3", { style: { margin: 0 } }, t("gear.ownGear") + ` (${p.gear.length})`), h("span.spacer"),
        h("button.sm", { disabled: ro || null, onclick: () => commit(q => { q.gear.push({ id: M.uid(), type: "light", model: "", qty: 1, source: "own" }); }) }, "＋ " + t("gear.add"))),
        h("div", { style: { height: "8px" } }),
        p.gear.length ? gearTable(p.gear, "own", ctx, { showSource: true, usage }) : emptyState(t("gear.noOwn"), t("gear.noOwnBody"))),
      h("p.small.mut", t("gear.usedHelp")));
  } else if (st.tab === "props") {
    const props = p.props;
    body = h("div.card",
      h("div.row", h("h3", { style: { margin: 0 } }, t("gear.props") + ` (${props.length})`), h("span.spacer"),
        h("span.small.mut", t("gear.readyN", { n: props.filter(x => x.status === "ready").length, total: props.length })),
        h("button.sm", { disabled: ro || null, onclick: () => commit(q => { q.props.push({ id: M.uid(), name: "", qty: 1, size: "", source: "own", owner: "", status: "todo" }); }) }, "＋ " + t("gear.addProp"))),
      h("div", { style: { height: "8px" } }),
      props.length ? h("table.grid",
        h("tr", ["prop.name", "gear.qty", "prop.size", "gear.source", "prop.owner", "prop.status", ""].map(k => h("th", k ? t(k) : ""))),
        props.map(x => {
          const upd = (k, val) => commit(q => { q.props.find(y => y.id === x.id)[k] = val; });
          return h("tr",
            h("td", inp(() => x.name, (q, v) => { q.props.find(y => y.id === x.id).name = v; }, { placeholder: t("prop.namePh") })),
            h("td.num", inp(() => x.qty, (q, v) => { q.props.find(y => y.id === x.id).qty = v; }, { type: "number", min: 0 })),
            h("td", inp(() => x.size, (q, v) => { q.props.find(y => y.id === x.id).size = v; })),
            h("td", sel([["own", t("gear.src.own")], ["rent", t("gear.src.rent")], ["venue", t("gear.src.venue")]], x.source, v => upd("source", v), { allowEmpty: false })),
            h("td", inp(() => x.owner, (q, v) => { q.props.find(y => y.id === x.id).owner = v; })),
            h("td", sel([["todo", t("prop.todo")], ["ready", t("prop.ready")]], x.status, v => upd("status", v), { allowEmpty: false })),
            h("td", h("button.sm.ghost", { disabled: ro || null, onclick: async () => {
              const n = p.shots.filter(s => (s.props || []).includes(x.id)).length + p.layout.setups.reduce((a, s) => a + s.elements.filter(e => e.ref === x.id).length, 0);
              if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n }), { danger: true, ok: t("common.delete") })) return;
              commit(q => { q.props = q.props.filter(y => y.id !== x.id); for (const s of q.shots) s.props = (s.props || []).filter(id => id !== x.id); for (const s of q.layout.setups) for (const e of s.elements) if (e.ref === x.id) e.ref = ""; });
            } }, "×")));
        })) : emptyState(t("gear.noProps"), t("gear.noPropsBody")));
  } else {
    const items = [
      ...p.gear.map(g => ({ key: "g:" + g.id, label: g.model || t("gear.type." + g.type), meta: `×${g.qty || 0} · ${t("gear.src." + (g.source || "own"))}` })),
      ...p.props.filter(x => x.source !== "venue").map(x => ({ key: "p:" + x.id, label: x.name || "—", meta: `×${x.qty || 0}${x.owner ? " · " + x.owner : ""}` })),
    ];
    body = h("div.card",
      h("div.row", h("h3", { style: { margin: 0 } }, t("gear.packing")), h("span.spacer"),
        h("span.small.mut", t("gear.packedN", { n: items.filter(i => p.packing[i.key]).length, total: items.length })),
        h("button.sm", { onclick: () => printPacking(p, items) }, t("gear.print"))),
      h("p.small.mut", t("gear.packingHelp")),
      items.length ? h("div", items.map(i => h("label.row", { style: { padding: "6px 0", borderBottom: "1px solid var(--line)" } },
        h("input", { type: "checkbox", checked: !!p.packing[i.key], onchange: e => commit(q => { q.packing[i.key] = e.target.checked; }, { force: true }) }),
        h("span", i.label), h("span.small.mut", i.meta)))) : h("p.mut", t("gear.packingEmpty")));
  }
  const list = M.checks(p).filter(c => c.page === "site");
  const perSetup = p.layout.setups.map(s => {
    const u = M.gearUsage(p, s.id);
    return h("div", { style: { marginBottom: "8px" } }, h("div.small", h("b", t("layout.setup") + " " + s.name)),
      u.size ? h("div.chips", [...u].map(([k, n]) => { const g = M.gearByKey(p, k); return h("span.chip.plain", `${g ? g.model || t("gear.type." + g.type) : "?"} ×${n}`); }))
        : h("div.small.mut", t("gear.noneUsed")));
  });
  const panel = h("div", h("h4", t("panel.checks")), issuesList(p, list, ctx.go), h("h4", t("gear.bySetup")), perSetup);
  return { main: h("div", h("h2.pt", t("step.gear")), h("p.sub", t("gear.sub")),
    h("div.toolbar", seg([["gear", t("gear.tabGear")], ["props", t("gear.tabProps")], ["packing", t("gear.tabPacking")]], st.tab, v => { st.tab = v; ctx.rerender(); })), body), panel };
}

function printPacking(p, items) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t("gear.packing"))}</title><style>body{font:14px -apple-system,sans-serif;padding:24px}li{list-style:none;padding:6px 0;border-bottom:1px solid #ddd}li::before{content:"☐  "}</style>
  <h2>${esc(p.name)} · ${esc(t("gear.packing"))}</h2><p>${esc(p.time.date || "")}</p><ul>${items.map(i => `<li>${esc(i.label)} <small>${esc(i.meta)}</small></li>`).join("")}</ul><script>print()<\/script>`);
  w.document.close();
}
