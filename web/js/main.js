// 入口：路由、窗口外壳（顶栏 / 左侧步骤导航 / 主工作区 / 右侧属性面板）、全局快捷键。
import { S, subscribe, openProject, closeProject, commit, undo, redo, flush, saveVersion, listVersions, restoreVersion, loadLibraries, readonly, saveSettings } from "./store.js";
import * as M from "./model.js";
import { t, setLang, getLang, LANGS } from "./i18n.js";
import { h, menu, modal, confirmDlg, promptDlg, toast, isTyping } from "./ui.js";
import * as P0 from "./pages/projects.js";
import * as PBasics from "./pages/basics.js";
import * as PSite from "./pages/site.js";
import * as PModels from "./pages/models.js";
import * as PPoses from "./pages/poses.js";
import * as PShots from "./pages/shots.js";
import * as PLayout from "./pages/layout.js";
import * as PSchedule from "./pages/schedule.js";
import * as PProgress from "./pages/progress.js";
import * as PExport from "./pages/export.js";
import * as PEx from "./pages/ex.js";

const PAGES = {
  basics: PBasics, site: PSite, models: PModels, poses: PPoses,
  shots: PShots, layout: PLayout, schedule: PSchedule, progress: PProgress, export: PExport, ex: PEx,
};
// 0.1.0 收藏夹 / 旧链接跳转
const LEGACY_STEP = { overview: "basics", time: "basics", venue: "site", gear: "site" };

const app = document.getElementById("app");
const ui = { navMini: null, panelOpen: false, page: {} };   // 页面自己的临时状态放在 ui.page[step]
let route = { name: "list" };
let current = null;     // 当前页面渲染结果
let liveFns = [];

setLang(S.settings.lang || "zh");

function resolveStep(raw) {
  const key = LEGACY_STEP[raw] || raw;
  return PAGES[key] ? key : "basics";
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "p" && parts[1]) {
    const step = resolveStep(parts[2]);
    // 旧 key 写进地址栏时改成新 key，用户收藏也能落到正确页
    if (parts[2] && parts[2] !== step) {
      location.replace(`#/p/${parts[1]}/${step}`);
      return { name: "project", id: parts[1], step };
    }
    return { name: "project", id: parts[1], step };
  }
  return { name: "list" };
}

export function go(step, extra = {}) {
  if (!S.project) { location.hash = "#/"; return; }
  const key = resolveStep(step);
  Object.assign(ui.page[key] || (ui.page[key] = {}), extra);
  const h2 = `#/p/${S.project.id}/${key}`;
  if (location.hash === h2) render(); else location.hash = h2;
}

let routeGen = 0;
async function onRoute() {
  const gen = ++routeGen;
  route = parseHash();
  try {
    if (route.name === "project") { await openProject(route.id); }
    else { await flush(); closeProject(); P0.invalidate(); }
  } catch (e) {
    if (gen !== routeGen) return;
    toast(t("err.open") + " " + e.message);
    location.hash = "#/";
    return;
  }
  // 快速连点导航时，只让最新一次路由完成渲染，避免旧请求把页面盖回去
  if (gen !== routeGen) return;
  render();
  document.querySelector("main.page")?.scrollTo(0, 0);
}

// ---------- 外壳 ----------
function topBar() {
  // 在项目列表页时，即使后台已经打开了某个项目（例如导入刚建好），也显示列表页的顶栏
  const p = route.name === "project" ? S.project : null;
  const langSel = h("select.langsel", { "aria-label": t("top.lang"), onchange: async e => { setLang(e.target.value); await saveSettings({ lang: e.target.value }); render(); } },
    LANGS.map(([v, l]) => h("option", { value: v, selected: v === getLang() || null }, l)));
  if (!p) {
    return h("header.top", h("span.home", t("app.name")), h("span.mut.small", "portrait-guidance " + (S.version || "")), h("span.spacer"), langSel,
      h("button.ghost", { onclick: settingsDlg }, t("top.settings")));
  }
  const saveTxt = { saved: t("save.saved"), pending: t("save.pending"), saving: t("save.saving"), error: t("save.error"), conflict: t("save.conflict") }[S.save] || "";
  const badge = h("button.badge." + p.status, { title: t("status.change"), onclick: e => statusMenu(e.currentTarget) }, t("status." + p.status));
  return h("header.top",
    h("a.ghost", { href: "#/", title: t("top.back"), style: { textDecoration: "none", color: "var(--mut)" } }, "‹ " + t("top.projects")),
    h("span.title", { title: p.name }, p.name || t("proj.untitled")), badge,
    h("span.savestate" + (S.save === "error" ? ".err" : ""), { "data-save": "" }, saveTxt),
    h("span.spacer"),
    h("button.ghost.icon", { title: t("top.undo") + " ⌘Z", disabled: !S.past.length || null, onclick: undo }, "↶"),
    h("button.ghost.icon", { title: t("top.redo") + " ⇧⌘Z", disabled: !S.future.length || null, onclick: redo }, "↷"),
    h("button.ghost", { onclick: versionsDlg, title: "⌘S" }, t("top.versions")),
    langSel,
    current && current.panel ? h("button.ghost.panel-toggle", { onclick: () => { ui.panelOpen = !ui.panelOpen; document.querySelector(".body")?.classList.toggle("panel-open", ui.panelOpen); } }, t("top.panel")) : null,
    h("button.primary", { onclick: () => go("export") }, t("top.export")));
}

function statusMenu(anchor) {
  const p = S.project;
  menu(anchor, ["draft", "pending", "final"].map(v => ({ value: v, label: t("status." + v) })), { selected: [p.status], onPick: async v => {
    if (v === p.status) return;
    if (p.status === "final") {
      if (!await confirmDlg(t("final.unlockTitle"), t("final.unlockBody"), { ok: t("final.unlock") })) return;
      await saveVersion(t("final.autoNoteUnlock"));
    }
    if (v === "final") {
      const list = M.checks(p).filter(c => c.level !== "info" || c.code === "propsNotReady");
      if (list.length && !await confirmDlg(t("final.title"), t("final.withIssues", { n: list.length }), { ok: t("final.anyway") })) return;
      commit(q => { q.status = v; }, { force: true });
      await saveVersion(t("final.autoNote"));
      toast(t("final.done"));
      return;
    }
    commit(q => { q.status = v; }, { force: true });
  } });
}

function navBar(step) {
  const st = M.stepStatus(S.project);
  return h("nav.steps", { "aria-label": t("nav.label") },
    M.STEPS.map((k, i) => h("a" + (k === step ? ".on" : ""), { href: `#/p/${S.project.id}/${k}`, title: t("step." + k), "aria-current": k === step ? "page" : null },
      h("span.num", String(i + 1)), h("span.lbl", t("step." + k)), h("span.dot.s" + st[k], { title: t("dot." + st[k]) }))),
    // EX：S6 布置图的光比 / 光效视图，不算策划完成度
    M.EXTRA_STEPS.map(k => h("a.extra" + (k === step ? ".on" : ""), { href: `#/p/${S.project.id}/${k}`, title: t("step." + k), "aria-current": k === step ? "page" : null },
      h("span.num", "EX"), h("span.lbl", t("step." + k)), h("span.dot.s" + st[k], { title: t("lr.dot." + st[k]) }))),
    h("button.ghost.sm.collapse", { title: t("nav.toggle"), onclick: () => { ui.navMini = !isMini(step); render(); } }, isMini(step) ? "»" : "«"));
}
// 分镜 / 场地图 / 时间轴 / 进度默认收成图标栏
const isMini = step => ui.navMini ?? (step === "shots" || step === "layout" || step === "schedule" || step === "progress" || step === "ex");

function render() {
  liveFns = [];
  const ctx = { go, rerender: render, ui, live: fn => liveFns.push(fn) };
  if (route.name !== "project" || !S.project) {
    current = P0.render(ctx);
    app.replaceChildren(h("div.shell", topBar(), h("div.body.nopanel", { style: { "--nav-w": "0px" } }, h("span"), h("main.page", current.main), h("span"))));
    return;
  }
  const step = route.step;
  ui.page[step] = ui.page[step] || {};
  ctx.state = ui.page[step];
  current = PAGES[step].render(ctx);
  const mainKids = [];
  if (readonly()) mainKids.push(h("div.readonly-banner", h("span", "✓ " + t("final.banner")), h("span.spacer"),
    h("button.sm", { onclick: e => statusMenu(e.currentTarget) }, t("final.unlock"))));
  mainKids.push(current.main);
  const cls = ["body", isMini(step) ? "navmini" : "", current.panel ? "" : "nopanel", ui.panelOpen ? "panel-open" : ""].filter(Boolean).join(".");
  const scrollY = document.querySelector("main.page")?.scrollTop ?? 0;
  const focusKey = focusSignature();
  const panelY = document.querySelector("aside.panel")?.scrollTop ?? 0;
  app.replaceChildren(h("div.shell", topBar(),
    h("div." + cls, navBar(step), h("main.page", mainKids), h("aside.panel", { "aria-label": t("panel.label") }, current.panel || ""))));
  restoreFocus(focusKey);
  if (current.keepScroll !== false) {
    const m = document.querySelector("main.page"); if (m) m.scrollTop = scrollY;
    const a = document.querySelector("aside.panel"); if (a) a.scrollTop = panelY;
  }
  current.mounted?.();
}

// 重绘后把光标放回同一个输入框：按它在页面里的位置（区域 + 第几个输入件）识别
function focusSignature() {
  const a = document.activeElement;
  if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return null;
  const zone = a.closest("main.page,aside.panel,header.top");
  if (!zone) return null;
  const all = [...zone.querySelectorAll("input,textarea,select")];
  return { zone: zone.tagName + "." + zone.className.split(" ")[0], i: all.indexOf(a), type: a.type, s: a.selectionStart, e: a.selectionEnd };
}
function restoreFocus(k) {
  if (!k || k.i < 0) return;
  const zone = document.querySelector(k.zone.toLowerCase().replace(/^(\w+)\./, "$1."));
  const el = zone && [...zone.querySelectorAll("input,textarea,select")][k.i];
  if (!el || el.type !== k.type) return;
  el.focus({ preventScroll: true });
  try { if (k.s != null) el.setSelectionRange(k.s, k.e); } catch { /* 数字等类型不支持 */ }
}

// 打字时只刷新外壳，不重绘页面
function softRender() {
  if (!S.project || route.name !== "project") return;
  const top = document.querySelector("header.top");
  if (top) top.replaceWith(topBar());
  const nav = document.querySelector("nav.steps");
  if (nav) nav.replaceWith(navBar(route.step));
  for (const fn of liveFns) fn();
}
function statusRender() {
  const el = document.querySelector("[data-save]");
  if (el) {
    el.textContent = { saved: t("save.saved"), pending: t("save.pending"), saving: t("save.saving"), error: t("save.error"), conflict: t("save.conflict") }[S.save] || "";
    el.classList.toggle("err", S.save === "error");
  }
}

subscribe(kind => { if (kind === "full") render(); else if (kind === "soft") softRender(); else statusRender(); });

// ---------- 版本 ----------
async function versionsDlg() {
  if (!S.project) return;
  await flush();
  const list = await listVersions();
  modal(close => [
    h("h3", t("ver.title")),
    h("p", t("ver.help")),
    h("div.row", h("button.primary", { onclick: async () => { const n = await promptDlg(t("ver.saveTitle"), { placeholder: t("ver.note") }); if (n != null) { await saveVersion(n); toast(t("ver.saved")); close(); } } }, t("ver.save"))),
    list.length ? h("table.grid", { style: { marginTop: "12px" } }, h("tr", h("th", t("ver.at")), h("th", t("ver.note")), h("th", "")),
      list.map(v => h("tr", h("td.nowrap", v.at.replace("T", " ")), h("td", v.note || h("span.mut", "—")), h("td",
        h("button.sm", { onclick: async () => { if (await confirmDlg(t("ver.restoreTitle"), t("ver.restoreBody"))) { close(); await restoreVersion(v.id); toast(t("ver.restored")); } } }, t("ver.restore"))))))
      : h("p.mut", t("ver.none")),
    h("div.acts", h("button", { onclick: () => close() }, t("common.close"))),
  ], { wide: true });
}

function settingsDlg() {
  modal(close => [
    h("h3", t("top.settings")),
    h("div.field", h("label", t("set.lang")), h("select", { onchange: async e => { setLang(e.target.value); await saveSettings({ lang: e.target.value }); close(); render(); } },
      LANGS.map(([v, l]) => h("option", { value: v, selected: v === getLang() || null }, l)))),
    h("div.field", h("label", t("set.data")), h("code.small", S.dataDir || "")),
    h("p.small", t("set.dataHelp")),
    h("div.acts", h("button", { onclick: () => close() }, t("common.close"))),
  ]);
}

// ---------- 快捷键 ----------
document.addEventListener("keydown", async e => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (S.project) { const n = await promptDlg(t("ver.saveTitle"), { placeholder: t("ver.note") }); if (n != null) { await saveVersion(n); toast(t("ver.saved")); } } return; }
  if (mod && e.key.toLowerCase() === "z" && !isTyping(e) && S.project) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "y" && !isTyping(e) && S.project) { e.preventDefault(); redo(); return; }
  if (current && current.onKey) current.onKey(e);
});

addEventListener("hashchange", onRoute);
(async () => {
  try { await loadLibraries(); } catch (e) { console.warn(e); }
  onRoute();
})();
