// S1 概要与情绪板（F05–F07）
import { h, menu, pickFiles, dropZone, toast, seg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, uploadImages, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, area, fld, tagsInput, issuesList } from "./common.js";

export function render(ctx) {
  const p = S.project, st = ctx.state;
  st.view = st.view || "grid";
  const sel = p.mood.find(m => m.id === st.selected);

  const add = async files => {
    if (readonly()) return toast(t("final.locked"));
    const names = await uploadImages(files);
    commit(q => { for (const f of names) q.mood.push({ id: M.uid(), file: f, note: "", tags: [], x: 4 + Math.random() * 60, y: 4 + Math.random() * 50 }); });
  };

  const info = h("div.card",
    h("h3", t("ov.basic")),
    h("div.grid2",
      fld(t("ov.name") + " *", inp(() => p.name, (q, v) => { q.name = v; }, { placeholder: t("proj.namePh") })),
      fld(t("ov.keywords"), tagsInput([...p.overview.keywords], v => commit(q => { q.overview.keywords = v; }), t("ov.keywordsPh")), t("ov.keywordsHelp"))),
    fld(t("ov.theme") + " *", area(() => p.overview.theme, (q, v) => { q.overview.theme = v; }, { placeholder: t("ov.themePh"), rows: 4 })),
    h("div.row", h("button.sm", { disabled: true, title: t("common.deferred") }, "✦ " + t("ov.aiDraft")), h("span.small.mut", t("common.deferred"))),
    h("details.more", h("summary", t("common.more")),
      h("div.grid2",
        fld(t("ov.client"), inp(() => p.overview.client, (q, v) => { q.overview.client = v; })),
        fld(t("ov.purpose"), inp(() => p.overview.purpose, (q, v) => { q.overview.purpose = v; }, { placeholder: t("ov.purposePh") })))));

  const zone = dropZone(h("div.drop", t("ov.drop"), " ", h("button.sm", { onclick: async () => add(await pickFiles()) }, t("ov.upload"))), add);
  let board;
  if (!p.mood.length) board = null;
  else if (st.view === "grid") {
    board = h("div.mood", p.mood.map(m => h("div.it" + (m.id === st.selected ? ".on" : ""), { tabindex: 0, onclick: () => { st.selected = m.id; ctx.rerender(); } },
      h("img", { src: fileUrl(m.file), alt: m.note || "", loading: "lazy" }), m.note || m.tags.length ? h("div.cap", m.note || m.tags.join(" · ")) : null)));
  } else {
    board = h("div.mood.free");
    for (const m of p.mood) {
      const it = h("div.it" + (m.id === st.selected ? ".on" : ""), { style: { left: (m.x ?? 5) + "%", top: (m.y ?? 5) + "%" } },
        h("img", { src: fileUrl(m.file), alt: "", draggable: "false" }));
      it.addEventListener("pointerdown", e => {
        st.selected = m.id;
        const r = board.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY, ox = m.x ?? 5, oy = m.y ?? 5;
        let nx = ox, ny = oy;
        const mv = ev => { nx = Math.max(0, Math.min(90, ox + (ev.clientX - sx) / r.width * 100)); ny = Math.max(0, Math.min(85, oy + (ev.clientY - sy) / r.height * 100)); it.style.left = nx + "%"; it.style.top = ny + "%"; };
        const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); commit(q => { const x = q.mood.find(z => z.id === m.id); x.x = nx; x.y = ny; }); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up);
      });
      board.append(it);
    }
  }
  const moodCard = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("ov.mood") + ` (${p.mood.length})`), h("span.spacer"),
      seg([["grid", t("ov.grid")], ["free", t("ov.free")]], st.view, v => { st.view = v; ctx.rerender(); })),
    h("div", { style: { height: "10px" } }), zone, h("div", { style: { height: "10px" } }), board);

  let panel;
  if (sel) {
    const shotNos = M.shotNumbers(p);
    const usedIn = p.shots.filter(s => (s.refs || []).includes(sel.file));
    panel = h("div",
      h("h4", t("ov.image")),
      h("img", { src: fileUrl(sel.file), style: { width: "100%", borderRadius: "8px" }, alt: "" }),
      fld(t("ov.note"), inp(() => sel.note, (q, v) => { q.mood.find(x => x.id === sel.id).note = v; })),
      fld(t("ov.tags"), tagsInput([...sel.tags], v => commit(q => { q.mood.find(x => x.id === sel.id).tags = v; }), t("ov.tagsPh"))),
      h("h4", t("ov.usedIn")),
      usedIn.length ? h("div.chips", usedIn.map(s => h("span.chip", { onclick: () => ctx.go("shots", { focus: s.id }) }, shotNos.get(s.id)))) : h("p.small.mut", t("ov.notUsed")),
      h("div.row.wrap", { style: { marginTop: "10px" } },
        h("button.sm", { disabled: !p.shots.length || readonly() || null, onclick: e => menu(e.currentTarget,
          M.orderedShots(p).map(s => ({ value: s.id, label: shotNos.get(s.id) }))
          , { onPick: id => commit(q => { const s = q.shots.find(x => x.id === id); s.refs = [...new Set([...(s.refs || []), sel.file])]; }) }) }, t("ov.setRef")),
        h("button.sm", { disabled: readonly() || null, onclick: () => commit(q => { const i = q.mood.findIndex(x => x.id === sel.id); const [x] = q.mood.splice(i, 1); q.mood.unshift(x); }) }, t("ov.cover")),
        h("button.sm.danger", { disabled: readonly() || null, onclick: () => { st.selected = null; commit(q => { q.mood = q.mood.filter(x => x.id !== sel.id); }); } }, t("common.delete"))));
  } else {
    const list = M.checks(p).filter(c => c.page === "basics");
    panel = h("div", h("h4", t("panel.checks")), issuesList(p, list, ctx.go), h("h4", t("panel.tips")), h("p.small.mut", t("ov.tip")));
  }
  return { main: h("div", h("h2.pt", t("step.basics")), h("p.sub", t("ov.sub")), info, moodCard), panel };
}
