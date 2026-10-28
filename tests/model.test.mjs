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

test("normalize fills defaults and keeps one setup", () => {
  const p = M.normalize({});
  assert.equal(p.layout.setups.length, 1);
  assert.equal(p.layout.activeSetup, p.layout.setups[0].id);
  assert.deepEqual(p.overview.keywords, []);
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
