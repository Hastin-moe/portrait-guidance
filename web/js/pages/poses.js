// S4 动作库：列表 + T17 二级编辑层（完整标签体系留给 T21）
import { h, pickFiles, confirmDlg, promptDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, libUrl, uploadImages, saveLibrary, commit } from "../store.js";
import * as M from "../model.js";
import { tagsInput, fld, emptyState } from "./common.js";
import { SIZES } from "./shots.js";
import { editShell, editForm } from "../editlayer.js";

const PEOPLE = ["1", "2", "group"];

export function render(ctx) {
  const st = ctx.state, p = S.project;
  if (ctx.edit?.kind === "pose") return renderPoseEdit(ctx, ctx.edit.id);

  const q = (st.q || "").toLowerCase();
  const allTags = [...new Set(S.poses.flatMap(x => x.tags || []))];
  const list = S.poses.filter(x => (!q || [x.name, ...(x.tags || [])].join(" ").toLowerCase().includes(q))
    && (!st.tag || (x.tags || []).includes(st.tag)) && (!st.size || (x.sizes || []).includes(st.size)) && (!st.people || x.people === st.people));
  const save = () => { saveLibrary("poses"); ctx.rerender(); };
  const add = async () => {
    const n = await promptDlg(t("pose.newTitle"), { placeholder: t("pose.namePh") });
    if (!n || !n.trim()) return;
    const id = M.uid();
    S.poses.unshift({ id, name: n.trim(), image: "", cues: { weight: "", hands: "", gaze: "" }, sizes: [], people: "1", tags: [] });
    saveLibrary("poses");
    ctx.openEdit("pose", id);
  };
  const openPose = id => ctx.openEdit("pose", id);
  const filterRow = h("div.toolbar",
    h("input", { type: "search", placeholder: t("pose.search"), value: st.q || "", oninput: e => { st.q = e.target.value; ctx.rerender(); requestAnimationFrame(() => { const i = document.querySelector(".toolbar input[type=search]"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); } }),
    h("select", { style: { width: "auto" }, onchange: e => { st.size = e.target.value; ctx.rerender(); } }, h("option", { value: "" }, t("pose.allSizes")), SIZES.map(k => h("option", { value: k, selected: st.size === k || null }, t("size." + k)))),
    h("select", { style: { width: "auto" }, onchange: e => { st.people = e.target.value; ctx.rerender(); } }, h("option", { value: "" }, t("pose.allPeople")), PEOPLE.map(k => h("option", { value: k, selected: st.people === k || null }, t("ppl." + k)))),
    allTags.length ? h("div.chips", allTags.map(tg => h("span.chip" + (st.tag === tg ? "" : ".plain"), { onclick: () => { st.tag = st.tag === tg ? "" : tg; ctx.rerender(); } }, tg))) : null,
    h("span.spacer"), h("button.primary", { onclick: add }, "＋ " + t("pose.new")));
  const grid = !S.poses.length ? emptyState(t("pose.emptyTitle"), t("pose.emptyBody"), h("button.primary", { onclick: add }, "＋ " + t("pose.new")))
    : !list.length ? h("p.mut", t("pose.noMatch"))
      : h("div.poses", list.map(x => h("div.pose", {
        tabindex: 0,
        onclick: () => openPose(x.id),
        onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); openPose(x.id); } },
      },
        h("div.img", { style: x.image ? { backgroundImage: `url(${libUrl(x.image)})` } : {} }, x.image ? "" : "◎"),
        h("div.bd", h("b", x.name), h("div.small.mut", [(x.sizes || []).map(k => t("size." + k)).join("/"), x.people ? t("ppl." + x.people) : ""].filter(Boolean).join(" · "))))));

  const panel = h("div", h("h4", t("panel.tips")), h("p.small.mut", t("pose.tip")), h("p.small.mut", t("pose.count", { n: S.poses.length })));
  return { main: h("div", h("h2.pt", t("step.poses")), h("p.sub", t("pose.sub")), filterRow, grid), panel };
}

function renderPoseEdit(ctx, id) {
  const p = S.project;
  const x = S.poses.find(y => y.id === id);
  if (!x) { ctx.closeEdit(); return render(ctx); }
  const idx = S.poses.findIndex(y => y.id === id);
  x.cues = x.cues || {};
  const save = () => { saveLibrary("poses"); ctx.rerender(); };
  const txt = (get, set, ph) => h("input", { type: "text", value: get() || "", placeholder: ph, oninput: e => { set(e.target.value); saveLibrary("poses"); }, onchange: () => ctx.rerender() });
  const nos = p ? M.shotNumbers(p) : new Map();
  const used = p ? p.shots.filter(s => s.poseId === x.id) : [];

  const body = editForm([
    h("div.refstrip", { style: { aspectRatio: "1", maxWidth: "280px" } }, x.image ? h("img", { src: libUrl(x.image), alt: "" }) : "◎"),
    h("div.row", { style: { marginTop: "6px" } }, h("button.sm", { onclick: async () => { const fs = await pickFiles({ multiple: false }); if (!fs.length) return; const [f] = await uploadImages(fs, true); x.image = f; save(); } }, t("pose.setImage")),
      x.image ? h("button.sm.ghost", { onclick: () => { x.image = ""; save(); } }, t("common.remove")) : null),
    fld(t("pose.name"), txt(() => x.name, v => { x.name = v; })),
    h("h4", t("pose.cues")),
    fld(t("pose.weight"), txt(() => x.cues.weight, v => { x.cues.weight = v; }, t("pose.weightPh"))),
    fld(t("pose.hands"), txt(() => x.cues.hands, v => { x.cues.hands = v; }, t("pose.handsPh"))),
    fld(t("pose.gaze"), txt(() => x.cues.gaze, v => { x.cues.gaze = v; }, t("pose.gazePh"))),
    h("h4", t("pose.fits")),
    h("div.chips", SIZES.map(k => h("span.chip" + ((x.sizes || []).includes(k) ? "" : ".plain"), { onclick: () => { x.sizes = (x.sizes || []).includes(k) ? x.sizes.filter(z => z !== k) : [...(x.sizes || []), k]; save(); } }, t("size." + k)))),
    h("div.chips", { style: { marginTop: "6px" } }, PEOPLE.map(k => h("span.chip" + (x.people === k ? "" : ".plain"), { onclick: () => { x.people = k; save(); } }, t("ppl." + k)))),
    fld(t("pose.tags"), tagsInput([...(x.tags || [])], v => { x.tags = v; save(); }, t("pose.tagsPh"))),
    p ? [h("h4", t("pose.usedHere")), used.length ? h("div.chips", used.map(s => h("span.chip", { onclick: () => ctx.go("shots", { focus: s.id }) }, nos.get(s.id)))) : h("p.small.mut", t("pose.notUsed"))] : null,
    h("div.row", { style: { marginTop: "14px" } },
      h("button.sm.danger", { onclick: async () => {
        const n = used.length;
        if (!await confirmDlg(t("common.deleteTitle"), n ? t("ref.affects", { n }) : t("pose.delBody"), { danger: true, ok: t("common.delete") })) return;
        S.poses = S.poses.filter(y => y.id !== x.id);
        if (n) commit(q2 => { for (const s of q2.shots) if (s.poseId === x.id) s.poseId = ""; }, { force: true });
        saveLibrary("poses");
        ctx.closeEdit();
      } }, t("common.delete"))),
  ]);

  const main = editShell({
    crumb: `${t("step.poses")} / ${x.name || "—"}`,
    onBack: () => ctx.closeEdit(),
    onPrev: idx > 0 ? () => ctx.openEdit("pose", S.poses[idx - 1].id) : null,
    onNext: idx >= 0 && idx < S.poses.length - 1 ? () => ctx.openEdit("pose", S.poses[idx + 1].id) : null,
    body,
  });

  const panel = h("div",
    h("h4", t("edit.summary")),
    h("p", h("b", x.name || "—")),
    h("p.small.mut", [(x.sizes || []).map(k => t("size." + k)).join("/"), x.people ? t("ppl." + x.people) : ""].filter(Boolean).join(" · ") || "—"),
    h("h4", t("pose.usedHere")),
    used.length ? h("div.chips", used.map(s => h("span.chip", nos.get(s.id)))) : h("p.small.mut", t("pose.notUsed")),
    h("h4", t("panel.tips")), h("p.small.mut", t("pose.tip")));

  return { main, panel };
}
