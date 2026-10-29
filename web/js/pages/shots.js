// S6 分镜（重做版）：按场景分组 + 继承、时长预算、检查列、详情抽屉带机位与布光缩略图、批量操作（F23–F28）
import { h, menu, modal, promptDlg, confirmDlg, toast, seg, isTyping } from "../ui.js";
import { t, fmtDuration } from "../i18n.js";
import { S, commit, fileUrl, libUrl, readonly, saveLibrary } from "../store.js";
import * as M from "../model.js";
import { renderLayout } from "../canvas.js";
import { inp, area, fld, sel, chip, issuesList, checkText, personName, lookName, setupName, cameraName, poseById, poseName, sceneName, emptyState } from "./common.js";
import { openRefPicker } from "../refimages.js";

export const SIZES = ["full", "knee", "half", "bust", "close", "xclose"];
const OPT_COLS = ["props", "camera", "setup", "notes"];

export function render(ctx) {
  const p = S.project, st = ctx.state, ro = readonly();
  st.view = st.view || "table";
  st.filter = st.filter || {};
  st.sel = st.sel || new Set();
  if (st.focus && !p.shots.some(s => s.id === st.focus)) st.focus = null;
  st.collapsed = st.collapsed || {};
  const cols = p.ui.columns;
  const nos = M.shotNumbers(p);
  const all = M.checks(p);
  const issues = M.shotIssues(all);
  const sch = M.schedule(p);

  // ---------- 筛选 ----------
  const f = st.filter, q = (st.q || "").trim().toLowerCase();
  const pass = s => {
    const r = M.resolveShot(p, s);
    if (f.scene && s.sceneId !== f.scene) return false;
    if (f.model && !r.personIds.includes(f.model)) return false;
    if (f.setup && r.setupId !== f.setup) return false;
    if (f.priority && s.priority !== f.priority) return false;
    if (f.issues && !issues.has(s.id)) return false;
    if (q) {
      const hay = [nos.get(s.id), poseName(s.poseId), s.cue, s.notes, t("size." + s.size)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const filtering = Object.values(f).some(Boolean) || !!q;

  // ---------- 操作 ----------
  const focusShot = id => { st.focus = id; ctx.rerender(); };
  const addScene = () => {
    if (ro) return toast(t("final.locked"));
    let id; commit(x => { const sc = M.newScene(x, ""); id = sc.id; });
    st.renaming = id; ctx.rerender();
  };
  const addShot = (sceneId, afterId) => {
    if (ro) return toast(t("final.locked"));
    if (!p.scenes.length) { commit(x => { M.newScene(x, ""); }); sceneId = p.scenes[0].id; }
    sceneId = sceneId || (afterId && p.shots.find(s => s.id === afterId)?.sceneId) || p.scenes[p.scenes.length - 1].id;
    let id; commit(x => { id = M.newShot(x, sceneId, afterId).id; });
    st.focus = id; st.sel = new Set(); ctx.rerender();
  };
  const dupShot = id => {
    if (ro) return;
    let nid; commit(x => { const src = x.shots.find(s => s.id === id); const n = M.newShot(x, src.sceneId, id); Object.assign(n, JSON.parse(JSON.stringify({ ...src, id: n.id, order: n.order, lockedNo: "" }))); nid = n.id; });
    st.focus = nid; ctx.rerender();
  };
  const delShots = async ids => {
    if (ro || !ids.length) return;
    if (!await confirmDlg(t("shots.delTitle", { n: ids.length }), ids.map(i => nos.get(i)).join("、"), { danger: true, ok: t("common.delete") })) return;
    st.sel = new Set(); if (ids.includes(st.focus)) st.focus = null;
    commit(x => { const scs = new Set(x.shots.filter(s => ids.includes(s.id)).map(s => s.sceneId)); x.shots = x.shots.filter(s => !ids.includes(s.id)); for (const id of ids) delete x.schedule.locks[id]; scs.forEach(sc => M.renumber(x, sc)); });
  };
  const setOnShots = (ids, patch) => commit(x => { for (const s of x.shots) if (ids.includes(s.id)) Object.assign(s, typeof patch === "function" ? patch(s) : patch); });

  // ---------- 选择菜单 ----------
  const setupItems = () => p.layout.setups.map(s => ({ value: s.id, label: `${t("layout.setup")} ${s.name}` }));
  const cameraItems = setupId => M.cameras(p, setupId).map((c, i) => ({ value: c.id, label: `${t("el.camera")} ${i + 1}`, hint: `${c.focal || 50}mm` }));
  const modelItems = () => M.models(p).map(m => ({ value: m.id, label: m.name }));
  const lookItems = personIds => M.allLooks(p).filter(l => !personIds || !personIds.length || personIds.includes(l.personId)).map(l => ({ value: l.id, label: `${l.personName} · ${l.name}` }));
  const propItems = () => p.props.map(x => ({ value: x.id, label: x.name || "—" }));

  // ---------- 工具栏 ----------
  const chipsActive = [
    f.scene && chip(sceneName(p, M.sceneById(p, f.scene) || {}), { onRemove: () => { f.scene = ""; ctx.rerender(); } }),
    f.model && chip(personName(p, f.model), { onRemove: () => { f.model = ""; ctx.rerender(); } }),
    f.setup && chip(setupName(p, f.setup), { onRemove: () => { f.setup = ""; ctx.rerender(); } }),
    f.priority && chip(t("pri." + f.priority), { onRemove: () => { f.priority = ""; ctx.rerender(); } }),
    f.issues && chip(t("shots.onlyIssues"), { onRemove: () => { f.issues = false; ctx.rerender(); } }),
  ].filter(Boolean);
  const filterMenu = e => menu(e.currentTarget, [
    { header: t("shots.scene") }, ...p.scenes.map(sc => ({ value: "scene:" + sc.id, label: sceneName(p, sc) })),
    { header: t("shots.model") }, ...M.models(p).map(m => ({ value: "model:" + m.id, label: m.name })),
    { header: t("layout.setups") }, ...p.layout.setups.map(s => ({ value: "setup:" + s.id, label: `${t("layout.setup")} ${s.name}` })),
    { header: t("shots.priority") }, { value: "priority:must", label: t("pri.must") }, { value: "priority:opt", label: t("pri.opt") },
    { header: t("panel.checks") }, { value: "issues:1", label: t("shots.onlyIssues") },
  ], { onPick: v => { const [k, val] = v.split(":"); f[k] = k === "issues" ? true : val; ctx.rerender(); } });
  const toolbar = h("div.toolbar",
    seg([["table", t("shots.table")], ["cards", t("shots.cards")]], st.view, v => { st.view = v; ctx.rerender(); }),
    h("button", { onclick: filterMenu }, t("shots.filter") + " ▾"),
    st.view === "table" ? h("button", { onclick: e => menu(e.currentTarget, OPT_COLS.map(c => ({ value: c, label: t("col." + c) })), { multi: true, selected: cols.filter(c => OPT_COLS.includes(c)),
      onPick: v => { commit(x => { x.ui.columns = [...x.ui.columns.filter(c => !OPT_COLS.includes(c)), ...v]; }, { force: true }); } }) }, t("shots.columns") + " ▾") : null,
    h("input", { type: "search", placeholder: t("shots.search"), value: st.q || "", oninput: e => { st.q = e.target.value; ctx.rerender(); requestAnimationFrame(() => { const i = document.querySelector(".toolbar input[type=search]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); } }),
    chipsActive.length ? h("div.chips", chipsActive, h("button.sm.ghost", { onclick: () => { st.filter = {}; st.q = ""; ctx.rerender(); } }, t("shots.clear"))) : null,
    h("span.spacer"),
    h("button.ghost", { disabled: ro || p.scenes.length < 2 || null, title: t("shots.sortHelp"), onclick: () => commit(x => M.sortScenesForShoot(x)) }, t("shots.sort")),
    h("button", { disabled: ro || null, onclick: addScene, title: "⌘⇧N" }, "＋ " + t("shots.newScene")),
    h("button.primary", { disabled: ro || null, onclick: () => addShot(st.focus ? p.shots.find(s => s.id === st.focus)?.sceneId : null, st.focus), title: "⌘N" }, "＋ " + t("shots.newShot")));

  // ---------- ① 时长预算 ----------
  const nMust = p.shots.filter(s => s.priority !== "opt").length;
  const avail = sch.avail.minutes;
  const scale = Math.max(avail, sch.mustMin + sch.optMin, 1) * 1.08;
  const errCount = all.filter(c => c.level === "error" || c.level === "warn").length;
  const budget = h("div.budget" + (sch.overMin > 0 ? ".over" : ""),
    h("div.txt",
      h("span", t("shots.budget", { n: p.shots.length, must: nMust, est: fmtDuration(sch.mustMin + sch.optMin), avail: fmtDuration(avail) }),
        sch.overMin > 0 ? h("b", { style: { color: "var(--y)", marginLeft: "8px" } }, t("shots.over", { m: sch.overMin, n: sch.cuttable.length })) : null),
      h("button.todo" + (errCount ? "" : ".none"), { onclick: e => { if (!errCount) return; menu(e.currentTarget, all.filter(c => c.level !== "info").map((c, i) => ({ value: i, label: (c.level === "error" ? "● " : "▲ ") + checkText(p, c) })),
        { onPick: i => { const c = all.filter(x => x.level !== "info")[i]; if (c.page === "shots") focusShot(c.id); else ctx.go(c.page); } }); } },
        errCount ? "⚠ " + t("shots.todo", { n: errCount }) : "✓ " + t("chk.none"))),
    h("div.bar", { title: t("shots.budgetHelp") },
      h("i.must", { style: { left: 0, width: (100 * sch.mustMin / scale) + "%" } }),
      h("i.opt", { style: { left: (100 * sch.mustMin / scale) + "%", width: (100 * sch.optMin / scale) + "%" } }),
      h("b", { style: { left: (100 * avail / scale) + "%" }, title: t("shots.availLine") })));

  // ---------- 表格 ----------
  const showCol = c => cols.includes(c);
  const cell = (val, own) => h("span." + (own ? "own" : "inh"), val);
  const shotRow = s => {
    const r = M.resolveShot(p, s);
    const iss = issues.get(s.id) || [];
    const lvl = iss.some(c => c.level === "error") ? "err" : iss.some(c => c.level === "warn") ? "warn" : "";
    const pose = poseById(s.poseId);
    const modelTxt = r.personIds.map(id => personName(p, id)).join("、") + (r.lookIds.length ? " · " + r.lookIds.map(id => (M.lookById(p, id) || {}).name || "?").join("、") : "");
    const lookBad = iss.some(c => c.code === "lookMismatch");
    const tr = h("tr.shot" + (st.sel.has(s.id) ? ".sel" : "") + (st.focus === s.id ? ".focus" : "") + (lvl ? "." + lvl : "") + (s.priority === "opt" ? ".opt" : ""),
      { "data-id": s.id, draggable: ro ? null : "true", tabindex: -1,
        onclick: e => {
          if (e.target.closest("button,input,select")) return;
          if (e.metaKey || e.ctrlKey) { st.sel.has(s.id) ? st.sel.delete(s.id) : st.sel.add(s.id); if (st.focus && !st.sel.size) st.sel.add(st.focus); st.sel.add(s.id); }
          else if (e.shiftKey && st.focus) {
            const ord = M.orderedShots(p).map(x => x.id); const a = ord.indexOf(st.focus), b = ord.indexOf(s.id);
            ord.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(id => st.sel.add(id));
          } else st.sel = new Set();
          st.focus = s.id; ctx.rerender();
        },
        ondragstart: e => { e.dataTransfer.setData("text/x-shot", s.id); e.dataTransfer.effectAllowed = "move"; },
        ondragover: e => { if (e.dataTransfer.types.includes("text/x-shot")) e.preventDefault(); },
        ondrop: e => { const id = e.dataTransfer.getData("text/x-shot"); if (!id || id === s.id) return; e.preventDefault(); commit(x => {
          const moving = x.shots.find(y => y.id === id), target = x.shots.find(y => y.id === s.id);
          const old = moving.sceneId; moving.sceneId = target.sceneId;
          const list = M.shotsOfScene(x, target.sceneId).filter(y => y.id !== id);
          list.splice(list.indexOf(target), 0, moving); list.forEach((y, i) => { y.order = i; }); if (old !== target.sceneId) M.renumber(x, old);
        }); } },
      h("td.nowrap", h("b", nos.get(s.id)), s.lockedNo ? h("span.small.mut", " 🔒") : null),
      h("td", (s.refs || []).length ? h("span.thumb", { style: { backgroundImage: `url(${fileUrl(s.refs[0])})` }, title: t("shots.refsN", { n: s.refs.length }) }) : h("span.thumb.none", "+")),
      h("td.nowrap", h("button.ghost.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget, SIZES.map(k => ({ value: k, label: t("size." + k) })), { selected: [s.size], onPick: v => setOnShots([s.id], { size: v }) }) },
        s.size ? t("size." + s.size) : h("span.mut", "—")), s.focal ? h("span.small.mut", ` ${s.focal}mm`) : null),
      h("td", { style: { maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: lookBad ? "var(--y)" : null } },
        modelTxt ? cell(modelTxt, r.own.personIds || r.own.lookIds) : h("span", { style: { color: "var(--r)" } }, t("shots.noModel"))),
      h("td", h("button.ghost.sm", { disabled: ro || null, onclick: () => posePicker(s.id) }, pose ? pose.name : h("span.mut", s.cue ? s.cue.slice(0, 12) : t("shots.pickPose")))),
      h("td.num", h("input", { type: "number", min: 0, step: 5, value: s.minutes, disabled: ro || null, style: { width: "56px", border: "1px solid transparent", background: "transparent", padding: "2px 4px", textAlign: "right" },
        onchange: e => setOnShots([s.id], { minutes: Number(e.target.value) || 0 }) })),
      h("td", h("button.ghost.sm", { disabled: ro || null, onclick: () => setOnShots([s.id], { priority: s.priority === "opt" ? "must" : "opt" }), title: t("shots.togglePri") }, t("pri." + (s.priority || "must")))),
      h("td", iss.length ? h("span.issue." + (lvl || "warn"), { title: iss.map(c => checkText(p, c)).join("\n") }, lvl === "err" ? "●" : "▲") : ""),
      showCol("props") ? h("td.small", (s.props || []).map(id => (p.props.find(x => x.id === id) || {}).name).filter(Boolean).join("、")) : null,
      showCol("camera") ? h("td.small", cell(cameraName(p, r.setupId, r.cameraId), r.own.cameraId)) : null,
      showCol("setup") ? h("td.small", cell(setupName(p, r.setupId), r.own.setupId)) : null,
      showCol("notes") ? h("td.small", { style: { maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.notes || "") : null);
    return tr;
  };
  const ncols = 8 + OPT_COLS.filter(showCol).length;
  const sceneRow = sc => {
    const list = M.shotsOfScene(p, sc.id);
    const mins = list.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
    const collapsed = st.collapsed[sc.id];
    const name = st.renaming === sc.id
      ? h("input", { type: "text", value: sc.name, placeholder: t("shots.sceneNamePh"), style: { width: "160px" }, autofocus: true,
        onkeydown: e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { st.renaming = null; ctx.rerender(); } },
        onblur: e => { st.renaming = null; commit(x => { M.sceneById(x, sc.id).name = e.target.value.trim(); }); } })
      : h("span.sname", { ondblclick: () => { if (!ro) { st.renaming = sc.id; ctx.rerender(); } }, title: t("shots.renameTip") }, sceneName(p, sc));
    const defChip = (label, onClick, title) => h("button.ghost.sm", { disabled: ro || null, onclick: onClick, title }, label);
    const setScene = patch => commit(x => Object.assign(M.sceneById(x, sc.id), patch));
    return h("tr.scene", { ondragover: e => { if (e.dataTransfer.types.includes("text/x-shot")) e.preventDefault(); },
      ondrop: e => { const id = e.dataTransfer.getData("text/x-shot"); if (id) { e.preventDefault(); commit(x => M.moveShotToScene(x, id, sc.id)); } } },
      h("td", { colspan: ncols },
        h("div.row.wrap",
          h("button.ghost.sm", { "aria-expanded": collapsed ? "false" : "true", onclick: () => { st.collapsed[sc.id] = !collapsed; ctx.rerender(); } }, collapsed ? "▸" : "▾"),
          name,
          h("span.defs.row.wrap", { style: { gap: "2px" } },
            defChip(sc.setupId ? setupName(p, sc.setupId) : h("span", { style: { color: "var(--r)" } }, t("shots.pickSetup")),
              e => menu(e.currentTarget, setupItems(), { selected: [sc.setupId], onPick: v => setScene({ setupId: v, cameraId: M.cameras(p, v)[0]?.id || "" }) }), t("shots.defSetup")),
            "·",
            defChip(sc.cameraId ? cameraName(p, sc.setupId, sc.cameraId) : h("span.mut", t("shots.pickCamera")),
              e => menu(e.currentTarget, cameraItems(sc.setupId), { selected: [sc.cameraId], onPick: v => setScene({ cameraId: v }) }), t("shots.defCamera")),
            "·",
            defChip(sc.personIds.length ? sc.personIds.map(id => personName(p, id)).join("、") : h("span", { style: { color: "var(--r)" } }, t("shots.pickModel")),
              e => menu(e.currentTarget, modelItems(), { multi: true, selected: sc.personIds, onPick: v => setScene({ personIds: v, lookIds: sc.lookIds.filter(l => v.includes((M.lookById(p, l) || {}).personId)) }) }), t("shots.defModel")),
            defChip(sc.lookIds.length ? sc.lookIds.map(id => (M.lookById(p, id) || {}).name || "?").join("、") : h("span.mut", t("shots.pickLook")),
              e => menu(e.currentTarget, lookItems(sc.personIds), { multi: true, selected: sc.lookIds, onPick: v => setScene({ lookIds: v }) }), t("shots.defLook"))),
          h("span.spacer"),
          h("span.small.mut", t("shots.sceneSum", { n: list.length, m: mins })),
          h("button.ghost.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget, [
            { value: "rename", label: t("shots.renameScene") }, { value: "up", label: t("shots.sceneUp") }, { value: "down", label: t("shots.sceneDown") },
            { value: "del", label: t("shots.delScene") }], { onPick: async v => {
            if (v === "rename") { st.renaming = sc.id; ctx.rerender(); }
            if (v === "up" || v === "down") commit(x => { const i = x.scenes.findIndex(z => z.id === sc.id), j = i + (v === "up" ? -1 : 1); if (j >= 0 && j < x.scenes.length) [x.scenes[i], x.scenes[j]] = [x.scenes[j], x.scenes[i]]; });
            if (v === "del") {
              if (!await confirmDlg(t("shots.delScene"), list.length ? t("shots.delSceneBody", { n: list.length }) : "", { danger: true, ok: t("common.delete") })) return;
              commit(x => { x.scenes = x.scenes.filter(z => z.id !== sc.id); x.shots = x.shots.filter(z => z.sceneId !== sc.id); });
            }
          } }) }, "⋯"))));
  };

  let body;
  if (!p.scenes.length) {
    body = emptyState(t("shots.emptyTitle"), p.layout.setups.some(s => s.elements.length) ? t("shots.emptyFromSetups") : t("shots.emptyBody"),
      p.layout.setups.some(s => s.elements.length) ? h("button", { disabled: ro || null, onclick: () => commit(x => { for (const s of x.layout.setups) { const sc = M.newScene(x, ""); sc.setupId = s.id; sc.cameraId = (s.elements.find(e => e.kind === "camera") || {}).id || ""; sc.personIds = M.models(x).slice(0, 1).map(m => m.id); } }) }, t("shots.fromSetups")) : null,
      h("button.primary", { disabled: ro || null, onclick: addScene }, "＋ " + t("shots.newScene")));
  } else if (st.view === "table") {
    const rows = [];
    for (const sc of p.scenes) {
      const list = M.shotsOfScene(p, sc.id).filter(pass);
      if (filtering && !list.length && f.scene !== sc.id) continue;
      rows.push(sceneRow(sc));
      if (st.collapsed[sc.id]) continue;
      rows.push(...list.map(shotRow));
      if (!filtering) rows.push(h("tr.addrow", h("td", { colspan: ncols }, h("button.ghost", { disabled: ro || null, onclick: () => addShot(sc.id) }, "＋ " + t("shots.addInScene")))));
    }
    body = h("table.shots",
      h("thead", h("tr", ["no", "ref", "size", "model", "pose", "min", "pri", "check"].map(c => h("th", t("col." + c))), OPT_COLS.filter(showCol).map(c => h("th", t("col." + c))))),
      h("tbody", rows));
  } else {
    body = h("div", p.scenes.map(sc => {
      const list = M.shotsOfScene(p, sc.id).filter(pass);
      if (filtering && !list.length) return null;
      return h("div", h("div.scenehd", h("b", sceneName(p, sc)), h("span.small.mut", [setupName(p, sc.setupId), sc.personIds.map(id => personName(p, id)).join("、")].filter(Boolean).join(" · "))),
        h("div.shotcards", list.map(s => {
          const r = M.resolveShot(p, s); const iss = issues.get(s.id) || [];
          return h("div.shotcard" + (st.focus === s.id ? ".sel" : ""), { tabindex: 0, onclick: () => focusShot(s.id) },
            h("div.img", { style: (s.refs || []).length ? { backgroundImage: `url(${fileUrl(s.refs[0])})` } : {} }, (s.refs || []).length ? "" : t("shots.noRef")),
            h("div.bd", h("div.row", h("b", nos.get(s.id)), h("span", poseName(s.poseId) || ""), h("span.spacer"), iss.length ? h("span.issue." + (iss.some(c => c.level === "error") ? "err" : "warn"), "▲") : null),
              h("div.small.mut", [s.size && t("size." + s.size), s.focal && s.focal + "mm"].filter(Boolean).join(" · ") || "—"),
              h("div.chips", { style: { marginTop: "4px" } }, r.personIds.map(id => h("span.chip.plain", personName(p, id)))),
              h("div.small.mut", { style: { marginTop: "4px" } }, `${s.minutes || 0}′ · ${t("pri." + (s.priority || "must"))}`)));
        })));
    }));
  }

  // ---------- ⑥ 批量操作条 ----------
  const selIds = [...st.sel].filter(id => p.shots.some(s => s.id === id));
  const batch = selIds.length > 1 ? h("div.batchbar",
    h("b", t("shots.selected", { n: selIds.length })),
    h("button.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget, [{ value: "", label: t("shots.inherit") }, ...setupItems()], { onPick: v => setOnShots(selIds, { setupId: v || null, cameraId: null }) }) }, t("shots.bSetup")),
    h("button.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget, [{ value: "", label: t("shots.inherit") }, ...modelItems()], { onPick: v => setOnShots(selIds, v ? { personIds: [v], lookIds: null } : { personIds: null, lookIds: null }) }) }, t("shots.bModel")),
    h("button.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget, [{ value: "must", label: t("pri.must") }, { value: "opt", label: t("pri.opt") }], { onPick: v => setOnShots(selIds, { priority: v }) }) }, t("shots.bPri")),
    h("button.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget, p.scenes.map(sc => ({ value: sc.id, label: sceneName(p, sc) })), { onPick: v => commit(x => { for (const id of selIds) M.moveShotToScene(x, id, v); }) }) }, t("shots.bMove") + " ▾"),
    h("button.sm.danger", { disabled: ro || null, onclick: () => delShots(selIds) }, t("common.delete")),
    h("span.spacer"), h("button.sm.ghost", { onclick: () => { st.sel = new Set(); ctx.rerender(); } }, t("shots.clearSel"))) : null;

  // ---------- 详情抽屉 ----------
  const panel = st.focus ? drawer(ctx, p.shots.find(s => s.id === st.focus), { nos, issues, posePicker, dupShot, delShots, setupItems, cameraItems, modelItems, lookItems, propItems })
    : h("div", h("h4", t("panel.checks")), issuesList(p, all.filter(c => c.page === "shots"), ctx.go),
      h("h4", t("panel.tips")), h("p.small.mut", t("shots.tip")),
      h("h4", t("panel.keys")), h("div.small.mut", { style: { lineHeight: 1.9 } }, t("shots.keys")));

  // ---------- 动作选择器（⌘K） ----------
  async function posePicker(shotId) {
    if (ro) return toast(t("final.locked"));
    const shot = p.shots.find(s => s.id === shotId); if (!shot) return;
    const res = await modal(close => {
      const state = { q: "", tag: "" };
      const grid = h("div.poses");
      const tags = [...new Set(S.poses.flatMap(x => [...(x.dims?.mood || x.tags || []), ...(x.sizes || []).map(k => t("size." + k)), x.people ? t("ppl." + x.people) : null]).filter(Boolean))];
      const draw = () => {
        const qq = state.q.toLowerCase();
        let list = S.poses.filter(x => (!qq || [x.name, ...(x.dims?.mood || []), ...(x.tags || []), x.cues && Object.values(x.cues).join(" ")].join(" ").toLowerCase().includes(qq))
          && (!state.tag || [...(x.dims?.mood || []), ...(x.tags || []), ...(x.sizes || []).map(k => t("size." + k)), x.people ? t("ppl." + x.people) : ""].includes(state.tag)));
        list = M.rankPosesForShot(p, shot, list);
        grid.replaceChildren(...list.map(x => {
          const cover = M.poseCoverFile(x);
          return h("div.pose" + (x.id === shot.poseId ? ".on" : ""), { tabindex: 0, onclick: () => close(x.id), onkeydown: e => { if (e.key === "Enter") close(x.id); } },
            cover ? h("div.img", { style: { backgroundImage: `url(${libUrl(cover)})` } }) : h("div.img.ph", (x.name || "?").slice(0, 1)),
            h("div.bd", h("b", x.name), h("div.small.mut", M.poseMoodChips(x, 3).join(" · "))));
        }));
        if (!list.length) grid.append(h("p.mut", t("pose.noMatch")));
      };
      draw();
      return [h("h3", t("pose.pick")),
        h("div.row", h("input", { type: "search", placeholder: t("pose.search"), autofocus: true, oninput: e => { state.q = e.target.value; draw(); } }),
          h("button", { onclick: async () => { const n = await promptDlg(t("pose.newTitle"), { placeholder: t("pose.namePh") }); if (n && n.trim()) { const pose = M.normalizePose(M.blankPose(n.trim())); if (shot.size) pose.sizes = [shot.size]; S.poses.push(pose); saveLibrary("poses"); close(pose.id); } } }, "＋ " + t("pose.new")),
          shot.poseId ? h("button.ghost", { onclick: () => close("") }, t("pose.clear")) : null),
        tags.length ? h("div.chips", { style: { margin: "10px 0" } }, tags.map(tg => h("span.chip" + (state.tag === tg ? "" : ".plain"), { onclick: e => { state.tag = state.tag === tg ? "" : tg; e.currentTarget.parentElement.querySelectorAll(".chip").forEach(c => c.classList.toggle("plain", c.textContent !== state.tag)); draw(); } }, tg))) : h("div", { style: { height: "10px" } }),
        grid, h("div.acts", h("button", { onclick: () => close(undefined) }, t("common.cancel")))];
    }, { wide: true });
    if (res === undefined) return;
    setOnShots([shotId], { poseId: res });
  }

  // ---------- 快捷键 ----------
  const onKey = e => {
    if (isTyping(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    const ord = M.orderedShots(p).filter(pass).map(s => s.id);
    if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); e.shiftKey ? addScene() : addShot(null, st.focus); }
    else if (mod && e.key.toLowerCase() === "d" && st.focus) { e.preventDefault(); dupShot(st.focus); }
    else if (mod && e.key.toLowerCase() === "k" && st.focus) { e.preventDefault(); posePicker(st.focus); }
    else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && st.focus) { e.preventDefault(); commit(x => M.moveShot(x, st.focus, e.key === "ArrowUp" ? -1 : 1), { group: "mv" + st.focus }); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); const i = ord.indexOf(st.focus); const j = i < 0 ? 0 : Math.max(0, Math.min(ord.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      if (ord[j]) { st.focus = ord[j]; st.sel = new Set(); ctx.rerender(); document.querySelector(`tr.shot[data-id="${ord[j]}"]`)?.scrollIntoView({ block: "nearest" }); }
    } else if (e.key === "Enter" && st.focus) { e.preventDefault(); ctx.ui.panelOpen = true; document.querySelector(".body")?.classList.add("panel-open"); document.querySelector("aside.panel input,aside.panel button")?.focus(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && (st.focus || selIds.length)) { e.preventDefault(); delShots(selIds.length > 1 ? selIds : [st.focus]); }
    else if (e.key === "Escape") { st.sel = new Set(); st.focus = null; ctx.rerender(); }
  };

  const main = h("div", h("div.row", h("h2.pt", { style: { margin: 0 } }, t("step.shots")), h("span.spacer"), h("button.sm", { disabled: true, title: t("common.deferred") }, "✦ " + t("shots.ai"))),
    h("div", { style: { height: "10px" } }), toolbar, p.shots.length || p.scenes.length ? budget : null, body, batch);
  const mounted = () => {
    if (st.focus) document.querySelector(`tr.shot[data-id="${st.focus}"]`)?.scrollIntoView({ block: "nearest" });
    const ren = document.querySelector("tr.scene input[autofocus]"); if (ren) { ren.focus(); ren.select(); }
  };
  return { main, panel, onKey, mounted };
}

// ---------- 详情抽屉 ----------
function drawer(ctx, s, k) {
  const p = S.project, st = ctx.state, ro = readonly();
  const r = M.resolveShot(p, s);
  const sc = M.sceneById(p, s.sceneId);
  const nos = k.nos;
  const ord = M.orderedShots(p).map(x => x.id);
  const i = ord.indexOf(s.id);
  st.refIdx = Math.min(st.refIdx || 0, Math.max(0, (s.refs || []).length - 1));
  const upd = patch => commit(x => Object.assign(x.shots.find(y => y.id === s.id), patch));
  const inherited = f => !r.own[f];
  const resetBtn = f => r.own[f] && !ro ? h("button.sm.ghost", { title: t("shots.reset"), onclick: () => upd({ [f]: f.endsWith("Ids") ? undefined : "" }) }, "↺") : null;
  // 引用字段：灰色虚线 = 继承自场景，实线 = 本镜改写
  const refChips = (f, labels, items, multi) => h("div.row", { style: { gap: "4px" } },
    h("div.chips", labels.length ? labels.map(l => chip(l, { inherit: inherited(f), onClick: e => menu(e.currentTarget, items(), { multi, selected: multi ? r[f] : [r[f]], onPick: v => upd({ [f]: v }) }) }))
      : h("span.chip.add", { onclick: e => menu(e.currentTarget, items(), { multi, selected: multi ? r[f] : [r[f]], onPick: v => upd({ [f]: v }) }) }, "＋")),
    resetBtn(f));

  const refs = s.refs || [];
  const ref = refs[st.refIdx];
  const refBox = h("div.refstrip", ref ? h("img", { src: fileUrl(ref), alt: "" }) : t("shots.noRefLong"),
    h("div.nav",
      refs.length > 1 ? h("button.sm", { onclick: () => { st.refIdx = (st.refIdx - 1 + refs.length) % refs.length; ctx.rerender(); } }, "‹") : null,
      refs.length > 1 ? h("button.sm", { onclick: () => { st.refIdx = (st.refIdx + 1) % refs.length; ctx.rerender(); } }, "›") : null));
  const refActs = h("div.row.wrap", { style: { marginTop: "6px" } },
    h("span.small.mut", refs.length ? `${st.refIdx + 1} / ${refs.length}` : ""), h("span.spacer"),
    h("button.sm", { disabled: ro || null, onclick: async () => {
      const pose = poseById(s.poseId);
      const cues = pose ? [pose.cues?.weight, pose.cues?.hands, pose.cues?.gaze].filter(Boolean).join("；") : "";
      const items = await openRefPicker({
        allowMood: true, multiple: true,
        size: s.size ? t("size." + s.size) : "",
        poseName: pose?.name || "", poseCues: cues,
      });
      if (!items?.length) return;
      // 镜头 refs 仍存文件名（兼容旧项目）；来源写在同源情绪板项上（搜索/AI 时同步落一条）
      const files = [];
      commit(q => {
        const shot = q.shots.find(x => x.id === s.id);
        for (const it of items) {
          files.push(it.file);
          if (it.source && it.source !== "own" && it.source !== "upload" && it.source !== "paste") {
            if (!q.mood.some(m => m.file === it.file)) {
              q.mood.push({
                id: M.uid(), file: it.file, note: "", tags: [],
                source: it.source, url: it.url || "",
                x: 4 + Math.random() * 60, y: 4 + Math.random() * 50,
              });
            }
          }
        }
        shot.refs = [...new Set([...(shot.refs || []), ...files])];
      });
    } }, t("ref.add")),
    ref && !ro ? h("button.sm.ghost", { title: t("common.remove"), onclick: () => upd({ refs: refs.filter(x => x !== ref) }) }, "×") : null);

  // ⑤ 机位与布光缩略图：只高亮本镜机位和用到的灯
  const setup = M.setupById(p, r.setupId);
  const thumb = setup ? h("div.layout-thumb", { title: t("shots.openLayout"), style: { cursor: "pointer" }, onclick: () => ctx.go("layout", { setup: setup.id, selected: r.cameraId || null }) },
    (() => { const svg = renderLayout(p, setup.id, { highlight: { cameraId: r.cameraId, lightIds: new Set(setup.elements.filter(e => e.kind === "light").map(e => e.id)) }, grid: false, rulers: false, pad: 0.3, labels: true, underlayUrl: fileUrl }); return svg; })(),
    h("span.small", { style: { position: "absolute", left: "8px", bottom: "4px", color: "var(--mut)" } }, [setupName(p, r.setupId), cameraName(p, r.setupId, r.cameraId)].filter(Boolean).join(" · ")),
    h("span", { style: { position: "absolute", right: "8px", top: "4px", color: "var(--focus)" } }, "↗"))
    : h("p.small", { style: { color: "var(--r)" } }, t("shots.noSetup"));

  const iss = k.issues.get(s.id) || [];
  return h("div",
    h("h4", { style: { marginTop: 0, fontSize: "14px", color: "var(--fg)" } }, h("span", nos.get(s.id) + (poseName(s.poseId) ? " · " + poseName(s.poseId) : "")),
      h("span", h("button.sm.ghost", { disabled: i <= 0 || null, onclick: () => { st.focus = ord[i - 1]; ctx.rerender(); }, title: "↑" }, "‹"),
        h("button.sm.ghost", { disabled: i >= ord.length - 1 || null, onclick: () => { st.focus = ord[i + 1]; ctx.rerender(); }, title: "↓" }, "›"))),
    refBox, refActs,
    h("h4", t("shots.camLight"), h("span.small", Object.values({ a: r.own.setupId, b: r.own.cameraId }).some(Boolean) ? t("shots.ownValue") : t("shots.inheritFrom", { scene: sc ? sceneName(p, sc) : "" }))),
    thumb,
    h("div.dl", { style: { marginTop: "10px" } },
      h("label", t("layout.setup")), refChips("setupId", r.setupId ? [setupName(p, r.setupId)] : [], k.setupItems, false),
      h("label", t("el.camera")), refChips("cameraId", r.cameraId ? [cameraName(p, r.setupId, r.cameraId)] : [], () => k.cameraItems(r.setupId), false)),
    h("h4", t("shots.what")),
    h("div.dl",
      h("label", t("col.size")), h("div.row", sel(SIZES.map(z => [z, t("size." + z)]), s.size, v => upd({ size: v })),
        h("input", { type: "number", min: 8, max: 800, placeholder: "mm", value: s.focal || "", disabled: ro || null, style: { width: "80px" }, onchange: e => upd({ focal: e.target.value ? Number(e.target.value) : "" }) })),
      h("label", t("col.pose")), h("div.row", h("div.chips", s.poseId ? chip(poseName(s.poseId), { onClick: () => k.posePicker(s.id), title: "⌘K" }) : h("span.chip.add", { onclick: () => k.posePicker(s.id) }, "＋ ⌘K"))),
      h("label", t("shots.cue")), inp(() => s.cue, (x, v) => { x.shots.find(y => y.id === s.id).cue = v; }, { placeholder: poseCue(s.poseId) || t("shots.cuePh") })),
    h("h4", t("shots.who")),
    h("div.dl",
      h("label", t("shots.model")), refChips("personIds", r.personIds.map(id => personName(p, id)), k.modelItems, true),
      h("label", t("shots.look")), refChips("lookIds", r.lookIds.map(id => lookName(p, id)), () => k.lookItems(r.personIds), true),
      h("label", t("col.props")), h("div.chips", (s.props || []).map(id => chip((p.props.find(x => x.id === id) || {}).name || t("common.missing"), { broken: !p.props.some(x => x.id === id), onRemove: () => upd({ props: s.props.filter(x => x !== id) }) })),
        ro ? null : h("span.chip.add", { onclick: e => menu(e.currentTarget, k.propItems(), { multi: true, selected: s.props || [], onPick: v => upd({ props: v }), onAdd: () => ctx.go("site", { tab: "props" }), addLabel: t("gear.addProp") }) }, "＋"))),
    h("h4", t("shots.when")),
    h("div.dl",
      h("label", t("col.min")), inp(() => s.minutes, (x, v) => { x.shots.find(y => y.id === s.id).minutes = Number(v) || 0; }, { type: "number", min: 0, step: 5 }),
      h("label", t("col.pri")), seg([["must", t("pri.must")], ["opt", t("pri.opt")]], s.priority || "must", v => upd({ priority: v })),
      h("label", t("shots.lockNo")), inp(() => s.lockedNo, (x, v) => { x.shots.find(y => y.id === s.id).lockedNo = v; }, { placeholder: nos.get(s.id) })),
    fld(t("col.notes"), area(() => s.notes, (x, v) => { x.shots.find(y => y.id === s.id).notes = v; }, { rows: 2 })),
    iss.length ? [h("h4", t("panel.checks")), h("ul.issues-list", iss.map(c => h("li", h("span." + c.level, c.level === "error" ? "●" : "▲"), h("span", checkText(p, c)))))] : null,
    h("div.row", { style: { marginTop: "14px" } },
      h("button.sm", { disabled: ro || null, onclick: () => k.dupShot(s.id), title: "⌘D" }, t("common.duplicate")),
      h("button.sm.danger", { disabled: ro || null, onclick: () => k.delShots([s.id]) }, t("common.delete"))));
}

function poseCue(id) {
  const x = poseById(id);
  return x && x.cues ? [x.cues.weight, x.cues.hands, x.cues.gaze].filter(Boolean).join("；") : "";
}
