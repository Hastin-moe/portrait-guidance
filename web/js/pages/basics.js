// S1 基础信息：项目概况 + 地点 + 拍摄时间（含时区）+ 到场时间 + 工作人员
import { h, confirmDlg } from "../ui.js";
import { t, fmtDate, fmtDuration } from "../i18n.js";
import { S, commit, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, area, fld, tagsInput, issuesList } from "./common.js";

export const TIMEZONES = [
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Asia/Hong_Kong", "Asia/Taipei",
  "Asia/Singapore", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "UTC",
];

export function render(ctx) {
  const p = S.project, st = ctx.state, ro = readonly();
  const tm = (k, label, type = "time") => fld(label, inp(() => p.time[k], (q, v) => { q.time[k] = v; }, { type, min: type === "number" ? 0 : null, step: type === "number" ? 5 : null }));

  const info = h("div.card",
    h("h3", t("ov.basic")),
    h("div.grid2",
      fld(t("ov.name") + " *", inp(() => p.name, (q, v) => { q.name = v; }, { placeholder: t("proj.namePh") })),
      fld(t("ov.keywords"), tagsInput([...p.overview.keywords], v => commit(q => { q.overview.keywords = v; }), t("ov.keywordsPh")), t("ov.keywordsHelp"))),
    fld(t("ov.theme") + " *", area(() => p.overview.theme, (q, v) => { q.overview.theme = v; }, { placeholder: t("ov.themePh"), rows: 4 })),
    h("div.row", h("button.sm", { disabled: true, title: t("common.deferred") }, "✦ " + t("ov.aiDraft")), h("span.small.mut", t("common.deferred"))),
    h("details.more", h("summary", t("common.more")),
      h("div.grid2",
        fld(t("ov.client"), inp(() => p.overview.client, (q, v) => { q.overview.client = v; })),
        fld(t("ov.purpose"), inp(() => p.overview.purpose, (q, v) => { q.overview.purpose = v; }, { placeholder: t("ov.purposePh") })))));

  const loc = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("basics.location")), h("span.spacer"),
      h("button.sm", { onclick: () => ctx.go("site") }, t("basics.editSite"))),
    h("div.grid2", { style: { marginTop: "10px" } },
      fld(t("venue.name"), inp(() => p.venue.name, (q, v) => { q.venue.name = v; })),
      fld(t("venue.address"), inp(() => p.venue.address, (q, v) => { q.venue.address = v; }))));

  const timeCard = h("div.card", h("h3", t("time.title")),
    h("div.grid3",
      fld(t("time.date") + " *", inp(() => p.time.date, (q, v) => { q.time.date = v; }, { type: "date" })),
      tm("start", t("time.start")), tm("end", t("time.end"))),
    h("div.grid3", { style: { marginTop: "10px" } },
      tm("venueFrom", t("time.venueFrom")), tm("venueTo", t("time.venueTo")),
      fld(t("basics.tz"), h("select", {
        disabled: ro || null,
        onchange: e => commit(q => { q.time.timezone = e.target.value; }),
      }, TIMEZONES.map(z => h("option", { value: z, selected: (p.time.timezone || "Asia/Shanghai") === z || null }, z))))),
    h("div.grid3", { style: { marginTop: "10px" } }, tm("makeupMin", t("time.makeupMin"), "number"), tm("setupMin", t("time.setupMin"), "number"), tm("bufferMin", t("time.bufferMin"), "number")),
    p.time.date ? h("p.small.mut", fmtDate(p.time.date)) : null);

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
  const callCard = h("div.card", h("h3", t("time.calls")), callsBox);

  const ss = M.staff(p);
  const addStaff = () => {
    const id = M.uid();
    commit(q => { q.people.push({ id, kind: "staff", name: t("time.staffN", { n: M.staff(q).length + 1 }), role: "", contact: "" }); });
    st.selected = id; ctx.rerender();
  };
  const pcard = x => h("div.pcard" + (x.id === st.selected ? ".on" : ""), { tabindex: 0, onclick: () => { st.selected = x.id; ctx.rerender(); } },
    h("div.nm", x.name || "—"),
    h("div.meta", [x.role, x.contact].filter(Boolean).join(" · ") || "—"));
  const staffCard = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("time.staff") + ` (${ss.length})`), h("span.spacer"),
      h("button.sm", { disabled: ro || null, onclick: addStaff }, "＋ " + t("time.addStaff"))),
    h("div", { style: { height: "8px" } }),
    ss.length ? h("div.cards", ss.map(pcard)) : h("p.small.mut", t("time.noStaff")));

  const x = ss.find(y => y.id === st.selected);
  let panel;
  if (x) {
    const set = k => inp(() => x[k], (q, v) => { M.personById(q, x.id)[k] = v; });
    panel = h("div",
      h("h4", t("time.staffOne")),
      fld(t("time.name"), set("name")),
      fld(t("time.role"), set("role")),
      fld(t("time.contact"), set("contact")),
      h("div.row", { style: { marginTop: "14px" } }, h("button.sm.danger", { disabled: ro || null, onclick: async () => {
        st.selected = null;
        commit(q => { q.people = q.people.filter(y => y.id !== x.id); });
      } }, t("common.delete"))));
  } else {
    const list = M.checks(p).filter(c => c.page === "basics");
    panel = h("div", h("h4", t("panel.checks")), issuesList(p, list, ctx.go),
      h("h4", t("panel.tips")), h("p.small.mut", t("basics.tip")),
      M.models(p).length ? null : h("p.small.mut", t("basics.modelsHint")));
  }

  return {
    main: h("div",
      h("h2.pt", t("step.basics")), h("p.sub", t("basics.sub")),
      info, loc,
      h("div.grid2", { style: { alignItems: "start" } }, timeCard, callCard),
      staffCard),
    panel,
  };
}
