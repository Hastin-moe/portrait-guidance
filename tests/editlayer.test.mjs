// T17：编辑层路由解析与地址拼装
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { editHash, parseEdit } from "../web/js/editlayer.js";

describe("editHash / parseEdit", () => {
  it("models person short path", () => {
    assert.equal(editHash("P1", "models", { kind: "person", id: "m9" }), "#/p/P1/models/m9");
    assert.deepEqual(parseEdit("models", ["m9"]), { kind: "person", id: "m9" });
    assert.deepEqual(parseEdit("models", ["person", "m9"]), { kind: "person", id: "m9" });
  });
  it("models mood path", () => {
    assert.equal(editHash("P1", "models", { kind: "mood", id: "g1" }), "#/p/P1/models/mood/g1");
    assert.deepEqual(parseEdit("models", ["mood", "g1"]), { kind: "mood", id: "g1" });
  });
  it("poses path", () => {
    assert.equal(editHash("P1", "poses", { kind: "pose", id: "z1" }), "#/p/P1/poses/z1");
    assert.deepEqual(parseEdit("poses", ["z1"]), { kind: "pose", id: "z1" });
    assert.equal(editHash("P1", "poses", { kind: "preset", id: "" }), "#/p/P1/poses/preset");
    assert.deepEqual(parseEdit("poses", ["preset"]), { kind: "preset", id: "" });
  });
  it("layout element short path and close", () => {
    assert.equal(editHash("P1", "layout", { kind: "element", id: "e1" }), "#/p/P1/layout/e1");
    assert.deepEqual(parseEdit("layout", ["e1"]), { kind: "element", id: "e1" });
    assert.deepEqual(parseEdit("layout", ["element", "e1"]), { kind: "element", id: "e1" });
    assert.equal(editHash("P1", "models", null), "#/p/P1/models");
    assert.equal(parseEdit("models", []), null);
  });
});
