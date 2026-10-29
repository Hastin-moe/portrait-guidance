// S2 场地与器材：场地 / 器材 / 道具 / 打包清单；器材二级编辑（T25）
import { h, menu, pickFiles, dropZone, toast, seg, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, uploadImages, readonly, saveLibrary } from "../store.js";
import * as M from "../model.js";
import { inp, area, fld, sel, issuesList, emptyState, gearTable, GEAR_TYPES } from "./common.js";
import { loadGearPresets, applyPreset, menuItemsFromPresets, allPresets, loadCatalogs, catalogCache, sizeLabel } from "../gear-presets.js";
import { editShell, editForm } from "../editlayer.js";

export { gearTable, GEAR_TYPES };

/** 器材「尺寸」列：从库选预设或手填 */
export async function openSizeEditor(anchor, path, gearId, ctx) {
  await loadGearPresets();
  const get = q => path === "venue" ? q.venue.gear : q.gear;
  const g = get(S.project).find(x => x.id === gearId);
  if (!g) return;
  const items = [
    { header: t("gear.fromLib") },
    ...menuItemsFromPresets(allPresets()),
    { header: t("gear.manualSize") },
    { value: "__manual__", label: t("gear.manualSize") },
    { value: "__clear__", label: t("gear.clearSize") },
  ];
  menu(anchor, items, {
    search: true,
    onPick: async id => {
      if (id === "__clear__") {
        commit(q => {
          const x = get(q).find(y => y.id === gearId);
          Object.assign(x, { presetId: "", shape: "", diameterCm: "", widthCm: "", heightCm: "", depthCm: "" });
        });
        return;
      }
      if (id === "__manual__") {
        const w = prompt(t("gear.widthCm"), g.widthCm || g.diameterCm || "");
        if (w == null) return;
        const h = prompt(t("gear.heightCm"), g.heightCm || "");
        if (h == null) return;
        commit(q => {
          const x = get(q).find(y => y.id === gearId);
          const nw = Number(w), nh = Number(h);
          if (nh > 0) Object.assign(x, { presetId: "", shape: "rect", widthCm: nw, heightCm: nh, diameterCm: "" });
          else Object.assign(x, { presetId: "", shape: "circle", diameterCm: nw, widthCm: "", heightCm: "" });
        });
        return;
      }
      const preset = allPresets().find(p => p.id === id);
      if (!preset) return;
      commit(q => { applyPreset(get(q).find(y => y.id === gearId), preset); });
      toast(t("gear.presetApplied", { name: preset.label || preset.model }));
    },
  });
}

export function render(ctx) {
  if (ctx.edit?.kind === "vgear" || ctx.edit?.kind === "ogear") {
    return renderGearEdit(ctx, ctx.edit.kind === "vgear" ? "venue" : "own", ctx.edit.id);
  }
  const p = S.project, v = p.venue, st = ctx.state, ro = readonly();
  st.tab = st.tab || "venue";
  const usage = M.gearUsedMax(p);
  const f = (k, label, opts) => fld(label, inp(() => v[k], (q, x) => { q.venue[k] = x; }, opts));
  const addPhotos = async files => { if (ro) return toast(t("final.locked")); const names = await uploadImages(files); commit(q => { q.venue.photos.push(...names); }); };

  let body;
  if (st.tab === "venue") {
    const libBtn = h("button.sm", { disabled: ro || null, onclick: e => menu(e.currentTarget,
      S.venues.map(x => ({ value: x.id, label: x.name || "—", hint: [x.w && x.d ? `${x.w}×${x.d} m` : "", x.address].filter(Boolean).join(" · ") })),
      { search: S.venues.length > 6, onPick: id => {
        const lib = S.venues.find(x => x.id === id);
        commit(q => { const keep = q.venue.photos; Object.assign(q.venue, JSON.parse(JSON.stringify(lib)), { libId: id, photos: lib.photos && lib.photos.length ? q.venue.photos : keep }); delete q.venue.id; });
        toast(t("venue.loaded"));
      } }) }, t("venue.fromLib") + (S.venues.length ? ` (${S.venues.length})` : ""));
    const saveLib = h("button.sm", { onclick: () => {
      const data = JSON.parse(JSON.stringify(v)); delete data.libId; data.photos = [];
      if (v.libId && S.venues.some(x => x.id === v.libId)) { Object.assign(S.venues.find(x => x.id === v.libId), data, { id: v.libId }); toast(t("venue.libUpdated")); }
      else { const id = M.uid(); S.venues.push({ ...data, id }); commit(q => { q.venue.libId = id; }, { force: true }); toast(t("venue.libSaved")); }
      saveLibrary("venues"); ctx.rerender();
    } }, v.libId ? t("venue.updateLib") : t("venue.saveLib"));

    body = h("div",
      h("div.card",
        h("div.row", h("h3", { style: { margin: 0 } }, t("venue.info")), h("span.spacer"), libBtn, saveLib),
        h("div.grid2", { style: { marginTop: "10px" } }, f("name", t("venue.name") + " *"), f("address", t("venue.address"))),
        h("div.grid2", { style: { marginTop: "10px" } }, f("contact", t("venue.contact")),
          fld(t("venue.inout"), seg([["in", t("venue.indoor")], ["out", t("venue.outdoor")]], v.indoor === false ? "out" : "in", x => commit(q => { q.venue.indoor = x === "in"; })))),
        h("div.grid3", { style: { marginTop: "10px" } }, f("w", t("venue.w") + " (m) *", { type: "number", min: 0, step: 0.1 }), f("d", t("venue.d") + " (m) *", { type: "number", min: 0, step: 0.1 }), f("h", t("venue.h") + " (m)", { type: "number", min: 0, step: 0.1 })),
        h("p.small.mut", t("venue.sizeHelp"))),
      h("div.card", h("h3", t("venue.conditions")),
        h("div.grid2", f("windowDir", t("venue.windowDir"), { placeholder: t("venue.windowDirPh") }), f("daylight", t("venue.daylight"), { placeholder: t("venue.daylightPh") })),
        h("div.grid2", { style: { marginTop: "10px" } }, f("surfaces", t("venue.surfaces"), { placeholder: t("venue.surfacesPh") }), f("power", t("venue.power"), { placeholder: t("venue.powerPh") })),
        fld(t("venue.zones"), area(() => v.zones, (q, x) => { q.venue.zones = x; }, { placeholder: t("venue.zonesPh"), rows: 2 }))),
      h("div.card", h("h3", t("venue.photos")),
        dropZone(h("div.drop", t("ov.drop"), " ", h("button.sm", { onclick: async () => addPhotos(await pickFiles()) }, t("ov.upload"))), addPhotos),
        v.photos.length ? h("div.mood", { style: { marginTop: "10px" } }, v.photos.map((ph, i) => h("div.it", h("img", { src: fileUrl(ph), alt: "" }),
          ro ? null : h("button.sm", { style: { position: "absolute", top: "4px", right: "4px" }, onclick: () => commit(q => { q.venue.photos.splice(i, 1); }) }, "×")))) : null));
  } else if (st.tab === "gear") {
    const addBlank = (own) => commit(q => {
      const row = { id: M.uid(), type: "light", model: "", qty: 1, presetId: "", shape: "", diameterCm: "", widthCm: "", heightCm: "", depthCm: "" };
      if (own) { row.source = "own"; q.gear.push(row); } else q.venue.gear.push(row);
    });
    const addLib = async (ev, own) => {
      const anchor = ev.currentTarget;
      const anchorRect = anchor.getBoundingClientRect();
      await loadGearPresets();
      menu(anchor, menuItemsFromPresets(allPresets()), {
        search: true,
        anchorRect,
        onPick: id => {
          const preset = allPresets().find(x => x.id === id);
          if (!preset) return;
          commit(q => {
            const row = { id: M.uid(), type: "modifier", model: "", qty: 1, source: own ? "own" : undefined, presetId: "", shape: "", diameterCm: "", widthCm: "", heightCm: "", depthCm: "" };
            applyPreset(row, preset);
            if (own) q.gear.push(row); else q.venue.gear.push(row);
          });
          toast(t("gear.presetApplied", { name: preset.label || preset.model }));
        },
      });
    };
    body = h("div",
      h("div.card", h("div.row", h("h3", { style: { margin: 0 } }, t("gear.venueGear") + ` (${p.venue.gear.length})`), h("span.spacer"),
        h("button.sm", { disabled: ro || null, onclick: e => addLib(e, false) }, t("gear.addFromLib")),
        h("button.sm", { disabled: ro || null, onclick: () => addBlank(false) }, "＋ " + t("gear.add"))),
        h("p.small.mut", t("venue.gearHelp")),
        p.venue.gear.length ? gearTable(p.venue.gear, "venue", ctx, { usage }) : h("p.small.mut", t("gear.noVenueGear"))),
      h("div.card", h("div.row", h("h3", { style: { margin: 0 } }, t("gear.ownGear") + ` (${p.gear.length})`), h("span.spacer"),
        h("button.sm", { disabled: ro || null, onclick: e => addLib(e, true) }, t("gear.addFromLib")),
        h("button.sm", { disabled: ro || null, onclick: () => addBlank(true) }, "＋ " + t("gear.add"))),
        h("div", { style: { height: "8px" } }),
        p.gear.length ? gearTable(p.gear, "own", ctx, { showSource: true, usage }) : emptyState(t("gear.noOwn"), t("gear.noOwnBody"))),
      h("p.small.mut", t("gear.usedHelp")));
  } else if (st.tab === "props") {
    const props = p.props;
    body = h("div.card",
      h("div.row", h("h3", { style: { margin: 0 } }, t("gear.props") + ` (${props.length})`), h("span.spacer"),
        h("span.small.mut", t("gear.readyN", { n: props.filter(x => x.status === "ready").length, total: props.length })),
        h("button.sm", { disabled: ro || null, onclick: () => commit(q => { q.props.push({ id: M.uid(), name: "", qty: 1, size: "", source: "own", owner: "", status: "todo" }); }) }, "＋ " + t("gear.addProp"))),
      h("div", { style: { height: "8px" } }),
      props.length ? h("table.grid",
        h("tr", ["prop.name", "gear.qty", "prop.size", "gear.source", "prop.owner", "prop.status", ""].map(k => h("th", k ? t(k) : ""))),
        props.map(x => {
          const upd = (k, val) => commit(q => { q.props.find(y => y.id === x.id)[k] = val; });
          return h("tr",
            h("td", inp(() => x.name, (q, v) => { q.props.find(y => y.id === x.id).name = v; }, { placeholder: t("prop.namePh") })),
            h("td.num", inp(() => x.qty, (q, v) => { q.props.find(y => y.id === x.id).qty = v; }, { type: "number", min: 0 })),
            h("td", inp(() => x.size, (q, v) => { q.props.find(y => y.id === x.id).size = v; })),
            h("td", sel([["own", t("gear.src.own")], ["rent", t("gear.src.rent")], ["venue", t("gear.src.venue")]], x.source, v => upd("source", v), { allowEmpty: false })),
            h("td", inp(() => x.owner, (q, v) => { q.props.find(y => y.id === x.id).owner = v; })),
            h("td", sel([["todo", t("prop.todo")], ["ready", t("prop.ready")]], x.status, v => upd("status", v), { allowEmpty: false })),
            h("td", h("button.sm.ghost", { disabled: ro || null, onclick: async () => {
              const n = p.shots.filter(s => (s.props || []).includes(x.id)).length + p.layout.setups.reduce((a, s) => a + s.elements.filter(e => e.ref === x.id).length, 0);
              if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affects", { n }), { danger: true, ok: t("common.delete") })) return;
              commit(q => { q.props = q.props.filter(y => y.id !== x.id); for (const s of q.shots) s.props = (s.props || []).filter(id => id !== x.id); for (const s of q.layout.setups) for (const e of s.elements) if (e.ref === x.id) e.ref = ""; });
            } }, "×")));
        })) : emptyState(t("gear.noProps"), t("gear.noPropsBody")));
  } else {
    const items = [
      ...p.gear.map(g => ({ key: "g:" + g.id, label: g.model || t("gear.type." + g.type), meta: `×${g.qty || 0} · ${t("gear.src." + (g.source || "own"))}` })),
      ...p.props.filter(x => x.source !== "venue").map(x => ({ key: "p:" + x.id, label: x.name || "—", meta: `×${x.qty || 0}${x.owner ? " · " + x.owner : ""}` })),
    ];
    body = h("div.card",
      h("div.row", h("h3", { style: { margin: 0 } }, t("gear.packing")), h("span.spacer"),
        h("span.small.mut", t("gear.packedN", { n: items.filter(i => p.packing[i.key]).length, total: items.length })),
        h("button.sm", { onclick: () => printPacking(p, items) }, t("gear.print"))),
      h("p.small.mut", t("gear.packingHelp")),
      items.length ? h("div", items.map(i => h("label.row.pack-row", { style: { padding: "6px 0", borderBottom: "1px solid var(--line)" } },
        h("input", { type: "checkbox", checked: !!p.packing[i.key], onchange: e => commit(q => { q.packing[i.key] = e.target.checked; }, { force: true }) }),
        h("span", i.label),
        h("span.chip" + (p.packing[i.key] ? "" : ".plain"), p.packing[i.key] ? t("gear.packedYes") : t("gear.packTick")),
        h("span.small.mut", i.meta)))) : h("p.mut", t("gear.packingEmpty")));
  }

  const list = M.checks(p).filter(c => c.page === "site");
  const perSetup = p.layout.setups.map(s => {
    const u = M.gearUsage(p, s.id);
    return h("div", { style: { marginBottom: "8px" } }, h("div.small", h("b", t("layout.setup") + " " + s.name)),
      u.size ? h("div.chips", [...u].map(([k, n]) => { const g = M.gearByKey(p, k); return h("span.chip.plain", `${g ? g.model || t("gear.type." + g.type) : "?"} ×${n}`); }))
        : h("div.small.mut", t("gear.noneUsed")));
  });
  const panel = h("div",
    h("h4", t("panel.checks")), issuesList(p, list, ctx.go),
    st.tab === "venue" ? [h("h4", t("venue.hints")),
      h("ul.small.mut", { style: { paddingLeft: "18px", margin: 0 } },
        v.daylight ? h("li", t("venue.hintDaylight", { v: v.daylight })) : null,
        v.windowDir ? h("li", t("venue.hintWindow", { v: v.windowDir })) : null,
        v.power ? h("li", t("venue.hintPower", { v: v.power })) : null,
        !v.daylight && !v.windowDir && !v.power ? h("li", t("venue.hintNone")) : null)] : null,
    h("h4", t("gear.bySetup")), perSetup);

  return {
    main: h("div",
      h("h2.pt", t("step.site")), h("p.sub", t("site.sub")),
      h("div.toolbar", seg([
        ["venue", t("site.tabVenue")],
        ["gear", t("gear.tabGear")],
        ["props", t("gear.tabProps")],
        ["packing", t("gear.tabPacking")],
      ], st.tab, v2 => { st.tab = v2; ctx.rerender(); })),
      body),
    panel,
  };
}

function printPacking(p, items) {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t("gear.packing"))}</title><style>body{font:14px -apple-system,sans-serif;padding:24px}li{list-style:none;padding:6px 0;border-bottom:1px solid #ddd}li::before{content:"☐  "}</style>
  <h2>${esc(p.name)} · ${esc(t("gear.packing"))}</h2><p>${esc(p.time.date || "")}</p><ul>${items.map(i => `<li>${esc(i.label)} <small>${esc(i.meta)}</small></li>`).join("")}</ul><script>print()<\/script>`);
  w.document.close();
}

function renderGearEdit(ctx, path, gearId) {
  const p = S.project, ro = readonly();
  const get = q => path === "venue" ? q.venue.gear : q.gear;
  const list = get(p);
  const g = list.find(x => x.id === gearId);
  if (!g) { ctx.closeEdit(); return render(ctx); }
  const idx = list.findIndex(x => x.id === gearId);
  const editKind = path === "venue" ? "vgear" : "ogear";
  const key = (path === "venue" ? "v:" : "o:") + g.id;
  const usage = M.gearUsedMax(p).get(key) || 0;

  // 目录异步加载：首次触发后重绘
  if (!catalogCache()) {
    loadCatalogs().then(() => ctx.rerender());
  }
  const cat = (catalogCache() && g.presetId && catalogCache().get(g.presetId)) || null;
  const lines = M.gearCatalogLines(cat);
  const sizeTxt = sizeLabel(g) || (cat ? M.gearCatalogLines(cat).find(l => l.key === "size")?.value : "") || "—";

  const set = (k, type) => inp(() => g[k], (q, v) => { get(q).find(x => x.id === g.id)[k] = v; }, { type });

  const body = editForm([
    h("div.grid2",
      fld(t("gear.type"), sel(GEAR_TYPES.map(k => [k, t("gear.type." + k)]), g.type, v => commit(q => { get(q).find(x => x.id === g.id).type = v; }), { allowEmpty: false })),
      fld(t("gear.qty"), set("qty", "number"))),
    fld(t("gear.model"), set("model")),
    path === "own" ? fld(t("gear.source"), sel([["own", t("gear.src.own")], ["rent", t("gear.src.rent")]], g.source || "own", v => commit(q => { get(q).find(x => x.id === g.id).source = v; }), { allowEmpty: false })) : null,
    h("h4", t("gear.catalogParams")),
    h("p.small.mut", t("gear.catalogHelp")),
    h("table.grid",
      h("tr", h("th", t("gear.size")), h("td", sizeTxt)),
      lines.filter(l => l.key !== "size").map(l => h("tr",
        h("th", t("gear.cat." + l.key)),
        h("td", l.link ? h("a", { href: l.value, target: "_blank", rel: "noopener" }, l.value) : l.value)))),
    !cat && g.presetId ? h("p.small.mut", t("gear.catalogMissing")) : null,
    !g.presetId ? h("p.small.mut", t("gear.noPreset")) : null,
    h("div.row", { style: { marginTop: "12px" } },
      h("button.sm", {
        disabled: ro || null,
        onclick: async e => { await openSizeEditor(e.currentTarget, path, g.id, ctx); },
      }, t("gear.sizeEdit")),
      h("button.sm.danger", { disabled: ro || null, onclick: async () => {
        const n = p.layout.setups.reduce((a, s) => a + s.elements.filter(e => e.ref === key || e.modifierRef === key).length, 0);
        if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affectsLayout", { n }), { danger: true, ok: t("common.delete") })) return;
        ctx.closeEdit();
        commit(q => {
          const arr = get(q); arr.splice(arr.findIndex(x => x.id === g.id), 1);
          for (const s of q.layout.setups) for (const e of s.elements) {
            if (e.ref === key) e.ref = "";
            if (e.modifierRef === key) e.modifierRef = "";
          }
        });
      } }, t("common.delete"))),
  ]);

  const main = editShell({
    crumb: `${t("step.site")} / ${g.model || t("gear.type." + g.type)}`,
    onBack: () => ctx.closeEdit(),
    onPrev: idx > 0 ? () => ctx.openEdit(editKind, list[idx - 1].id) : null,
    onNext: idx >= 0 && idx < list.length - 1 ? () => ctx.openEdit(editKind, list[idx + 1].id) : null,
    body,
  });
  const panel = h("div",
    h("h4", t("edit.summary")),
    h("p", h("b", g.model || "—")),
    h("p.small.mut", t("gear.type." + g.type) + (path === "own" ? " · " + t("gear.src." + (g.source || "own")) : " · " + t("gear.src.venue"))),
    h("p.small.mut", t("gear.used") + ` ${usage} / ${Number(g.qty) || 0}`),
    g.presetId ? h("p.small.mut", "ID · " + g.presetId) : null);
  return { main, panel };
}
