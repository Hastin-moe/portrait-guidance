// S0 项目列表：新建、从模板新建、复制、归档、搜索、按状态筛选、导入（F01–F03）
import { h, menu, promptDlg, toast, confirmDlg, modal } from "../ui.js";
import { t, fmtDate } from "../i18n.js";
import { api, openProject, S, uploadImages, loadLibraries, flush } from "../store.js";
import * as M from "../model.js";
import { emptyState } from "./common.js";
import { convertGrok } from "../import_grok.js";

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
  location.hash = `#/p/${data.id}/basics`;
}

function pickJsonFile() {
  return new Promise(resolve => {
    const inp = h("input", { type: "file", accept: "application/json,.json", style: { display: "none" },
      onchange: () => { resolve(inp.files[0] || null); inp.remove(); } });
    document.body.append(inp);
    inp.click();
  });
}

function dataUrlToFile(dataUrl, name = "image.png") {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: m[1] });
}

function showReport(report, then) {
  const sec = (title, items) => items && items.length
    ? [h("h4", title), h("ul.small", { style: { paddingLeft: "18px" } }, items.map(x => h("li", x)))]
    : null;
  modal(close => [
    h("h3", t("proj.importReport")),
    sec(t("proj.importOk"), report.ok),
    sec(t("proj.importSkip"), report.skip),
    sec(t("proj.importCheck"), report.check),
    h("div.acts", h("button.primary", { onclick: () => { close(); then && then(); } }, t("common.close"))),
  ], { wide: true });
}

async function doImport(ctx) {
  const file = await pickJsonFile();
  if (!file) return;
  let raw;
  try { raw = JSON.parse(await file.text()); }
  catch { return toast(t("proj.importBadJson")); }

  let project, poses = [], images = [], report;

  if (raw && raw.schema === "portrait-guidance.plan/v1") {
    ({ project, poses, images, report } = convertGrok(raw));
  } else if (raw && raw.schema === 1 && raw.layout) {
    project = M.normalize(raw);
    report = {
      ok: [t("proj.importNativeOk")],
      skip: [],
      check: [t("proj.importNoImages")],
    };
    // 本地备份不含图片文件
    if ((project.mood || []).length || (project.venue.photos || []).length) {
      report.check.push(t("proj.importImageMissing"));
    }
  } else {
    return toast(t("proj.importUnknown"));
  }

  try {
    const { data: created } = await api("POST", "projects", { data: project, name: project.name || file.name.replace(/\.json$/i, "") });
    await openProject(created.id);

    // 合并动作库（按名去重）
    if (poses.length) {
      await loadLibraries();
      let added = false;
      for (const pose of poses) {
        if (S.poses.some(x => x.name === pose.name)) continue;
        S.poses.push(pose);
        added = true;
      }
      if (added) await api("PUT", "library/poses", S.poses);
    }

    // 上传 dataURL 图片
    const venuePhotos = [];
    const mood = [];
    for (const img of images) {
      const f = dataUrlToFile(img.dataUrl, img.role + "-" + M.uid() + ".png");
      if (!f) { report.skip.push(t("proj.importBadImage")); continue; }
      const names = await uploadImages([f]);
      if (!names.length) continue;
      if (img.role === "venue") venuePhotos.push(names[0]);
      else mood.push({ id: M.uid(), file: names[0], note: img.note || "", tags: [], source: img.source || "", url: img.url || "", x: 10, y: 10 });
    }
    if (venuePhotos.length || mood.length) {
      const { commit } = await import("../store.js");
      commit(q => {
        if (venuePhotos.length) q.venue.photos.push(...venuePhotos);
        if (mood.length) q.mood.push(...mood);
      }, { force: true });
      report.ok.push(t("proj.importImagesDone", { n: venuePhotos.length + mood.length }));
    }

    // 先刷新背后的项目列表，再弹报告（T11-B8）
    st.list = null;
    await flush().catch(() => {});
    await load(ctx).catch(() => {});
    ctx.rerender();
    showReport(report, () => { location.hash = `#/p/${created.id}/basics`; });
  } catch (e) {
    toast(t("proj.importFail") + " " + (e.message || e));
  }
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
      h("button", { onclick: () => doImport(ctx) }, t("proj.import")),
      h("button.primary", { onclick: () => create(ctx, {}) }, "＋ " + t("proj.new"))),
    !st.list.length ? emptyState(t("proj.emptyTitle"), t("proj.emptyBody"), h("button.primary", { onclick: () => create(ctx, {}) }, "＋ " + t("proj.new")))
      : !rows.length ? h("p.mut", t("proj.noMatch"))
        : h("div.plist", rows.map(p => projCard(ctx, p))));
  return { main };
}

function projCard(ctx, p) {
  const pct = (p.summary && p.summary.completeness) || 0;
  return h("div.proj", { tabindex: 0, onclick: () => { location.hash = `#/p/${p.id}/basics`; }, onkeydown: e => { if (e.key === "Enter") location.hash = `#/p/${p.id}/basics`; } },
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
