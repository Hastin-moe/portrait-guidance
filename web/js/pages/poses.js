// S7 动作库（F26）：跨项目共用，条目含示意图、要点（重心、手位、视线）、适用景别、人数、标签
import { h, pickFiles, confirmDlg, promptDlg, toast } from "../ui.js";
import { t } from "../i18n.js";
import { S, libUrl, uploadImages, saveLibrary, commit } from "../store.js";
import * as M from "../model.js";
import { tagsInput, fld, emptyState } from "./common.js";
import { SIZES } from "./shots.js";

const PEOPLE = ["1", "2", "group"];

export function render(ctx) {
  const st = ctx.state, p = S.project;
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
    st.selected = id; save();
  };
  const filterRow = h("div.toolbar",
    h("input", { type: "search", placeholder: t("pose.search"), value: st.q || "", oninput: e => { st.q = e.target.value; ctx.rerender(); requestAnimationFrame(() => { const i = document.querySelector(".toolbar input[type=search]"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); } }),
    h("select", { style: { width: "auto" }, onchange: e => { st.size = e.target.value; ctx.rerender(); } }, h("option", { value: "" }, t("pose.allSizes")), SIZES.map(k => h("option", { value: k, selected: st.size === k || null }, t("size." + k)))),
    h("select", { style: { width: "auto" }, onchange: e => { st.people = e.target.value; ctx.rerender(); } }, h("option", { value: "" }, t("pose.allPeople")), PEOPLE.map(k => h("option", { value: k, selected: st.people === k || null }, t("ppl." + k)))),
    allTags.length ? h("div.chips", allTags.map(tg => h("span.chip" + (st.tag === tg ? "" : ".plain"), { onclick: () => { st.tag = st.tag === tg ? "" : tg; ctx.rerender(); } }, tg))) : null,
    h("span.spacer"), h("button.primary", { onclick: add }, "＋ " + t("pose.new")));
  const grid = !S.poses.length ? emptyState(t("pose.emptyTitle"), t("pose.emptyBody"), h("button.primary", { onclick: add }, "＋ " + t("pose.new")))
    : !list.length ? h("p.mut", t("pose.noMatch"))
      : h("div.poses", list.map(x => h("div.pose" + (x.id === st.selected ? ".on" : ""), { tabindex: 0, onclick: () => { st.selected = x.id; ctx.rerender(); } },
        h("div.img", { style: x.image ? { backgroundImage: `url(${libUrl(x.image)})` } : {} }, x.image ? "" : "◎"),
        h("div.bd", h("b", x.name), h("div.small.mut", [(x.sizes || []).map(k => t("size." + k)).join("/"), x.people ? t("ppl." + x.people) : ""].filter(Boolean).join(" · "))))));

  const x = S.poses.find(y => y.id === st.selected);
  let panel = null;
  if (x) {
    x.cues = x.cues || {};
    const txt = (get, set, ph) => h("input", { type: "text", value: get() || "", placeholder: ph, oninput: e => { set(e.target.value); saveLibrary("poses"); }, onchange: () => ctx.rerender() });
    const nos = p ? M.shotNumbers(p) : new Map();
    const used = p ? p.shots.filter(s => s.poseId === x.id) : [];
    panel = h("div",
      h("h4", t("pose.entry")),
      h("div.refstrip", { style: { aspectRatio: "1" } }, x.image ? h("img", { src: libUrl(x.image), alt: "" }) : "◎"),
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
        p && ctx.state.assignTo ? null : null,
        h("button.sm.danger", { onclick: async () => {
          const n = used.length;
          if (!await confirmDlg(t("common.deleteTitle"), n ? t("ref.affects", { n }) : t("pose.delBody"), { danger: true, ok: t("common.delete") })) return;
          S.poses = S.poses.filter(y => y.id !== x.id); st.selected = null;
          if (n) commit(q2 => { for (const s of q2.shots) if (s.poseId === x.id) s.poseId = ""; }, { force: true });
          save();
        } }, t("common.delete"))));
  } else {
    panel = h("div", h("h4", t("panel.tips")), h("p.small.mut", t("pose.tip")), h("p.small.mut", t("pose.count", { n: S.poses.length })));
  }
  return { main: h("div", h("h2.pt", t("step.poses")), h("p.sub", t("pose.sub")), filterRow, grid), panel };
}
