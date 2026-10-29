// Grok 旧版 portrait-guidance.plan/v1 → 本程序项目。纯函数，不碰网络。
import * as M from "./model.js";

const FRAMING = {
  "全身": "full", "七分": "knee", "半身": "half", "近景": "bust", "特写": "close", "大特写": "xclose",
  full: "full", knee: "knee", half: "half", bust: "bust", close: "close", xclose: "xclose",
};

const EQUIP_TYPE = {
  light_head: "light", light: "light", modifier: "modifier", absorb: "absorb", other: "other",
};

function uid() { return M.uid(); }

// 取字符串里的焦距数字；取不到返回 null（不再默认 50，避免没写焦距的镜头被填成 50mm，T11-B2）
function parseFocal(s) {
  const m = String(s || "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function parseHHMM(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : M.toMin(s);
}

function dataUrlEntry(dataUrl, role, meta = {}) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  return { dataUrl, role, ...meta };
}

/**
 * @returns {{ project: object, poses: object[], images: object[], report: { ok: string[], skip: string[], check: string[] } }}
 */
export function convertGrok(raw) {
  const report = { ok: [], skip: [], check: [] };
  const images = [];
  const poses = [];
  const p = M.blankProject(raw.title || "");

  p.name = raw.title || "";
  p.time.date = raw.shoot_date || "";
  p.time.timezone = raw.timezone || "Asia/Shanghai";
  p.venue.name = raw.location || "";
  p.overview.theme = raw.notes || "";
  if (raw.site_conditions) p.venue.zones = String(raw.site_conditions);
  report.ok.push(`项目「${p.name}」`);

  const place = raw.location_place || {};
  const mapQ = place.map && place.map.query;
  if (mapQ) { p.venue.address = mapQ; report.ok.push("地址"); }
  else if (place.map) report.skip.push("location_place.map.query 为空");

  const shot = place.screenshot && place.screenshot.dataUrl;
  if (shot) {
    const img = dataUrlEntry(shot, "venue");
    if (img) { images.push(img); report.ok.push("地图截图（待上传）"); }
  }

  // ---- 人员 ----
  const modelIdMap = new Map();
  const models = Array.isArray(raw.models) ? raw.models : [];
  if (raw.model_count != null && Number(raw.model_count) !== models.length) {
    report.check.push(`model_count=${raw.model_count} 与 models 列表长度 ${models.length} 不一致`);
  }
  for (const m of models) {
    const id = uid();
    modelIdMap.set(m.id || m.name, id);
    const lookName = (m.wardrobe && String(m.wardrobe).trim()) || "造型 1";
    const person = { id, kind: "model", name: m.name || "", height: "", size: "", availFrom: "", availTo: "", looks: [{ id: uid(), name: lookName }] };
    p.people.push(person);
    if (m.notes) report.check.push(`模特「${m.name}」备注：${m.notes}`);
  }
  if (models.length) report.ok.push(`模特 ${models.length} 位`);

  for (const c of raw.crew || []) {
    p.people.push({ id: uid(), kind: "staff", name: String(c), role: "", contact: "" });
  }
  if ((raw.crew || []).length) report.ok.push(`工作人员 ${(raw.crew || []).length} 人`);

  // ---- 器材 ----
  const gearByPreset = new Map();
  const gearNames = new Set();
  const addGear = (row) => {
    p.gear.push(row);
    if (row.model) gearNames.add(row.model);
    if (row.presetId) gearByPreset.set(row.presetId, row);
  };

  for (const eq of raw.equipment || []) {
    const type = EQUIP_TYPE[eq.category || eq.kind] || "other";
    const row = {
      id: uid(), type, model: eq.name || eq.label || "", qty: 1, source: "own",
      presetId: eq.preset_id || "", shape: eq.shape || "",
      diameterCm: eq.diameter_cm ?? "", widthCm: eq.width_cm ?? "", heightCm: eq.height_cm ?? "", depthCm: eq.depth_cm ?? eq.thickness_cm ?? "",
    };
    addGear(row);
  }
  if ((raw.equipment || []).length) report.ok.push(`equipment ${(raw.equipment || []).length} 件`);

  for (const g of raw.gear || []) {
    const kind = String(g.kind || "");
    let type = "other";
    if (/机身/.test(kind)) type = "camera";
    else if (/镜头/.test(kind)) type = "lens";
    const name = g.name || "";
    if (gearNames.has(name)) continue;
    addGear({ id: uid(), type, model: name, qty: 1, source: "own", presetId: "", shape: "", diameterCm: "", widthCm: "", heightCm: "", depthCm: "" });
  }

  for (const L of raw.lights || []) {
    const name = L.name || "";
    if (!name || gearNames.has(name)) continue;
    addGear({ id: uid(), type: "light", model: name, qty: 1, source: "own", presetId: "", shape: "", diameterCm: "", widthCm: "", heightCm: "", depthCm: "" });
  }

  // ---- 道具 ----
  const propByName = new Map();
  for (const pr of raw.props || []) {
    const id = uid();
    const name = pr.name || "";
    propByName.set(name, id);
    p.props.push({ id, name, qty: 1, size: "", source: "own", owner: "", status: "todo" });
  }

  // ---- 动作 ----
  const poseByOldId = new Map();
  const poseByName = new Map();
  for (const a of raw.actions || []) {
    const id = uid();
    const name = a.name || "";
    const pose = { id, name, image: "", cues: { weight: a.notes || "", hands: "", gaze: "" }, sizes: [], people: "1", tags: [] };
    poses.push(pose);
    poseByOldId.set(a.id, id);
    poseByName.set(name, id);
    if (a.notes) report.check.push(`动作「${name}」：原备注放在『重心』一栏，请人工调整`);
  }
  if (poses.length) report.ok.push(`动作 ${poses.length} 个`);

  // ---- 情绪板 ----
  const refs = (raw.references && raw.references.items) || raw.references || [];
  const refItems = Array.isArray(refs) ? refs : [];
  for (const it of refItems) {
    if (!it.thumb) {
      report.skip.push(`参考图无缩略图：${it.title || it.url || "（无标题）"}`);
      continue;
    }
    const src = it.source === "x" || it.source === "xhs" ? it.source : "web";
    const img = dataUrlEntry(it.thumb, "mood", { url: it.url || "", source: src, note: it.title || "" });
    if (img) images.push(img);
  }
  if (raw.references && raw.references.query) report.skip.push(`references 检索词：${raw.references.query}`);
  if (raw.LIGHT_FIXTURES || raw.light_fixtures) report.skip.push("LIGHT_FIXTURES 相关字段未导入");

  // ---- 场地图 ----
  const sm = raw.site_map || {};
  const room = sm.room || {};
  const roomW = Number(room.width_m) > 0 ? Number(room.width_m) : (Number(p.venue.w) || 8);
  const roomD = Number(room.depth_m) > 0 ? Number(room.depth_m) : (Number(p.venue.d) || 6);
  if (Number(room.width_m) > 0) p.venue.w = room.width_m;
  if (Number(room.depth_m) > 0) p.venue.d = room.depth_m;
  if (!p.venue.w) p.venue.w = roomW;
  if (!p.venue.d) p.venue.d = roomD;

  const setupA = p.layout.setups[0];
  setupA.name = "A";
  const firstLens = (raw.gear || []).find(g => /镜头/.test(String(g.kind || "")));
  const defaultFocal = parseFocal(firstLens && firstLens.name) || 50;

  const catOf = m => m.category || m.kind || "";
  const pendingMods = [];
  for (const mk of sm.markers || []) {
    const cat = catOf(mk);
    const x = (Number(mk.x) || 0) * roomW;
    const y = (Number(mk.y) || 0) * roomD;
    const rot = Number(mk.rotation) || 0;
    if (cat === "window") {
      const e = M.newElement("window", x, y);
      e.w = Number(mk.width_m) > 0 ? Number(mk.width_m) : e.w;
      e.h = 0.15;
      e.rot = rot;
      p.layout.base.push(e);
    } else if (cat === "model") {
      const e = M.newElement("person", x, y);
      const hit = p.people.find(pe => pe.kind === "model" && pe.name === mk.label);
      e.ref = hit ? hit.id : "";
      e.rot = rot - 90;
      setupA.elements.push(e);
    } else if (cat === "camera") {
      const e = M.newElement("camera", x, y);
      e.focal = parseFocal(mk.focal_length) || defaultFocal;
      e.rot = rot - 90;
      e.label = mk.label || "";
      setupA.elements.push(e);
    } else if (cat === "light_head" || cat === "light") {
      const e = M.newElement("light", x, y);
      e.rot = rot - 90;
      if (mk.beam_angle != null) e.beam = Number(mk.beam_angle);
      const g = p.gear.find(x => x.type === "light" && x.model === mk.label);
      if (g) e.ref = "o:" + g.id;
      setupA.elements.push(e);
    } else if (cat === "modifier") {
      // Grok 里灯头和修饰器是两个标记；修饰器挂到最近的灯上，不再变成一盏多余的灯（T11-A1）
      pendingMods.push({ mk, x, y, rot });
    } else if (cat === "absorb") {
      const e = M.newElement("board", x, y);
      e.w = Number(mk.width_m) > 0 ? Number(mk.width_m) : e.w;
      e.h = Math.max(Number(mk.depth_m) || 0, 0.05);
      e.rot = rot;
      // 先按 preset_id、再按名称对应清单里的吸光板，都找不到才退回第一块（T11-B3）
      const absorbs = p.gear.filter(x => x.type === "absorb");
      const g = (mk.preset_id && gearByPreset.get(mk.preset_id))
        || (mk.label && absorbs.find(x => x.model === mk.label || x.model.includes(mk.label)))
        || absorbs[0];
      if (g && g.type === "absorb") e.ref = "o:" + g.id;
      setupA.elements.push(e);
    } else if (cat === "other" || cat) {
      const e = M.newElement("prop", x, y);
      e.w = Number(mk.width_m) > 0 ? Number(mk.width_m) : e.w;
      e.h = Number(mk.depth_m) > 0 ? Number(mk.depth_m) : e.h;
      e.rot = rot - 90;
      setupA.elements.push(e);
    } else {
      report.skip.push(`未知场地图标记：${mk.label || mk.id || "?"}`);
    }
  }
  for (const { mk, x, y, rot } of pendingMods) {
    const g = mk.preset_id && gearByPreset.get(mk.preset_id);
    const free = setupA.elements.filter(e => e.kind === "light" && !e.modifierRef);
    const byLabel = free.find(e => mk.label && e.ref && (p.gear.find(r => "o:" + r.id === e.ref) || {}).model === mk.label);
    const near = free.map(e => ({ e, d: Math.hypot(e.x - x, e.y - y) })).sort((a, b) => a.d - b.d)[0];
    const host = byLabel || (near && near.d <= 1.5 ? near.e : null);
    if (host) {
      if (g) host.modifierRef = "o:" + g.id; else host.modifier = mk.label || "";
    } else {
      const e = M.newElement("light", x, y);
      e.rot = rot - 90;
      if (g) e.modifierRef = "o:" + g.id; else e.modifier = mk.label || "";
      setupA.elements.push(e);
      report.check.push(`修饰器「${mk.label || mk.preset_id || "?"}」附近没有灯，已单独放一盏未绑定的灯，请人工检查`);
    }
  }
  if ((sm.markers || []).length) report.ok.push(`场地图标记 ${(sm.markers || []).length} 个`);

  // ---- 分镜 ----
  const lightGroups = new Map();
  for (const sh of raw.shots || []) {
    const key = sh.light || "（未命名布光）";
    if (!lightGroups.has(key)) lightGroups.set(key, []);
    lightGroups.get(key).push(sh);
  }
  const lookByName = new Map();
  for (const pe of M.models(p)) for (const l of pe.looks || []) lookByName.set(l.name, l.id);

  let orderBase = 0;
  for (const [lightName, list] of lightGroups) {
    const sc = M.newScene(p, lightName);
    sc.setupId = setupA.id;
    sc.personIds = [];
    for (const sh of list) {
      const shot = M.newShot(p, sc.id);
      shot.lockedNo = sh.shot_id || "";
      const title = sh.title || "";
      const notesExtra = [];
      shot.notes = [title, sh.notes].filter(Boolean).join("\n");
      const size = FRAMING[sh.framing];
      if (size) shot.size = size;
      else if (sh.framing) { notesExtra.push(String(sh.framing)); }
      shot.focal = parseFocal(sh.focal_length) ?? "";
      if (sh.action_id && poseByOldId.has(sh.action_id)) shot.poseId = poseByOldId.get(sh.action_id);
      else if (sh.action_text && poseByName.has(sh.action_text)) shot.poseId = poseByName.get(sh.action_text);
      shot.cue = sh.action_text || "";
      if (sh.props_text && sh.props_text !== "无") {
        const names = String(sh.props_text).split(/[,，、]/).map(s => s.trim()).filter(Boolean);
        shot.props = [];
        for (const n of names) {
          if (propByName.has(n)) shot.props.push(propByName.get(n));
          else notesExtra.push("道具：" + n);
        }
      }
      if (sh.wardrobe && lookByName.has(sh.wardrobe)) shot.lookIds = [lookByName.get(sh.wardrobe)];
      if (Array.isArray(sh.model_ids)) {
        shot.personIds = sh.model_ids.map(id => modelIdMap.get(id)).filter(Boolean);
        if (shot.personIds.length) sc.personIds = [...new Set([...sc.personIds, ...shot.personIds])];
      }
      const sm0 = parseHHMM(sh.start), sm1 = parseHHMM(sh.end);
      if (sm0 != null && sm1 != null && sm1 > sm0) {
        shot.minutes = sm1 - sm0;
        p.schedule.locks[shot.id] = M.fmtMin(sm0);
      } else shot.minutes = 10;
      if (sh.status) shot.status = sh.status;
      const date = p.time.date || "";
      const tz = p.time.timezone || "Asia/Shanghai";
      // 「HH:MM」按项目时区和拍摄日期拼成 ISO（T11-B1）
      const stamp = (v) => {
        if (!v) return "";
        if (/T/.test(v) || /^\d{4}-/.test(v)) return v;
        if (/^\d{1,2}:\d{2}/.test(v) && date) {
          const [hh, mm, ss] = v.split(":");
          return M.wallToIso(date, `${hh.padStart(2, "0")}:${mm}${ss ? ":" + ss : ""}`, tz);
        }
        return v;
      };
      shot.startedAt = stamp(sh.started_at || "");
      shot.completedAt = stamp(sh.completed_at || "");
      if (notesExtra.length) shot.notes = [shot.notes, ...notesExtra].filter(Boolean).join("\n");
      if (sh.gear_ids && sh.gear_ids.length) report.skip.push(`${sh.shot_id || shot.id} 的 gear_ids 未导入分镜`);
      orderBase++;
    }
  }
  if ((raw.shots || []).length) report.ok.push(`分镜 ${(raw.shots || []).length} 镜 / 场景 ${p.scenes.length}`);

  // 其余未映射顶层字段
  const known = new Set(["schema", "id", "title", "shoot_date", "timezone", "location", "location_place", "model_count", "crew", "notes", "site_conditions", "lights", "props", "site_map", "gear", "equipment", "models", "actions", "shots", "references", "status", "updated_at", "created_at"]);
  for (const k of Object.keys(raw)) {
    if (!known.has(k)) report.skip.push(`字段 ${k} 未导入`);
  }

  return { project: M.normalize(p), poses, images, report };
}

export default convertGrok;
