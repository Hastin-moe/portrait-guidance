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

/** 某时刻在指定 IANA 时区相对 UTC 的偏移（分钟） */
export function tzOffsetMinutes(date = new Date(), tz = "Asia/Shanghai") {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** 当前时刻写成带该时区偏移的 ISO，如 2026-11-08T10:02:13+08:00 */
export function nowIso(tz = "Asia/Shanghai") {
  const d = new Date();
  const off = tzOffsetMinutes(d, tz);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${oh}:${om}`;
}

/** ISO（可带偏移）→ 该时区墙钟 `YYYY-MM-DD HH:MM:SS` */
export function isoToWall(iso, tz = "Asia/Shanghai") {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** 拍摄日 + 分钟数 → 墙钟（秒为 00） */
/** 某时区的墙钟（日期 + HH:MM[:SS]）→ 带当天正确偏移的 ISO；按拍摄当天算，夏令时也对 */
export function wallToIso(dateStr, hhmm, tz = "Asia/Shanghai") {
  if (!dateStr || !hhmm) return "";
  const [Y, Mo, D] = dateStr.split("-").map(Number);
  const [h, m, sec] = String(hhmm).split(":").map(Number);
  if (![Y, Mo, D, h, m].every(Number.isFinite)) return "";
  const naive = Date.UTC(Y, Mo - 1, D, h, m, sec || 0);
  let off = tzOffsetMinutes(new Date(naive), tz);
  off = tzOffsetMinutes(new Date(naive - off * 60000), tz);   // 第二次按真实时刻校正（夏令时切换日）
  const sign = off >= 0 ? "+" : "-", abs = Math.abs(off);
  const pad = n => String(n).padStart(2, "0");
  return `${dateStr}T${pad(h)}:${pad(m)}:${pad(sec || 0)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 墙钟字符串 `YYYY-MM-DD HH:MM:SS` 加若干分钟 */
export function wallAddMin(wall, min) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(wall || "");
  if (!m) return wall;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + Math.round(Number(min) || 0), +m[6]));
  return t.toISOString().slice(0, 19).replace("T", " ");
}

export function wallFromMin(dateStr, min) {
  if (!dateStr || min == null) return "";
  return `${dateStr} ${fmtMin(min)}:00`;
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
  const normGear = g => {
    if (g.presetId == null) g.presetId = "";
    if (g.shape == null) g.shape = "";
    for (const k of ["diameterCm", "widthCm", "heightCm", "depthCm"]) if (g[k] == null) g[k] = "";
    return g;
  };
  p.gear.forEach(normGear);
  p.venue.gear.forEach(normGear);
  p.props = Array.isArray(p.props) ? p.props : [];
  p.packing = d(p.packing, {});                  // 打包清单勾选状态：key -> true
  p.layout = d(p.layout, { underlay: null, base: [], setups: [], activeSetup: "" });
  p.layout.base = Array.isArray(p.layout.base) ? p.layout.base : [];
  p.layout.setups = Array.isArray(p.layout.setups) ? p.layout.setups : [];
  if (!p.layout.setups.length) p.layout.setups.push({ id: uid(), name: "A", elements: [] });
  for (const s of p.layout.setups) {
    s.elements = Array.isArray(s.elements) ? s.elements : [];
    // EX 光比：每套布光自己的被摄者、主光和测光 ISO
    s.ex = s.ex && typeof s.ex === "object" ? s.ex : {};
    if (s.ex.subjectId == null) s.ex.subjectId = "";
    if (s.ex.keyId == null) s.ex.keyId = "";
    if (!(Number(s.ex.iso) > 0)) s.ex.iso = 100;
  }
  const normLightLux = e => {
    if (e.kind !== "light") return;
    if (e.exitLux == null) e.exitLux = "";
    if (e.faceLux == null) e.faceLux = "";
    if (e.luxNote == null) e.luxNote = "";
    if (e.luxMeter == null) e.luxMeter = "";
    if (e.faceFstop == null) e.faceFstop = "";
  };
  for (const e of p.layout.base) normLightLux(e);
  for (const s of p.layout.setups) for (const e of s.elements) normLightLux(e);
  if (!p.layout.setups.some(s => s.id === p.layout.activeSetup)) p.layout.activeSetup = p.layout.setups[0].id;
  p.scenes = Array.isArray(p.scenes) ? p.scenes : [];
  p.shots = Array.isArray(p.shots) ? p.shots : [];
  for (const s of p.shots) {
    if (!s.status) s.status = "planned";
    if (s.startedAt == null) s.startedAt = "";
    if (s.completedAt == null) s.completedAt = "";
  }
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
  for (const e of s.elements) {
    if ((e.kind === "light" || e.kind === "board") && e.ref) use.set(e.ref, (use.get(e.ref) || 0) + 1);
    if (e.kind === "light" && e.modifierRef) use.set(e.modifierRef, (use.get(e.modifierRef) || 0) + 1);
  }
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

/**
 * 导出分镜时间窗（Photo-cull 归组用）。labels 提供已翻译字段：
 * { poseName(id), sizeLabel(size), setupName(id), cameraName(setupId,camId),
 *   personName(id), lookName(id), propName(id), lightFallback }
 */
export function timeWindows(p, labels = {}) {
  const tz = p.time.timezone || "Asia/Shanghai";
  const date = p.time.date || "";
  const sch = schedule(p);
  const nos = shotNumbers(p);
  const L = {
    poseName: labels.poseName || (() => ""),
    sizeLabel: labels.sizeLabel || (s => s || ""),
    setupName: labels.setupName || (() => ""),
    cameraName: labels.cameraName || (() => ""),
    personName: labels.personName || (() => ""),
    lookName: labels.lookName || (() => ""),
    propName: labels.propName || (() => ""),
  };
  const windows = [];
  for (const it of sch.items) {
    if (it.type !== "shot") continue;
    const shot = p.shots.find(s => s.id === it.shotId);
    if (!shot || (shot.status || "planned") === "skipped") continue;
    const r = resolveShot(p, shot);
    const start = shot.startedAt ? isoToWall(shot.startedAt, tz) : wallFromMin(date, it.start);
    // 只点了「开始」没点「完成」：按开始时间 + 计划时长推算，不再用计划结束时间（T11-A2）
    let end = shot.completedAt ? isoToWall(shot.completedAt, tz)
      : shot.startedAt ? wallAddMin(start, Math.max(1, Number(shot.minutes) || (it.end - it.start) || 1))
      : wallFromMin(date, it.end);
    if (start && end && end < start) end = start;
    const wardrobe = (r.lookIds || []).map(id => {
      const look = lookById(p, id);
      return look ? `${L.personName(look.personId)} · ${L.lookName(id)}` : L.lookName(id);
    }).filter(Boolean).join("、");
    windows.push({
      shot_id: nos.get(shot.id) || shot.id,
      title: L.poseName(shot.poseId) || (shot.notes || "").split("\n")[0] || "",
      start, end,
      framing: L.sizeLabel(shot.size),
      focal_length: shot.focal ? `${shot.focal}mm` : "",
      action: shot.cue || "",
      light: L.setupName(r.setupId),
      props: (shot.props || []).map(L.propName).filter(Boolean).join("、"),
      wardrobe,
      camera_id: L.cameraName(r.setupId, r.cameraId),
      notes: shot.notes || "",
    });
  }
  return { timezone: tz, camera_offsets_seconds: {}, windows };
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
      if ((e.kind === "light" || e.kind === "prop" || e.kind === "board") && !e.ref) add("warn", "unbound", "layout", { id: e.id, setupId: s.id });
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
export const EXTRA_STEPS = ["ex"];
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
  // EX 光比：被分镜用到的布光方案里，每盏灯都有脸部读数 = 完成；有一部分 = 进行中
  const usedSetups = new Set([...p.scenes, ...p.shots].map(x => x.setupId).filter(Boolean));
  const exLights = p.layout.setups.filter(s => !usedSetups.size || usedSetups.has(s.id)).flatMap(s => s.elements.filter(e => e.kind === "light"));
  const measured = e => Number(e.faceFstop) > 0 || Number(e.faceLux) > 0;
  st.ex = exLights.length && exLights.every(measured) ? 2 : exLights.some(measured) ? 1 : 0;
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
export const ELEMENT_KINDS = ["wall", "window", "door", "pillar", "backdrop", "light", "camera", "person", "prop", "board", "text"];
export const BASE_KINDS = new Set(["wall", "window", "door", "pillar", "text"]);

export function newElement(kind, x, y) {
  const e = { id: uid(), kind, x, y, rot: 0 };
  const size = { wall: [3, 0.15], window: [1.2, 0.15], door: [0.9, 0.15], pillar: [0.4, 0.4], backdrop: [2.7, 0.1], prop: [0.6, 0.6], board: [2.4, 0.05] }[kind];
  if (size) [e.w, e.h] = size;
  if (kind === "light") Object.assign(e, {
    beam: 60, modifier: "", modifierRef: "", power: "", ref: "",
    // 实测照度（lux）：厂商标称另见 catalogs；此处留给现场测光录入
    exitLux: "", faceLux: "", faceFstop: "", luxNote: "", luxMeter: "",
  });
  if (kind === "camera") Object.assign(e, { focal: 50, label: "" });
  if (kind === "person") Object.assign(e, { ref: "" });
  if (kind === "prop") Object.assign(e, { ref: "" });
  if (kind === "board") Object.assign(e, { ref: "" });
  if (kind === "text") Object.assign(e, { label: "" });
  return e;
}

/** 从器材尺寸推算场地图上吸光板 / 修饰器投影（米） */
export function boardSizeM(gear) {
  if (!gear) return { w: 2.4, h: 0.05 };
  const thick = Number(gear.depthCm) > 0 ? Number(gear.depthCm) / 100 : 0.05;
  if (Number(gear.widthCm) > 0) return { w: Number(gear.widthCm) / 100, h: thick };
  if (Number(gear.diameterCm) > 0) return { w: Number(gear.diameterCm) / 100, h: thick };
  return { w: 2.4, h: thick };
}

export function modifierSizeM(gear) {
  if (!gear) return { depth: 0.4, width: 0.9 };
  const diam = Number(gear.diameterCm) > 0 ? Number(gear.diameterCm) / 100
    : Number(gear.widthCm) > 0 ? Number(gear.widthCm) / 100 : 0.9;
  const depth = Number(gear.depthCm) > 0 ? Number(gear.depthCm) / 100 : diam * 0.5;
  return { depth, width: diam };
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

// ---------- EX 光比与光效（T14） ----------
// 原则：布置只有一份（project.layout），S6 场地图和 EX 是同一份数据的两个视图。
// 实测读数挂在灯位元素上：faceFstop（闪光，脸位入射式测光的光圈）、faceLux（持续光，脸位照度）、exitLux。
// 估算只看功率档、灯的标称输出和到被摄者的距离（平方反比），不计修饰器损耗和角度衰减，只作预判。

/** 功率档文字 → 满功率的比例：1/4、1/8+0.3、50%、0.25、全光 / full */
export function parsePower(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(/\s+/g, "").replace("＋", "+").replace("－", "-").replace("％", "%");
  if (!s) return null;
  if (/^(全光|满功率|满光|full|max|1\/1)$/.test(s)) return 1;
  let m = /^1\/(\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?$/.exec(s);
  if (m) { const base = 1 / Number(m[1]); return Math.min(1, base * Math.pow(2, Number(m[2] || 0))); }
  m = /^(\d+(?:\.\d+)?)%$/.exec(s);
  if (m) return Math.min(1, Number(m[1]) / 100);
  m = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (m) { const n = Number(m[1]); if (n > 0 && n <= 1) return n; if (n > 1 && n <= 100) return n / 100; }
  return null;
}

const log2 = x => Math.log(x) / Math.LN2;
/** 光圈读数 → EV（ISO 不变时只用于相互比较） */
export const fstopToEv = n => (Number(n) > 0 ? 2 * log2(Number(n)) : null);
/** 照度 → EV100（入射式，C = 250） */
export const luxToEv = lux => (Number(lux) > 0 ? log2(Number(lux) / 2.5) : null);
/** EV 差 → 照度比，例如 1.58 EV → 3 */
export const evToRatio = ev => Math.pow(2, ev);

/** 闪光 / 持续光 / 未知：看目录类别，没有目录时看器材名称里的常见词 */
export function lightKind(gear, cat) {
  const c = cat ? `${cat.category || ""} ${cat.subcategory || ""}` : "";
  if (/strobe|flash|generator|power_pack|lamp_head/.test(c)) return "flash";
  if (/led|continuous|panel/.test(c)) return "continuous";
  const n = `${gear ? gear.model : ""}`.toLowerCase();
  if (/\b(ad|ms|sk|qt|dp|e\d|siros|scoro|move|b10|b1x|d2|a1)\d*|闪光|闪灯|strobe|flash/.test(n)) return "flash";
  if (/led|storm|amaran|aputure|nova|ls\s?\d|sl\d|ml\d|fv|knowled|持续|常亮/.test(n)) return "continuous";
  return "unknown";
}

/**
 * 修饰器损耗（EV，经验值）：先看目录里的类型，没有就看名称。
 * 柔光箱 / 八角 / 抛物线柔光箱（带柔光布）约 1.7 档，灯笼 2 档，伞 1.3 档，雷达罩 1 档，
 * 标准罩、抛物线反光罩（无柔光布）、菲涅尔、蜂巢、束光筒约 0–0.3 档；认不出来按 1 档。
 */
export function modifierLossEv(mod, catalog = null, freeText = "") {
  const cat = mod && mod.presetId && catalog ? catalog.get(mod.presetId) : null;
  const sub = cat ? String(cat.subcategory || "") : "";
  const name = `${mod ? mod.model : ""} ${freeText || ""}`.toLowerCase();
  if (!mod && !String(freeText || "").trim()) return 0;
  const table = [
    [/lantern|灯笼|球形/, 2], [/umbrella|伞/, 1.3], [/beauty|雷达/, 1],
    [/standard_reflector|parabolic_reflector|fresnel|标准罩|反光罩|菲涅尔|para\s?\d|grid|蜂巢|snoot|束光/, 0.3],
    [/softbox|octa|strip|dome|柔光|八角|抛物线|深抛|条形/, 1.7],
  ];
  for (const [re, v] of table) if (re.test(sub)) return v;
  for (const [re, v] of table) if (re.test(name)) return v;
  return 1;
}

/** 目录里 1 m 处、裸灯 / 标准罩的照度（lux，持续光） */
function catLuxAt1m(cat) {
  const arr = Array.isArray(cat && cat.illuminance) ? cat.illuminance : [];
  const bare = arr.filter(x => Number(x.lux) > 0 && Number(x.distance_m) > 0)
    .map(x => ({ ...x, at1: Number(x.lux) * Math.pow(Number(x.distance_m), 2) }));
  const pick = bare.find(x => /bare|standard|标准|裸/i.test(x.modifier || "")) || bare[0];
  return pick ? { lux1m: pick.at1, cct: pick.cct_k || "", modifier: pick.modifier || "" } : null;
}
/** 目录里的闪光指数（ISO 100，米） */
function catGuide(cat) {
  const g = cat && cat.guide_number_m;
  const first = Array.isArray(g) ? g[0] : g;
  if (first && Number(first.value) > 0) return { gn: Number(first.value) * Math.sqrt(100 / (Number(first.iso) || 100)), with: first.with || "" };
  const f = cat && cat.fstop_at_2m;
  if (f && Number(f.value) > 0) return { gn: Number(f.value) * 2 * Math.sqrt(100 / (Number(f.iso) || 100)), with: f.reflector || "" };
  return null;
}

/**
 * 一个布光方案的光比表。
 * @param catalog Map(presetId → 目录条目)，可为空：没有目录时只按功率档和距离做相对估算
 * @returns {{ subject, subjects, key, rows, pairs, warnings }}
 */
export function lightRatios(p, setupId, { catalog = null, subjectId = "", keyId = "", iso = 100 } = {}) {
  const s = setupById(p, setupId);
  const empty = { subject: null, subjects: [], key: null, rows: [], warnings: [] };
  if (!s) return empty;
  const els = [...p.layout.base, ...s.elements];
  const subjects = els.filter(e => e.kind === "person");
  const subject = subjects.find(e => e.id === subjectId) || subjects[0] || null;
  const lights = s.elements.filter(e => e.kind === "light");
  const isoK = Math.sqrt((Number(iso) || 100) / 100);
  const rows = lights.map(e => {
    const gear = e.ref ? gearByKey(p, e.ref) : null;
    const cat = gear && gear.presetId && catalog ? catalog.get(gear.presetId) || null : null;
    const kind = lightKind(gear, cat);
    const mod = e.modifierRef ? gearByKey(p, e.modifierRef) : null;
    const frac = parsePower(e.power);
    const r = { id: e.id, el: e, gear, cat, kind, mod, frac, d: null, dEff: null, offAxis: null, inBeam: true,
      est: null, meas: null, evRel: null, evRelMeas: null, evRelEst: null, gap: null };
    if (subject) {
      r.d = dist(e, subject);
      // 有修饰器时从修饰器出口算距离（平方反比以发光面为准）
      const front = mod ? 0.13 + modifierSizeM(mod).depth : 0;
      r.dEff = Math.max(0.3, r.d - front);
      const aim = Math.atan2(subject.y - e.y, subject.x - e.x) * 180 / Math.PI;
      r.offAxis = Math.abs(((aim - (Number(e.rot) || 0)) % 360 + 540) % 360 - 180);
      r.inBeam = r.offAxis <= (Number(e.beam) || 60) / 2;
    }
    const pmax = cat ? (kind === "flash" ? Number(cat.power_ws) : Number(cat.power_w)) || null : null;
    // 估算
    r.loss = modifierLossEv(mod, catalog, e.modifier);
    if (r.dEff && frac) {
      const gn = kind === "flash" ? catGuide(cat) : null;
      const lx = kind === "continuous" ? catLuxAt1m(cat) : null;
      const k = Math.pow(2, -r.loss);
      if (gn) {
        const n = gn.gn * isoK * Math.sqrt(frac * k) / r.dEff;
        r.est = { unit: "f", value: n, ev: fstopToEv(n), basis: gn.with };
      } else if (lx) {
        const lux = lx.lux1m * frac * k / (r.dEff * r.dEff);
        r.est = { unit: "lux", value: lux, ev: luxToEv(lux), basis: lx.modifier };
      } else {
        r.est = { unit: "rel", value: null, ev: log2(frac * k * (pmax || 1) / (r.dEff * r.dEff)), basis: pmax ? "power" : "" };
      }
    }
    // 实测：闪光看脸部光圈，持续光看脸部照度；两者都填时按灯的类型取
    const fF = Number(e.faceFstop) > 0 ? Number(e.faceFstop) : null, fL = Number(e.faceLux) > 0 ? Number(e.faceLux) : null;
    if (fF && (kind !== "continuous" || !fL)) r.meas = { unit: "f", value: fF, ev: fstopToEv(fF) };
    else if (fL) r.meas = { unit: "lux", value: fL, ev: luxToEv(fL) };
    if (r.meas && r.est && r.est.unit === r.meas.unit) r.gap = r.meas.ev - r.est.ev;
    return r;
  });
  // 主光：手动指定；否则取实测最亮，再否则估算最亮（只在同一单位里比）
  let key = rows.find(r => r.id === keyId) || null;
  if (!key) {
    // 只在同一单位里比亮度：取灯数最多的那种单位（同数时闪光优先），实测优先于估算
    const pickIn = field => {
      const pool = rows.filter(r => r[field] && r.inBeam);
      if (!pool.length) return null;
      const count = u => pool.filter(r => r[field].unit === u).length;
      const unit = ["f", "lux", "rel"].sort((a, b) => count(b) - count(a))[0];
      return pool.filter(r => r[field].unit === unit).sort((a, b) => b[field].ev - a[field].ev)[0] || null;
    };
    key = pickIn("meas") || pickIn("est") || rows[0] || null;
  }
  const comparable = (a, b) => a && b && a.unit === b.unit;
  for (const r of rows) {
    if (!key) break;
    if (comparable(r.meas, key.meas)) r.evRelMeas = r.meas.ev - key.meas.ev;
    // 估算：光圈对光圈、照度对照度；只有相对估算时要求同一类灯
    if (comparable(r.est, key.est) && (r.est.unit !== "rel" || r.kind === key.kind)) r.evRelEst = r.est.ev - key.est.ev;
    r.evRel = r.evRelMeas != null ? r.evRelMeas : r.evRelEst;
  }
  const warnings = [];
  if (!subject) warnings.push({ code: "noSubject" });
  for (const r of rows) {
    if (subject && !r.inBeam) warnings.push({ code: "outOfBeam", id: r.id, deg: Math.round(r.offAxis) });
    if (r.gap != null && Math.abs(r.gap) > 1) warnings.push({ code: "gap", id: r.id, ev: r.gap });
    if (r.el.power && r.frac == null) warnings.push({ code: "badPower", id: r.id });
    if (key && r.id !== key.id && r.evRel == null && (r.meas || r.est)) warnings.push({ code: "mixed", id: r.id });
  }
  return { subject, subjects, key, rows, warnings };
}

/** 光比文字：1.58 EV → "3:1"；负数（比主光暗）也按 主:该灯 写 */
export function ratioText(ev) {
  if (ev == null || !isFinite(ev)) return "—";
  const r = evToRatio(Math.abs(ev));
  const v = r >= 10 ? Math.round(r) : Math.round(r * 10) / 10;
  return ev <= 0 ? `${v}:1` : `1:${v}`;
}

// ---------- T22 参考图获取 ----------
/** 搜索平台：打开浏览器到结果页（Q1-A），不在程序内列结果 */
export const REF_SEARCH_PLATFORMS = ["xhs", "pinterest", "google", "huaban"];

/** Gemini Nano Banana 示意单价（美元/张），仅用于费用预估展示 */
export const AI_IMAGE_USD = 0.03;

export function defaultRefSearchQuery(project) {
  const kw = ((project?.overview?.keywords) || []).filter(Boolean);
  const theme = (project?.overview?.theme || "").trim();
  if (kw.length) return kw.slice(0, 4).join(" ");
  return theme.slice(0, 40);
}

export function refSearchUrl(platform, query) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return "";
  if (platform === "xhs") return `https://www.xiaohongshu.com/search_result?keyword=${q}`;
  if (platform === "pinterest") return `https://www.pinterest.com/search/pins/?q=${q}`;
  if (platform === "google") return `https://www.google.com/search?tbm=isch&q=${q}`;
  if (platform === "huaban") return `https://huaban.com/search?q=${q}`;
  return "";
}

export function aiImageCostUsd(count) {
  const n = Math.max(0, Math.min(8, Math.floor(Number(count) || 0)));
  return Math.round(n * AI_IMAGE_USD * 100) / 100;
}

/** 默认 AI 提示：项目风格 + 可选景别 / 动作要点 */
export function defaultAiPrompt(project, { size = "", poseName = "", poseCues = "" } = {}) {
  const parts = [];
  const theme = (project?.overview?.theme || "").trim();
  const kw = ((project?.overview?.keywords) || []).filter(Boolean);
  if (theme) parts.push(theme);
  if (kw.length) parts.push(kw.join("、"));
  if (size) parts.push(size);
  if (poseName) parts.push(poseName);
  if (poseCues) parts.push(poseCues);
  return parts.filter(Boolean).join("。");
}
