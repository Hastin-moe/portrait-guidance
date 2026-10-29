// 界面小工具：建元素、弹窗、菜单、提示。所有页面共用。
import { t } from "./i18n.js";

// h("div.card#id", {onclick, ...attrs}, ...children)
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || "div");
  for (const part of (m[2] || "").match(/[.#][\w-]+/g) || []) {
    if (part[0] === ".") el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className += " " + v;
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export function debounce(fn, ms) {
  let tm;
  const d = (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(tm); fn(...a); };
  return d;
}

// ---------- 提示 ----------
export function toast(msg, ms = 2600) {
  let box = document.querySelector(".toasts");
  if (!box) { box = h("div.toasts"); document.body.append(box); }
  const el = h("div.toast", msg);
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- 弹窗 ----------
export function modal(build, { wide = false } = {}) {
  return new Promise(resolve => {
    const close = v => { back.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(undefined); } };
    const dlg = h("div.dlg" + (wide ? ".wide" : ""), { role: "dialog", "aria-modal": "true" });
    const back = h("div.modal", { onmousedown: e => { if (e.target === back) close(undefined); } }, dlg);
    append(dlg, [build(close)]);
    document.body.append(back);
    document.addEventListener("keydown", onKey, true);
    setTimeout(() => (dlg.querySelector("[autofocus]") || dlg.querySelector("input,select,textarea,button.primary"))?.focus(), 0);
  });
}

export function confirmDlg(title, body, { ok = t("common.ok"), danger = false, list = null } = {}) {
  return modal(close => [
    h("h3", title), body ? h("p", body) : null,
    list && list.length ? h("ul", list.map(x => h("li", x))) : null,
    h("div.acts", h("button", { onclick: () => close(false) }, t("common.cancel")),
      h("button.primary" + (danger ? ".danger" : ""), { onclick: () => close(true) }, ok)),
  ]).then(v => !!v);
}

export function promptDlg(title, { value = "", placeholder = "", ok = t("common.ok"), help = "" } = {}) {
  return modal(close => {
    const inp = h("input", { type: "text", value, placeholder, autofocus: true, onkeydown: e => { if (e.key === "Enter") close(inp.value); } });
    return [h("h3", title), help ? h("p", help) : null, inp,
      h("div.acts", h("button", { onclick: () => close(null) }, t("common.cancel")), h("button.primary", { onclick: () => close(inp.value) }, ok))];
  }).then(v => (v == null ? null : v));
}

// ---------- 菜单（单选 / 多选，可搜索） ----------
export function menu(anchor, items, { multi = false, selected = [], search = false, onPick, onAdd = null, addLabel = "", anchorRect = null } = {}) {
  document.querySelectorAll(".menu").forEach(m => m.remove());
  const sel = new Set(selected);
  const box = h("div.menu", { role: "listbox" });
  let q = "";
  const render = () => {
    box.replaceChildren();
    if (search) {
      const inp = h("input", { type: "search", value: q, placeholder: t("common.search"), oninput: e => { q = e.target.value; render(); inp2focus(); } });
      box.append(inp);
    }
    for (const it of items) {
      if (it.header) { box.append(h("div.hd", it.header)); continue; }
      if (q && !String(it.label).toLowerCase().includes(q.toLowerCase())) continue;
      const on = sel.has(it.value);
      box.append(h("button" + (on ? ".on" : ""), { type: "button", disabled: it.disabled, title: it.title || null, onclick: () => {
        if (multi) { on ? sel.delete(it.value) : sel.add(it.value); onPick([...sel]); render(); }
        else { close(); onPick(it.value); }
      } }, multi ? (on ? "☑" : "☐") : (on ? "✓" : " "), it.label, it.hint ? h("span.mut.small", it.hint) : null));
    }
    if (onAdd) box.append(h("button", { type: "button", onclick: async () => { close(); onAdd(); } }, "＋", addLabel || t("common.add")));
    if (!items.length && !onAdd) box.append(h("div.hd", t("common.none")));
  };
  const inp2focus = () => { const i = box.querySelector("input"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
  const close = () => { box.remove(); document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", esc, true); };
  const outside = e => { if (!box.contains(e.target) && e.target !== anchor) close(); };
  const esc = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  render();
  document.body.append(box);
  // anchorRect：异步打开前先量好，避免 await 后节点被换掉导致定位到视口外
  const r = anchorRect || (anchor && anchor.isConnected ? anchor.getBoundingClientRect() : { left: 12, bottom: 48, top: 12, width: 0, height: 0 });
  const mh = Math.min(320, box.offsetHeight || 320);
  const top = Math.min(r.bottom + 4, Math.max(8, innerHeight - mh - 8));
  box.style.left = Math.max(8, Math.min(r.left, innerWidth - (box.offsetWidth || 180) - 8)) + "px";
  box.style.top = Math.max(8, top) + "px";
  setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", esc, true); inp2focus(); }, 0);
  return close;
}

// ---------- 表单小件 ----------
// 文本框：输入时只更新数据（不重绘页面，避免丢失光标），离开时再整体刷新
export function field(label, input, help) {
  return h("div.field", label ? h("label", label) : null, input, help ? h("div.help", help) : null);
}

export function seg(options, value, onChange) {
  return h("div.seg", { role: "radiogroup" }, options.map(([v, label]) =>
    h("button" + (v === value ? ".on" : ""), { type: "button", role: "radio", "aria-checked": v === value ? "true" : "false", onclick: () => onChange(v) }, label)));
}

// 读取用户选的图片（拖入或文件选择）
export function pickFiles({ multiple = true } = {}) {
  return new Promise(resolve => {
    const inp = h("input", { type: "file", accept: "image/*", multiple: multiple || null, style: { display: "none" },
      onchange: () => { resolve([...inp.files]); inp.remove(); } });
    document.body.append(inp);
    inp.click();
  });
}

export function dropZone(el, onFiles) {
  el.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); el.classList.add("over"); } });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); el.classList.remove("over");
    onFiles([...e.dataTransfer.files].filter(f => f.type.startsWith("image/")));
  });
  return el;
}

export function download(name, blob) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function isTyping(e) {
  const tg = e.target;
  return tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable);
}
