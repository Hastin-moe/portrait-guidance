// S3 场地：场地库、场地条件、场地提供器材（F10–F11）
import { h, menu, pickFiles, dropZone, toast, seg, confirmDlg } from "../ui.js";
import { t } from "../i18n.js";
import { S, commit, fileUrl, uploadImages, readonly, saveLibrary } from "../store.js";
import * as M from "../model.js";
import { inp, area, fld, sel, issuesList } from "./common.js";

export const GEAR_TYPES = ["light", "modifier", "stand", "backdrop", "reflector", "camera", "lens", "trigger", "other"];

export function gearTable(rows, path, ctx, { showSource = false, usage = null } = {}) {
  const ro = readonly();
  const get = q => path === "venue" ? q.venue.gear : q.gear;
  return h("table.grid",
    h("tr", h("th", t("gear.type")), h("th", t("gear.model")), h("th", t("gear.qty")), showSource ? h("th", t("gear.source")) : null, usage ? h("th", t("gear.used")) : null, h("th", "")),
    rows.map(g => {
      const u = usage ? usage.get((path === "venue" ? "v:" : "o:") + g.id) || 0 : 0;
      const over = u > (Number(g.qty) || 0);
      return h("tr" + (over ? ".warn" : ""),
        h("td", sel(GEAR_TYPES.map(k => [k, t("gear.type." + k)]), g.type, v => commit(q => { get(q).find(x => x.id === g.id).type = v; }), { allowEmpty: false })),
        h("td", inp(() => g.model, (q, v) => { get(q).find(x => x.id === g.id).model = v; }, { placeholder: t("gear.modelPh") })),
        h("td.num", inp(() => g.qty, (q, v) => { get(q).find(x => x.id === g.id).qty = v; }, { type: "number", min: 0 })),
        showSource ? h("td", sel([["own", t("gear.src.own")], ["rent", t("gear.src.rent")]], g.source || "own", v => commit(q => { get(q).find(x => x.id === g.id).source = v; }), { allowEmpty: false })) : null,
        usage ? h("td", h("span.used" + (over ? ".over" : ""), `${u} / ${Number(g.qty) || 0}`)) : null,
        h("td", h("button.sm.ghost", { disabled: ro || null, title: t("common.delete"), onclick: async () => {
          const key = (path === "venue" ? "v:" : "o:") + g.id;
          const n = S.project.layout.setups.reduce((a, s) => a + s.elements.filter(e => e.ref === key).length, 0);
          if (n && !await confirmDlg(t("common.deleteTitle"), t("ref.affectsLayout", { n }), { danger: true, ok: t("common.delete") })) return;
          commit(q => { const arr = get(q); arr.splice(arr.findIndex(x => x.id === g.id), 1); for (const s of q.layout.setups) for (const e of s.elements) if (e.ref === key) e.ref = ""; });
        } }, "×")));
    }));
}

export function render(ctx) {
  const p = S.project, v = p.venue, ro = readonly();
  const f = (k, label, opts) => fld(label, inp(() => v[k], (q, x) => { q.venue[k] = x; }, opts));
  const addPhotos = async files => { if (ro) return toast(t("final.locked")); const names = await uploadImages(files); commit(q => { q.venue.photos.push(...names); }); };

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

  const info = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("venue.info")), h("span.spacer"), libBtn, saveLib),
    h("div.grid2", { style: { marginTop: "10px" } }, f("name", t("venue.name") + " *"), f("address", t("venue.address"))),
    h("div.grid2", { style: { marginTop: "10px" } }, f("contact", t("venue.contact")),
      fld(t("venue.inout"), seg([["in", t("venue.indoor")], ["out", t("venue.outdoor")]], v.indoor === false ? "out" : "in", x => commit(q => { q.venue.indoor = x === "in"; })))),
    h("div.grid3", { style: { marginTop: "10px" } }, f("w", t("venue.w") + " (m) *", { type: "number", min: 0, step: 0.1 }), f("d", t("venue.d") + " (m) *", { type: "number", min: 0, step: 0.1 }), f("h", t("venue.h") + " (m)", { type: "number", min: 0, step: 0.1 })),
    h("p.small.mut", t("venue.sizeHelp")));
  const cond = h("div.card", h("h3", t("venue.conditions")),
    h("div.grid2", f("windowDir", t("venue.windowDir"), { placeholder: t("venue.windowDirPh") }), f("daylight", t("venue.daylight"), { placeholder: t("venue.daylightPh") })),
    h("div.grid2", { style: { marginTop: "10px" } }, f("surfaces", t("venue.surfaces"), { placeholder: t("venue.surfacesPh") }), f("power", t("venue.power"), { placeholder: t("venue.powerPh") })),
    fld(t("venue.zones"), area(() => v.zones, (q, x) => { q.venue.zones = x; }, { placeholder: t("venue.zonesPh"), rows: 2 })));
  const photos = h("div.card", h("h3", t("venue.photos")),
    dropZone(h("div.drop", t("ov.drop"), " ", h("button.sm", { onclick: async () => addPhotos(await pickFiles()) }, t("ov.upload"))), addPhotos),
    v.photos.length ? h("div.mood", { style: { marginTop: "10px" } }, v.photos.map((ph, i) => h("div.it", h("img", { src: fileUrl(ph), alt: "" }),
      ro ? null : h("button.sm", { style: { position: "absolute", top: "4px", right: "4px" }, onclick: () => commit(q => { q.venue.photos.splice(i, 1); }) }, "×")))) : null);
  const gear = h("div.card",
    h("div.row", h("h3", { style: { margin: 0 } }, t("venue.gear") + ` (${v.gear.length})`), h("span.spacer"),
      h("button.sm", { disabled: ro || null, onclick: () => commit(q => { q.venue.gear.push({ id: M.uid(), type: "light", model: "", qty: 1 }); }) }, "＋ " + t("gear.add"))),
    h("p.small.mut", t("venue.gearHelp")),
    v.gear.length ? gearTable(v.gear, "venue", ctx) : null);

  const list = M.checks(p).filter(c => c.page === "site");
  const panel = h("div", h("h4", t("panel.checks")), issuesList(p, list, ctx.go),
    h("h4", t("venue.hints")),
    h("ul.small.mut", { style: { paddingLeft: "18px", margin: 0 } },
      v.daylight ? h("li", t("venue.hintDaylight", { v: v.daylight })) : null,
      v.windowDir ? h("li", t("venue.hintWindow", { v: v.windowDir })) : null,
      v.power ? h("li", t("venue.hintPower", { v: v.power })) : null,
      !v.daylight && !v.windowDir && !v.power ? h("li", t("venue.hintNone")) : null));
  return { main: h("div", h("h2.pt", t("step.site")), h("p.sub", t("venue.sub")), info, cond, gear, photos), panel };
}
