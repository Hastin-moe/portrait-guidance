// T17：通用二级编辑层外壳（顶栏返回 / 面包屑 / 上一位下一位 / 标签页 / 表单区）。
// 路由与打开关闭由 main.js 负责；本文件只负责结构和样式类名。
import { h } from "./ui.js";
import { t } from "./i18n.js";

/** 拼编辑层地址。模特 person 用短链 `#/p/id/models/<personId>`，其余用 kind/id。 */
export function editHash(projectId, step, edit) {
  if (!edit) return `#/p/${projectId}/${step}`;
  if (step === "models" && edit.kind === "person") return `#/p/${projectId}/models/${edit.id}`;
  if (step === "models" && edit.kind === "mood") return `#/p/${projectId}/models/mood/${edit.id}`;
  if (step === "poses" && (edit.kind === "pose" || !edit.kind)) return `#/p/${projectId}/poses/${edit.id}`;
  if ((step === "layout" || step === "ex") && edit.kind === "element") return `#/p/${projectId}/${step}/${edit.id}`;
  return `#/p/${projectId}/${step}/${edit.kind}/${edit.id}`;
}

/** 从 hash 剩余段解析编辑目标。 */
export function parseEdit(step, rest) {
  if (!rest.length) return null;
  if (step === "models") {
    if (rest[0] === "mood" && rest[1]) return { kind: "mood", id: rest[1] };
    if (rest[0] === "person" && rest[1]) return { kind: "person", id: rest[1] };
    return { kind: "person", id: rest[0] };
  }
  if (step === "poses") {
    if (rest[0] === "pose" && rest[1]) return { kind: "pose", id: rest[1] };
    return { kind: "pose", id: rest[0] };
  }
  if (step === "layout" || step === "ex") {
    if (rest[0] === "element" && rest[1]) return { kind: "element", id: rest[1] };
    return { kind: "element", id: rest[0] };
  }
  if (rest.length >= 2) return { kind: rest[0], id: rest[1] };
  return { kind: "item", id: rest[0] };
}

/**
 * @param {object} opts
 * @param {string|Node} opts.crumb  面包屑，例如「模特与样图 / 林夏」
 * @param {() => void} opts.onBack
 * @param {(() => void)|null} [opts.onPrev]
 * @param {(() => void)|null} [opts.onNext]
 * @param {{id:string,label:string}[]} [opts.tabs]
 * @param {string} [opts.tab]
 * @param {(id:string)=>void} [opts.onTab]
 * @param {Node|Node[]} opts.body
 */
export function editShell({ crumb, onBack, onPrev = null, onNext = null, tabs = null, tab = "", onTab = null, body }) {
  return h("div.edit-layer", { role: "region", "aria-label": t("edit.layer") },
    h("div.edit-bar",
      h("button.ghost.edit-back", { type: "button", onclick: onBack }, "‹ " + t("edit.back")),
      h("span.edit-crumb", crumb),
      h("span.spacer"),
      onPrev ? h("button.ghost.sm", { type: "button", onclick: onPrev, title: t("edit.prev") }, "‹ " + t("edit.prev")) : null,
      onNext ? h("button.ghost.sm", { type: "button", onclick: onNext, title: t("edit.next") }, t("edit.next") + " ›") : null),
    tabs && tabs.length ? h("div.edit-tabs", { role: "tablist" },
      tabs.map(tb => h("button.edit-tab" + (tb.id === tab ? ".on" : ""), {
        type: "button", role: "tab", "aria-selected": tb.id === tab ? "true" : "false",
        onclick: () => onTab && onTab(tb.id),
      }, tb.label))) : null,
    h("div.edit-body", body));
}

/** 双列表单区；窄窗口由 CSS 收成一列。 */
export function editForm(kids) {
  return h("div.edit-form", kids);
}

export function editPlaceholder(msg) {
  return h("p.mut.edit-ph", msg);
}
