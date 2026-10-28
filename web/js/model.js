// 领域逻辑：只做计算，不碰界面和网络。页面、导出、测试都调用这里。
// 规格对应：场景继承（S6）、镜号、器材用量（F12）、自动排程（F29/F30）、完整度检查（F37）。

export const SCHEMA = 1;

export function uid() {
  const a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return [...a].map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}

// ---------- 时间 ----------
export function toMin(hhmm) {
  if (typeof hhmm !== "string" || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fmtMin(min) {
  if (min == null || Number.isNaN(min)) return "";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}
export function fmtDur(min) {
  min = Math.max(0, Math.round(min || 0));
  const h = Math.floor(min / 60), m = min % 60;
  return { h, m };
}

// ---------- 项目骨架 ----------
export function blankProject(name = "") {
  return normalize({ name });
}

export function normalize(p) {
  p = p || {};
  const d = (obj, def) => Object.assign(def, obj || {});
  p.schema = SCHEMA;
  p.name = p.name || "";
  p.status = p.status || "draft";                 // draft | pending | final
  p.overview = d(p.overview, { theme: "", keywords: [], client: "", purpose: "" });
  p.mood = Array.isArray(p.mood) ? p.mood : [];
  for (const m of p.mood) {
    if (m.source == null) m.source = "";
    if (m.url == null) m.url = "";
  }
  p.time = d(p.time, { date: "", start: "09:00", end: "17:00", venueFrom: "", venueTo: "", makeupMin: 60, setupMin: 30, bufferMin: 10, timezone: "Asia/Shanghai" });
  if (!p.time.timezone) p.time.timezone = "Asia/Shanghai";
  p.people = Array.isArray(p.people) ? p.people : [];
  for (const x of p.people) {
    x.kind = x.kind || "model";
    if (x.kind === "model") x.looks = Array.isArray(x.looks) ? x.looks : [];
  }
  p.venue = d(p.venue, { libId: "", name: "", address: "", contact: "", indoor: true, w: "", d: "", h: "",
    photos: [], windowDir: "", daylight: "", surfaces: "", power: "", zones: "", gear: [] });
  p.venue.gear = Array.isArray(p.venue.gear) ? p.venue.gear : [];
  p.venue.photos = Array.isArray(p.venue.photos) ? p.venue.photos : [];
  p.gear = Array.isArray(p.gear) ? p.gear : [];
  p.props = Array.isArray(p.props) ? p.props : [];
  p.packing = d(p.packing, {});                  // 打包清单勾选状态：key -> true
  p.layout = d(p.layout, { underlay: null, base: [], setups: [], activeSetup: "" });
  p.layout.base = Array.isArray(p.layout.base) ? p.layout.base : [];
  p.layout.setups = Array.isArray(p.layout.setups) ? p.layout.setups : [];
  if (!p.layout.setups.length) p.layout.setups.push({ id: uid(), name: "A", elements: [] });
  for (const s of p.layout.setups) s.elements = Array.isArray(s.elements) ? s.elements : [];
  if (!p.layout.setups.some(s => s.id === p.layout.activeSetup)) p.layout.activeSetup = p.layout.setups[0].id;
  p.scenes = Array.isArray(p.scenes) ? p.scenes : [];
  p.shots = Array.isArray(p.shots) ? p.shots : [];
  p.schedule = d(p.schedule, { locks: {} });
  p.schedule.locks = p.schedule.locks || {};
  p.ui = d(p.ui, { columns: ["no", "ref", "size", "model", "pose", "min", "pri", "check"], collapsed: {} });
  p.exportOpts = d(p.exportOpts, { sections: { cover: true, overview: true, schedule: true, people: true, gear: true, layout: true, shots: true }, lang: "", refs: true, paper: "A4" });
  return p;
}

// ---------- 人员与造型 ----------
export const models = p => p.people.filter(x => x.kind === "model");
export const staff = p => p.people.filter(x => x.kind === "staff");
export const personById = (p, id) => p.people.find(x => x.id === id);

export function setLookCount(person, n, namer = i => String(i + 1)) {
  n = Math.max(0, Math.min(20, Math.floor(Number(n) || 0)));
  const looks = person.looks || (person.looks = []);
  while (looks.length < n) looks.push({ id: uid(), name: namer(looks.length) });
  looks.length = n;
  return person;
}

export function allLooks(p) {
  const out = [];
  for (const m of models(p)) for (const l of m.looks || []) out.push({ ...l, personId: m.id, personName: m.name });
  return out;
}
export const lookById = (p, id) => allLooks(p).find(l => l.id === id);

// ---------- 器材 ----------
// 场地器材与自带器材合并，用 "v:id" / "o:id" 区分来源
export function gearList(p) {
  return [
    ...p.venue.gear.map(g => ({ ...g, key: "v:" + g.id, source: "venue" })),
    ...p.gear.map(g => ({ ...g, key: "o:" + g.id, source: g.source || "own" })),
  ];
}
export const gearByKey = (p, key) => gearList(p).find(g => g.key === key);

export function setupById(p, id) { return p.layout.setups.find(s => s.id === id); }

export function gearUsage(p, setupId) {
  const s = setupById(p, setupId);
  const use = new Map();
  if (!s) return use;
  for (const e of s.elements) if (e.kind === "light" && e.ref) use.set(e.ref, (use.get(e.ref) || 0) + 1);
  return use;
}

// 每件器材的「布置图最多用了几件 / 总数」：取所有布光方案里用量最大的一套
export function gearUsedMax(p) {
  const out = new Map();
  for (const s of p.layout.setups) for (const [k, n] of gearUsage(p, s.id)) out.set(k, Math.max(out.get(k) || 0, n));
  return out;
}

export function cameras(p, setupId) {
  const s = setupById(p, setupId);
  return s ? s.elements.filter(e => e.kind === "camera") : [];
}

// ---------- 场景与镜头 ----------
export const INHERITED = ["setupId", "cameraId", "personIds", "lookIds"];

export function sceneById(p, id) { return p.scenes.find(s => s.id === id); }

export function orderedShots(p) {
  const out = [];
  p.scenes.forEach(sc => {
    p.shots.filter(s => s.sceneId === sc.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach(s => out.push(s));
  });
  return out;
}

export function shotsOfScene(p, sceneId) {
  return p.shots.filter(s => s.sceneId === sceneId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// 镜头没填的字段继承场景；返回的 own 标记哪些是本镜改写
export function resolveShot(p, shot) {
  const sc = sceneById(p, shot.sceneId) || {};
  const r = { own: {} };
  for (const f of INHERITED) {
    const v = shot[f];
    const has = Array.isArray(v) ? true : (v !== undefined && v !== null && v !== "");
    r.own[f] = has;
    r[f] = has ? v : (sc[f] ?? (f.endsWith("Ids") ? [] : ""));
  }
  r.personIds = r.personIds || [];
  r.lookIds = r.lookIds || [];
  // 本镜换了布光方案而没指定机位时，继承来的机位可能不属于新方案：改用新方案里的第一个机位
  if (!r.own.cameraId && r.setupId) {
    const cams = cameras(p, r.setupId);
    if (!cams.some(c => c.id === r.cameraId)) r.cameraId = cams[0] ? cams[0].id : "";
  }
  return r;
}

const pad = n => String(n).padStart(2, "0");
export function shotNumbers(p) {
  const map = new Map();
  p.scenes.forEach((sc, i) => {
    shotsOfScene(p, sc.id).forEach((s, j) => map.set(s.id, s.lockedNo || `S${pad(i + 1)}-${pad(j + 1)}`));
  });
  return map;
}

export function renumber(p, sceneId) {
  shotsOfScene(p, sceneId).forEach((s, i) => { s.order = i; });
}

export function newScene(p, name = "") {
  const prev = p.scenes[p.scenes.length - 1];
  const sc = { id: uid(), name, setupId: prev ? prev.setupId : (p.layout.setups[0] || {}).id || "", cameraId: "", personIds: prev ? [...prev.personIds] : [], lookIds: [] };
  p.scenes.push(sc);
  return sc;
}

export function newShot(p, sceneId, afterId = null) {
  const list = shotsOfScene(p, sceneId);
  const shot = { id: uid(), sceneId, order: 0, size: "", focal: "", poseId: "", cue: "", props: [], refs: [], minutes: 10, priority: "must", notes: "" };
  let idx = list.length;
  if (afterId) { const i = list.findIndex(s => s.id === afterId); if (i >= 0) idx = i + 1; }
  list.splice(idx, 0, shot);
  p.shots.push(shot);
  list.forEach((s, i) => { s.order = i; });
  return shot;
}

export function moveShot(p, shotId, delta) {
  const shot = p.shots.find(s => s.id === shotId);
  if (!shot) return;
  const list = shotsOfScene(p, shot.sceneId);
  const i = list.indexOf(shot), j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((s, k) => { s.order = k; });
}

export function moveShotToScene(p, shotId, sceneId) {
  const shot = p.shots.find(s => s.id === shotId);
  if (!shot || shot.sceneId === sceneId) return;
  const old = shot.sceneId;
  shot.sceneId = sceneId;
  shot.order = 1e6;
  renumber(p, old); renumber(p, sceneId);
}

// 按布光方案、再按造型整理场景顺序，减少换灯换装（F29）
export function sortScenesForShoot(p) {
  const setupOrder = new Map(p.layout.setups.map((s, i) => [s.id, i]));
  const key = sc => [setupOrder.get(sc.setupId) ?? 999, (sc.lookIds || []).join(",")];
  p.scenes.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1].localeCompare(kb[1]); });
}

// ---------- 排程 ----------
export function availability(p, personIds = null) {
  const t = p.time;
  const start = toMin(t.start) ?? 540;
  let from = Math.max(start, toMin(t.venueFrom) ?? start);
  let to = toMin(t.venueTo) ?? toMin(t.end) ?? start + 480;
  if (toMin(t.end) != null) to = Math.min(to, toMin(t.end));
  const ms = models(p).filter(m => !personIds || personIds.includes(m.id));
  let limit = null;
  for (const m of ms) {
    const e = toMin(m.availTo);
    if (e != null) to = Math.min(to, e);
    if (e != null && (limit == null || e < limit.at)) limit = { personId: m.id, at: e };
  }
  return { from, to, minutes: Math.max(0, to - from), limitedBy: limit && limit.at === to ? limit.personId : null };
}

export function callTimes(p) {
  const t = p.time;
  const start = toMin(t.start) ?? 540;
  const out = [];
  out.push({ role: "setup", at: start - (Number(t.setupMin) || 0) });
  for (const m of models(p)) out.push({ role: "model", personId: m.id, at: start - (Number(t.makeupMin) || 0) });
  for (const s of staff(p)) out.push({ role: "staff", personId: s.id, at: /化妆|makeup|メイク|메이크업/i.test(s.role || "") ? start - (Number(t.makeupMin) || 0) - 15 : start - (Number(t.setupMin) || 0) });
  return out.sort((a, b) => a.at - b.at);
}

export function schedule(p) {
  const t = p.time;
  const start = toMin(t.start) ?? 540;
  const buffer = Math.max(0, Number(t.bufferMin ?? 10));
  const avail = availability(p);
  const items = [];
  let cursor = Math.max(start, avail.from);
  let prev = null;
  let mustMin = 0, optMin = 0, bufMin = 0;
  const conflicts = [];
  for (const shot of orderedShots(p)) {
    const r = resolveShot(p, shot);
    if (prev) {
      const reasons = [];
      if (r.setupId !== prev.setupId) reasons.push("light");
      if (r.lookIds.slice().sort().join() !== prev.lookIds.slice().sort().join()) reasons.push("look");
      if (reasons.length && buffer) {
        items.push({ type: "buffer", start: cursor, end: cursor + buffer, reasons });
        cursor += buffer; bufMin += buffer;
      }
    }
    const lock = toMin(p.schedule.locks[shot.id]);
    if (lock != null) {
      if (lock > cursor) { items.push({ type: "gap", start: cursor, end: lock }); cursor = lock; }
      else if (lock < cursor) conflicts.push({ shotId: shot.id, lock, at: cursor });
    }
    const dur = Math.max(0, Number(shot.minutes) || 0);
    items.push({ type: "shot", shotId: shot.id, start: cursor, end: cursor + dur, setupId: r.setupId, priority: shot.priority, locked: lock != null });
    if (shot.priority === "opt") optMin += dur; else mustMin += dur;
    cursor += dur;
    prev = r;
  }
  const end = cursor;
  const overMin = Math.max(0, end - avail.to);
  // 超时时，从时长最长的可选镜头开始建议删减，直到抵消超出量
  const cuttable = [];
  if (overMin > 0) {
    let need = overMin;
    const opts = p.shots.filter(s => s.priority === "opt").sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
    for (const s of opts) { if (need <= 0) break; cuttable.push(s.id); need -= Number(s.minutes) || 0; }
  }
  return { start: Math.max(start, avail.from), end, items, avail, overMin, cuttable, conflicts,
    mustMin: mustMin + bufMin, optMin, bufMin, totalMin: end - Math.max(start, avail.from) };
}

// ---------- 检查（F37） ----------
// level: error 必填缺失 / warn 警告 / info 提示；page: 对应步骤 key
export function checks(p) {
  const out = [];
  const add = (level, code, page, extra = {}) => out.push({ level, code, page, ...extra });
  if (!p.name.trim()) add("error", "name", "basics", { field: "name" });
  if (!p.time.date) add("error", "date", "basics", { field: "date" });
  if (!p.venue.name.trim()) add("error", "venue", "site", { field: "name" });
  if (!(Number(p.venue.w) > 0 && Number(p.venue.d) > 0)) add("error", "venueSize", "site", { field: "w" });

  const allLookIds = new Map(allLooks(p).map(l => [l.id, l.personId]));
  for (const shot of p.shots) {
    const r = resolveShot(p, shot);
    if (!r.setupId || !setupById(p, r.setupId)) add("error", "shotSetup", "shots", { id: shot.id, field: "setupId" });
    if (!r.personIds.length) add("error", "shotModel", "shots", { id: shot.id, field: "personIds" });
    for (const lid of r.lookIds) {
      const owner = allLookIds.get(lid);
      if (!owner || !r.personIds.includes(owner)) { add("warn", "lookMismatch", "shots", { id: shot.id, field: "lookIds" }); break; }
    }
    if (!(shot.refs || []).length) add("warn", "noRef", "shots", { id: shot.id, field: "refs" });
  }
  const gear = new Map(gearList(p).map(g => [g.key, g]));
  for (const s of p.layout.setups) {
    for (const [k, n] of gearUsage(p, s.id)) {
      const g = gear.get(k);
      if (g && n > (Number(g.qty) || 0)) add("warn", "gearOver", "site", { id: k, setupId: s.id, used: n, qty: Number(g.qty) || 0 });
    }
    for (const e of s.elements) {
      if ((e.kind === "light" || e.kind === "prop") && !e.ref) add("warn", "unbound", "layout", { id: e.id, setupId: s.id });
    }
    const referenced = p.scenes.some(sc => sc.setupId === s.id)
      || p.shots.some(sh => resolveShot(p, sh).setupId === s.id);
    if (referenced && !s.elements.some(e => e.kind === "light")) {
      add("warn", "setupEmpty", "layout", { setupId: s.id, setup: s.name });
    }
  }
  if (p.shots.length) {
    const sch = schedule(p);
    if (sch.overMin > 0) add("warn", "overTime", "schedule", { minutes: sch.overMin });
    for (const c of sch.conflicts) add("warn", "lockConflict", "schedule", { id: c.shotId });
  }
  if (p.status === "final" && p.props.some(x => x.status !== "ready")) add("info", "propsNotReady", "site");
  return out;
}

export function shotIssues(list) {
  const map = new Map();
  for (const c of list) if (c.page === "shots" && c.id) {
    if (!map.has(c.id)) map.set(c.id, []);
    map.get(c.id).push(c);
  }
  return map;
}

// ---------- 步骤完成度（导航圆点）：0 未开始 / 1 有缺项 / 2 完成 ----------
// progress 是拍摄当天步骤，不计入完整度与 export 完成条件
export const STEPS = ["basics", "site", "models", "poses", "shots", "layout", "schedule", "progress", "export"];
export const COMPLETE_STEPS = ["basics", "site", "models", "poses", "shots", "layout", "schedule", "export"];
const EXPORT_PRE = ["basics", "site", "models", "poses", "shots", "layout", "schedule"];

export function stepStatus(p, list = checks(p)) {
  const has = page => list.some(c => c.page === page && c.level !== "info");
  const any = (...vals) => vals.some(v => (Array.isArray(v) ? v.length : !!v));
  const st = {};
  // S1 基础信息：名 + 主题 + 日期
  st.basics = p.name && p.overview.theme && p.time.date
    ? (has("basics") ? 1 : 2)
    : any(p.name, p.overview.theme, p.overview.keywords, p.time.date, p.overview.client) ? 1 : 0;
  // S2 场地与器材
  const gl = gearList(p);
  const siteFilled = any(p.venue.name, p.venue.w, p.venue.d, p.venue.gear, p.gear, p.props);
  st.site = p.venue.name.trim() && Number(p.venue.w) > 0 && Number(p.venue.d) > 0 && gl.length
    ? (has("site") ? 1 : 2)
    : siteFilled ? 1 : 0;
  // S3 模特与样图
  const ms = models(p);
  st.models = ms.length && ms.every(m => (m.looks || []).length)
    ? 2
    : any(ms, p.mood) ? 1 : 0;
  // S4 动作库：每个镜头有动作或要点
  const poseOk = s => !!(s.poseId || (s.cue || "").trim());
  st.poses = p.shots.length && p.shots.every(poseOk)
    ? 2
    : p.shots.some(poseOk) ? 1 : 0;
  // S5 分镜（同 0.1.0）
  const shotErr = list.some(c => c.page === "shots" && c.level === "error");
  st.shots = p.shots.length ? (shotErr ? 1 : 2) : p.scenes.length ? 1 : 0;
  // S6 场地图：同 0.1.0，另需无 setupEmpty
  const lit = p.layout.setups.some(s => s.elements.some(e => e.kind === "light") && s.elements.some(e => e.kind === "camera"));
  const anyEl = p.layout.base.length || p.layout.setups.some(s => s.elements.length);
  st.layout = lit ? (has("layout") ? 1 : 2) : anyEl ? 1 : 0;
  // S7 时间轴
  st.schedule = p.shots.length ? (has("schedule") ? 1 : 2) : 0;
  // S8 进度：planned / shooting / done / skipped（缺省视为 planned）
  const shotStat = s => s.status || "planned";
  st.progress = p.shots.length && p.shots.every(s => shotStat(s) === "done" || shotStat(s) === "skipped")
    ? 2
    : p.shots.some(s => shotStat(s) !== "planned") ? 1 : 0;
  // S9 导出：前七步都完成且无 error
  const errors = list.some(c => c.level === "error");
  st.export = EXPORT_PRE.every(k => st[k] === 2) && !errors
    ? 2
    : EXPORT_PRE.some(k => st[k]) ? 1 : 0;
  return st;
}

export function completeness(p) {
  const st = stepStatus(p);
  const total = COMPLETE_STEPS.length * 2;
  return Math.round(100 * COMPLETE_STEPS.reduce((a, k) => a + st[k], 0) / total);
}

// ---------- 布置图几何 ----------
export const ELEMENT_KINDS = ["wall", "window", "door", "pillar", "backdrop", "light", "camera", "person", "prop", "text"];
export const BASE_KINDS = new Set(["wall", "window", "door", "pillar", "text"]);

export function newElement(kind, x, y) {
  const e = { id: uid(), kind, x, y, rot: 0 };
  const size = { wall: [3, 0.15], window: [1.2, 0.15], door: [0.9, 0.15], pillar: [0.4, 0.4], backdrop: [2.7, 0.1], prop: [0.6, 0.6] }[kind];
  if (size) [e.w, e.h] = size;
  if (kind === "light") Object.assign(e, { beam: 60, modifier: "", power: "", ref: "" });
  if (kind === "camera") Object.assign(e, { focal: 50, label: "" });
  if (kind === "person") Object.assign(e, { ref: "" });
  if (kind === "prop") Object.assign(e, { ref: "" });
  if (kind === "text") Object.assign(e, { label: "" });
  return e;
}

// 35mm 全画幅横向视角
export function fovDeg(focal) {
  const f = Number(focal) || 50;
  return 2 * Math.atan(36 / (2 * f)) * 180 / Math.PI;
}

export function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

// 选中灯或机位时，显示到最近人物、人物到最近背景的距离（F19）
export function distances(p, setupId, el) {
  const s = setupById(p, setupId);
  if (!s || !el) return [];
  const els = [...p.layout.base, ...s.elements];
  const persons = els.filter(e => e.kind === "person");
  const backs = els.filter(e => e.kind === "backdrop");
  const nearest = (from, arr) => arr.reduce((best, e) => { const d = dist(from, e); return !best || d < best.d ? { e, d } : best; }, null);
  const out = [];
  if (el.kind === "light" || el.kind === "camera") {
    const n = nearest(el, persons);
    if (n) out.push({ from: el, to: n.e, d: n.d, kind: el.kind === "light" ? "lightPerson" : "cameraPerson" });
  }
  if (el.kind === "person") {
    const n = nearest(el, backs);
    if (n) out.push({ from: el, to: n.e, d: n.d, kind: "personBackdrop" });
  }
  return out;
}
