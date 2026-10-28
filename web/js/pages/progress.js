// S8 进度看板：拍摄当天记录镜头状态，并导出分镜时间窗
import { h, toast, isTyping } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl } from "../store.js";
import * as M from "../model.js";
import { personName, lookName, setupName, cameraName, poseName, emptyState } from "./common.js";

const COLS = [
  ["planned", "prog.colPlanned"],
  ["shooting", "prog.colShooting"],
  ["done", "prog.colDone"],
  ["skipped", "prog.colSkipped"],
];

function shotStat(s) { return s.status || "planned"; }

function planItem(sch, shotId) {
  return sch.items.find(i => i.type === "shot" && i.shotId === shotId);
}

function deltaVsPlan(shot, sch, tz) {
  if (!shot.startedAt) return null;
  const it = planItem(sch, shot.id);
  if (!it || !S.project.time.date) return null;
  const planIso = wallToApproxIso(S.project.time.date, it.start, tz);
  const plan = new Date(planIso).getTime();
  const actual = new Date(shot.startedAt).getTime();
  if (Number.isNaN(plan) || Number.isNaN(actual)) return null;
  return Math.round((actual - plan) / 60000);
}

/** 拍摄日 + 分钟 → 带时区偏移的近似 ISO（用于比较） */
function wallToApproxIso(dateStr, min, tz) {
  const wall = M.wallFromMin(dateStr, min);
  const fake = new Date(wall.replace(" ", "T") + "Z");
  const off = M.tzOffsetMinutes(fake, tz);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return wall.replace(" ", "T") + `${sign}${oh}:${om}`;
}

function setTimeOnDate(dateStr, hhmm, tz) {
  if (!dateStr || !hhmm) return "";
  const off = M.tzOffsetMinutes(new Date(), tz);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${dateStr}T${hhmm}:00${sign}${oh}:${om}`;
}

function hhmmFromIso(iso, tz) {
  if (!iso) return "";
  const wall = M.isoToWall(iso, tz);
  return wall ? wall.slice(11, 16) : "";
}

export function render(ctx) {
  const p = S.project, st = ctx.state;
  st.focus = st.focus || null;
  const tz = p.time.timezone || "Asia/Shanghai";
  const nos = M.shotNumbers(p);
  const sch = M.schedule(p);
  const shots = M.orderedShots(p);

  if (!shots.length) {
    return {
      main: h("div", h("h2.pt", t("step.progress")), emptyState(t("prog.emptyTitle"), t("prog.emptyBody"),
        h("button.primary", { onclick: () => ctx.go("shots") }, t("prog.goShots")))),
      panel: null,
    };
  }

  const by = { planned: [], shooting: [], done: [], skipped: [] };
  for (const s of shots) by[shotStat(s)]?.push(s);

  const doneN = by.done.length, skipN = by.skipped.length, total = shots.length;
  const current = by.shooting[0];
  let deltaLine = null;
  if (current) {
    const d = deltaVsPlan(current, sch, tz);
    if (d != null) deltaLine = d === 0 ? t("prog.onTime") : d > 0 ? t("prog.late", { n: d }) : t("prog.early", { n: -d });
  }

  const force = (fn) => commit(fn, { force: true });

  const startShot = (id) => {
    const now = M.nowIso(tz);
    force(q => {
      for (const s of q.shots) {
        if (shotStat(s) === "shooting" && s.id !== id) {
          s.status = "done";
          s.completedAt = now;
          toast(t("prog.autoDone", { shot: nos.get(s.id) }));
        }
      }
      const s = q.shots.find(x => x.id === id);
      s.status = "shooting";
      if (!s.startedAt) s.startedAt = now;
      s.completedAt = "";
    });
  };
  const finishShot = (id) => force(q => {
    const s = q.shots.find(x => x.id === id);
    s.status = "done";
    s.completedAt = M.nowIso(tz);
    if (!s.startedAt) s.startedAt = s.completedAt;
  });
  const skipShot = (id) => force(q => {
    const s = q.shots.find(x => x.id === id);
    s.status = "skipped";
  });
  const reopen = (id) => force(q => {
    const s = q.shots.find(x => x.id === id);
    s.status = "shooting";
    s.completedAt = "";
    if (!s.startedAt) s.startedAt = M.nowIso(tz);
  });
  const toPlanned = (id) => force(q => {
    const s = q.shots.find(x => x.id === id);
    s.status = "planned";
    s.startedAt = "";
    s.completedAt = "";
  });
  const restore = (id) => force(q => {
    const s = q.shots.find(x => x.id === id);
    s.status = "planned";
  });

  const card = (s) => {
    const r = M.resolveShot(p, s);
    const it = planItem(sch, s.id);
    const plan = it ? `${M.fmtMin(it.start)}–${M.fmtMin(it.end)}` : "—";
    const on = st.focus === s.id;
    const acts = {
      planned: [
        h("button.sm.primary", { onclick: e => { e.stopPropagation(); startShot(s.id); } }, t("prog.start")),
        h("button.sm", { onclick: e => { e.stopPropagation(); skipShot(s.id); } }, t("prog.skip")),
      ],
      shooting: [
        h("button.sm.primary", { onclick: e => { e.stopPropagation(); finishShot(s.id); } }, t("prog.done")),
        h("button.sm", { onclick: e => { e.stopPropagation(); toPlanned(s.id); } }, t("prog.back")),
      ],
      done: [
        h("button.sm", { onclick: e => { e.stopPropagation(); reopen(s.id); } }, t("prog.reshoot")),
      ],
      skipped: [
        h("button.sm", { onclick: e => { e.stopPropagation(); restore(s.id); } }, t("prog.restore")),
      ],
    }[shotStat(s)];

    const timeRow = (label, field) => h("div.row.small", { style: { gap: "6px", marginTop: "4px" } },
      h("span.mut", label),
      h("input", {
        type: "time", value: hhmmFromIso(s[field], tz),
        onclick: e => e.stopPropagation(),
        onchange: e => {
          const v = e.target.value;
          force(q => { q.shots.find(x => x.id === s.id)[field] = v ? setTimeOnDate(p.time.date || M.isoToWall(M.nowIso(tz), tz).slice(0, 10), v, tz) : ""; });
        },
      }));

    return h("div.pcard" + (on ? ".on" : ""), {
      tabindex: 0,
      onclick: () => { st.focus = s.id; ctx.rerender(); },
      "data-shot": s.id,
    },
      h("div.nm", `${nos.get(s.id)} · ${poseName(s.poseId) || t("prog.noPose")}`),
      (s.refs || [])[0] ? h("img", { src: fileUrl(s.refs[0]), alt: "", style: { width: "100%", borderRadius: "6px", marginTop: "6px", maxHeight: "80px", objectFit: "cover" } }) : null,
      h("div.meta", t("prog.plan") + " " + plan),
      timeRow(t("prog.started"), "startedAt"),
      timeRow(t("prog.completed"), "completedAt"),
      h("div.row.wrap", { style: { marginTop: "8px", gap: "4px" } }, acts));
  };

  const board = h("div.prog-board", COLS.map(([k, label]) =>
    h("div.prog-col",
      h("div.row", h("b", t(label)), h("span.small.mut", String(by[k].length))),
      by[k].length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" } }, by[k].map(card))
        : h("p.small.mut", t("prog.colEmpty")))));

  const summary = h("div.card",
    h("div.row.wrap", { style: { gap: "16px" } },
      h("span", t("prog.summaryDone", { n: doneN, total })),
      h("span", t("prog.summarySkip", { n: skipN })),
      current ? h("span", t("prog.summaryNow", { shot: nos.get(current.id) })) : h("span.mut", t("prog.summaryIdle")),
      deltaLine ? h("span", deltaLine) : null));

  const focus = shots.find(s => s.id === st.focus);
  let panel;
  if (focus) {
    const r = M.resolveShot(p, focus);
    panel = h("div",
      h("h4", `${nos.get(focus.id)} ${poseName(focus.poseId) || ""}`),
      h("p.small", focus.cue || h("span.mut", t("prog.noCue"))),
      h("p.small", t("shots.model") + "：" + (r.personIds.map(id => personName(p, id)).join("、") || "—")),
      h("p.small", t("time.looks") + "：" + (r.lookIds.map(id => lookName(p, id)).join("、") || "—")),
      h("p.small", t("layout.setup") + "：" + (setupName(p, r.setupId) || "—")),
      h("p.small", t("el.camera") + "：" + (cameraName(p, r.setupId, r.cameraId) || "—")),
      h("button.sm", { style: { marginTop: "10px" }, onclick: () => ctx.go("shots", { focus: focus.id }) }, t("prog.openShot")));
  } else {
    panel = h("div",
      h("h4", t("prog.exportTitle")),
      h("p.small.mut", t("prog.exportHelp")),
      h("button.primary", { onclick: () => downloadPlan(p) }, t("prog.export")),
      h("h4", t("panel.keys")),
      h("p.small.mut", t("prog.keys")));
  }

  return {
    main: h("div", h("h2.pt", t("step.progress")), h("p.sub", t("progress.sub")), summary, board),
    panel,
    onKey(e) {
      if (isTyping(e) || !st.focus) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); startShot(st.focus); }
      if (k === "d") { e.preventDefault(); finishShot(st.focus); }
      if (k === "k") { e.preventDefault(); skipShot(st.focus); }
    },
  };
}

function downloadPlan(p) {
  const labels = {
    poseName: id => poseName(id),
    sizeLabel: s => s ? t("size." + s) : "",
    setupName: id => setupName(p, id),
    cameraName: (sid, cid) => cameraName(p, sid, cid),
    personName: id => personName(p, id),
    lookName: id => lookName(p, id),
    propName: id => (p.props.find(x => x.id === id) || {}).name || "",
  };
  const data = M.timeWindows(p, labels);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name || "plan"}.plan.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t("prog.exported"));
}
