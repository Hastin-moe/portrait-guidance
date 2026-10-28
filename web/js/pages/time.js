// S2 时间与人员（F08–F09）
import { h, confirmDlg } from "../ui.js";
import { t, fmtDate, fmtDuration } from "../i18n.js";
import { S, commit, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, fld, issuesList, emptyState } from "./common.js";

export function render(ctx) {
  const p = S.project, st = ctx.state;
  const tm = (k, label, type = "time") => fld(label, inp(() => p.time[k], (q, v) => { q.time[k] = v; }, { type, min: type === "number" ? 0 : null, step: type === "number" ? 5 : null }));
  const calls = M.callTimes(p);
  const av = M.availability(p);
  const callsBox = h("div", { "data-live": "calls" });
  const drawCalls = () => {
    const c = M.callTimes(p), a = M.availability(p);
    callsBox.replaceChildren(
      h("table.grid", h("tr", h("th", t("time.who")), h("th", t("time.callAt"))),
        c.map(x => h("tr", h("td", x.role === "setup" ? t("time.setupCrew") : (M.personById(p, x.personId) || {}).name || "—"), h("td", M.fmtMin(x.at))))),
      h("p.small.mut", { style: { marginTop: "8px" } }, t("time.window", { from: M.fmtMin(a.from), to: M.fmtMin(a.to), dur: fmtDuration(a.minutes) }),
        a.limitedBy ? " " + t("time.limitedBy", { name: (M.personById(p, a.limitedBy) || {}).name }) : ""));
  };
  drawCalls(); ctx.live(drawCalls);

  const timeCard = h("div.card", h("h3", t("time.title")),
    h("div.grid3", fld(t("time.date") + " *", inp(() => p.time.date, (q, v) => { q.time.date = v; }, { type: "date" })),
      tm("start", t("time.start")), tm("end", t("time.end"))),
    h("div.grid3", { style: { marginTop: "10px" } }, tm("venueFrom", t("time.venueFrom")), tm("venueTo", t("time.venueTo")), h("span")),
    h("div.grid3", { style: { marginTop: "10px" } }, tm("makeupMin", t("time.makeupMin"), "number"), tm("setupMin", t("time.setupMin"), "number"), tm("bufferMin", t("time.bufferMin"), "number")),
    p.time.date ? h("p.small.mut", fmtDate(p.time.date)) : null);
  const callCard = h("div.card", h("h3", t("time.calls")), callsBox);

  const ms = M.models(p), ss = M.staff(p);
  const addPerson = kind => {
    const id = M.uid();
    commit(q => {
      const x = { id, kind, name: kind === "model" ? t("time.modelN", { n: M.models(q).length + 1 }) : t("time.staffN", { n: M.staff(q).length + 1 }) };
      if (kind === "model") { Object.assign(x, { height: "", size: "", availFrom: "", availTo: "" }); M.setLookCount(x, 1, i => t("time.lookN", { n: i + 1 })); }
      else Object.assign(x, { role: "", contact: "" });
      q.people.push(x);
    });
    st.selected = id; ctx.rerender();
  };
  const pcard = x => h("div.pcard" + (x.id === st.selected ? ".on" : ""), { tabindex: 0, onclick: () => { st.selected = x.id; ctx.rerender(); } },
    h("div.nm", x.name || "—"),
    x.kind === "model"
      ? h("div.meta", [x.height && x.height + " cm", x.size, t("time.looksN", { n: (x.looks || []).length }), x.availTo && t("time.until", { t: x.availTo })].filter(Boolean).join(" · "))
      : h("div.meta", [x.role, x.contact].filter(Boolean).join(" · ") || "—"));
  const peopleCard = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("time.models") + ` (${ms.length})`), h("span.spacer"), h("button.sm", { disabled: readonly() || null, onclick: () => addPerson("model") }, "＋ " + t("time.addModel"))),
    h("div", { style: { height: "8px" } }),
    ms.length ? h("div.cards", ms.map(pcard)) : emptyState(t("time.noModels"), t("time.noModelsBody")),
    h("div.row", { style: { marginTop: "16px" } }, h("h3", { style: { margin: 0 } }, t("time.staff") + ` (${ss.length})`), h("span.spacer"), h("button.sm", { disabled: readonly() || null, onclick: () => addPerson("staff") }, "＋ " + t("time.addStaff"))),
    h("div", { style: { height: "8px" } }),
    ss.length ? h("div.cards", ss.map(pcard)) : h("p.small.mut", t("time.noStaff")));

  const x = p.people.find(y => y.id === st.selected);
  let panel;
  if (x) {
    const set = (k, type) => inp(() => x[k], (q, v) => { M.personById(q, x.id)[k] = v; }, { type });
    const usedBy = p.shots.filter(s => M.resolveShot(p, s).personIds.includes(x.id)).length + p.scenes.filter(sc => sc.personIds.includes(x.id)).length;
    panel = h("div",
      h("h4", x.kind === "model" ? t("time.model") : t("time.staffOne")),
      fld(t("time.name"), set("name")),
      x.kind === "model" ? [
        h("div.grid2", fld(t("time.height"), set("height", "number")), fld(t("time.size"), set("size"))),
        h("div.grid2", fld(t("time.availFrom"), set("availFrom", "time")), fld(t("time.availTo"), set("availTo", "time"))),
        h("h4", t("time.looks"), h("span", h("button.sm", { disabled: readonly() || null, onclick: () => commit(q => { const y = M.personById(q, x.id); M.setLookCount(y, y.looks.length + 1, i => t("time.lookN", { n: i + 1 })); }) }, "＋"))),
        h("p.small.mut", t("time.looksHelp")),
        x.looks.map((l, i) => h("div.row", { style: { marginBottom: "4px" } },
          inp(() => l.name, (q, v) => { M.personById(q, x.id).looks[i].name = v; }),
          h("button.sm.ghost", { disabled: readonly() || null, title: t("common.delete"), onclick: async () => {
            const n = p.shots.filter(s => (s.lookIds || []).includes(l.id)).length + p.scenes.filter(sc => (sc.lookIds || []).includes(l.id)).length;
            if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n }))) return;
            commit(q => { M.personById(q, x.id).looks.splice(i, 1); });
          } }, "×"))),
      ] : [fld(t("time.role"), set("role")), fld(t("time.contact"), set("contact"))],
      h("div.row", { style: { marginTop: "14px" } }, h("button.sm.danger", { disabled: readonly() || null, onclick: async () => {
        if (usedBy && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n: usedBy }), { danger: true, ok: t("common.delete") })) return;
        st.selected = null;
        commit(q => { q.people = q.people.filter(y => y.id !== x.id); });
      } }, t("common.delete"))));
  } else {
    panel = h("div", h("h4", t("panel.checks")), issuesList(p, M.checks(p).filter(c => c.page === "time"), ctx.go), h("h4", t("panel.tips")), h("p.small.mut", t("time.tip")));
  }
  return { main: h("div", h("h2.pt", t("step.time")), h("p.sub", t("time.sub")), h("div.grid2", { style: { alignItems: "start" } }, timeCard, callCard), peopleCard), panel };
}
