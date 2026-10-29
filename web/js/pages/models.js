// S3 模特与样图：列表 + T17 二级编辑层（基本信息先迁入；工作照/服装/角色/付费选项留给 T18/T19）
import { h, menu, pickFiles, dropZone, toast, seg, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, uploadImages, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, fld, tagsInput, issuesList, emptyState } from "./common.js";
import { editShell, editForm, editPlaceholder } from "../editlayer.js";

const SOURCES = ["", "x", "xhs", "web", "ai", "own"];
// 标签页：基本信息本卡可编；其余留给 T18/T19（占位文案，不猜字段）
const PERSON_TABS = [
  { id: "basic", label: "edit.tab.basic" },
  { id: "photos", label: "edit.tab.photos", later: "edit.later.photos" },
  { id: "looks", label: "edit.tab.looks", later: "edit.later.looks" },
  { id: "role", label: "edit.tab.role", later: "edit.later.role" },
  { id: "pay", label: "edit.tab.pay", later: "edit.later.pay" },
];

export function render(ctx) {
  const p = S.project, st = ctx.state, ro = readonly();
  st.view = st.view || "grid";
  st.editTab = st.editTab || "basic";
  if (st.selected && typeof st.selected === "string") st.selected = { kind: "person", id: st.selected };

  if (ctx.edit?.kind === "person") return renderPersonEdit(ctx, ctx.edit.id);
  if (ctx.edit?.kind === "mood") return renderMoodEdit(ctx, ctx.edit.id);

  const addPerson = () => {
    const id = M.uid();
    commit(q => {
      const x = { id, kind: "model", name: t("time.modelN", { n: M.models(q).length + 1 }), height: "", size: "", availFrom: "", availTo: "" };
      M.setLookCount(x, 1, i => t("time.lookN", { n: i + 1 }));
      q.people.push(x);
    });
    ctx.openEdit("person", id);
  };

  const ms = M.models(p);
  const openPerson = id => ctx.openEdit("person", id);
  const pcard = x => h("div.pcard", {
    tabindex: 0,
    onclick: () => openPerson(x.id),
    onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); openPerson(x.id); } },
  },
    h("div.nm", x.name || "—"),
    h("div.meta", [x.height && x.height + " cm", x.size, t("time.looksN", { n: (x.looks || []).length }), x.availTo && t("time.until", { t: x.availTo })].filter(Boolean).join(" · ")));

  const peopleCard = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("time.models") + ` (${ms.length})`), h("span.spacer"),
      h("button.sm", { disabled: ro || null, onclick: addPerson }, "＋ " + t("time.addModel"))),
    h("div", { style: { height: "8px" } }),
    ms.length ? h("div.cards", ms.map(pcard)) : emptyState(t("time.noModels"), t("time.noModelsBody")));

  const addMood = async files => {
    if (ro) return toast(t("final.locked"));
    const names = await uploadImages(files);
    let first = null;
    commit(q => {
      for (const f of names) {
        const id = M.uid();
        if (!first) first = id;
        q.mood.push({ id, file: f, note: "", tags: [], source: "", url: "", x: 4 + Math.random() * 60, y: 4 + Math.random() * 50 });
      }
    });
    if (first) ctx.openEdit("mood", first);
  };
  const zone = dropZone(h("div.drop", t("ov.drop"), " ", h("button.sm", { onclick: async () => addMood(await pickFiles()) }, t("ov.upload"))), addMood);

  const srcLabel = m => {
    const s = m.source || "";
    return s ? t("mood.src." + (s === "" ? "none" : s)) : "";
  };
  const openMood = id => ctx.openEdit("mood", id);
  let board;
  if (!p.mood.length) board = null;
  else if (st.view === "grid") {
    board = h("div.mood", p.mood.map(m => {
      const cap = [m.note, ...(m.tags || []), srcLabel(m)].filter(Boolean).join(" · ");
      return h("div.it", {
        tabindex: 0,
        onclick: () => openMood(m.id),
        onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); openMood(m.id); } },
      }, h("img", { src: fileUrl(m.file), alt: m.note || "", loading: "lazy" }), cap ? h("div.cap", cap) : null);
    }));
  } else {
    board = h("div.mood.free");
    for (const m of p.mood) {
      const it = h("div.it", { style: { left: (m.x ?? 5) + "%", top: (m.y ?? 5) + "%" },
        onclick: e => { if (e.detail === 2) openMood(m.id); } },
        h("img", { src: fileUrl(m.file), alt: "", draggable: "false" }));
      it.addEventListener("pointerdown", e => {
        if (e.detail > 1) return;
        const r = board.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY, ox = m.x ?? 5, oy = m.y ?? 5;
        let nx = ox, ny = oy, moved = false;
        const mv = ev => {
          moved = true;
          nx = Math.max(0, Math.min(90, ox + (ev.clientX - sx) / r.width * 100));
          ny = Math.max(0, Math.min(85, oy + (ev.clientY - sy) / r.height * 100));
          it.style.left = nx + "%"; it.style.top = ny + "%";
        };
        const up = () => {
          removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
          if (moved) commit(q => { const x = q.mood.find(z => z.id === m.id); x.x = nx; x.y = ny; });
          else openMood(m.id);
        };
        addEventListener("pointermove", mv); addEventListener("pointerup", up);
      });
      board.append(it);
    }
  }
  const moodCard = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("ov.mood") + ` (${p.mood.length})`), h("span.spacer"),
      seg([["grid", t("ov.grid")], ["free", t("ov.free")]], st.view, v => { st.view = v; ctx.rerender(); })),
    h("div", { style: { height: "10px" } }), zone, h("div", { style: { height: "10px" } }), board);

  const panel = h("div",
    h("h4", t("panel.checks")), issuesList(p, M.checks(p).filter(c => c.page === "models"), ctx.go),
    h("h4", t("panel.tips")), h("p.small.mut", t("models.tip")));

  return {
    main: h("div", h("h2.pt", t("step.models")), h("p.sub", t("models.sub")), peopleCard, moodCard),
    panel,
  };
}

function renderPersonEdit(ctx, id) {
  const p = S.project, st = ctx.state, ro = readonly();
  const ms = M.models(p);
  const x = M.personById(p, id);
  if (!x || x.kind !== "model") { ctx.closeEdit(); return render(ctx); }
  const idx = ms.findIndex(m => m.id === id);
  const tabDef = PERSON_TABS.find(tb => tb.id === st.editTab) || PERSON_TABS[0];
  const tab = tabDef.id;
  st.editTab = tab;

  const set = (k, type) => inp(() => x[k], (q, v) => { M.personById(q, x.id)[k] = v; }, { type });
  const usedBy = p.shots.filter(s => M.resolveShot(p, s).personIds.includes(x.id)).length + p.scenes.filter(sc => sc.personIds.includes(x.id)).length;

  let body;
  if (tab === "basic") {
    body = editForm([
      fld(t("time.name"), set("name")),
      h("div.grid2", fld(t("time.height"), set("height", "number")), fld(t("time.size"), set("size"))),
      h("div.grid2", fld(t("time.availFrom"), set("availFrom", "time")), fld(t("time.availTo"), set("availTo", "time"))),
      h("h4", t("time.looks"), h("span", h("button.sm", { disabled: ro || null, onclick: () => commit(q => { const y = M.personById(q, x.id); M.setLookCount(y, y.looks.length + 1, i => t("time.lookN", { n: i + 1 })); }) }, "＋"))),
      h("p.small.mut", t("time.looksHelp")),
      x.looks.map((l, i) => h("div.row", { style: { marginBottom: "4px" } },
        inp(() => l.name, (q, v) => { M.personById(q, x.id).looks[i].name = v; }),
        h("button.sm.ghost", { disabled: ro || null, title: t("common.delete"), onclick: async () => {
          const n = p.shots.filter(s => (s.lookIds || []).includes(l.id)).length + p.scenes.filter(sc => (sc.lookIds || []).includes(l.id)).length;
          if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n }))) return;
          commit(q => { M.personById(q, x.id).looks.splice(i, 1); });
        } }, "×"))),
      h("div.row", { style: { marginTop: "14px" } }, h("button.sm.danger", { disabled: ro || null, onclick: async () => {
        if (usedBy && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n: usedBy }), { danger: true, ok: t("common.delete") })) return;
        ctx.closeEdit();
        commit(q => { q.people = q.people.filter(y => y.id !== x.id); });
      } }, t("common.delete"))),
    ]);
  } else {
    body = editPlaceholder(t(tabDef.later));
  }

  const main = editShell({
    crumb: `${t("step.models")} / ${x.name || t("proj.untitled")}`,
    onBack: () => ctx.closeEdit(),
    onPrev: idx > 0 ? () => ctx.openEdit("person", ms[idx - 1].id) : null,
    onNext: idx >= 0 && idx < ms.length - 1 ? () => ctx.openEdit("person", ms[idx + 1].id) : null,
    tabs: PERSON_TABS.map(tb => ({ id: tb.id, label: t(tb.label) })),
    tab,
    onTab: id2 => { st.editTab = id2; ctx.rerender(); },
    body,
  });

  const panel = h("div",
    h("h4", t("edit.summary")),
    h("p", h("b", x.name || "—")),
    h("p.small.mut", [x.height && x.height + " cm", x.size, t("time.looksN", { n: (x.looks || []).length })].filter(Boolean).join(" · ") || "—"),
    h("h4", t("edit.usedBy")),
    h("p.small.mut", usedBy ? t("edit.usedByN", { n: usedBy }) : t("ov.notUsed")),
    h("h4", t("panel.checks")),
    issuesList(p, M.checks(p).filter(c => c.page === "models"), ctx.go));

  return { main, panel, onKey: e => {
    if (e.key === "Enter" && !e.target.matches("input,textarea,select,button")) { e.preventDefault(); }
  } };
}

function renderMoodEdit(ctx, id) {
  const p = S.project, ro = readonly();
  const m = p.mood.find(x => x.id === id);
  if (!m) { ctx.closeEdit(); return render(ctx); }
  const list = p.mood;
  const idx = list.findIndex(x => x.id === id);
  const shotNos = M.shotNumbers(p);
  const usedIn = p.shots.filter(s => (s.refs || []).includes(m.file));
  const urlOk = /^https?:\/\//i.test(m.url || "");

  const body = editForm([
    h("img", { src: fileUrl(m.file), style: { width: "100%", maxWidth: "420px", borderRadius: "8px" }, alt: "" }),
    fld(t("ov.note"), inp(() => m.note, (q, v) => { q.mood.find(x => x.id === m.id).note = v; })),
    fld(t("ov.tags"), tagsInput([...m.tags], v => commit(q => { q.mood.find(x => x.id === m.id).tags = v; }), t("ov.tagsPh"))),
    fld(t("mood.source"), h("select", {
      disabled: ro || null,
      onchange: e => commit(q => { q.mood.find(x => x.id === m.id).source = e.target.value; }),
    }, SOURCES.map(s => h("option", { value: s, selected: (m.source || "") === s || null }, t("mood.src." + (s || "none")))))),
    fld(t("mood.url"), inp(() => m.url || "", (q, v) => { q.mood.find(x => x.id === m.id).url = v; }, { placeholder: "https://" })),
    urlOk ? h("button.sm", { onclick: () => window.open(m.url, "_blank", "noopener") }, t("mood.openUrl")) : null,
    h("h4", t("ov.usedIn")),
    usedIn.length ? h("div.chips", usedIn.map(s => h("span.chip", { onclick: () => ctx.go("shots", { focus: s.id }) }, shotNos.get(s.id)))) : h("p.small.mut", t("ov.notUsed")),
    h("div.row.wrap", { style: { marginTop: "10px" } },
      h("button.sm", { disabled: !p.shots.length || ro || null, onclick: e => menu(e.currentTarget,
        M.orderedShots(p).map(s => ({ value: s.id, label: shotNos.get(s.id) })),
        { onPick: id2 => commit(q => { const s = q.shots.find(x => x.id === id2); s.refs = [...new Set([...(s.refs || []), m.file])]; }) }) }, t("ov.setRef")),
      h("button.sm", { disabled: ro || null, onclick: () => commit(q => { const i = q.mood.findIndex(x => x.id === m.id); const [x] = q.mood.splice(i, 1); q.mood.unshift(x); }) }, t("ov.cover")),
      h("button.sm.danger", { disabled: ro || null, onclick: () => { ctx.closeEdit(); commit(q => { q.mood = q.mood.filter(x => x.id !== m.id); }); } }, t("common.delete"))),
  ]);

  const main = editShell({
    crumb: `${t("step.models")} / ${t("ov.image")}`,
    onBack: () => ctx.closeEdit(),
    onPrev: idx > 0 ? () => ctx.openEdit("mood", list[idx - 1].id) : null,
    onNext: idx >= 0 && idx < list.length - 1 ? () => ctx.openEdit("mood", list[idx + 1].id) : null,
    body,
  });

  const panel = h("div",
    h("h4", t("edit.summary")),
    h("img", { src: fileUrl(m.file), style: { width: "100%", borderRadius: "8px" }, alt: "" }),
    h("p.small.mut", m.note || "—"),
    h("h4", t("ov.usedIn")),
    usedIn.length ? h("div.chips", usedIn.map(s => h("span.chip", shotNos.get(s.id)))) : h("p.small.mut", t("ov.notUsed")));

  return { main, panel };
}
