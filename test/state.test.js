import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileState,
  recordFailure,
  requiredConfirmations,
} from "../src/state.js";

const oldTarget = "https://comic-old.example/";
const newTarget = "https://comic-new.example/";

test("initializes immediately when there is no current target", () => {
  const result = reconcileState(null, [newTarget], "2026-09-25T00:00:00.000Z", 2);
  assert.equal(result.action, "initialized");
  assert.equal(result.state.currentTarget, newTarget);
});

test("requires two consecutive observations before changing target", () => {
  const first = reconcileState(
    { currentTarget: oldTarget },
    [newTarget],
    "2026-09-25T00:00:00.000Z",
    2,
  );
  assert.equal(first.action, "pending");
  assert.equal(first.state.currentTarget, oldTarget);
  assert.equal(first.state.pendingCount, 1);

  const second = reconcileState(
    first.state,
    [newTarget],
    "2026-09-25T00:30:00.000Z",
    2,
  );
  assert.equal(second.action, "changed");
  assert.equal(second.state.currentTarget, newTarget);
  assert.equal(second.state.pendingTarget, null);
});

test("an unchanged observation clears stale pending state", () => {
  const result = reconcileState(
    {
      currentTarget: oldTarget,
      pendingTarget: newTarget,
      pendingCount: 1,
      lastChangedAt: "2026-09-24T00:00:00.000Z",
    },
    [oldTarget],
    "2026-09-25T00:00:00.000Z",
    2,
  );
  assert.equal(result.action, "unchanged");
  assert.equal(result.state.pendingTarget, null);
  assert.equal(result.state.pendingCount, 0);
});

test("records failures without replacing the last known target", () => {
  const result = recordFailure(
    { currentTarget: oldTarget, consecutiveFailures: 2 },
    "2026-09-25T00:00:00.000Z",
    "upstream unavailable",
    newTarget,
  );
  assert.equal(result.currentTarget, oldTarget);
  assert.equal(result.consecutiveFailures, 3);
  assert.equal(result.lastError, "upstream unavailable");
});

test("confirmation count is bounded to a safe range", () => {
  assert.equal(requiredConfirmations("2"), 2);
  assert.equal(requiredConfirmations("0"), 2);
  assert.equal(requiredConfirmations("99"), 5);
});
