// S3 模特与样图：列表 + T18 二级档案（基本 / 工作照 / 服装 / 角色；付费 → T19）
import { h, menu, toast, seg, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, readonly } from "../store.js";
import * as M from "../model.js";
import { inp, fld, tagsInput, issuesList, emptyState, sel, poseById } from "./common.js";
import { editShell, editForm } from "../editlayer.js";
import { openRefPicker } from "../refimages.js";

const SOURCES = ["", "x", "xhs", "web", "ai", "own", "upload", "paste", "pinterest", "google", "huaban"];
const PERSON_TABS = [
  { id: "basic", label: "edit.tab.basic" },
  { id: "photos", label: "edit.tab.photos" },
  { id: "looks", label: "edit.tab.looks" },
  { id: "role", label: "edit.tab.role" },
  { id: "pay", label: "edit.tab.pay" },
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
      const x = M.normalizeModel({
        id, kind: "model", name: t("time.modelN", { n: M.models(q).length + 1 }),
        height: "", size: "", availFrom: "", availTo: "",
      });
      M.setLookCount(x, 1, i => t("time.lookN", { n: i + 1 }));
      q.people.push(x);
    });
    ctx.openEdit("person", id);
  };

  const ms = M.models(p);
  const openPerson = id => ctx.openEdit("person", id);
  const pcard = x => {
    const cover = M.modelCoverFile(x);
    const incomplete = M.modelProfileIncomplete(x);
    return h("div.pcard", {
      tabindex: 0,
      onclick: () => openPerson(x.id),
      onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); openPerson(x.id); } },
    },
      cover ? h("img.pcard-cover", { src: fileUrl(cover), alt: "" }) : h("div.pcard-cover.ph", (x.name || "?").slice(0, 1)),
      incomplete ? h("span.pcard-warn", { title: t("model.incompleteHelp") }, "!") : null,
      x.paid ? h("span.pcard-paid", t("model.paidBadge")) : null,
      h("div.nm", x.name || "—", x.alias ? h("span.mut", " · " + x.alias) : null),
      x.roleName ? h("div.role", x.roleName) : null,
      h("div.meta", [
        x.height && x.height + " cm",
        t("time.looksN", { n: (x.looks || []).length }),
        x.availTo && t("time.until", { t: x.availTo }),
      ].filter(Boolean).join(" · ")));
  };

  const peopleCard = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("time.models") + ` (${ms.length})`), h("span.spacer"),
      h("button.sm", { disabled: ro || null, onclick: addPerson }, "＋ " + t("time.addModel"))),
    h("div", { style: { height: "8px" } }),
    ms.length ? h("div.cards", ms.map(pcard)) : emptyState(t("time.noModels"), t("time.noModelsBody")));

  const addMoodViaPicker = async () => {
    if (ro) return toast(t("final.locked"));
    const items = await openRefPicker({ allowMood: false, multiple: true });
    if (!items?.length) return;
    let first = null;
    commit(q => {
      for (const it of items) {
        const id = M.uid();
        if (!first) first = id;
        q.mood.push(M.normalizeMoodItem({
          id, file: it.file, note: "", tags: [], aspects: [],
          source: it.source || "", url: it.url || "",
          x: 4 + Math.random() * 60, y: 4 + Math.random() * 50,
        }));
      }
    });
    if (first) ctx.openEdit("mood", first);
  };
  const zone = h("div.drop", t("ov.drop"), " ",
    h("button.sm", { disabled: ro || null, onclick: addMoodViaPicker }, "＋ " + t("ref.add")));

  const srcLabel = m => m.source ? t("mood.src." + m.source) : "";
  const openMood = id => ctx.openEdit("mood", id);
  st.aspect = st.aspect || "";
  const moodList = st.aspect
    ? p.mood.filter(m => (m.aspects || []).includes(st.aspect))
    : p.mood;

  // 说明条：首次展开，收起后记住
  const HELP_KEY = "pg.moodHelpCollapsed";
  if (st.moodHelpOpen == null) st.moodHelpOpen = localStorage.getItem(HELP_KEY) !== "1";
  const moodHelp = h("div.mood-help" + (st.moodHelpOpen ? ".open" : ""),
    h("div.row", h("b", t("mood.helpTitle")), h("span.spacer"),
      h("button.sm.ghost", { onclick: () => {
        st.moodHelpOpen = !st.moodHelpOpen;
        localStorage.setItem(HELP_KEY, st.moodHelpOpen ? "0" : "1");
        ctx.rerender();
      } }, st.moodHelpOpen ? t("mood.helpCollapse") : t("mood.helpExpand"))),
    st.moodHelpOpen ? h("div.mood-help-body",
      h("p", t("mood.helpBody")),
      h("ol.mood-steps",
        h("li", t("mood.step1")),
        h("li", t("mood.step2")),
        h("li", t("mood.step3")))) : null);

  const styleBox = h("div.mood-style",
    fld(t("mood.style"), h("textarea", {
      rows: 2, disabled: ro || null, placeholder: t("mood.stylePh"),
      value: p.overview.moodStyle || "",
      oninput: e => commit(q => { q.overview.moodStyle = e.target.value; }, { soft: true, group: "moodStyle" }),
      onchange: () => commit(q => q),
    })));

  const aspectFilter = h("div.row.wrap", { style: { gap: "6px", marginBottom: "8px" } },
    h("span.small.mut", t("mood.filterAsp")),
    h("span.chip" + (!st.aspect ? "" : ".plain"), { onclick: () => { st.aspect = ""; ctx.rerender(); } }, t("mood.aspAll")),
    ...M.MOOD_ASPECTS.map(a => h("span.chip" + (st.aspect === a ? "" : ".plain"), {
      onclick: () => { st.aspect = st.aspect === a ? "" : a; ctx.rerender(); },
    }, t("mood.asp." + a))));

  let board;
  if (!p.mood.length) board = null;
  else if (!moodList.length) board = h("p.mut", t("mood.noMatch"));
  else if (st.view === "grid") {
    board = h("div.mood.cards", moodList.map(m => moodGridCard(ctx, m, srcLabel, openMood, ro, p)));
  } else {
    board = h("div.mood.free");
    for (const m of moodList) {
      const it = h("div.it", { style: { left: (m.x ?? 5) + "%", top: (m.y ?? 5) + "%" },
        onclick: e => { if (e.detail === 2) openMood(m.id); } },
        h("img", { src: fileUrl(m.file), alt: "", draggable: "false" }),
        m.source === "ai" ? h("span.ai-badge", "AI") : null);
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
    moodHelp, styleBox, aspectFilter,
    h("div", { style: { height: "6px" } }), board || null,
    h("div", { style: { height: "10px" } }), zone);

  const panel = h("div",
    h("h4", t("panel.checks")), issuesList(p, M.checks(p).filter(c => c.page === "models"), ctx.go),
    h("h4", t("panel.tips")), h("p.small.mut", t("models.tip")));

  return {
    main: h("div", h("h2.pt", t("step.models")), h("p.sub", t("models.sub")), peopleCard, moodCard),
    panel,
  };
}

function moodGridCard(ctx, m, srcLabel, openMood, ro, p) {
  const usedIn = p.shots.filter(s => (s.refs || []).includes(m.file));
  const nos = M.shotNumbers(p);
  const urlOk = /^https?:\/\//i.test(m.url || "");
  return h("div.mood-card",
    h("div.mood-card-media", {
      tabindex: 0,
      onclick: () => openMood(m.id),
      onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); openMood(m.id); } },
    },
      h("img", { src: fileUrl(m.file), alt: m.note || "", loading: "lazy" }),
      m.source === "ai" ? h("span.ai-badge", "AI") : null),
    h("div.mood-card-side",
      fld(t("ov.note"), inp(() => m.note, (q, v) => { q.mood.find(x => x.id === m.id).note = v; }, { placeholder: t("mood.notePh") })),
      h("div.small.mut", { style: { marginBottom: "4px" } }, t("mood.aspects")),
      h("div.chips", M.MOOD_ASPECTS.map(a => h("span.chip" + ((m.aspects || []).includes(a) ? "" : ".plain"), {
        onclick: e => {
          e.stopPropagation();
          if (ro) return;
          commit(q => {
            const x = q.mood.find(z => z.id === m.id);
            const arr = x.aspects || (x.aspects = []);
            const i = arr.indexOf(a);
            if (i >= 0) arr.splice(i, 1); else arr.push(a);
          });
        },
      }, t("mood.asp." + a)))),
      h("p.small.mut", [
        srcLabel(m),
        urlOk ? h("a", { href: m.url, target: "_blank", rel: "noopener", onclick: e => e.stopPropagation() }, " ↗") : null,
      ].filter(Boolean)),
      h("div.row.wrap", { style: { gap: "4px", marginTop: "4px" } },
        h("span.small.mut", t("ov.usedIn") + "："),
        usedIn.length ? usedIn.map(s => h("span.chip", { onclick: e => { e.stopPropagation(); ctx.go("shots", { focus: s.id }); } }, nos.get(s.id))) : h("span.small.mut", "—"),
        h("button.sm", {
          disabled: !p.shots.length || ro || null,
          onclick: e => {
            e.stopPropagation();
            menu(e.currentTarget,
              M.orderedShots(p).map(s => ({ value: s.id, label: nos.get(s.id) })),
              { onPick: id2 => commit(q => {
                const s = q.shots.find(x => x.id === id2);
                s.refs = [...new Set([...(s.refs || []), m.file])];
              }) });
          },
        }, "＋ " + t("ov.setRef"))),
      h("button.sm.ghost", { onclick: e => { e.stopPropagation(); openMood(m.id); } }, t("mood.openEdit")),
    ));
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
  const lookAt = (q, i) => M.personById(q, x.id).looks[i];

  let body;
  if (tab === "basic") {
    body = editForm([
      h("div.grid2", fld(t("time.name"), set("name")), fld(t("model.alias"), set("alias"))),
      h("div.grid2", fld(t("model.gender"), set("gender")), fld(t("model.ageBand"), set("ageBand"))),
      h("div.grid2", fld(t("time.height") + " (cm)", set("height", "number")), fld(t("model.weight"), set("weight", "number"))),
      h("div.grid2", fld(t("model.bust"), set("bust")), fld(t("model.waist"), set("waist"))),
      h("div.grid2", fld(t("model.hips"), set("hips")), fld(t("time.size"), set("size"))),
      h("div.grid2", fld(t("model.topSize"), set("topSize")), fld(t("model.pantSize"), set("pantSize"))),
      fld(t("model.shoeSize"), set("shoeSize")),
      h("div.grid2", fld(t("model.hair"), set("hair")), fld(t("model.skin"), set("skin"))),
      fld(t("model.features"), set("features")),
      fld(t("model.contact"), set("contact"), t("model.contactHelp")),
      fld(t("model.note"), set("note")),
      h("div.grid2", fld(t("time.availFrom"), set("availFrom", "time")), fld(t("time.availTo"), set("availTo", "time"))),
      h("div.row", { style: { marginTop: "14px" } }, h("button.sm.danger", { disabled: ro || null, onclick: async () => {
        if (usedBy && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n: usedBy }), { danger: true, ok: t("common.delete") })) return;
        ctx.closeEdit();
        commit(q => { q.people = q.people.filter(y => y.id !== x.id); });
      } }, t("common.delete"))),
    ]);
  } else if (tab === "photos") {
    body = editForm([
      h("p.small.mut", t("model.photosHelp")),
      h("button.sm.primary", { disabled: ro || null, onclick: async () => {
        const items = await openRefPicker({ allowMood: false, multiple: true });
        if (!items?.length) return;
        commit(q => {
          const m = M.personById(q, x.id);
          const first = !m.photos.length;
          for (const it of items) m.photos.push({ file: it.file, note: "", cover: first && m.photos.length === 0 });
          if (first && m.photos[0]) m.photos[0].cover = true;
        });
      } }, "＋ " + t("ref.add")),
      !(x.photos || []).length ? h("p.mut", t("model.noPhotos")) : h("div.photo-grid", x.photos.map((ph, i) => h("div.photo-card",
        h("img", { src: fileUrl(ph.file), alt: "" }),
        ph.cover ? h("span.badge", t("model.cover")) : null,
        fld(t("model.photoNote"), inp(() => ph.note, (q, v) => { M.personById(q, x.id).photos[i].note = v; }, { placeholder: t("model.photoNotePh") })),
        h("div.row.wrap",
          h("button.sm", { disabled: ro || ph.cover || null, onclick: () => commit(q => {
            const m = M.personById(q, x.id);
            for (const p2 of m.photos) p2.cover = false;
            m.photos[i].cover = true;
          }) }, t("model.setCover")),
          h("button.sm.danger", { disabled: ro || null, onclick: () => commit(q => {
            const m = M.personById(q, x.id);
            const was = m.photos[i].cover;
            m.photos.splice(i, 1);
            if (was && m.photos[0]) m.photos[0].cover = true;
          }) }, t("common.delete"))),
      ))),
    ]);
  } else if (tab === "looks") {
    body = editForm([
      h("p.small.mut", t("model.looksHelp")),
      h("div.row", h("button.sm", { disabled: ro || null, onclick: () => commit(q => {
        const y = M.personById(q, x.id);
        y.looks.push(M.blankLook(t("time.lookN", { n: y.looks.length + 1 })));
      }) }, "＋ " + t("model.addLook"))),
      !(x.looks || []).length ? h("p.mut", t("model.noLooks")) : x.looks.map((l, i) => lookEditor(x, l, i, lookAt, ro, p)),
    ]);
  } else if (tab === "role") {
    body = editForm([
      fld(t("model.roleName"), set("roleName")),
      fld(t("model.rolePitch"), set("rolePitch")),
      fld(t("model.roleTraits"), tagsInput([...(x.roleTraits || [])], v => commit(q => { M.personById(q, x.id).roleTraits = v; }), t("model.roleTraitsPh"))),
      fld(t("model.roleRelations"), set("roleRelations")),
      fld(t("model.roleScenes"), set("roleScenes")),
      fld(t("model.roleNotes"), set("roleNotes")),
    ]);
  } else if (tab === "pay") {
    const marks = M.marksForPerson(p, x.id);
    const setWork = (k, type) => inp(() => x.work?.[k] ?? "", (q, v) => {
      const m = M.personById(q, x.id);
      if (!m.work) m.work = {};
      m.work[k] = v;
      if (k === "start") m.availFrom = v;
      if (k === "end") m.availTo = v;
    }, { type });
    const setMcn = k => inp(() => x.mcn?.[k] ?? "", (q, v) => {
      const m = M.personById(q, x.id);
      if (!m.mcn) m.mcn = {};
      m.mcn[k] = v;
    });
    body = editForm([
      h("label.row", h("input", {
        type: "checkbox", disabled: ro || null, checked: !!x.paid,
        onchange: e => commit(q => { M.personById(q, x.id).paid = e.target.checked; }),
      }), " ", t("model.paidToggle")),
      !x.paid ? h("p.small.mut", t("model.paidOffHelp")) : [
        h("h4", t("model.workHours")),
        h("div.grid2", fld(t("model.arrive"), setWork("arrive", "time")), fld(t("model.workStart"), setWork("start", "time"))),
        h("div.grid2", fld(t("model.workEnd"), setWork("end", "time")), fld(t("model.overtime"), sel(
          [["", "—"], ["hourly", t("model.ot.hourly")], ["none", t("model.ot.none")]],
          x.work?.overtime || "",
          v => commit(q => { const m = M.personById(q, x.id); if (!m.work) m.work = {}; m.work.overtime = v; }),
          { allowEmpty: false },
        ))),
        h("div.grid2", fld(t("model.lunchFrom"), setWork("lunchFrom", "time")), fld(t("model.lunchTo"), setWork("lunchTo", "time"))),
        fld(t("model.hourlyNote"), setWork("hourlyNote")),

        h("h4", t("model.poseList")),
        h("p.small.mut", t("model.poseListHelp")),
        h("div.row", h("button.sm", { disabled: ro || null, onclick: e => {
          const used = new Set(x.poseIds || []);
          menu(e.currentTarget,
            S.poses.filter(po => !used.has(po.id)).map(po => ({ value: po.id, label: po.name })),
            { onPick: id2 => commit(q => {
              const m = M.personById(q, x.id);
              if (!m.poseIds) m.poseIds = [];
              if (!m.poseIds.includes(id2)) m.poseIds.push(id2);
            }) });
        } }, "＋ " + t("model.addPose"))),
        !(x.poseIds || []).length ? h("p.mut", t("model.noPoses")) : h("div", (x.poseIds || []).map((pid, i) => {
          const po = poseById(pid);
          return h("div.row", { style: { marginBottom: "4px" } },
            h("span", `${i + 1}. ${po?.name || pid}`), h("span.spacer"),
            h("button.sm.ghost", { disabled: ro || i === 0 || null, onclick: () => commit(q => {
              const a = M.personById(q, x.id).poseIds; [a[i - 1], a[i]] = [a[i], a[i - 1]];
            }) }, "↑"),
            h("button.sm.ghost", { disabled: ro || i >= (x.poseIds.length - 1) || null, onclick: () => commit(q => {
              const a = M.personById(q, x.id).poseIds; [a[i + 1], a[i]] = [a[i], a[i + 1]];
            }) }, "↓"),
            h("button.sm.ghost", { disabled: ro || null, onclick: () => commit(q => {
              M.personById(q, x.id).poseIds.splice(i, 1);
            }) }, "×"));
        })),

        h("h4", t("model.marks")),
        h("p.small.mut", t("model.marksHelp")),
        h("div.row",
          h("span", t("model.marksN", { n: marks.length })),
          h("button.sm", { onclick: () => {
            if (marks[0]) ctx.go("layout", { setup: marks[0].setupId, selected: marks[0].id });
            else ctx.go("layout");
          } }, t("model.viewMarks"))),

        h("h4", t("model.mcn")),
        h("p.small.mut", t("model.mcnHelp")),
        fld(t("model.mcn.agency"), setMcn("agency")),
        h("div.grid2", fld(t("model.mcn.agent"), setMcn("agent")), fld(t("model.mcn.agentContact"), setMcn("agentContact"))),
        fld(t("model.mcn.contractNo"), setMcn("contractNo")),
        h("div.grid2", fld(t("model.mcn.licenseUse"), setMcn("licenseUse")), fld(t("model.mcn.licensePlatform"), setMcn("licensePlatform"))),
        fld(t("model.mcn.licenseUntil"), setMcn("licenseUntil")),
        h("div.grid2", fld(t("model.mcn.fee"), setMcn("fee")), fld(t("model.mcn.settle"), setMcn("settle"))),
        fld(t("model.mcn.note"), setMcn("note")),
      ],
    ]);
  } else {
    body = editForm([h("p.mut", "—")]);
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

  const cover = M.modelCoverFile(x);
  const panel = h("div",
    h("h4", t("edit.summary")),
    cover ? h("img", { src: fileUrl(cover), style: { width: "100%", borderRadius: "8px", marginBottom: "8px" }, alt: "" }) : null,
    h("p", h("b", x.name || "—"), x.roleName ? h("span.mut", " · " + x.roleName) : null),
    h("p.small.mut", [x.height && x.height + " cm", t("time.looksN", { n: (x.looks || []).length })].filter(Boolean).join(" · ") || "—"),
    M.modelProfileIncomplete(x) ? h("p.small", { style: { color: "var(--y)" } }, "▲ " + t("model.incompleteHelp")) : null,
    h("h4", t("edit.usedBy")),
    h("p.small.mut", usedBy ? t("edit.usedByN", { n: usedBy }) : t("ov.notUsed")),
    h("h4", t("panel.checks")),
    issuesList(p, M.checks(p).filter(c => c.page === "models"), ctx.go));

  return { main, panel, onKey: e => {
    if (e.key === "Enter" && !e.target.matches("input,textarea,select,button")) { e.preventDefault(); }
  } };
}

function lookEditor(person, l, i, lookAt, ro, p) {
  const srcOpts = M.LOOK_SOURCES.map(s => [s, s ? t("model.lookSrc." + s) : "—"]);
  const stOpts = M.LOOK_STATUSES.map(s => [s, t("model.lookSt." + s)]);
  return h("div.look-block",
    h("div.row", h("b", t("model.lookSet") + " " + (i + 1)), h("span.spacer"),
      h("button.sm.ghost", { disabled: ro || null, title: t("common.delete"), onclick: async () => {
        const n = p.shots.filter(s => (s.lookIds || []).includes(l.id)).length + p.scenes.filter(sc => (sc.lookIds || []).includes(l.id)).length;
        if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n }))) return;
        commit(q => { M.personById(q, person.id).looks.splice(i, 1); });
      } }, "×")),
    fld(t("model.lookName"), inp(() => l.name, (q, v) => { lookAt(q, i).name = v; })),
    h("div.grid2",
      fld(t("model.lookSource"), sel(srcOpts, l.source || "", v => commit(q => { lookAt(q, i).source = v; }), { allowEmpty: false })),
      fld(t("model.lookStatus"), sel(stOpts, l.status || "todo", v => commit(q => { lookAt(q, i).status = v; }), { allowEmpty: false }))),
    fld(t("model.lookOwner"), inp(() => l.owner, (q, v) => { lookAt(q, i).owner = v; })),
    h("h4", t("model.lookItems"), h("span", h("button.sm", { disabled: ro || null, onclick: () => commit(q => {
      lookAt(q, i).items.push(M.blankLookItem("top"));
    }) }, "＋"))),
    (l.items || []).map((it, j) => h("div.grid2", { style: { marginBottom: "6px" } },
      fld(t("model.part"), sel(M.LOOK_PARTS.map(pt => [pt, t("model.part." + pt)]), it.part, v => commit(q => { lookAt(q, i).items[j].part = v; }), { allowEmpty: false })),
      fld(t("model.color"), inp(() => it.color, (q, v) => { lookAt(q, i).items[j].color = v; })),
      fld(t("model.material"), inp(() => it.material, (q, v) => { lookAt(q, i).items[j].material = v; })),
      h("div.row", fld(t("model.itemNote"), inp(() => it.note, (q, v) => { lookAt(q, i).items[j].note = v; })),
        h("button.sm.ghost", { disabled: ro || null, onclick: () => commit(q => { lookAt(q, i).items.splice(j, 1); }) }, "×")),
    )),
    h("div.row", h("button.sm", { disabled: ro || null, onclick: async () => {
      const items = await openRefPicker({ allowMood: false, multiple: true });
      if (!items?.length) return;
      commit(q => { for (const it of items) lookAt(q, i).photos.push({ file: it.file, note: "" }); });
    } }, "＋ " + t("model.lookPhotos"))),
    (l.photos || []).length ? h("div.row.wrap", l.photos.map((ph, pi) => h("div.photo-thumb",
      h("img", { src: fileUrl(ph.file), alt: "" }),
      h("button.sm.ghost", { disabled: ro || null, onclick: () => commit(q => { lookAt(q, i).photos.splice(pi, 1); }) }, "×"),
    ))) : null,
  );
}

function renderMoodEdit(ctx, id) {
  const p = S.project, ro = readonly();
  const m = p.mood.find(x => x.id === id);
  if (!m) { ctx.closeEdit(); return render(ctx); }
  M.normalizeMoodItem(m);
  const list = p.mood;
  const idx = list.findIndex(x => x.id === id);
  const shotNos = M.shotNumbers(p);
  const usedIn = p.shots.filter(s => (s.refs || []).includes(m.file));
  const urlOk = /^https?:\/\//i.test(m.url || "");

  const body = editForm([
    h("img", { src: fileUrl(m.file), style: { width: "100%", maxWidth: "420px", borderRadius: "8px" }, alt: "" }),
    fld(t("ov.note"), inp(() => m.note, (q, v) => { q.mood.find(x => x.id === m.id).note = v; }, { placeholder: t("mood.notePh") })),
    h("h4", t("mood.aspects")),
    h("p.small.mut", t("mood.aspectsHelp")),
    h("div.chips", M.MOOD_ASPECTS.map(a => h("span.chip" + ((m.aspects || []).includes(a) ? "" : ".plain"), {
      onclick: () => {
        if (ro) return;
        commit(q => {
          const x = q.mood.find(z => z.id === m.id);
          const arr = x.aspects || (x.aspects = []);
          const i = arr.indexOf(a);
          if (i >= 0) arr.splice(i, 1); else arr.push(a);
        });
      },
    }, t("mood.asp." + a)))),
    fld(t("ov.tags"), tagsInput([...(m.tags || [])], v => commit(q => { q.mood.find(x => x.id === m.id).tags = v; }), t("ov.tagsPh"))),
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

  const aspTxt = M.moodAspectLabels(m.aspects, t).join("、");
  const panel = h("div",
    h("h4", t("edit.summary")),
    h("img", { src: fileUrl(m.file), style: { width: "100%", borderRadius: "8px" }, alt: "" }),
    h("p.small.mut", m.note || "—"),
    aspTxt ? h("p.small", t("mood.borrowLine", { list: aspTxt })) : null,
    h("h4", t("ov.usedIn")),
    usedIn.length ? h("div.chips", usedIn.map(s => h("span.chip", shotNos.get(s.id)))) : h("p.small.mut", t("ov.notUsed")));

  return { main, panel };
}
