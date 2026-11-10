import test from "node:test";
import assert from "node:assert/strict";
import { researchSourceFor } from "../lib/research-sources.mjs";
import { initialState, autoBlockers } from "../lib/model.mjs";
test("research source matching uses the actual hostname", () => {
  assert.equal(
    researchSourceFor("https://hiringcafe.com/job/example"),
    "HiringCafe",
  );
  assert.equal(
    researchSourceFor("https://hiring.cafe/job/example"),
    "HiringCafe",
  );
  assert.equal(researchSourceFor("https://laborx.com/jobs/example"), "LaborX");
  assert.equal(researchSourceFor("https://laborx.com.example.org/job"), null);
  assert.equal(researchSourceFor("https://laborx.com@example.org/job"), null);
});
test("research platform links cannot be automatically submitted", () => {
  const s = initialState();
  s.jobs = [
    {
      id: "test",
      url: "https://laborx.com/jobs/example",
      title: "Example",
      description: "",
      arrangement: "unknown",
      countries: [],
    },
  ];
  const blockers = autoBlockers(
    s,
    { id: "app", jobId: "test", status: "draft" },
    {},
  );
  assert.match(blockers.join(" "), /manual applications only/);
});
