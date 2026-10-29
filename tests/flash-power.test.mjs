import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getFlashCurve, relativeOutput, stopsFromFull, applyPowerDelta, parsePowerLevel, listFlashCurves,
} from "../web/js/flash-power.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(fs.readFileSync(path.join(root, "web/data/flash-power-curves.json"), "utf8"));

test("flash-power-curves schema and coverage", () => {
  assert.equal(doc.schema, "portrait-guidance.flash-power-curves/v1");
  assert.ok(doc.curves.length >= 20);
  assert.ok(doc.curves.some(c => c.id === "ideal-proportional"));
  assert.ok(doc.curves.some(c => c.id === "godox-ad200pro-ii"));
  assert.ok(doc.curves.some(c => c.brand === "Broncolor"));
  assert.ok(doc.curves.some(c => c.brand === "Profoto" && c.status === "pending_measure"));
  assert.ok(doc.curves.every(c => c.status));
});

test("ideal curve: 1/8 is 3 stops, relative 0.125", () => {
  const c = getFlashCurve("ideal-proportional", doc);
  assert.equal(stopsFromFull(c, "1/8"), 3);
  const r = relativeOutput(c, "1/8");
  assert.ok(r);
  assert.equal(r.value, 0.125);
});

test("catalog id resolves to godox AD curve", () => {
  const c = getFlashCurve("godox-ad200pro-ii", doc);
  assert.equal(c.id, "godox-ad200pro-ii");
  assert.equal(c.power_ws, 200);
  assert.equal(stopsFromFull(c, "1/1"), 0);
});

test("godox studio 10-scale: 8.0 ≈ 2 stops below full", () => {
  const c = getFlashCurve("godox-dp600iiiv", doc);
  assert.equal(c.scale, "godox_studio_10");
  assert.equal(stopsFromFull(c, "8.0"), 2);
  assert.equal(stopsFromFull(c, parsePowerLevel("8", c)), 2);
});

test("applyPowerDelta from 1/4 up one stop → near 1/2", () => {
  const c = getFlashCurve("ideal-proportional", doc);
  const next = applyPowerDelta(c, "1/4", 1);
  assert.ok(next);
  assert.equal(next.level, "1/2");
});

test("listFlashCurves reads injected doc via cache bypass", () => {
  assert.ok(listFlashCurves(doc).length > 0);
});
