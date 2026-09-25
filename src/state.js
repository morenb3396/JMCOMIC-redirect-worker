export const STATE_KEY = "redirect-state-v1";

function normalizeCount(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function requiredConfirmations(value) {
  return Math.min(normalizeCount(value, 2), 5);
}

export function reconcileState(previous, candidates, checkedAt, confirmations = 2) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("at least one observed candidate is required");
  }

  const observedTarget = candidates[0];
  const currentTarget = previous?.currentTarget ?? null;
  const base = {
    version: 1,
    currentTarget,
    candidates,
    pendingTarget: null,
    pendingCount: 0,
    lastCheckedAt: checkedAt,
    lastSuccessfulCheckAt: checkedAt,
    lastChangedAt: previous?.lastChangedAt ?? null,
    consecutiveFailures: 0,
    lastError: null,
  };

  if (!currentTarget) {
    return {
      action: "initialized",
      state: {
        ...base,
        currentTarget: observedTarget,
        lastChangedAt: checkedAt,
      },
    };
  }

  if (observedTarget === currentTarget) {
    return { action: "unchanged", state: base };
  }

  const pendingCount = previous?.pendingTarget === observedTarget
    ? normalizeCount(previous?.pendingCount, 0) + 1
    : 1;

  if (pendingCount >= confirmations) {
    return {
      action: "changed",
      state: {
        ...base,
        currentTarget: observedTarget,
        lastChangedAt: checkedAt,
      },
    };
  }

  return {
    action: "pending",
    state: {
      ...base,
      pendingTarget: observedTarget,
      pendingCount,
    },
  };
}

export function recordFailure(previous, checkedAt, errorMessage, bootstrapTarget = null) {
  return {
    version: 1,
    currentTarget: previous?.currentTarget ?? bootstrapTarget,
    candidates: previous?.candidates ?? [],
    pendingTarget: previous?.pendingTarget ?? null,
    pendingCount: previous?.pendingCount ?? 0,
    lastCheckedAt: checkedAt,
    lastSuccessfulCheckAt: previous?.lastSuccessfulCheckAt ?? null,
    lastChangedAt: previous?.lastChangedAt ?? null,
    consecutiveFailures: normalizeCount(previous?.consecutiveFailures, 0) + 1,
    lastError: errorMessage.slice(0, 500),
  };
}
