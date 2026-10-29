// S8 拍摄日时间表：自动排程 + 拖动锁定时间（F29–F30）
import { h, confirmDlg, toast } from "../ui.js";
import { t, fmtDuration, fmtDate } from "../i18n.js";
import { S, commit, readonly } from "../store.js";
import * as M from "../model.js";
import { issuesList, personName, setupName, poseName, emptyState } from "./common.js";

export const SETUP_COLORS = ["#3b6fd8", "#2f8a4c", "#b8860b", "#8e44ad", "#c0392b", "#16a085", "#d35400", "#2c3e50"];
export const setupColor = (p, id) => SETUP_COLORS[Math.max(0, p.layout.setups.findIndex(s => s.id === id)) % SETUP_COLORS.length];

export function render(ctx) {
  const p = S.project, ro = readonly();
  if (!p.shots.length) return { main: h("div", h("h2.pt", t("step.schedule")), emptyState(t("sch.emptyTitle"), t("sch.emptyBody"), h("button.primary", { onclick: () => ctx.go("shots") }, t("sch.goShots")))), panel: null };
  const sch = M.schedule(p);
  const calls = M.callTimes(p);
  const nos = M.shotNumbers(p);
  const startAxis = Math.floor((Math.min(sch.start, ...calls.map(c => c.at)) - 15) / 30) * 30;
  const endAxis = Math.ceil((Math.max(sch.end, sch.avail.to) + 20) / 30) * 30;
  const PX = 4;                                  // 每分钟 4 像素
  const x = m => (m - startAxis) * PX;
  const width = (endAxis - startAxis) * PX;
  const ticks = [];
  for (let m = startAxis; m <= endAxis; m += 30) ticks.push(h("span", { style: { left: x(m) + "px" } }, m % 60 === 0 ? M.fmtMin(m) : "·"));

  const row = (label, bars) => h("div.ln", h("div.lab", { title: typeof label === "string" ? label : "" }, label), h("div.track", { style: { width: width + "px", "--hour": 60 * PX + "px", backgroundPosition: `${x(Math.ceil(startAxis / 60) * 60)}px 0` } },
    bars, h("div.limit", { style: { left: x(sch.avail.to) + "px" }, title: t("sch.availEnd", { t: M.fmtMin(sch.avail.to) }) })));
  const rows = [];
  // T25：付费模特工作时间背景条
  const workBars = M.paidWorkBars(p);
  for (const w of workBars) {
    const from = w.from ?? startAxis;
    const to = w.to ?? endAxis;
    const overShots = sch.items.filter(it => it.type === "shot" && it.end > (w.to ?? Infinity)).filter(it => {
      const s = p.shots.find(y => y.id === it.shotId);
      return s && M.resolveShot(p, s).personIds.includes(w.personId);
    });
    rows.push(row(
      h("span", t("sch.workOf", { name: w.name || personName(p, w.personId) })),
      [
        h("div.bar.work", {
          style: { left: x(from) + "px", width: Math.max(8, (to - from) * PX) + "px" },
          title: `${M.fmtMin(from)}–${M.fmtMin(to)}`,
        }, `${M.fmtMin(from)}–${M.fmtMin(to)}`),
        overShots.length ? h("span.blab.over", { style: { left: (x(w.to) + 6) + "px", color: "var(--y)" } }, t("sch.workOver", { n: overShots.length })) : null,
      ]));
  }
  for (const c of calls) {
    const label = c.role === "setup" ? t("time.setupCrew") : personName(p, c.personId);
    const end = c.role === "model" ? sch.start : sch.start;
    rows.push(row(h("span.mut", label), h("div.bar.buffer", { style: { left: x(c.at) + "px", width: Math.max(4, (end - c.at) * PX) + "px" } }, t("sch.callAt", { t: M.fmtMin(c.at) }))));
  }
  for (const it of sch.items) {
    if (it.type === "buffer") { rows.push(row(h("span.mut.small", it.reasons.map(r => t("sch.buf." + r)).join(" + ")), h("div.bar.buffer", { style: { left: x(it.start) + "px", width: (it.end - it.start) * PX + "px" } }, `${it.end - it.start}′`))); continue; }
    if (it.type === "gap") continue;
    const s = p.shots.find(y => y.id === it.shotId);
    const r = M.resolveShot(p, s);
    const label = `${nos.get(s.id)} ${poseName(s.poseId) || ""}`.trim();
    const bar = h("div.bar" + (s.priority === "opt" ? ".opt" : "") + (it.locked ? ".locked" : "") + (sch.cuttable.includes(s.id) ? ".cut" : ""), {
      style: { left: x(it.start) + "px", width: Math.max(8, (it.end - it.start) * PX) + "px", background: setupColor(p, r.setupId) },
      title: `${label}\n${M.fmtMin(it.start)}–${M.fmtMin(it.end)} · ${setupName(p, r.setupId)}${it.locked ? "\n" + t("sch.lockedTip") : "\n" + t("sch.dragTip")}`,
      ondblclick: () => { if (!ro && it.locked) commit(q => { delete q.schedule.locks[s.id]; }); },
    }, (it.end - it.start) * PX >= 44 ? `${M.fmtMin(it.start)}${it.locked ? " 🔒" : ""}` : (it.locked ? "🔒" : ""));
    const side = h("span.blab", { style: { left: (x(it.end) + 6) + "px" } }, `${M.fmtMin(it.start)}–${M.fmtMin(it.end)} · ${s.minutes || 0}′`);
    if (!ro) bar.addEventListener("pointerdown", ev => {
      const sx = ev.clientX, left0 = x(it.start);
      let moved = false, nt = it.start;
      bar.setPointerCapture(ev.pointerId);
      const mv = e => { const dm = Math.round((e.clientX - sx) / PX / 5) * 5; if (dm) moved = true; nt = it.start + dm; bar.style.left = (left0 + dm * PX) + "px"; side.textContent = `${M.fmtMin(nt)} →`; side.style.left = (left0 + dm * PX + (it.end - it.start) * PX + 6) + "px"; };
      const up = () => { bar.removeEventListener("pointermove", mv); bar.removeEventListener("pointerup", up); if (moved) commit(q => { q.schedule.locks[s.id] = M.fmtMin(nt); }); };
      bar.addEventListener("pointermove", mv); bar.addEventListener("pointerup", up);
    });
    rows.push(row(h("a", { href: "#", onclick: e => { e.preventDefault(); ctx.go("shots", { focus: s.id }); } }, label), [bar, side]));
  }
  const kpi = h("div.kpi",
    h("div", h("b", M.fmtMin(sch.start)), h("span", t("sch.start"))),
    h("div", h("b", M.fmtMin(sch.end)), h("span", t("sch.end"))),
    h("div", h("b", fmtDuration(sch.totalMin)), h("span", t("sch.total"))),
    h("div", h("b", fmtDuration(sch.avail.minutes)), h("span", t("sch.avail"))),
    h("div", h("b", { style: { color: sch.overMin ? "var(--y)" : "var(--g)" } }, sch.overMin ? "+" + fmtDuration(sch.overMin) : "✓"), h("span", sch.overMin ? t("sch.over") : t("sch.fits"))),
    h("div", h("b", fmtDuration(sch.bufMin)), h("span", t("sch.buffers"))));
  const legend = h("div.row.wrap.small", { style: { margin: "10px 0" } }, p.layout.setups.map(s => h("span.row", { style: { gap: "4px" } }, h("span", { style: { width: "12px", height: "12px", borderRadius: "3px", background: setupColor(p, s.id), display: "inline-block" } }), `${t("layout.setup")} ${s.name}`)),
    h("span.mut", t("sch.legendOpt")), h("span.spacer"),
    h("button.sm", { disabled: ro || p.scenes.length < 2 || null, onclick: () => commit(q => M.sortScenesForShoot(q)), title: t("shots.sortHelp") }, t("shots.sort")),
    h("button.sm", { disabled: ro || !Object.keys(p.schedule.locks).length || null, onclick: () => commit(q => { q.schedule.locks = {}; }) }, t("sch.clearLocks")));
  const gantt = h("div.gantt", h("div.axis", h("div.lab"), h("div.ticks", { style: { width: width + "px" } }, ticks)), rows);
  const main = h("div", h("h2.pt", t("step.schedule")), h("p.sub", (p.time.date ? fmtDate(p.time.date) + " · " : "") + t("sch.sub", { buf: p.time.bufferMin })), kpi, legend, gantt);

  const list = M.checks(p).filter(c => c.page === "schedule");
  const paidOver = list.filter(c => c.code === "paidOverWork");
  const panel = h("div",
    h("h4", t("panel.checks")), issuesList(p, list, ctx.go),
    paidOver.length ? [h("h4", t("sch.workOverTitle")), h("p.small.mut", t("sch.workOverHelp"))] : null,
    sch.overMin > 0 ? [h("h4", t("sch.cutTitle")), h("p.small.mut", t("sch.cutHelp", { m: sch.overMin })),
      h("ul.issues-list", sch.cuttable.map(id => { const s = p.shots.find(y => y.id === id); return h("li", { onclick: () => ctx.go("shots", { focus: id }) }, h("span", `${nos.get(id)} ${poseName(s.poseId) || ""} · ${s.minutes}′`)); })),
      sch.cuttable.length ? h("button.sm.danger", { disabled: ro || null, onclick: async () => {
        if (!await confirmDlg(t("sch.cutAll"), sch.cuttable.map(id => nos.get(id)).join("、"), { danger: true, ok: t("common.delete") })) return;
        commit(q => { const ids = new Set(sch.cuttable); const scs = new Set(q.shots.filter(s => ids.has(s.id)).map(s => s.sceneId)); q.shots = q.shots.filter(s => !ids.has(s.id)); scs.forEach(sc => M.renumber(q, sc)); });
        toast(t("sch.cutDone"));
      } }, t("sch.cutAll")) : null] : null,
    h("h4", t("panel.tips")), h("p.small.mut", t("sch.tip")));
  return { main, panel };
}
