// 各页面共用的表单件和显示件。
import { h, field, toast, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, readonly, refresh } from "../store.js";
import * as M from "../model.js";

export const GEAR_TYPES = ["light", "modifier", "absorb", "stand", "backdrop", "reflector", "camera", "lens", "trigger", "other"];

export function gearTable(rows, path, ctx, { showSource = false, usage = null } = {}) {
  const ro = readonly();
  const get = q => path === "venue" ? q.venue.gear : q.gear;
  const editKind = path === "venue" ? "vgear" : "ogear";
  return h("table.grid",
    h("tr", h("th", t("gear.type")), h("th", t("gear.model")), h("th", t("gear.size")), h("th", t("gear.qty")), showSource ? h("th", t("gear.source")) : null, usage ? h("th", t("gear.used")) : null, h("th", "")),
    rows.map(g => {
      const u = usage ? usage.get((path === "venue" ? "v:" : "o:") + g.id) || 0 : 0;
      const over = u > (Number(g.qty) || 0);
      const key = (path === "venue" ? "v:" : "o:") + g.id;
      return h("tr" + (over ? ".warn" : ""),
        h("td", sel(GEAR_TYPES.map(k => [k, t("gear.type." + k)]), g.type, v => commit(q => { get(q).find(x => x.id === g.id).type = v; }), { allowEmpty: false })),
        h("td", inp(() => g.model, (q, v) => { get(q).find(x => x.id === g.id).model = v; }, { placeholder: t("gear.modelPh") })),
        h("td", h("button.sm", {
          disabled: ro || null,
          title: g.presetId || t("gear.sizeEdit"),
          onclick: async e => {
            const { openSizeEditor } = await import("./site.js");
            openSizeEditor(e.currentTarget, path, g.id, ctx);
          },
        }, sizeText(g) || t("gear.sizeEdit"))),
        h("td.num", inp(() => g.qty, (q, v) => { get(q).find(x => x.id === g.id).qty = v; }, { type: "number", min: 0 })),
        showSource ? h("td", sel([["own", t("gear.src.own")], ["rent", t("gear.src.rent")]], g.source || "own", v => commit(q => { get(q).find(x => x.id === g.id).source = v; }), { allowEmpty: false })) : null,
        usage ? h("td", h("span.used" + (over ? ".over" : ""), `${u} / ${Number(g.qty) || 0}`)) : null,
        h("td", h("div.row", { style: { gap: "4px", justifyContent: "flex-end" } },
          h("button.sm", { title: t("gear.openEdit"), onclick: () => ctx.openEdit?.(editKind, g.id) }, t("gear.edit")),
          h("button.sm.ghost", { disabled: ro || null, title: t("common.delete"), onclick: async () => {
            const n = S.project.layout.setups.reduce((a, s) => a + s.elements.filter(e => e.ref === key || e.modifierRef === key).length, 0);
            if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affectsLayout", { n }), { danger: true, ok: t("common.delete") })) return;
            commit(q => {
              const arr = get(q); arr.splice(arr.findIndex(x => x.id === g.id), 1);
              for (const s of q.layout.setups) for (const e of s.elements) {
                if (e.ref === key) e.ref = "";
                if (e.modifierRef === key) e.modifierRef = "";
              }
            });
          } }, "×"))));
    }));
}

function sizeText(g) {
  if (g.shape === "circle" || Number(g.diameterCm) > 0) return Number(g.diameterCm) > 0 ? `ø${g.diameterCm} cm` : "";
  if (Number(g.widthCm) > 0 && Number(g.heightCm) > 0) return `${g.widthCm}×${g.heightCm} cm`;
  return "";
}

// 文本 / 数字输入：打字时 soft 提交（不重绘页面），离开输入框时整页刷新
export function inp(get, set, { type = "text", placeholder = "", group, min, max, step, list, cls = "" } = {}) {
  const g = group || ("in:" + Math.random());
  const el = h("input" + cls, { type, value: get() ?? "", placeholder, min, max, step, list, disabled: readonly() || null,
    oninput: e => commit(p => set(p, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value), { soft: true, group: g }),
    onchange: () => refresh() });
  return el;
}
export function area(get, set, { placeholder = "", rows = 3 } = {}) {
  const g = "ta:" + Math.random();
  return h("textarea", { rows, placeholder, disabled: readonly() || null,
    oninput: e => commit(p => set(p, e.target.value), { soft: true, group: g }), onchange: () => refresh() }, get() ?? "");
}
export function sel(options, value, onChange, { allowEmpty = true, emptyLabel = "—" } = {}) {
  return h("select", { disabled: readonly() || null, onchange: e => onChange(e.target.value) },
    allowEmpty ? h("option", { value: "" }, emptyLabel) : null,
    options.map(([v, l]) => h("option", { value: v, selected: String(v) === String(value) || null }, l)));
}
export const fld = field;

// 标签输入：回车或逗号加一个
export function tagsInput(tags, onChange, placeholder) {
  const box = h("div.chips", { style: { border: "1px solid var(--line)", borderRadius: "8px", padding: "4px 6px", background: "var(--panel)" } });
  const draw = () => {
    box.replaceChildren(
      ...tags.map((tg, i) => h("span.chip.plain", tg, readonly() ? null : h("button.x", { "aria-label": t("common.remove"), onclick: () => { tags.splice(i, 1); onChange([...tags]); } }, "×"))),
      readonly() ? null : h("input", { type: "text", placeholder, style: { border: 0, flex: 1, minWidth: "120px", padding: "3px" },
        onkeydown: e => {
          if ((e.key === "Enter" || e.key === "," || e.key === "，" || e.key === "、") && e.target.value.trim()) {
            e.preventDefault(); onChange([...tags, e.target.value.trim()]);
          } else if (e.key === "Backspace" && !e.target.value && tags.length) onChange(tags.slice(0, -1));
        } }));
  };
  draw();
  return box;
}

export function chip(label, { onClick, inherit = false, broken = false, onRemove, title } = {}) {
  return h("span.chip" + (inherit ? ".inherit" : "") + (broken ? ".broken" : ""), { title: title || label, onclick: onClick, tabindex: onClick ? 0 : null,
    onkeydown: onClick ? e => { if (e.key === "Enter") onClick(e); } : null },
    label, onRemove && !readonly() ? h("button.x", { "aria-label": t("common.remove"), onclick: e => { e.stopPropagation(); onRemove(); } }, "×") : null);
}

// ---------- 名称 ----------
export const personName = (p, id) => (M.personById(p, id) || {}).name || t("common.missing");
export const lookName = (p, id) => { const l = M.lookById(p, id); return l ? `${l.personName} · ${l.name}` : t("common.missing"); };
export const setupName = (p, id, lang) => { const s = M.setupById(p, id); return s ? `${t("layout.setup", null, lang)} ${s.name}` : (id ? t("common.missing", null, lang) : ""); };
export const cameraName = (p, setupId, camId, lang) => {
  const s = M.setupById(p, setupId);
  if (!s || !camId) return "";
  let n = 0;
  for (const e of s.elements) if (e.kind === "camera") { n++; if (e.id === camId) return `${t("el.camera", null, lang)} ${n}`; }
  return t("common.missing", null, lang);
};
export const poseById = id => S.poses.find(x => x.id === id);
export const poseName = id => { const x = poseById(id); return x ? x.name : (id ? t("common.missing") : ""); };
export const sceneName = (p, sc, lang) => `${t("shots.scene", null, lang)} ${String(p.scenes.indexOf(sc) + 1).padStart(2, "0")}${sc.name ? " · " + sc.name : ""}`;

// ---------- 检查结果 ----------
export function checkText(p, c, lang) {
  const nos = M.shotNumbers(p);
  const params = { ...c };
  if (c.page === "shots" && c.id) params.shot = nos.get(c.id) || "";
  if (c.code === "lockConflict") params.shot = nos.get(c.id) || "";
  if (c.code === "gearOver") { const g = M.gearByKey(p, c.id); params.gear = g ? g.model || t("gear.type." + g.type) : ""; params.setup = (M.setupById(p, c.setupId) || {}).name || ""; }
  if (c.code === "unbound" || c.code === "setupEmpty") params.setup = (M.setupById(p, c.setupId) || {}).name || c.setup || "";
  if (c.personId) params.name = (M.personById(p, c.personId) || {}).name || "";
  if (c.code === "paidOverWork" || c.code === "lookNotReady") params.shot = nos.get(c.id) || "";
  return t("chk." + c.code, params, lang);
}

export function issuesList(p, list, go) {
  if (!list.length) return h("p.mut.small", "✓ " + t("chk.none"));
  return h("ul.issues-list", list.map(c => h("li", { onclick: () => {
    if (c.page === "shots") go("shots", { focus: c.id });
    else if (c.page === "layout") go("layout", { setup: c.setupId, selected: c.id });
    else if (c.page === "models" && c.personId) go("models", { edit: { kind: "person", id: c.personId } });
    else if (c.page === "schedule" && c.id) go("schedule", { focus: c.id });
    else go(c.page);
  } },
    h("span." + c.level, c.level === "error" ? "●" : c.level === "warn" ? "▲" : "ℹ"), h("span", checkText(p, c)))));
}

export function needsDate(p) { return !p.time.date; }

export function emptyState(title, body, ...actions) {
  return h("div.empty", h("b", title), body ? h("div", body) : null, actions.length ? h("div.row", actions) : null);
}

export function warnReadonly() { if (readonly()) { toast(t("final.locked")); return true; } return false; }
