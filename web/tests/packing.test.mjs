import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pack, unpack } from "../lib/packing.mjs";
test("Firestore snapshots preserve Unicode and split large content below document limits", () => {
  const state = {
    revision: 7,
    name: "Test — Lagos 🇳🇬",
    content: randomBytes(900000).toString("base64"),
  };
  const chunks = pack(state);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((x) => x.length <= 650000));
  assert.deepEqual(unpack(chunks), state);
});
test("corrupted snapshots fail instead of silently replacing career data", () => {
  assert.throws(() => unpack([Buffer.from("broken")]));
});
