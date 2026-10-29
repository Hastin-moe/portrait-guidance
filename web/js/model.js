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
  p.overview = d(p.overview, { theme: "", keywords: [], client: "", purpose: "", moodStyle: "" });
  if (p.overview.moodStyle == null) p.overview.moodStyle = "";
  p.mood = Array.isArray(p.mood) ? p.mood : [];
  for (const m of p.mood) normalizeMoodItem(m);
  p.time = d(p.time, { date: "", start: "09:00", end: "17:00", venueFrom: "", venueTo: "", makeupMin: 60, setupMin: 30, bufferMin: 10, timezone: "Asia/Shanghai" });
  if (!p.time.timezone) p.time.timezone = "Asia/Shanghai";
  p.people = Array.isArray(p.people) ? p.people : [];
  for (const x of p.people) {
    x.kind = x.kind || "model";
    if (x.kind === "model") normalizeModel(x);
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
    // T23 / Q7：灯位中心高人工后填；俯仰向下为负；光效附件
    if (e.heightM == null) e.heightM = "";
    if (e.pitchDeg == null) e.pitchDeg = 0;
    if (e.honeycombDeg == null) e.honeycombDeg = "";
    if (e.diffusionLayers == null) e.diffusionLayers = 0;
    if (e.gel == null) e.gel = "";
    if (e.barnDoors == null) e.barnDoors = false;
  };
  for (const e of p.layout.base) { normLightLux(e); normalizeElement(e); }
  for (const s of p.layout.setups) for (const e of s.elements) { normLightLux(e); normalizeElement(e); }
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

// ---------- 人员与造型（T18 档案字段） ----------
export const LOOK_PARTS = ["top", "bottom", "outer", "shoes", "acc"];
export const LOOK_SOURCES = ["", "own", "rent", "studio", "brand"];
export const LOOK_STATUSES = ["todo", "ready", "onsite"];

export const models = p => p.people.filter(x => x.kind === "model");
export const staff = p => p.people.filter(x => x.kind === "staff");
export const personById = (p, id) => p.people.find(x => x.id === id);

export function blankLookItem(part = "top") {
  return { id: uid(), part, color: "", material: "", note: "" };
}

export function blankLook(name = "") {
  return {
    id: uid(), name: name || "",
    items: [], source: "", owner: "", status: "todo", photos: [],
  };
}

export function normalizeLook(l) {
  if (!l || typeof l !== "object") return blankLook();
  if (!l.id) l.id = uid();
  if (l.name == null) l.name = "";
  if (!Array.isArray(l.items)) l.items = [];
  for (const it of l.items) {
    if (!it.id) it.id = uid();
    if (!LOOK_PARTS.includes(it.part)) it.part = "top";
    if (it.color == null) it.color = "";
    if (it.material == null) it.material = "";
    if (it.note == null) it.note = "";
  }
  if (!LOOK_SOURCES.includes(l.source)) l.source = "";
  if (l.owner == null) l.owner = "";
  if (!LOOK_STATUSES.includes(l.status)) l.status = "todo";
  if (!Array.isArray(l.photos)) l.photos = [];
  for (const ph of l.photos) {
    if (ph.note == null) ph.note = "";
  }
  return l;
}

export function normalizeModel(x) {
  x.looks = Array.isArray(x.looks) ? x.looks.map(normalizeLook) : [];
  if (x.alias == null) x.alias = "";
  if (x.gender == null) x.gender = "";
  if (x.ageBand == null) x.ageBand = "";
  if (x.weight == null) x.weight = "";
  if (x.bust == null) x.bust = "";
  if (x.waist == null) x.waist = "";
  if (x.hips == null) x.hips = "";
  if (x.topSize == null) x.topSize = "";
  if (x.pantSize == null) x.pantSize = "";
  if (x.shoeSize == null) x.shoeSize = "";
  if (x.hair == null) x.hair = "";
  if (x.skin == null) x.skin = "";
  if (x.features == null) x.features = "";
  if (x.contact == null) x.contact = "";
  if (x.note == null) x.note = "";
  if (!Array.isArray(x.photos)) x.photos = [];
  for (const ph of x.photos) {
    if (ph.note == null) ph.note = "";
    if (ph.cover == null) ph.cover = false;
  }
  if (x.roleName == null) x.roleName = "";
  if (x.rolePitch == null) x.rolePitch = "";
  if (!Array.isArray(x.roleTraits)) x.roleTraits = [];
  if (x.roleRelations == null) x.roleRelations = "";
  if (x.roleScenes == null) x.roleScenes = "";
  if (x.roleNotes == null) x.roleNotes = "";
  if (x.paid == null) x.paid = false;
  if (!x.work || typeof x.work !== "object") x.work = {};
  for (const k of ["arrive", "start", "end", "lunchFrom", "lunchTo", "overtime", "hourlyNote"]) {
    if (x.work[k] == null) x.work[k] = "";
  }
  if (!["", "hourly", "none"].includes(x.work.overtime)) x.work.overtime = "";
  if (!Array.isArray(x.poseIds)) x.poseIds = [];
  if (!x.mcn || typeof x.mcn !== "object") x.mcn = {};
  for (const k of ["agency", "agent", "agentContact", "contractNo", "licenseUse", "licensePlatform", "licenseUntil", "fee", "settle", "note"]) {
    if (x.mcn[k] == null) x.mcn[k] = "";
  }
  // 付费工作时段与旧 avail 字段对齐（排程仍读 avail*）
  if (x.paid) {
    if (x.work.start && !x.availFrom) x.availFrom = x.work.start;
    if (x.work.end && !x.availTo) x.availTo = x.work.end;
  }
  return x;
}

/** 模特工作时间窗（付费优先 work.*） */
export function modelWorkWindow(m) {
  if (!m) return { from: "", to: "" };
  if (m.paid && (m.work?.start || m.work?.end)) {
    return { from: m.work.start || m.availFrom || "", to: m.work.end || m.availTo || "" };
  }
  return { from: m.availFrom || "", to: m.availTo || "" };
}

/** 某模特在所有布光方案里的站位点 */
export function marksForPerson(p, personId) {
  const out = [];
  for (const s of p.layout?.setups || []) {
    for (const e of s.elements || []) {
      if (e.kind !== "mark") continue;
      const pid = e.personId || e.ref;
      if (pid === personId) out.push({ ...e, setupId: s.id });
    }
  }
  return out;
}

export function setLookCount(person, n, namer = i => String(i + 1)) {
  n = Math.max(0, Math.min(20, Math.floor(Number(n) || 0)));
  const looks = person.looks || (person.looks = []);
  while (looks.length < n) looks.push(blankLook(namer(looks.length)));
  looks.length = n;
  looks.forEach(normalizeLook);
  return person;
}

/** 工作照封面文件名；无则空 */
export function modelCoverFile(m) {
  const photos = m?.photos || [];
  const hit = photos.find(ph => ph.cover && ph.file) || photos.find(ph => ph.file);
  return hit?.file || "";
}

/** 列表角标：姓名 / 身高 / 服装套组名未齐 */
export function modelProfileIncomplete(m) {
  if (!m) return true;
  if (!(m.name || "").trim()) return true;
  if (!(Number(m.height) > 0)) return true;
  if (!(m.looks || []).length) return true;
  if ((m.looks || []).some(l => !(l.name || "").trim())) return true;
  return false;
}

export function allLooks(p) {
  const out = [];
  for (const m of models(p)) for (const l of m.looks || []) out.push({ ...l, personId: m.id, personName: m.name });
  return out;
}
export const lookById = (p, id) => allLooks(p).find(l => l.id === id);

// ---------- 情绪板（T20） ----------
/** 固定七个借鉴点 */
export const MOOD_ASPECTS = ["light", "tone", "comp", "wardrobe", "pose", "makeup", "scene"];

export function normalizeMoodItem(m) {
  if (!m || typeof m !== "object") return m;
  if (!m.id) m.id = uid();
  if (m.note == null) m.note = "";
  if (!Array.isArray(m.tags)) m.tags = [];
  if (!Array.isArray(m.aspects)) m.aspects = [];
  m.aspects = m.aspects.filter(a => MOOD_ASPECTS.includes(a));
  if (m.source == null) m.source = "";
  if (m.url == null) m.url = "";
  if (m.x == null) m.x = 5;
  if (m.y == null) m.y = 5;
  if (m.file == null) m.file = "";
  return m;
}

export function moodByFile(p, file) {
  return (p.mood || []).find(m => m.file === file) || null;
}

export function moodAspectLabels(aspects, tFn) {
  return (aspects || []).filter(a => MOOD_ASPECTS.includes(a)).map(a => tFn("mood.asp." + a));
}

// ---------- 动作库（T21） ----------
export const POSE_DIMS = ["mood", "stance", "focus", "prop", "scene"];
/** 各组预设；存库用中文词（与现有 tags 一致），组内可加自定义 */
export const POSE_DIM_PRESETS = {
  mood: ["温柔", "清冷", "活泼", "慵懒", "忧郁", "自信"],
  stance: ["站", "坐", "倚", "躺", "走", "蹲"],
  focus: ["脸", "手", "背", "腿", "全身"],
  prop: ["无", "椅子", "窗帘", "花"],
  scene: ["窗边", "沙发", "户外", "背景纸"],
};

export function blankPose(name = "") {
  return {
    id: uid(), name: name || "",
    images: [], image: "", imageSource: "", imageUrl: "",
    steps: [],
    cues: { weight: "", hands: "", gaze: "", pitfalls: "" },
    guide: "", sizes: [], people: "1", wardrobe: "",
    dims: { mood: [], stance: [], focus: [], prop: [], scene: [] },
    tags: [],
  };
}

export function normalizePose(x) {
  if (!x || typeof x !== "object") return blankPose();
  if (!x.id) x.id = uid();
  if (x.name == null) x.name = "";
  if (!Array.isArray(x.images)) x.images = [];
  // 旧字段单图 → images
  if (!x.images.length && x.image) {
    x.images.push({ file: x.image, source: x.imageSource || "", url: x.imageUrl || "", cover: true, note: "" });
  }
  for (const im of x.images) {
    if (!im.id) im.id = uid();
    if (im.file == null) im.file = "";
    if (im.source == null) im.source = "";
    if (im.url == null) im.url = "";
    if (im.note == null) im.note = "";
    if (im.cover == null) im.cover = false;
  }
  if (x.images.length && !x.images.some(im => im.cover)) x.images[0].cover = true;
  const cover = x.images.find(im => im.cover) || x.images[0];
  x.image = cover?.file || "";
  x.imageSource = cover?.source || "";
  x.imageUrl = cover?.url || "";
  if (!Array.isArray(x.steps)) x.steps = [];
  x.steps = x.steps.map(s => (s == null ? "" : String(s)));
  x.cues = x.cues && typeof x.cues === "object" ? x.cues : {};
  for (const k of ["weight", "hands", "gaze", "pitfalls"]) if (x.cues[k] == null) x.cues[k] = "";
  if (x.guide == null) x.guide = "";
  if (!Array.isArray(x.sizes)) x.sizes = [];
  if (!x.people) x.people = "1";
  if (x.wardrobe == null) x.wardrobe = "";
  if (!x.dims || typeof x.dims !== "object") x.dims = {};
  for (const d of POSE_DIMS) {
    if (!Array.isArray(x.dims[d])) x.dims[d] = [];
    x.dims[d] = x.dims[d].map(v => String(v)).filter(Boolean);
  }
  if (!Array.isArray(x.tags)) x.tags = [];
  // 旧自由 tags 迁入情绪维；情绪维回写 tags 供旧筛选
  if (x.tags.length && !POSE_DIMS.some(d => x.dims[d].length)) {
    x.dims.mood = [...x.tags];
  }
  x.tags = [...(x.dims.mood || [])];
  return x;
}

export function poseCoverFile(x) {
  const imgs = x?.images || [];
  const hit = imgs.find(im => im.cover && im.file) || imgs.find(im => im.file);
  return hit?.file || x?.image || "";
}

/** 卡片上最多两个情绪标签 */
export function poseMoodChips(x, n = 2) {
  const mood = (x?.dims?.mood?.length ? x.dims.mood : (x?.tags || []));
  return mood.slice(0, n);
}

export function poseMatchesDims(x, filters) {
  if (!filters) return true;
  for (const d of POSE_DIMS) {
    const want = filters[d];
    if (!want) continue;
    const have = x.dims?.[d] || [];
    if (!have.includes(want)) return false;
  }
  return true;
}

/** ⌘K：按镜头场景名 / 模特角色情绪与动作标签的重合度排序 */
export function rankPosesForShot(p, shot, poses) {
  const sc = p.scenes.find(s => s.id === shot.sceneId);
  const sceneName = (sc?.name || "").toLowerCase();
  const r = resolveShot(p, shot);
  const moodWant = new Set();
  for (const id of r.personIds || []) {
    const m = personById(p, id);
    for (const t of m?.roleTraits || []) moodWant.add(String(t));
  }
  const scored = poses.map(x => {
    let score = 0;
    for (const s of x.dims?.scene || []) if (sceneName && (sceneName.includes(s.toLowerCase()) || s.toLowerCase().includes(sceneName))) score += 3;
    for (const m of x.dims?.mood || x.tags || []) if (moodWant.has(m)) score += 2;
    if (shot.size && (x.sizes || []).includes(shot.size)) score += 1;
    return { x, score };
  });
  scored.sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name, "zh"));
  return scored.map(s => s.x);
}

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
    const win = modelWorkWindow(m);
    const e = toMin(win.to);
    const s = toMin(win.from);
    if (s != null) from = Math.max(from, s);
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
    for (const item of sch.items) {
      if (item.type !== "shot") continue;
      const shot = p.shots.find(s => s.id === item.shotId);
      if (!shot) continue;
      const r = resolveShot(p, shot);
      for (const pid of r.personIds) {
        const m = personById(p, pid);
        if (!m?.paid) continue;
        const lim = toMin(modelWorkWindow(m).to);
        if (lim != null && item.end > lim) add("warn", "paidOverWork", "schedule", { id: shot.id, personId: pid });
      }
    }
  }
  for (const shot of p.shots) {
    const r = resolveShot(p, shot);
    for (const lid of r.lookIds) {
      const look = allLooks(p).find(l => l.id === lid);
      if (look && look.status === "todo") {
        add("warn", "lookNotReady", "models", { id: shot.id, lookId: lid, personId: look.personId });
        break;
      }
    }
  }
  for (const m of models(p)) {
    if (!m.paid) continue;
    const win = modelWorkWindow(m);
    if (!(win.from && win.to)) add("warn", "paidNoHours", "models", { personId: m.id });
    const lic = m.mcn || {};
    if (!(lic.licenseUse || lic.licensePlatform || lic.licenseUntil)) {
      add("info", "paidNoLicense", "models", { personId: m.id });
    }
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
export const ELEMENT_KINDS = ["wall", "window", "door", "pillar", "backdrop", "light", "camera", "person", "mark", "prop", "board", "text"];
export const BASE_KINDS = new Set(["wall", "window", "door", "pillar", "text"]);

export function newElement(kind, x, y) {
  const e = { id: uid(), kind, x, y, rot: 0 };
  const size = { wall: [3, 0.15], window: [1.2, 0.15], door: [0.9, 0.15], pillar: [0.4, 0.4], backdrop: [2.7, 0.1], prop: [0.6, 0.6], board: [2.4, 0.05] }[kind];
  if (size) [e.w, e.h] = size;
  if (kind === "light") Object.assign(e, {
    beam: 60, modifier: "", modifierRef: "", power: "", ref: "",
    heightM: "", pitchDeg: 0,
    honeycombDeg: "", diffusionLayers: 0, gel: "", barnDoors: false,
    // 实测照度（lux）：厂商标称另见 catalogs；此处留给现场测光录入
    exitLux: "", faceLux: "", faceFstop: "", luxNote: "", luxMeter: "",
  });
  if (kind === "camera") Object.assign(e, { focal: 50, label: "" });
  if (kind === "person") Object.assign(e, { ref: "" });
  if (kind === "mark") Object.assign(e, { personId: "", poseId: "", shotIds: [], label: "", ref: "" });
  if (kind === "prop") Object.assign(e, { ref: "" });
  if (kind === "board") Object.assign(e, { ref: "" });
  if (kind === "text") Object.assign(e, { label: "" });
  return e;
}

/** 规范化场地图元素（站位点字段） */
export function normalizeElement(e) {
  if (!e || typeof e !== "object") return e;
  if (e.kind === "mark") {
    if (e.personId == null) e.personId = e.ref || "";
    if (e.ref == null) e.ref = e.personId || "";
    if (!e.personId && e.ref) e.personId = e.ref;
    if (!e.ref && e.personId) e.ref = e.personId;
    if (e.poseId == null) e.poseId = "";
    if (!Array.isArray(e.shotIds)) e.shotIds = [];
    if (e.label == null) e.label = "";
  }
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

// 选中灯/机位/人物时的距离线（T24：背景/窗用线段最近点）
export function distances(p, setupId, el) {
  const s = setupById(p, setupId);
  if (!s || !el) return [];
  const els = [...p.layout.base, ...s.elements];
  const persons = els.filter(e => e.kind === "person" || e.kind === "mark");
  const backs = els.filter(e => e.kind === "backdrop");
  const wins = els.filter(e => e.kind === "window");
  const nearest = (from, arr) => arr.reduce((best, e) => { const d0 = dist(from, e); return !best || d0 < best.d ? { e, d: d0 } : best; }, null);
  const nearestSeg = (from, arr) => arr.reduce((best, e) => {
    const [a, b] = segmentEnds(e);
    const n = nearestOnSegment(from, a, b);
    return !best || n.d < best.d ? { e, d: n.d, pt: n } : best;
  }, null);
  const out = [];
  if (el.kind === "light" || el.kind === "camera") {
    const n = nearest(el, persons);
    if (n) out.push({ from: el, to: n.e, d: n.d, kind: el.kind === "light" ? "lightPerson" : "cameraPerson" });
  }
  if (el.kind === "person" || el.kind === "mark") {
    const nb = nearestSeg(el, backs);
    if (nb) out.push({ from: el, to: { x: nb.pt.x, y: nb.pt.y }, d: nb.d, kind: "personBackdrop" });
    const nw = nearestSeg(el, wins);
    if (nw) out.push({ from: el, to: { x: nw.pt.x, y: nw.pt.y }, d: nw.d, kind: "personWindow" });
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

// ---------- T23 / Q3：棚左下角显示系 + 15° 档 ----------
/** 取最近的 15° 档（输入用） */
export function snapDeg15(deg) {
  const n = Number(deg);
  if (!isFinite(n)) return 0;
  const s = Math.round(n / 15) * 15;
  return ((s % 360) + 360) % 360;
}

/** 相对夹角显示：四舍五入到最近 15°，落到 (−180, 180] */
export function roundRelDeg15(deg) {
  const n = Number(deg);
  if (!isFinite(n)) return 0;
  let s = Math.round(n / 15) * 15;
  while (s > 180) s -= 360;
  while (s <= -180) s += 360;
  return s;
}

/**
 * 存储系 → 显示系（棚左下角原点，Y 向上；rot 0°=+X、逆时针）
 * 存储系：y 向下，rot 顺时针（屏幕）
 */
export function toDisplayXY(venue, x, y) {
  const d = Number(venue?.d) || 0;
  return { x: Number(x) || 0, y: d - (Number(y) || 0) };
}
export function fromDisplayXY(venue, x, y) {
  const d = Number(venue?.d) || 0;
  return { x: Number(x) || 0, y: d - (Number(y) || 0) };
}
export function toDisplayRot(rot) {
  return ((360 - (Number(rot) || 0)) % 360 + 360) % 360;
}
export function fromDisplayRot(rot) {
  return ((360 - (Number(rot) || 0)) % 360 + 360) % 360;
}

/** 棚坐标左右：目标相对被摄者 X（显示系）更小为左 */
export function shelfSide(sx, sy, tx, ty) {
  const dx = (Number(tx) || 0) - (Number(sx) || 0);
  const dy = (Number(ty) || 0) - (Number(sy) || 0);
  if (Math.abs(dx) < 1e-6) return dy > 0 ? "back" : dy < 0 ? "front" : "same";
  return dx < 0 ? "left" : "right";
}

/** 方位口语：左/右 + 前/后 组合（例：左后），用于 HUD「方位 135°（左后）」 */
export function shelfSideLabel(sx, sy, tx, ty) {
  const dx = (Number(tx) || 0) - (Number(sx) || 0);
  const dy = (Number(ty) || 0) - (Number(sy) || 0);
  const lr = Math.abs(dx) < 1e-6 ? "" : (dx < 0 ? "left" : "right");
  const fb = Math.abs(dy) < 1e-6 ? "" : (dy > 0 ? "back" : "front");
  if (lr && fb) return lr + fb[0].toUpperCase() + fb.slice(1); // leftBack
  if (lr) return lr;
  if (fb) return fb;
  return "same";
}

/** 棚坐标方位角（显示系）：从被摄者指向目标，0°=+X 逆时针，再取 15° 档 */
export function shelfAzimuth15(sx, sy, tx, ty) {
  const dx = (Number(tx) || 0) - (Number(sx) || 0);
  const dy = (Number(ty) || 0) - (Number(sy) || 0);
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  let deg = Math.atan2(dy, dx) * 180 / Math.PI; // (−180, 180]
  if (deg < 0) deg += 360;
  return snapDeg15(deg);
}

/** 光位名：按相对被摄者朝向的 |α|（已 15° 档） */
export function lightKeyName(absAlpha15) {
  const a = Math.abs(Number(absAlpha15) || 0);
  if (a <= 0) return "front";
  if (a <= 30) return "shortFront";
  if (a === 45) return "rembrandt";
  if (a <= 90) return "side";
  if (a <= 135) return "sideBack";
  return "back";
}

/** 向量相对朝向的有符号夹角（显示系），再 round 到 15° */
export function relAngleToHeading15(sx, sy, headingDeg, tx, ty) {
  const th = (Number(headingDeg) || 0) * Math.PI / 180;
  const fx = Math.cos(th), fy = Math.sin(th);
  const dx = (Number(tx) || 0) - (Number(sx) || 0);
  const dy = (Number(ty) || 0) - (Number(sy) || 0);
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  const raw = Math.atan2(fx * dy - fy * dx, fx * dx + fy * dy) * 180 / Math.PI;
  return roundRelDeg15(raw);
}

/** 灯水平朝向对准被摄者：显示系 aim，再换回存储 rot，并取 15° 档 */
export function aimRotStorageToward(venue, light, subject) {
  const L = toDisplayXY(venue, light.x, light.y);
  const S = toDisplayXY(venue, subject.x, subject.y);
  const az = shelfAzimuth15(L.x, L.y, S.x, S.y); // 从灯指向被摄者
  return fromDisplayRot(az);
}

/** 解析当前被摄者（站位 mark 留给 T19；现回退 person / ex.subjectId） */
export function resolveSubject(p, setup, preferredId) {
  const els = [...(setup?.elements || [])];
  if (preferredId) {
    const hit = els.find(e => e.id === preferredId) || p.layout.base.find(e => e.id === preferredId);
    if (hit) return hit;
  }
  const sid = setup?.ex?.subjectId;
  if (sid) {
    const byRef = els.find(e => e.kind === "person" && e.ref === sid);
    if (byRef) return byRef;
    const byId = els.find(e => e.id === sid);
    if (byId) return byId;
  }
  return els.find(e => e.kind === "mark") || els.find(e => e.kind === "person") || null;
}

/** 脸高（m）：模特身高 − 0.12；未填身高用 1.55（与三维预览眼高一致） */
export function faceHeightM(p, subjectEl) {
  if (subjectEl?.faceHeightM !== "" && subjectEl?.faceHeightM != null && Number(subjectEl.faceHeightM) > 0) {
    return Number(subjectEl.faceHeightM);
  }
  const person = subjectEl?.ref ? personById(p, subjectEl.ref) : null;
  const hCm = person && Number(person.height) > 0 ? Number(person.height) : null;
  if (hCm) return hCm / 100 - 0.12;
  return 1.55;
}

/** 图元长边两端（存储系）：墙/窗/背景纸等 */
export function segmentEnds(el) {
  const len = Number(el.w) > 0 ? Number(el.w) : 1;
  const rad = (Number(el.rot) || 0) * Math.PI / 180;
  const hx = Math.cos(rad) * len / 2, hy = Math.sin(rad) * len / 2;
  return [
    { x: (Number(el.x) || 0) - hx, y: (Number(el.y) || 0) - hy },
    { x: (Number(el.x) || 0) + hx, y: (Number(el.y) || 0) + hy },
  ];
}

/** 点到线段最近点（存储系），含距离 */
export function nearestOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    const d0 = dist(p, a);
    return { x: a.x, y: a.y, d: d0 };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { x: q.x, y: q.y, d: dist(p, q) };
}

/** 机位相对被摄者朝向的景别档（按 |α| 15°） */
export function cameraViewLabel(absAlpha15) {
  const a = Math.abs(Number(absAlpha15) || 0);
  if (a <= 15) return "front";
  if (a <= 45) return "threeQuarter";
  if (a <= 90) return "side";
  if (a <= 135) return "sideBack";
  return "back";
}

/** 可选位置覆盖（拖动预览用）：{ [id]: { x, y, rot? } } */
function elWithOverride(e, overrides) {
  if (!e || !overrides || !overrides[e.id]) return e;
  return { ...e, ...overrides[e.id] };
}

/**
 * T24：四种静态相对关系（纯函数，不入库）。
 * 夹角一律在显示系计算；左右按棚坐标（§9.4）。
 * overrides：拖动时临时改坐标，不写工程。
 */
export function relativeAngles(p, setupId, subjectRef, overrides = null) {
  const setup = setupById(p, setupId);
  const subject0 = resolveSubject(p, setup, subjectRef);
  const subject = elWithOverride(subject0, overrides);
  if (!setup || !subject) {
    return { subject: null, lights: [], camera: null, backdrop: null, window: null };
  }
  const venue = p.venue;
  const S = toDisplayXY(venue, subject.x, subject.y);
  const head = toDisplayRot(subject.rot || 0);
  const faceH = faceHeightM(p, subject);
  const els = [...p.layout.base, ...setup.elements].map(e => elWithOverride(e, overrides));
  const setupEls = setup.elements.map(e => elWithOverride(e, overrides));
  const lab = (() => {
    const m = new Map();
    let l = 0, c = 0;
    for (const e of setup.elements) {
      if (e.kind === "light") m.set(e.id, "L" + (++l));
      if (e.kind === "camera") m.set(e.id, "C" + (++c));
    }
    return m;
  })();

  const lights = [];
  for (const e of setupEls.filter(x => x.kind === "light")) {
    const L = toDisplayXY(venue, e.x, e.y);
    const dXY = Math.hypot(L.x - S.x, L.y - S.y);
    const alpha = relAngleToHeading15(S.x, S.y, head, L.x, L.y);
    const row = {
      lightId: e.id,
      label: lab.get(e.id) || e.id,
      dXY,
      dSlant: null,
      alphaDeg: Math.abs(alpha),
      alphaSigned: alpha,
      side: shelfSideLabel(S.x, S.y, L.x, L.y),
      azDeg: shelfAzimuth15(S.x, S.y, L.x, L.y),
      keyName: lightKeyName(Math.abs(alpha)),
      elevDeg: null,
      headingStorage: subject.rot || 0,
      from: { x: subject.x, y: subject.y },
      to: { x: e.x, y: e.y },
    };
    if (e.heightM !== "" && e.heightM != null && isFinite(Number(e.heightM))) {
      const dh = Number(e.heightM) - faceH;
      row.dSlant = Math.hypot(dXY, dh);
      row.elevDeg = roundRelDeg15(Math.atan2(dh, Math.max(dXY, 1e-6)) * 180 / Math.PI);
    }
    lights.push(row);
  }
  lights.sort((a, b) => a.dXY - b.dXY);

  let camera = null;
  const cams = setupEls.filter(x => x.kind === "camera");
  let camEl = null;
  if (cams.length) {
    camEl = cams.reduce((best, e) => {
      const d0 = dist(subject, e);
      return !best || d0 < best.d ? { e, d: d0 } : best;
    }, null)?.e;
  }
  if (camEl) {
    const Cxy = toDisplayXY(venue, camEl.x, camEl.y);
    const dXY = Math.hypot(Cxy.x - S.x, Cxy.y - S.y);
    const alpha = relAngleToHeading15(S.x, S.y, head, Cxy.x, Cxy.y);
    camera = {
      cameraId: camEl.id,
      label: lab.get(camEl.id) || camEl.id,
      dXY,
      alphaDeg: Math.abs(alpha),
      side: shelfSideLabel(S.x, S.y, Cxy.x, Cxy.y),
      azDeg: shelfAzimuth15(S.x, S.y, Cxy.x, Cxy.y),
      viewLabel: cameraViewLabel(Math.abs(alpha)),
      focal: camEl.focal || 50,
      headingStorage: subject.rot || 0,
      from: { x: subject.x, y: subject.y },
      to: { x: camEl.x, y: camEl.y },
    };
  }

  let backdrop = null;
  const backs = els.filter(e => e.kind === "backdrop");
  if (backs.length) {
    let best = null;
    for (const e of backs) {
      const [a, b] = segmentEnds(e);
      const n = nearestOnSegment(subject, a, b);
      if (!best || n.d < best.n.d) best = { e, n };
    }
    if (best) {
      const T = toDisplayXY(venue, best.n.x, best.n.y);
      const alpha = relAngleToHeading15(S.x, S.y, head, T.x, T.y);
      backdrop = {
        backdropId: best.e.id,
        dMin: best.n.d,
        alphaDeg: Math.abs(alpha),
        side: shelfSideLabel(S.x, S.y, T.x, T.y),
        headingStorage: subject.rot || 0,
        from: { x: subject.x, y: subject.y },
        to: { x: best.n.x, y: best.n.y },
      };
    }
  }

  let windowRel = null;
  const wins = els.filter(e => e.kind === "window");
  if (wins.length) {
    let best = null;
    for (const e of wins) {
      const [a, b] = segmentEnds(e);
      const n = nearestOnSegment(subject, a, b);
      if (!best || n.d < best.n.d) best = { e, n, a, b };
    }
    if (best) {
      const T = toDisplayXY(venue, best.n.x, best.n.y);
      const alpha = relAngleToHeading15(S.x, S.y, head, T.x, T.y);
      // 窗内法向：长轴 rot ± 90°，取指向被摄者一侧
      const rad = (Number(best.e.rot) || 0) * Math.PI / 180;
      let nx = -Math.sin(rad), ny = Math.cos(rad);
      const toSubX = subject.x - best.e.x, toSubY = subject.y - best.e.y;
      if (nx * toSubX + ny * toSubY < 0) { nx = -nx; ny = -ny; }
      const N = { x: nx, y: -ny };
      const Nlen = Math.hypot(N.x, N.y) || 1;
      const Vx = S.x - T.x, Vy = S.y - T.y;
      const Vlen = Math.hypot(Vx, Vy) || 1;
      const cosI = Math.max(-1, Math.min(1, (N.x * Vx + N.y * Vy) / (Nlen * Vlen)));
      const incidenceDeg = roundRelDeg15(Math.acos(cosI) * 180 / Math.PI);
      windowRel = {
        windowId: best.e.id,
        dMin: best.n.d,
        alphaDeg: Math.abs(alpha),
        side: shelfSideLabel(S.x, S.y, T.x, T.y),
        azDeg: shelfAzimuth15(S.x, S.y, T.x, T.y),
        incidenceDeg,
        headingStorage: subject.rot || 0,
        from: { x: subject.x, y: subject.y },
        to: { x: best.n.x, y: best.n.y },
      };
    }
  }

  return { subject, lights, camera, backdrop, window: windowRel };
}

/**
 * 按选中对象挑出画布要画的量角器弧（§3.1）。
 * focusId：当前选中；overrides：拖动预览。
 */
export function relationArcs(p, setupId, focusId, overrides = null) {
  const focus = focusId ? (elWithOverride(
    [...p.layout.base, ...(setupById(p, setupId)?.elements || [])].find(e => e.id === focusId),
    overrides,
  ) || null) : null;
  const preferred = focus && (focus.kind === "person" || focus.kind === "mark") ? focus.id : null;
  const rel = relativeAngles(p, setupId, preferred, overrides);
  if (!rel.subject) return { distances: [], arcs: [], hud: [] };
  const arcs = [];
  const distances = [];
  const hud = [];
  const pushArc = (row, kind, label) => {
    if (!row) return;
    arcs.push({
      kind,
      from: row.from,
      to: row.to,
      headingStorage: row.headingStorage ?? (rel.subject.rot || 0),
      alphaDeg: row.alphaDeg,
      side: row.side,
      keyName: row.keyName || null,
      viewLabel: row.viewLabel || null,
      elevDeg: row.elevDeg ?? null,
      label,
    });
    distances.push({ from: row.from, to: row.to, d: row.dXY ?? row.dMin ?? 0, kind });
  };
  if (!focus || focus.kind === "person" || focus.kind === "mark") {
    for (const L of rel.lights) pushArc(L, "lightPerson", L.label);
    if (rel.camera) pushArc(rel.camera, "cameraPerson", rel.camera.label);
    if (rel.backdrop) {
      distances.push({ from: rel.backdrop.from, to: rel.backdrop.to, d: rel.backdrop.dMin, kind: "personBackdrop" });
    }
    if (rel.window) {
      pushArc(rel.window, "personWindow", "W");
    }
  } else if (focus.kind === "light") {
    const L = rel.lights.find(x => x.lightId === focus.id);
    pushArc(L, "lightPerson", L?.label || "L");
    if (L) hud.push(L);
  } else if (focus.kind === "camera") {
    if (rel.camera && rel.camera.cameraId === focus.id) pushArc(rel.camera, "cameraPerson", rel.camera.label);
    else if (rel.camera) pushArc(rel.camera, "cameraPerson", rel.camera.label);
  } else if (focus.kind === "backdrop" && rel.backdrop) {
    distances.push({ from: rel.backdrop.from, to: rel.backdrop.to, d: rel.backdrop.dMin, kind: "personBackdrop" });
  } else if (focus.kind === "window" && rel.window) {
    pushArc(rel.window, "personWindow", "W");
  }
  return { distances, arcs, hud, rel };
}

/** HUD：L1 · 2.30 m · 135°（左后）· 伦勃朗光 45°（side/key 由调用方本地化） */
export function formatLightHud(row, sideLabel, keyLabel) {
  const parts = [
    row.label,
    `${row.dXY.toFixed(2)} m`,
    `${row.azDeg}° (${sideLabel})`,
    `${keyLabel} ${row.alphaDeg}°`,
  ];
  if (row.elevDeg != null) parts.push(`β ${row.elevDeg}°`);
  if (row.dSlant != null) parts.push(`${row.dSlant.toFixed(2)} m∴`);
  return parts.join(" · ");
}
