// S4 动作库：列表筛选 + T21 二级编辑（参考图 / 分解 / 要点 / 标签维）
import { h, confirmDlg, promptDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, libUrl, saveLibrary, commit } from "../store.js";
import * as M from "../model.js";
import { tagsInput, fld, emptyState } from "./common.js";
import { SIZES } from "./shots.js";
import { editShell, editForm } from "../editlayer.js";
import { openRefPicker } from "../refimages.js";

const PEOPLE = ["1", "2", "group"];

export function render(ctx) {
  const st = ctx.state, p = S.project;
  if (ctx.edit?.kind === "pose") return renderPoseEdit(ctx, ctx.edit.id);
  st.dim = st.dim || {};

  const q = (st.q || "").toLowerCase();
  const list = S.poses.filter(x => {
    const hay = [x.name, ...(x.tags || []), ...(x.dims?.mood || []), ...(x.steps || []), x.guide, x.cues && Object.values(x.cues).join(" ")].join(" ").toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (st.size && !(x.sizes || []).includes(st.size)) return false;
    if (st.people && x.people !== st.people) return false;
    if (!M.poseMatchesDims(x, st.dim)) return false;
    return true;
  });
  const save = () => { saveLibrary("poses"); ctx.rerender(); };
  const add = async () => {
    const n = await promptDlg(t("pose.newTitle"), { placeholder: t("pose.namePh") });
    if (!n || !n.trim()) return;
    const pose = M.normalizePose(M.blankPose(n.trim()));
    S.poses.unshift(pose);
    saveLibrary("poses");
    ctx.openEdit("pose", pose.id);
  };
  const openPose = id => ctx.openEdit("pose", id);

  const dimFilters = h("div.pose-dims", M.POSE_DIMS.map(d => h("div.pose-dim",
    h("span.lbl", t("pose.dim." + d)),
    h("div.chips", [
      h("span.chip" + (!st.dim[d] ? "" : ".plain"), { onclick: () => { st.dim[d] = ""; ctx.rerender(); } }, t("pose.dimAll")),
      ...[...new Set([...(M.POSE_DIM_PRESETS[d] || []), ...S.poses.flatMap(x => x.dims?.[d] || [])])].map(v =>
        h("span.chip" + (st.dim[d] === v ? "" : ".plain"), { onclick: () => { st.dim[d] = st.dim[d] === v ? "" : v; ctx.rerender(); } }, v)),
    ]))));

  const filterRow = h("div.toolbar",
    h("input", { type: "search", placeholder: t("pose.search"), value: st.q || "", oninput: e => { st.q = e.target.value; ctx.rerender(); requestAnimationFrame(() => { const i = document.querySelector(".toolbar input[type=search]"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); } }),
    h("select", { style: { width: "auto" }, onchange: e => { st.size = e.target.value; ctx.rerender(); } }, h("option", { value: "" }, t("pose.allSizes")), SIZES.map(k => h("option", { value: k, selected: st.size === k || null }, t("size." + k)))),
    h("select", { style: { width: "auto" }, onchange: e => { st.people = e.target.value; ctx.rerender(); } }, h("option", { value: "" }, t("pose.allPeople")), PEOPLE.map(k => h("option", { value: k, selected: st.people === k || null }, t("ppl." + k)))),
    h("span.spacer"), h("button.primary", { onclick: add }, "＋ " + t("pose.new")));

  const grid = !S.poses.length ? emptyState(t("pose.emptyTitle"), t("pose.emptyBody"), h("button.primary", { onclick: add }, "＋ " + t("pose.new")))
    : !list.length ? h("p.mut", t("pose.noMatch"))
      : h("div.poses", list.map(x => {
        const cover = M.poseCoverFile(x);
        const mood = M.poseMoodChips(x, 2);
        return h("div.pose", {
          tabindex: 0,
          onclick: () => openPose(x.id),
          onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); openPose(x.id); } },
        },
          cover
            ? h("div.img", { style: { backgroundImage: `url(${libUrl(cover)})` } })
            : h("div.img.ph", (x.name || "?").slice(0, 1)),
          h("div.bd",
            h("b", x.name),
            h("div.small.mut", [(x.sizes || []).map(k => t("size." + k)).join("/"), x.people ? t("ppl." + x.people) : ""].filter(Boolean).join(" · ")),
            mood.length ? h("div.chips.tight", mood.map(m => h("span.chip.plain", m))) : null));
      }));

  const panel = h("div", h("h4", t("panel.tips")), h("p.small.mut", t("pose.tip")), h("p.small.mut", t("pose.count", { n: S.poses.length })));
  return { main: h("div", h("h2.pt", t("step.poses")), h("p.sub", t("pose.sub")), filterRow, dimFilters, grid), panel };
}

function renderPoseEdit(ctx, id) {
  const p = S.project;
  const x = S.poses.find(y => y.id === id);
  if (!x) { ctx.closeEdit(); return render(ctx); }
  M.normalizePose(x);
  const idx = S.poses.findIndex(y => y.id === id);
  const save = () => { M.normalizePose(x); saveLibrary("poses"); ctx.rerender(); };
  const nos = p ? M.shotNumbers(p) : new Map();
  const used = p ? p.shots.filter(s => s.poseId === x.id) : [];

  const body = editForm([
    h("p.small.mut", t("pose.imagesHelp")),
    h("div.row", h("button.sm.primary", { onclick: async () => {
      const cues = [x.cues?.weight, x.cues?.hands, x.cues?.gaze].filter(Boolean).join("；");
      const items = await openRefPicker({
        allowMood: true, multiple: true, toLibrary: true,
        poseName: x.name || "", poseCues: cues,
      });
      if (!items?.length) return;
      const first = !x.images.length;
      for (const it of items) x.images.push({ id: M.uid(), file: it.file, source: it.source || "", url: it.url || "", note: "", cover: false });
      if (first && x.images[0]) x.images[0].cover = true;
      save();
    } }, "＋ " + t("ref.add"))),
    !(x.images || []).length ? h("p.mut", t("pose.noImages")) : h("div.photo-grid", x.images.map((im, i) => h("div.photo-card",
      h("img", { src: libUrl(im.file), alt: "" }),
      im.cover ? h("span.badge", t("model.cover")) : null,
      im.source === "ai" ? h("span.ai-badge", "AI") : null,
      h("div.row.wrap",
        h("button.sm", { disabled: im.cover || null, onclick: () => {
          for (const z of x.images) z.cover = false;
          x.images[i].cover = true;
          save();
        } }, t("model.setCover")),
        h("button.sm.danger", { onclick: () => {
          const was = x.images[i].cover;
          x.images.splice(i, 1);
          if (was && x.images[0]) x.images[0].cover = true;
          save();
        } }, t("common.delete"))),
    ))),

    fld(t("pose.name"), h("input", { type: "text", value: x.name || "", oninput: e => { x.name = e.target.value; saveLibrary("poses"); }, onchange: () => ctx.rerender() })),

    h("div.sec-head", h("h4", t("pose.steps")), h("button.sm", { onclick: () => { x.steps.push(""); save(); } }, "＋ " + t("pose.addStep"))),
    h("p.small.mut", t("pose.stepsHelp")),
    !(x.steps || []).length ? h("p.mut", t("pose.noSteps")) : x.steps.map((s, i) => h("div.row", { style: { marginBottom: "6px", gap: "6px" } },
      h("span.mut", String(i + 1)),
      h("input", { type: "text", style: { flex: 1 }, value: s, placeholder: t("pose.stepPh"), oninput: e => { x.steps[i] = e.target.value; saveLibrary("poses"); }, onchange: () => ctx.rerender() }),
      h("button.sm.ghost", { disabled: i === 0 || null, onclick: () => { const a = x.steps; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(); } }, "↑"),
      h("button.sm.ghost", { disabled: i >= x.steps.length - 1 || null, onclick: () => { const a = x.steps; [a[i + 1], a[i]] = [a[i], a[i + 1]]; save(); } }, "↓"),
      h("button.sm.ghost", { onclick: () => { x.steps.splice(i, 1); save(); } }, "×"),
    )),

    h("h4", t("pose.cues")),
    fld(t("pose.weight"), cueInp(x, "weight", t("pose.weightPh"), save, ctx)),
    fld(t("pose.hands"), cueInp(x, "hands", t("pose.handsPh"), save, ctx)),
    fld(t("pose.gaze"), cueInp(x, "gaze", t("pose.gazePh"), save, ctx)),
    fld(t("pose.pitfalls"), cueInp(x, "pitfalls", t("pose.pitfallsPh"), save, ctx)),

    fld(t("pose.guide"), h("textarea", {
      rows: 2, placeholder: t("pose.guidePh"), value: x.guide || "",
      oninput: e => { x.guide = e.target.value; saveLibrary("poses"); }, onchange: () => ctx.rerender(),
    })),

    h("h4", t("pose.fits")),
    h("div.chips", SIZES.map(k => h("span.chip" + ((x.sizes || []).includes(k) ? "" : ".plain"), { onclick: () => { x.sizes = (x.sizes || []).includes(k) ? x.sizes.filter(z => z !== k) : [...(x.sizes || []), k]; save(); } }, t("size." + k)))),
    h("div.chips", { style: { marginTop: "6px" } }, PEOPLE.map(k => h("span.chip" + (x.people === k ? "" : ".plain"), { onclick: () => { x.people = k; save(); } }, t("ppl." + k)))),
    fld(t("pose.wardrobe"), h("input", { type: "text", value: x.wardrobe || "", placeholder: t("pose.wardrobePh"), oninput: e => { x.wardrobe = e.target.value; saveLibrary("poses"); }, onchange: () => ctx.rerender() })),

    h("h4", t("pose.dims")),
    h("p.small.mut", t("pose.dimsHelp")),
    ...M.POSE_DIMS.map(d => dimEditor(x, d, save, ctx)),

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

  const cover = M.poseCoverFile(x);
  const main = editShell({
    crumb: `${t("step.poses")} / ${x.name || "—"}`,
    onBack: () => ctx.closeEdit(),
    onPrev: idx > 0 ? () => ctx.openEdit("pose", S.poses[idx - 1].id) : null,
    onNext: idx >= 0 && idx < S.poses.length - 1 ? () => ctx.openEdit("pose", S.poses[idx + 1].id) : null,
    body,
  });

  const panel = h("div",
    h("h4", t("edit.summary")),
    cover ? h("img", { src: libUrl(cover), style: { width: "100%", borderRadius: "8px", marginBottom: "8px" }, alt: "" }) : null,
    h("p", h("b", x.name || "—")),
    h("p.small.mut", [(x.sizes || []).map(k => t("size." + k)).join("/"), x.people ? t("ppl." + x.people) : "", ...(M.poseMoodChips(x, 2))].filter(Boolean).join(" · ") || "—"),
    h("h4", t("pose.usedHere")),
    used.length ? h("div.chips", used.map(s => h("span.chip", nos.get(s.id)))) : h("p.small.mut", t("pose.notUsed")),
    h("h4", t("panel.tips")), h("p.small.mut", t("pose.tip")));

  return { main, panel };
}

function cueInp(x, key, ph, save, ctx) {
  return h("input", {
    type: "text", value: x.cues[key] || "", placeholder: ph,
    oninput: e => { x.cues[key] = e.target.value; saveLibrary("poses"); },
    onchange: () => ctx.rerender(),
  });
}

function dimEditor(x, dim, save, ctx) {
  const selected = new Set(x.dims[dim] || []);
  const presets = M.POSE_DIM_PRESETS[dim] || [];
  const extras = (x.dims[dim] || []).filter(v => !presets.includes(v));
  return h("div.pose-dim-edit",
    h("div.row", h("b", t("pose.dim." + dim)), h("span.spacer")),
    h("div.chips", [
      ...presets.map(v => h("span.chip" + (selected.has(v) ? "" : ".plain"), { onclick: () => {
        const arr = x.dims[dim] || (x.dims[dim] = []);
        const i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        x.tags = [...(x.dims.mood || [])];
        save();
      } }, v)),
      ...extras.map(v => h("span.chip", { onclick: () => {
        x.dims[dim] = x.dims[dim].filter(z => z !== v);
        x.tags = [...(x.dims.mood || [])];
        save();
      } }, v, " ×")),
    ]),
    tagsInput([], v => {
      if (!v.length) return;
      const arr = x.dims[dim] || (x.dims[dim] = []);
      for (const n of v) if (n && !arr.includes(n)) arr.push(n);
      x.tags = [...(x.dims.mood || [])];
      save();
    }, t("pose.dimCustomPh")),
  );
}
