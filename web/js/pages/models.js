// S3 模特与样图：模特（自 time.js）+ 情绪板（自 overview.js）；来源链接见 T4 完整规格
import { h, menu, pickFiles, dropZone, toast, seg, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, uploadImages, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, fld, tagsInput, issuesList, emptyState } from "./common.js";

const SOURCES = ["", "x", "xhs", "web", "ai", "own"];

export function render(ctx) {
  const p = S.project, st = ctx.state, ro = readonly();
  st.view = st.view || "grid";
  // selected: { kind:"person"|"mood", id }
  if (st.selected && typeof st.selected === "string") st.selected = { kind: "person", id: st.selected };
  const sel = st.selected;

  const addPerson = () => {
    const id = M.uid();
    commit(q => {
      const x = { id, kind: "model", name: t("time.modelN", { n: M.models(q).length + 1 }), height: "", size: "", availFrom: "", availTo: "" };
      M.setLookCount(x, 1, i => t("time.lookN", { n: i + 1 }));
      q.people.push(x);
    });
    st.selected = { kind: "person", id }; ctx.rerender();
  };

  const ms = M.models(p);
  const pcard = x => h("div.pcard" + (sel && sel.kind === "person" && sel.id === x.id ? ".on" : ""), {
    tabindex: 0, onclick: () => { st.selected = { kind: "person", id: x.id }; ctx.rerender(); },
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
    commit(q => { for (const f of names) q.mood.push({ id: M.uid(), file: f, note: "", tags: [], source: "", url: "", x: 4 + Math.random() * 60, y: 4 + Math.random() * 50 }); });
  };
  const zone = dropZone(h("div.drop", t("ov.drop"), " ", h("button.sm", { onclick: async () => addMood(await pickFiles()) }, t("ov.upload"))), addMood);

  const srcLabel = m => {
    const s = m.source || "";
    return s ? t("mood.src." + (s === "" ? "none" : s)) : "";
  };
  let board;
  if (!p.mood.length) board = null;
  else if (st.view === "grid") {
    board = h("div.mood", p.mood.map(m => {
      const cap = [m.note, ...(m.tags || []), srcLabel(m)].filter(Boolean).join(" · ");
      return h("div.it" + (sel && sel.kind === "mood" && sel.id === m.id ? ".on" : ""), {
        tabindex: 0, onclick: () => { st.selected = { kind: "mood", id: m.id }; ctx.rerender(); },
      }, h("img", { src: fileUrl(m.file), alt: m.note || "", loading: "lazy" }), cap ? h("div.cap", cap) : null);
    }));
  } else {
    board = h("div.mood.free");
    for (const m of p.mood) {
      const it = h("div.it" + (sel && sel.kind === "mood" && sel.id === m.id ? ".on" : ""), { style: { left: (m.x ?? 5) + "%", top: (m.y ?? 5) + "%" } },
        h("img", { src: fileUrl(m.file), alt: "", draggable: "false" }));
      it.addEventListener("pointerdown", e => {
        st.selected = { kind: "mood", id: m.id };
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
  if (sel && sel.kind === "person") {
    const x = M.personById(p, sel.id);
    if (!x || x.kind !== "model") { st.selected = null; return render(ctx); }
    const set = (k, type) => inp(() => x[k], (q, v) => { M.personById(q, x.id)[k] = v; }, { type });
    const usedBy = p.shots.filter(s => M.resolveShot(p, s).personIds.includes(x.id)).length + p.scenes.filter(sc => sc.personIds.includes(x.id)).length;
    panel = h("div",
      h("h4", t("time.model")),
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
        st.selected = null;
        commit(q => { q.people = q.people.filter(y => y.id !== x.id); });
      } }, t("common.delete"))));
  } else if (sel && sel.kind === "mood") {
    const m = p.mood.find(x => x.id === sel.id);
    if (!m) { st.selected = null; return render(ctx); }
    const shotNos = M.shotNumbers(p);
    const usedIn = p.shots.filter(s => (s.refs || []).includes(m.file));
    const urlOk = /^https?:\/\//i.test(m.url || "");
    panel = h("div",
      h("h4", t("ov.image")),
      h("img", { src: fileUrl(m.file), style: { width: "100%", borderRadius: "8px" }, alt: "" }),
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
          { onPick: id => commit(q => { const s = q.shots.find(x => x.id === id); s.refs = [...new Set([...(s.refs || []), m.file])]; }) }) }, t("ov.setRef")),
        h("button.sm", { disabled: ro || null, onclick: () => commit(q => { const i = q.mood.findIndex(x => x.id === m.id); const [x] = q.mood.splice(i, 1); q.mood.unshift(x); }) }, t("ov.cover")),
        h("button.sm.danger", { disabled: ro || null, onclick: () => { st.selected = null; commit(q => { q.mood = q.mood.filter(x => x.id !== m.id); }); } }, t("common.delete"))));
  } else {
    panel = h("div", h("h4", t("panel.checks")), issuesList(p, M.checks(p).filter(c => c.page === "models"), ctx.go),
      h("h4", t("panel.tips")), h("p.small.mut", t("models.tip")));
  }

  return {
    main: h("div", h("h2.pt", t("step.models")), h("p.sub", t("models.sub")), peopleCard, moodCard),
    panel,
  };
}
