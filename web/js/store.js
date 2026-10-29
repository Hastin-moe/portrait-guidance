// 数据与保存：当前项目、自动保存（约 1 秒）、撤销 / 重做（至少 50 步）、资料库。
import * as M from "./model.js";
import { t } from "./i18n.js";
import { toast, confirmDlg } from "./ui.js";

const BOOT = window.BOOT || { token: "", settings: { lang: "zh" } };
const HIST = 80;

export const S = {
  project: null, rev: 0, save: "saved", past: [], future: [],
  poses: [], venues: [], settings: BOOT.settings, version: BOOT.version, dataDir: BOOT.dataDir,
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind) { for (const fn of listeners) fn(kind); }

// ---------- 接口 ----------
export async function api(method, path, body, headers = {}) {
  const opt = { method, headers: { "X-Token": BOOT.token, ...headers } };
  if (body instanceof Blob || body instanceof File) { opt.body = body; opt.headers["Content-Type"] = body.type; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch("/api/" + path, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(data.error || r.statusText);
  return { status: r.status, data };
}

export const fileUrl = name => name ? `/files/${S.project.id}/${encodeURIComponent(name)}` : "";
export const libUrl = name => name ? `/lib/${encodeURIComponent(name)}` : "";

export async function uploadImages(files, toLibrary = false) {
  const out = [];
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const { data } = await api("POST", toLibrary ? "library/files" : `projects/${S.project.id}/files`, f);
    out.push(data.file);
  }
  return out;
}

// ---------- 项目 ----------
export async function openProject(id) {
  if (S.project && S.project.id === id) return;
  await flush();
  const { data } = await api("GET", "projects/" + id);
  S.project = M.normalize(data);
  S.rev = data.rev;
  S.past = []; S.future = [];
  S.save = "saved";
  // 列表上显示的完整度存在项目里；打开时顺手更新一次
  const c = M.completeness(S.project);
  if (!S.project.summary || S.project.summary.completeness !== c || S.project.summary.shots !== S.project.shots.length) queueSave();
}

export function closeProject() { S.project = null; }

export const readonly = () => S.project && S.project.status === "final";

let lastGroup = null, lastGroupAt = 0;
// 修改数据：mutate(p) 直接改对象。soft=true 时只刷新外壳（打字时不重绘页面）
export function commit(mutate, { soft = false, group = null, force = false } = {}) {
  if (!S.project) return false;
  if (readonly() && !force) { toast(t("final.locked")); emit("full"); return false; }
  const nowT = Date.now();
  const merge = group && group === lastGroup && nowT - lastGroupAt < 1500;
  if (!merge) {
    S.past.push(JSON.stringify(S.project));
    if (S.past.length > HIST) S.past.shift();
  }
  lastGroup = group; lastGroupAt = nowT;
  mutate(S.project);
  S.future = [];
  queueSave();
  emit(soft ? "soft" : "full");
  return true;
}

// 只重绘，不改数据（输入框离开时用）。
// 如果这时鼠标正按着（用户正点向另一个按钮或输入框），等这次点击完成后再重绘，避免点击落空。
let pointerDown = false, pendingRefresh = false;
document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
document.addEventListener("pointerup", () => setTimeout(() => { pointerDown = false; if (pendingRefresh) { pendingRefresh = false; emit("full"); } }, 0), true);
export function refresh() {
  if (pointerDown) { pendingRefresh = true; return; }
  setTimeout(() => emit("full"), 0);
}

export function undo() {
  if (!S.past.length) return;
  S.future.push(JSON.stringify(S.project));
  S.project = M.normalize(JSON.parse(S.past.pop()));
  lastGroup = null;
  queueSave(); emit("full");
}
export function redo() {
  if (!S.future.length) return;
  S.past.push(JSON.stringify(S.project));
  S.project = M.normalize(JSON.parse(S.future.pop()));
  lastGroup = null;
  queueSave(); emit("full");
}

let saveTimer = null, saving = null;
function queueSave() {
  S.save = "pending"; emit("status");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 1000);
}

async function doSave(forceOverwrite = false) {
  saveTimer = null;
  if (!S.project) return;
  if (saving) { await saving; }
  const p = S.project;
  p.summary = { completeness: M.completeness(p), shots: p.shots.length };
  S.save = "saving"; emit("status");
  saving = (async () => {
    try {
      const { status, data } = await api("PUT", "projects/" + p.id, p, forceOverwrite ? {} : { "If-Rev": String(S.rev) });
      if (status === 409) {
        S.save = "conflict"; emit("status");
        const ok = await confirmDlg(t("save.conflictTitle"), t("save.conflictBody"), { ok: t("save.overwrite") });
        if (ok) { S.rev = data.current.rev; saving = null; return doSave(true); }
        S.project = M.normalize(data.current); S.rev = data.current.rev; S.past = []; S.future = [];
        S.save = "saved"; emit("full");
        return;
      }
      S.rev = data.rev;
      S.save = saveTimer ? "pending" : "saved";
    } catch (e) {
      S.save = "error";
      console.error(e);
    }
    emit("status");
  })();
  await saving; saving = null;
}

export async function flush() {
  if (saveTimer) { clearTimeout(saveTimer); await doSave(); }
  else if (saving) await saving;
}
addEventListener("beforeunload", e => { if (saveTimer || saving) { doSave(); e.preventDefault(); } });

// ---------- 版本 ----------
export async function saveVersion(note) {
  await flush();
  await api("POST", `projects/${S.project.id}/versions`, { note });
}
export async function listVersions() { return (await api("GET", `projects/${S.project.id}/versions`)).data; }
export async function restoreVersion(vid) {
  await flush();
  await api("POST", `projects/${S.project.id}/versions/${vid}/restore`);
  const id = S.project.id; S.project = null;
  await openProject(id); emit("full");
}

// ---------- 资料库（动作库、场地库） ----------
export async function loadLibraries() {
  const [poses, venues] = await Promise.all([api("GET", "library/poses"), api("GET", "library/venues")]);
  const { normalizePose } = await import("./model.js");
  // 空库不再自动写入起步预设；由动作页「从预设调出」按需克隆
  S.poses = (poses.data || []).map(x => normalizePose(x));
  S.venues = venues.data || [];
}
const libTimers = {};
export function saveLibrary(name) {
  clearTimeout(libTimers[name]);
  libTimers[name] = setTimeout(() => api("PUT", "library/" + name, S[name]).catch(e => toast(String(e))), 600);
}

export async function saveSettings(patch) {
  Object.assign(S.settings, patch);
  await api("PUT", "settings", patch);
}
