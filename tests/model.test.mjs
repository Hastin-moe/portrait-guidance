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

test("light elements reserve measured exitLux / faceLux", () => {
  const e = M.newElement("light", 1, 2);
  assert.equal(e.exitLux, "");
  assert.equal(e.faceLux, "");
  assert.equal(e.luxMeter, "");
  assert.equal(e.luxNote, "");
  const p = M.blankProject("lux");
  p.layout.setups[0].elements.push({ id: "L1", kind: "light", x: 1, y: 1, rot: 0, beam: 60 });
  M.normalize(p);
  const L = p.layout.setups[0].elements[0];
  assert.equal(L.exitLux, "");
  assert.equal(L.faceLux, "");
  L.exitLux = 4200;
  L.faceLux = 860;
  L.luxMeter = "Sekonic L-858D";
  M.normalize(p);
  assert.equal(p.layout.setups[0].elements[0].exitLux, 4200);
  assert.equal(p.layout.setups[0].elements[0].faceLux, 860);
});

import { toCamera, projectPoint, projectScene } from "../web/js/camview3d.js";

test("3D preview: point straight ahead of the camera lands at screen centre", () => {
  for (const yaw of [0, 90, 205, 300]) {
    const cam = { x: 6, z: 4, yaw, pitch: 0, eye: 1.5, hfovDeg: 84 };
    const a = yaw * Math.PI / 180;
    const pt = { x: 6 + 3 * Math.cos(a), y: 1.5, z: 4 + 3 * Math.sin(a) };
    const c = toCamera(pt, cam);
    assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.z - 3) < 1e-9, `yaw ${yaw}: ${JSON.stringify(c)}`);
    const s = projectPoint(pt, cam, 960, 540);
    assert.ok(Math.abs(s.x - 480) < 1e-6 && Math.abs(s.y - 270) < 1e-6);
  }
});

test("3D preview: plan-right (rot+90°) is screen-right; behind camera is not drawn", () => {
  const cam = { x: 0, z: 0, yaw: 0, pitch: 0, eye: 1.5, hfovDeg: 84 };
  const right = projectPoint({ x: 3, y: 1.5, z: 1 }, cam, 960, 540);   // 平面图 +y 一侧
  assert.ok(right.x > 480);
  assert.equal(projectPoint({ x: -2, y: 1.5, z: 0 }, cam, 960, 540), null);
});

test("3D preview: camera inside the room sees walls, floor and the subject", () => {
  const { p, A } = sample();
  const camEl = M.newElement("camera", 6, 4); camEl.rot = 200;
  A.elements.push(camEl, M.newElement("person", 3, 2));
  const polys = projectScene(buildSceneBoxes(p, A.id), cameraFromElement(camEl), 960, 540);
  const kinds = new Set(polys.map(f => f.kind));
  for (const k of ["wall", "floor", "person"]) assert.ok(kinds.has(k), k);
  assert.ok(polys.findIndex(f => !f.shell) > polys.findLastIndex(f => f.shell), "shell drawn before interior");
});

// ---------- T11 遗留修复 ----------
test("T11-A1 Grok modifier marker attaches to the nearest light instead of adding a light", () => {
  const raw = JSON.parse(readFileSync(FIX, "utf8"));
  const { project: p, report } = convertGrok(raw);
  const lights = p.layout.setups[0].elements.filter(e => e.kind === "light");
  assert.equal(lights.length, 2, "AD600 + 反光板补光，没有多出来的灯");
  const ad = lights.find(e => e.modifierRef);
  assert.ok(ad && ad.ref, "修饰器挂在已绑定 AD600 的灯上");
  assert.ok(!report.check.some(s => /附近没有灯/.test(s)));
});

test("T11-A1 a modifier far from any light becomes its own light and is reported", () => {
  const raw = JSON.parse(readFileSync(FIX, "utf8"));
  raw.site_map.markers.find(m => m.kind === "modifier").x = 0.95;
  const { project: p, report } = convertGrok(raw);
  assert.equal(p.layout.setups[0].elements.filter(e => e.kind === "light").length, 3);
  assert.ok(report.check.some(s => /附近没有灯/.test(s)));
});

test("T11-A2 started but not completed shot never ends before it starts", () => {
  const { p } = sample();
  p.time.date = "2026-11-08"; p.time.timezone = "Asia/Shanghai";
  const shot = p.shots[0];
  shot.minutes = 15;
  shot.startedAt = "2026-11-08T23:30:00+08:00";   // 远晚于计划结束
  shot.completedAt = "";
  const w = M.timeWindows(p).windows.find(x => x.start.startsWith("2026-11-08 23:30"));
  assert.ok(w, "window present");
  assert.equal(w.end, "2026-11-08 23:45:00");
  for (const x of M.timeWindows(p).windows) assert.ok(x.end >= x.start, JSON.stringify(x));
});

test("wallToIso uses the offset of the shoot day (DST aware)", () => {
  assert.equal(M.wallToIso("2026-11-08", "09:30", "Asia/Shanghai"), "2026-11-08T09:30:00+08:00");
  assert.equal(M.wallToIso("2026-07-01", "09:30", "Europe/Berlin"), "2026-07-01T09:30:00+02:00");
  assert.equal(M.wallToIso("2026-12-01", "09:30", "Europe/Berlin"), "2026-12-01T09:30:00+01:00");
  assert.equal(M.wallAddMin("2026-11-08 23:50:00", 20), "2026-11-09 00:10:00");
});

test("T11-B1/B2/B3 importer: project timezone, no fake 50mm, absorb by preset id", () => {
  const raw = JSON.parse(readFileSync(FIX, "utf8"));
  raw.timezone = "Europe/Berlin";
  raw.shots[0].started_at = "10:05";
  delete raw.shots[1].focal_length;
  raw.equipment.unshift({ id: "eq_abs_0", category: "absorb", name: "V 板", preset_id: "vflat-other", shape: "rect", width_cm: 120, height_cm: 240 });
  const { project: p } = convertGrok(raw);
  assert.equal(p.shots[0].startedAt, `${p.time.date}T10:05:00+01:00`);
  assert.equal(p.shots[1].focal, "");
  const board = p.layout.setups[0].elements.find(e => e.kind === "board");
  assert.equal(M.gearByKey(p, board.ref).model, "聚苯板 240×120");
});

test("T11-C1/C2 fixtures: images and an older minimal Grok file both import", () => {
  const dir = dirname(FIX);
  const withImg = convertGrok(JSON.parse(readFileSync(join(dir, "grok-with-images.json"), "utf8")));
  assert.equal(withImg.images.filter(i => i.role === "venue").length, 1);
  assert.equal(withImg.images.filter(i => i.role === "mood").length, 2);
  const min = convertGrok(JSON.parse(readFileSync(join(dir, "grok-minimal.json"), "utf8")));
  assert.equal(min.project.shots.length, 2);
  assert.equal(min.project.layout.setups[0].elements.length, 0);
  assert.ok(min.project.gear.length >= 1, "lights / gear 旧字段仍转成器材");
});

// ---------- T14 EX 光比 ----------
function exSample() {
  const p = M.blankProject("光比");
  Object.assign(p.venue, { name: "棚", w: 8, d: 6 });
  p.people.push({ id: "m", kind: "model", name: "林夏" });
  p.gear.push({ id: "k", type: "light", model: "Godox AD600Pro II", presetId: "godox-ad600pro-ii", qty: 2 });
  p.gear.push({ id: "led", type: "light", model: "Aputure STORM 80c", presetId: "aputure-storm-80c", qty: 1 });
  const A = p.layout.setups[0];
  const person = { ...M.newElement("person", 4, 3), ref: "m" };
  const key = { ...M.newElement("light", 2, 3), ref: "o:k", power: "1/4", rot: 0 };          // 2 m，正对
  const fill = { ...M.newElement("light", 4, 1), ref: "o:k", power: "1/16", rot: 90 };       // 2 m，低 2 档
  A.elements.push(person, key, fill);
  const catalog = new Map([
    ["godox-ad600pro-ii", { id: "godox-ad600pro-ii", category: "light_head", subcategory: "strobe", power_ws: 600, guide_number_m: { value: 87, iso: 100 } }],
    ["aputure-storm-80c", { id: "aputure-storm-80c", category: "led", subcategory: "full_color_led", power_w: 80, illuminance: [{ lux: 6500, distance_m: 1, modifier: "bare" }] }],
  ]);
  return { p, A, person, key, fill, catalog };
}

test("parsePower reads common power notations", () => {
  assert.equal(M.parsePower("1/4"), 0.25);
  assert.ok(Math.abs(M.parsePower("1/8+0.3") - 0.125 * Math.pow(2, 0.3)) < 1e-9);
  assert.equal(M.parsePower("50%"), 0.5);
  assert.equal(M.parsePower("全光"), 1);
  assert.equal(M.parsePower("0.5"), 0.5);
  assert.equal(M.parsePower("abc"), null);
  assert.equal(M.ratioText(-Math.log2(3)), "3:1");
  assert.equal(M.ratioText(1), "1:2");
});

test("EX estimate: same strobe two stops down reads 4:1 against the key", () => {
  const { p, A, key, fill, catalog } = exSample();
  const r = M.lightRatios(p, A.id, { catalog });
  assert.equal(r.key.id, key.id, "brightest estimate is the key");
  const f = r.rows.find(x => x.id === fill.id);
  assert.equal(f.est.unit, "f");
  assert.ok(Math.abs(f.evRel + 2) < 1e-9, f.evRel);
  assert.equal(M.ratioText(f.evRel), "4:1");
  // GN 87 × √(1/4) ÷ 2 m ≈ f/21.8
  assert.ok(Math.abs(r.rows.find(x => x.id === key.id).est.value - 87 * 0.5 / 2) < 1e-9);
});

test("EX measured readings win over estimates and flag a big gap", () => {
  const { p, A, key, fill, catalog } = exSample();
  key.faceFstop = 11; fill.faceFstop = 5.6;
  const r = M.lightRatios(p, A.id, { catalog });
  const f = r.rows.find(x => x.id === fill.id);
  assert.ok(Math.abs(f.evRel - 2 * Math.log2(5.6 / 11)) < 1e-9, "measured ratio");
  assert.ok(r.warnings.some(w => w.code === "gap" && w.id === key.id), "f/11 vs estimated f/21.8 is > 1 EV off");
  // 加上柔光箱后估算按 1.7 档损耗下调，实测 f/11 就和估算接近了
  p.gear.push({ id: "box", type: "modifier", model: "Godox QR-P90T 抛物线柔光箱", diameterCm: 90, depthCm: 42.7 });
  key.modifierRef = "o:box";
  const r2 = M.lightRatios(p, A.id, { catalog });
  assert.equal(r2.rows.find(x => x.id === key.id).loss, 1.7);
  assert.equal(M.modifierLossEv(null, null, "蜂巢"), 0.3);
  assert.equal(M.modifierLossEv(null, null, ""), 0);
});

test("EX: modifier front shortens distance, out-of-beam light is flagged, units don't mix", () => {
  const { p, A, key, catalog } = exSample();
  p.gear.push({ id: "box", type: "modifier", model: "QR-P90T", diameterCm: 90, depthCm: 42.7 });
  key.modifierRef = "o:box";
  const led = { ...M.newElement("light", 6, 3), ref: "o:led", power: "100%", rot: 0 };   // 背对被摄者
  A.elements.push(led);
  const r = M.lightRatios(p, A.id, { catalog });
  const k = r.rows.find(x => x.id === key.id);
  assert.ok(Math.abs(k.dEff - (2 - 0.13 - 0.427)) < 1e-9);
  const l = r.rows.find(x => x.id === led.id);
  assert.equal(l.inBeam, false);
  assert.equal(l.est.unit, "lux");
  assert.equal(l.evRel, null, "lux vs f-stop not compared");
  l.el.rot = 180;   // 转过来对着被摄者：LED 再亮也不会因为单位不同被选成主光
  assert.equal(M.lightRatios(p, A.id, { catalog }).key.kind, "flash");
  assert.ok(r.warnings.some(w => w.code === "outOfBeam" && w.id === led.id));
});

test("EX status dot counts measured lights; layout edits are shared with S6", () => {
  const { p, A, key, fill } = exSample();
  assert.equal(M.stepStatus(p).ex, 0);
  key.faceFstop = 8;
  assert.equal(M.stepStatus(p).ex, 1);
  fill.faceLux = 900;
  assert.equal(M.stepStatus(p).ex, 2);
  const n = M.normalize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(n.layout.setups[0].ex, { subjectId: "", keyId: "", iso: 100 });
  assert.equal(n.layout.setups[0].elements.find(e => e.id === key.id).faceFstop, 8);
});

test("T11-C2 Grok's untouched original sample imports cleanly", () => {
  const raw = JSON.parse(readFileSync(join(dirname(FIX), "grok-original.json"), "utf8"));
  const { project: p, report } = convertGrok(raw);
  assert.equal(p.name, "窗边人像试拍 · 样例策划案");
  assert.equal(p.shots.length, 2);
  assert.ok(p.layout.base.some(e => e.kind === "window"));
  const A = p.layout.setups[0];
  assert.deepEqual(A.elements.map(e => e.kind).sort(), ["camera", "light", "person"]);
  assert.ok(!report.check.some(s => /附近没有灯/.test(s)));
  assert.ok(M.checks(p).every(c => c.level !== "error" || c.code !== "venueSize"));
});

test("T22 ref search URLs and AI cost helpers", () => {
  const p = { overview: { theme: "窗光人像", keywords: ["窗光", "柔和"] } };
  assert.equal(M.defaultRefSearchQuery(p), "窗光 柔和");
  assert.match(M.refSearchUrl("xhs", "窗光"), /xiaohongshu\.com.*%E7%AA%97%E5%85%89/);
  assert.match(M.refSearchUrl("google", "a b"), /tbm=isch/);
  assert.equal(M.refSearchUrl("nope", "x"), "");
  assert.equal(M.aiImageCostUsd(2), Math.round(2 * M.AI_IMAGE_USD * 100) / 100);
  assert.equal(M.aiImageCostUsd(99), Math.round(8 * M.AI_IMAGE_USD * 100) / 100);
  assert.match(M.defaultAiPrompt(p, { size: "半身", poseName: "回眸" }), /窗光人像/);
});

test("T23 display coords, 15° snap, shelf side and key names", () => {
  const venue = { w: 8, d: 6 };
  assert.deepEqual(M.toDisplayXY(venue, 2, 1), { x: 2, y: 5 });
  assert.deepEqual(M.fromDisplayXY(venue, 2, 5), { x: 2, y: 1 });
  assert.equal(M.toDisplayRot(90), 270);
  assert.equal(M.fromDisplayRot(270), 90);
  assert.equal(M.snapDeg15(50), 45);
  assert.equal(M.snapDeg15(37), 30);
  assert.equal(M.roundRelDeg15(37), 30);
  assert.equal(M.roundRelDeg15(38), 45);
  assert.equal(M.shelfSide(4, 3, 2, 3), "left");
  assert.equal(M.shelfSide(4, 3, 6, 3), "right");
  assert.equal(M.lightKeyName(45), "rembrandt");
  assert.equal(M.lightKeyName(0), "front");
  const light = { x: 1, y: 3 }, sub = { x: 4, y: 3 };
  // display: light (1,3), subject (4,3) → aim +X → display rot 0 → storage 0
  assert.equal(M.aimRotStorageToward(venue, light, sub), 0);
});

test("T18 model profile: normalize looks/photos/role, cover, incomplete", () => {
  const bare = { id: "m", kind: "model", name: "", height: "" };
  M.normalizeModel(bare);
  assert.equal(bare.alias, "");
  assert.deepEqual(bare.photos, []);
  assert.equal(bare.roleName, "");
  assert.equal(bare.paid, false);
  assert.ok(M.modelProfileIncomplete(bare));
  bare.name = "林夏";
  bare.height = 168;
  bare.looks = [{ name: "" }];
  M.normalizeModel(bare);
  assert.ok(M.modelProfileIncomplete(bare));
  bare.looks[0].name = "白衬衫";
  assert.equal(M.modelProfileIncomplete(bare), false);
  bare.photos = [{ file: "a.jpg", note: null, cover: false }, { file: "b.jpg", cover: true }];
  M.normalizeModel(bare);
  assert.equal(bare.photos[0].note, "");
  assert.equal(M.modelCoverFile(bare), "b.jpg");
  const look = M.blankLook("套 A");
  assert.equal(look.status, "todo");
  assert.deepEqual(look.items, []);
  look.items.push(M.blankLookItem("shoes"));
  M.normalizeLook(look);
  assert.equal(look.items[0].part, "shoes");
  assert.ok(M.LOOK_PARTS.includes("top"));
  assert.ok(M.LOOK_SOURCES.includes("rent"));
  assert.ok(M.LOOK_STATUSES.includes("onsite"));
  const p = M.blankProject();
  p.people.push({ id: "old", kind: "model", name: "旧", height: 170, looks: [{ id: "l1", name: "旧造型" }] });
  M.normalize(p);
  const m = M.personById(p, "old");
  assert.equal(m.looks[0].status, "todo");
  assert.equal(m.alias, "");
  assert.equal(M.modelCoverFile(m), "");
});

test("T24 relativeAngles: shelf L/R, 15° display, segment nearest, no elev when height empty", () => {
  const { p, A } = sample();
  // 存储：人物朝上屏 = rot 270 → 显示朝 +Y（后）；灯在人物左侧（X 更小）
  const person = { ...M.newElement("person", 4, 3), rot: 270, ref: "mia" };
  const lightL = { ...M.newElement("light", 2, 3), heightM: "" };
  const lightR = { ...M.newElement("light", 6, 3), heightM: 2.0 };
  const cam = M.newElement("camera", 4, 5);
  const backdrop = { ...M.newElement("backdrop", 4, 0.5), w: 3, h: 0.1, rot: 0 };
  A.elements = [person, lightL, lightR, cam];
  p.layout.base.push(backdrop);
  // 往返含边界角
  for (const r of [0, 90, 359]) assert.equal(M.fromDisplayRot(M.toDisplayRot(r)), r % 360 === 359 ? 359 : r);

  const rel = M.relativeAngles(p, A.id, person.id);
  assert.equal(rel.subject.id, person.id);
  const L = rel.lights.find(x => x.lightId === lightL.id);
  const R = rel.lights.find(x => x.lightId === lightR.id);
  assert.ok(L && R);
  assert.equal(L.side, "left"); // 棚坐标：X 更小
  assert.equal(R.side, "right");
  assert.equal(L.alphaDeg, 90);
  assert.equal(L.elevDeg, null); // 灯高空 → 无高度角
  assert.equal(L.dSlant, null);
  assert.ok(R.elevDeg != null);
  assert.ok(R.dSlant != null);
  assert.equal(M.roundRelDeg15(37), 30);
  assert.equal(M.roundRelDeg15(38), 45);
  assert.equal(M.snapDeg15(50), 45);
  // 线段最近点：人物 (4,3) 到水平背景 y=0.5、x∈[2.5,5.5] → 点 (4,0.5)
  assert.ok(rel.backdrop);
  assert.ok(Math.abs(rel.backdrop.dMin - 2.5) < 1e-6);
  assert.ok(Math.abs(rel.backdrop.to.x - 4) < 1e-6);
  assert.ok(Math.abs(rel.backdrop.to.y - 0.5) < 1e-6);
  // 光位名边界（15° 档）
  assert.equal(M.lightKeyName(0), "front");
  assert.equal(M.lightKeyName(15), "shortFront");
  assert.equal(M.lightKeyName(30), "shortFront");
  assert.equal(M.lightKeyName(45), "rembrandt");
  assert.equal(M.lightKeyName(90), "side");
  assert.equal(M.lightKeyName(135), "sideBack");
  assert.equal(M.lightKeyName(150), "back");
  // 选中灯时只画该灯弧
  const arcsL = M.relationArcs(p, A.id, lightL.id);
  assert.equal(arcsL.arcs.length, 1);
  assert.equal(arcsL.arcs[0].kind, "lightPerson");
});
