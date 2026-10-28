import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../web/js/model.js";

function sample() {
  const p = M.blankProject("春日窗边人像");
  p.overview.theme = "窗光";
  p.time.date = "2026-11-08"; p.time.start = "10:00"; p.time.end = "13:00"; p.time.bufferMin = 10;
  const mia = { id: "mia", kind: "model", name: "林夏", availTo: "" }; M.setLookCount(mia, 3);
  const emma = { id: "emma", kind: "model", name: "周可" }; M.setLookCount(emma, 1);
  p.people.push(mia, emma);
  Object.assign(p.venue, { name: "白棚", w: 8, d: 6 });
  p.venue.gear.push({ id: "g1", type: "light", model: "Godox AD600", qty: 1 });
  const A = p.layout.setups[0];
  const B = { id: "B", name: "B", elements: [] }; p.layout.setups.push(B);
  A.elements.push({ ...M.newElement("light", 1, 1), ref: "v:g1" }, { ...M.newElement("light", 2, 1), ref: "v:g1" }, M.newElement("camera", 4, 4));
  const s1 = M.newScene(p, "窗边"); s1.setupId = A.id; s1.personIds = ["mia"]; s1.lookIds = [mia.looks[0].id];
  const s2 = M.newScene(p, "沙发"); s2.setupId = "B"; s2.personIds = ["mia", "emma"]; s2.lookIds = [];
  const a = M.newShot(p, s1.id); a.minutes = 15; a.refs = ["x.jpg"];
  const b = M.newShot(p, s1.id); b.minutes = 10;
  const c = M.newShot(p, s1.id); c.minutes = 10; c.priority = "opt"; c.lookIds = [mia.looks[2].id];
  const d = M.newShot(p, s2.id); d.minutes = 20;
  const e = M.newShot(p, s2.id); e.minutes = 15; e.priority = "opt";
  return { p, A, s1, s2, shots: [a, b, c, d, e], mia, emma };
}

test("time helpers", () => {
  assert.equal(M.toMin("09:30"), 570);
  assert.equal(M.fmtMin(570), "09:30");
  assert.equal(M.toMin("bad"), null);
});

test("nowIso and wall clock helpers", () => {
  const iso = M.nowIso("Asia/Shanghai");
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(M.wallFromMin("2026-11-08", 615), "2026-11-08 10:15:00");
  const wall = M.isoToWall("2026-11-08T10:15:00+08:00", "Asia/Shanghai");
  assert.equal(wall, "2026-11-08 10:15:00");
});

test("timeWindows uses actual times and skips skipped shots", () => {
  const { p, shots } = sample();
  shots[0].status = "done";
  shots[0].startedAt = "2026-11-08T10:02:00+08:00";
  shots[0].completedAt = "2026-11-08T10:12:00+08:00";
  shots[1].status = "skipped";
  const tw = M.timeWindows(p, {
    poseName: () => "回眸",
    sizeLabel: () => "特写",
    setupName: () => "布光 A",
    cameraName: () => "机位 1",
    personName: () => "林夏",
    lookName: () => "白衬衫",
    propName: () => "",
  });
  assert.equal(tw.timezone, "Asia/Shanghai");
  assert.ok(tw.windows.length >= 1);
  assert.equal(tw.windows[0].start, "2026-11-08 10:02:00");
  assert.equal(tw.windows[0].end, "2026-11-08 10:12:00");
  assert.ok(!tw.windows.some(w => w.shot_id && shots[1] && false));
  const ids = tw.windows.map(w => w.shot_id);
  const nos = M.shotNumbers(p);
  assert.ok(!ids.includes(nos.get(shots[1].id)));
});

test("normalize fills defaults and keeps one setup", () => {
  const p = M.normalize({});
  assert.equal(p.layout.setups.length, 1);
  assert.equal(p.layout.activeSetup, p.layout.setups[0].id);
  assert.deepEqual(p.overview.keywords, []);
  assert.equal(p.time.timezone, "Asia/Shanghai");
  const withMood = M.normalize({ mood: [{ id: "m1", file: "a.jpg" }] });
  assert.equal(withMood.mood[0].source, "");
  assert.equal(withMood.mood[0].url, "");
});

test("shots inherit from scene unless overridden", () => {
  const { p, s1, shots, mia } = sample();
  const r = M.resolveShot(p, shots[0]);
  assert.equal(r.setupId, s1.setupId);
  assert.equal(r.own.setupId, false);
  assert.deepEqual(r.lookIds, [mia.looks[0].id]);
  const r3 = M.resolveShot(p, shots[2]);
  assert.equal(r3.own.lookIds, true);
  assert.deepEqual(r3.lookIds, [mia.looks[2].id]);
});

test("shot numbering by scene and order, locked numbers stay", () => {
  const { p, shots } = sample();
  let n = M.shotNumbers(p);
  assert.equal(n.get(shots[0].id), "S01-01");
  assert.equal(n.get(shots[4].id), "S02-02");
  M.moveShot(p, shots[1].id, -1);
  n = M.shotNumbers(p);
  assert.equal(n.get(shots[1].id), "S01-01");
  shots[3].lockedNo = "X-1";
  assert.equal(M.shotNumbers(p).get(shots[3].id), "X-1");
});

test("schedule inserts buffers on lighting or look change and computes over time", () => {
  const { p, shots } = sample();
  const s = M.schedule(p);
  const buffers = s.items.filter(i => i.type === "buffer");
  // c 换造型(look) ；d 换布光+造型
  assert.equal(buffers.length, 2);
  assert.deepEqual(buffers[0].reasons, ["look"]);
  assert.deepEqual(buffers[1].reasons.sort(), ["light", "look"]);
  assert.equal(s.end - s.start, 15 + 10 + 10 + 10 + 10 + 20 + 15);
  assert.equal(s.overMin, 0);
  p.time.end = "11:00";
  const s2 = M.schedule(p);
  assert.equal(s2.overMin, 30);
  assert.ok(s2.cuttable.includes(shots[4].id));
});

test("locks create gaps and report conflicts", () => {
  const { p, shots } = sample();
  p.schedule.locks[shots[1].id] = "10:30";
  let s = M.schedule(p);
  assert.ok(s.items.some(i => i.type === "gap" && i.end === M.toMin("10:30")));
  p.schedule.locks[shots[1].id] = "10:05";
  s = M.schedule(p);
  assert.equal(s.conflicts.length, 1);
});

test("model availability limits the window", () => {
  const { p, mia } = sample();
  mia.availTo = "12:00";
  const a = M.availability(p);
  assert.equal(a.to, M.toMin("12:00"));
  assert.equal(a.limitedBy, "mia");
});

test("gearUsage counts boards and light modifiers", () => {
  const p = M.blankProject("x");
  p.gear.push(
    { id: "b1", type: "absorb", model: "poly", qty: 1 },
    { id: "m1", type: "modifier", model: "QR-P90T", qty: 1, diameterCm: 90, depthCm: 43 },
  );
  const A = p.layout.setups[0];
  A.elements.push(
    { ...M.newElement("board", 1, 1), ref: "o:b1" },
    { ...M.newElement("board", 2, 1), ref: "o:b1" },
    { ...M.newElement("light", 3, 1), ref: "", modifierRef: "o:m1" },
  );
  const u = M.gearUsage(p, A.id);
  assert.equal(u.get("o:b1"), 2);
  assert.equal(u.get("o:m1"), 1);
  const c = M.checks(p);
  assert.ok(c.some(x => x.code === "gearOver" && x.id === "o:b1" && x.used === 2 && x.qty === 1));
  const sz = M.modifierSizeM(p.gear[1]);
  assert.equal(sz.width, 0.9);
  assert.ok(Math.abs(sz.depth - 0.43) < 1e-9);
});

test("checks: gear over-use, unbound, look mismatch, missing refs", () => {
  const { p, shots, emma } = sample();
  let c = M.checks(p);
  assert.ok(c.some(x => x.code === "gearOver" && x.used === 2 && x.qty === 1 && x.page === "site"));
  assert.ok(c.some(x => x.code === "setupEmpty" && x.setupId === "B" && x.page === "layout"));
  assert.ok(!c.some(x => x.level === "error"), JSON.stringify(c.filter(x => x.level === "error")));
  shots[0].lookIds = [emma.looks[0].id];
  p.layout.setups[0].elements.push(M.newElement("prop", 3, 3));
  c = M.checks(p);
  assert.ok(c.some(x => x.code === "lookMismatch" && x.id === shots[0].id));
  assert.ok(c.some(x => x.code === "unbound"));
  assert.ok(c.some(x => x.code === "noRef" && x.id === shots[1].id));
  assert.ok(!c.some(x => x.code === "noRef" && x.id === shots[0].id));
});

test("checks: required fields", () => {
  const p = M.blankProject("");
  const codes = M.checks(p).map(x => x.code);
  for (const k of ["name", "date", "venue", "venueSize"]) assert.ok(codes.includes(k), k);
  const { p: q, s1 } = sample();
  s1.setupId = ""; s1.personIds = [];
  const c = M.checks(q);
  assert.ok(c.some(x => x.code === "shotSetup"));
  assert.ok(c.some(x => x.code === "shotModel"));
});

test("step status and completeness", () => {
  const { p } = sample();
  const st = M.stepStatus(p);
  assert.equal(st.basics, 2);
  assert.equal(st.site, 1);       // gear over-use → site warn
  assert.equal(st.models, 2);
  assert.equal(st.poses, 0);      // 镜头尚无动作/要点
  assert.equal(st.shots, 2);
  assert.equal(st.layout, 1);     // setupEmpty on B
  assert.equal(st.schedule, 2);
  assert.equal(st.progress, 0);
  assert.equal(st.export, 1);
  assert.equal(M.stepStatus(M.blankProject("")).basics, 0);
  assert.ok(M.completeness(p) > 50);
  assert.ok(!("overview" in st) && !("gear" in st));
  assert.deepEqual(M.STEPS, ["basics", "site", "models", "poses", "shots", "layout", "schedule", "progress", "export"]);
});

test("move shot to another scene renumbers both", () => {
  const { p, s2, shots } = sample();
  M.moveShotToScene(p, shots[0].id, s2.id);
  const n = M.shotNumbers(p);
  assert.equal(n.get(shots[1].id), "S01-01");
  assert.equal(n.get(shots[0].id), "S02-03");
});

test("sort scenes groups by setup", () => {
  const { p, s1, s2, A } = sample();
  p.scenes = [s2, s1];
  M.sortScenesForShoot(p);
  assert.equal(p.scenes[0].setupId, A.id);
});

test("distances and fov", () => {
  const { p, A } = sample();
  A.elements.push(M.newElement("person", 4, 1));
  const cam = A.elements.find(e => e.kind === "camera");
  const d = M.distances(p, A.id, cam);
  assert.equal(d[0].kind, "cameraPerson");
  assert.equal(Math.round(d[0].d * 10) / 10, 3);
  assert.equal(Math.round(M.fovDeg(50)), 40);
});

import { convertGrok } from "../web/js/import_grok.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "demo-project.json");

test("convertGrok maps demo project core fields", () => {
  const raw = JSON.parse(readFileSync(FIX, "utf8"));
  const { project: p, poses, images, report } = convertGrok(raw);
  assert.equal(p.name, "窗边人像试拍 · 样例策划案");
  assert.equal(p.time.date, "2026-10-28");
  assert.equal(p.time.timezone, "Asia/Shanghai");
  assert.equal(p.venue.name, "小影棚 · 北窗");
  assert.equal(p.venue.w, 8);
  assert.equal(p.venue.d, 6);
  assert.equal(p.venue.zones, raw.site_conditions);
  assert.equal(p.overview.theme, raw.notes);
  const models = M.models(p);
  assert.equal(models.length, 1);
  assert.equal(models[0].name, "模特 A");
  assert.equal(models[0].looks[0].name, "白衬衫");
  assert.equal(p.people.filter(x => x.kind === "staff").length, 2);
  const qr = p.gear.find(g => /QR-P90T/.test(g.model));
  assert.ok(qr);
  assert.equal(qr.type, "modifier");
  assert.equal(qr.diameterCm, 90);
  assert.equal(qr.presetId, "godox-qr-p90t");
  const board = p.gear.find(g => /聚苯/.test(g.model));
  assert.ok(board);
  assert.equal(board.type, "absorb");
  assert.equal(board.widthCm, 240);
  assert.ok(p.gear.some(g => g.type === "camera" && g.model === "ILCE-1M2"));
  assert.ok(p.gear.some(g => g.type === "lens" && /85mm/.test(g.model)));
  assert.equal(poses.length, 2);
  assert.equal(poses[0].cues.weight, "肩线放松");
  assert.equal(p.shots.length, 2);
  assert.equal(p.scenes.length, 2);
  assert.equal(p.shots[0].size, "half");
  assert.equal(p.shots[1].size, "close");
  assert.equal(p.shots[0].focal, 85);
  assert.equal(p.shots[0].lockedNo, "S01");
  assert.equal(p.shots[0].minutes, 10);
  assert.ok(p.schedule.locks[p.shots[0].id]);
  const base = p.layout.base;
  assert.ok(base.some(e => e.kind === "window"));
  const A = p.layout.setups[0];
  assert.ok(A.elements.some(e => e.kind === "person" && e.ref === models[0].id));
  assert.ok(A.elements.some(e => e.kind === "camera" && e.focal === 85));
  assert.ok(A.elements.some(e => e.kind === "board" && Math.abs(e.w - 2.4) < 0.01));
  assert.ok(A.elements.some(e => e.kind === "light" && e.modifierRef && e.modifierRef.startsWith("o:")));
  assert.ok(report.ok.length >= 3);
  assert.ok(report.skip.some(s => /gear_ids/.test(s)));
  assert.ok(report.skip.some(s => /检索词|query/.test(s) || /window portrait/.test(s)));
  assert.ok(report.skip.some(s => /无图|缩略图/.test(s)));
  assert.ok(report.check.some(s => /重心/.test(s)));
  assert.ok(report.check.some(s => /卸妆/.test(s)));
  assert.equal(images.length, 0);
});

test("convertGrok collects dataURL images and model_count mismatch", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const raw = {
    schema: "portrait-guidance.plan/v1",
    title: "图测",
    model_count: 2,
    models: [{ id: "m1", name: "A", wardrobe: "" }],
    location_place: { screenshot: { dataUrl: png }, map: { query: "上海" } },
    references: { items: [{ title: "ref", url: "https://x.com/a", source: "x", thumb: png }] },
  };
  const { project: p, images, report } = convertGrok(raw);
  assert.equal(p.venue.address, "上海");
  assert.equal(images.length, 2);
  assert.equal(images[0].role, "venue");
  assert.equal(images[1].role, "mood");
  assert.equal(images[1].source, "x");
  assert.ok(report.check.some(s => /model_count/.test(s)));
});

import { buildSceneBoxes, hFovDeg, cameraFromElement, DEFAULT_FOCAL } from "../web/js/camview3d.js";
import { applyPreset } from "../web/js/gear-presets.js";

test("20mm full-frame horizontal FOV is wide (~84°)", () => {
  const fov = hFovDeg(20);
  assert.ok(fov > 80 && fov < 90, fov);
  assert.equal(Math.round(M.fovDeg(20)), Math.round(fov));
});

test("buildSceneBoxes includes floor and people from layout", () => {
  const { p, A } = sample();
  A.elements.push(M.newElement("camera", 6, 4));
  A.elements.push(M.newElement("person", 3, 2));
  const boxes = buildSceneBoxes(p, A.id);
  assert.ok(boxes.some(b => b.kind === "floor"));
  assert.ok(boxes.some(b => b.kind === "person"));
  assert.ok(boxes.some(b => b.kind === "wall"));
  const cam = cameraFromElement(A.elements.find(e => e.kind === "camera"), DEFAULT_FOCAL);
  assert.equal(cam.focal, 20);
  assert.ok(cam.hfovDeg > 80);
});

test("applyPreset forces modifier type even on light row", () => {
  const row = { id: "g1", type: "light", model: "", qty: 1 };
  applyPreset(row, {
    id: "godox-qr-p90t", category: "modifier", subcategory: "parabolic_softbox",
    label: "Godox QR-P90T", shape: "circle", diameter_cm: 90, depth_cm: 42.7,
  });
  assert.equal(row.type, "modifier");
  assert.equal(row.diameterCm, 90);
  const head = { id: "g2", type: "modifier", model: "" };
  applyPreset(head, {
    id: "godox-ad600pro-ii", category: "light_head", label: "AD600Pro II",
    shape: "rect", width_cm: 25, height_cm: 25, depth_cm: 12.5,
  });
  assert.equal(head.type, "light");
});
