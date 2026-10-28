// S0 项目列表：新建、从模板新建、复制、归档、搜索、按状态筛选（F01–F03）
import { h, menu, promptDlg, toast, confirmDlg } from "../ui.js";
import { t, fmtDate } from "../i18n.js";
import { api } from "../store.js";
import { emptyState } from "./common.js";

const st = { q: "", status: "all", archived: false, list: null, templates: [] };

async function load(ctx) {
  const [a, b] = await Promise.all([api("GET", "projects"), api("GET", "templates")]);
  st.list = a.data; st.templates = b.data;
  ctx.rerender();
}

async function create(ctx, body) {
  const name = await promptDlg(body && body.template ? t("proj.newFromTpl") : t("proj.new"), { placeholder: t("proj.namePh"), ok: t("common.create") });
  if (name == null) return;
  const { data } = await api("POST", "projects", { ...body, name: name.trim() });
  st.list = null;
  location.hash = `#/p/${data.id}/overview`;
}

export function render(ctx) {
  if (st.list == null) { load(ctx).catch(e => toast(e.message)); return { main: h("p.mut", t("common.loading")) }; }
  const q = st.q.trim().toLowerCase();
  const rows = st.list.filter(p => !!p.archived === st.archived && (st.status === "all" || p.status === st.status)
    && (!q || (p.name || "").toLowerCase().includes(q)));
  const tplBtn = h("button", { disabled: !st.templates.length || null, title: st.templates.length ? "" : t("proj.noTpl"),
    onclick: e => menu(e.currentTarget, st.templates.map(x => ({ value: x.id, label: x.name || t("proj.untitled") })), { onPick: id => create(ctx, { template: id }) }) }, t("proj.fromTpl"));
  const main = h("div",
    h("div.row.wrap", { style: { marginBottom: "14px" } },
      h("h2.pt", { style: { margin: 0 } }, t("proj.title")), h("span.spacer"),
      h("input", { type: "search", placeholder: t("proj.search"), value: st.q, style: { width: "200px" }, oninput: e => { st.q = e.target.value; ctx.rerender(); setTimeout(() => { const i = document.querySelector("input[type=search]"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); } }),
      h("select", { style: { width: "auto" }, onchange: e => { st.status = e.target.value; ctx.rerender(); } },
        ["all", "draft", "pending", "final"].map(v => h("option", { value: v, selected: v === st.status || null }, v === "all" ? t("proj.allStatus") : t("status." + v)))),
      h("button.ghost", { onclick: () => { st.archived = !st.archived; ctx.rerender(); } }, st.archived ? t("proj.showActive") : t("proj.showArchived")),
      tplBtn,
      h("button.primary", { onclick: () => create(ctx, {}) }, "＋ " + t("proj.new"))),
    !st.list.length ? emptyState(t("proj.emptyTitle"), t("proj.emptyBody"), h("button.primary", { onclick: () => create(ctx, {}) }, "＋ " + t("proj.new")))
      : !rows.length ? h("p.mut", t("proj.noMatch"))
        : h("div.plist", rows.map(p => projCard(ctx, p))));
  return { main };
}

function projCard(ctx, p) {
  const pct = (p.summary && p.summary.completeness) || 0;
  return h("div.proj", { tabindex: 0, onclick: () => { location.hash = `#/p/${p.id}/overview`; }, onkeydown: e => { if (e.key === "Enter") location.hash = `#/p/${p.id}/overview`; } },
    h("div.cover", { style: p.cover ? { backgroundImage: `url(/files/${p.id}/${encodeURIComponent(p.cover)})` } : {} }, p.cover ? "" : "◐"),
    h("div.info",
      h("div.nm", p.name || t("proj.untitled")),
      h("div.row.small.mut", h("span", p.date ? fmtDate(p.date) : t("proj.noDate")), h("span.spacer"), h("span.badge." + p.status, t("status." + p.status))),
      h("div.prog", { title: t("proj.completeness", { n: pct }) }, h("i", { style: { width: pct + "%" } })),
      h("div.small.mut", t("proj.completeness", { n: pct }))),
    h("div.acts",
      h("button.sm.ghost", { onclick: async e => { e.stopPropagation(); await api("POST", "projects", { from: p.id }); st.list = null; ctx.rerender(); toast(t("proj.duplicated")); } }, t("proj.duplicate")),
      h("button.sm.ghost", { onclick: async e => { e.stopPropagation();
        if (!p.archived && !await confirmDlg(t("proj.archiveTitle"), t("proj.archiveBody"))) return;
        await api("POST", `projects/${p.id}/archive`, { archived: !p.archived }); st.list = null; ctx.rerender(); } }, p.archived ? t("proj.unarchive") : t("proj.archive"))));
}

export function invalidate() { st.list = null; }
