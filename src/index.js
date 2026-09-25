import { normalizeCandidate, parseMainlandTargets } from "./parser.js";
import { buildRedirectTarget, redirectResponse } from "./redirect.js";
import {
  recordFailure,
  reconcileState,
  requiredConfirmations,
  STATE_KEY,
} from "./state.js";

const DEFAULT_MAX_SOURCE_BYTES = 512 * 1024;
const DEFAULT_SOURCE_TIMEOUT_MS = 15_000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function hostKeywords(env) {
  return String(env.TARGET_HOST_KEYWORDS ?? "comic,jm")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function readTextWithLimit(response, maximumBytes) {
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`source response exceeds ${maximumBytes} bytes`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel("source response too large");
        throw new Error(`source response exceeds ${maximumBytes} bytes`);
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

async function loadState(env) {
  return env.STATE.get(STATE_KEY, "json");
}

function bootstrapTarget(env) {
  if (!env.BOOTSTRAP_TARGET) return null;
  return normalizeCandidate(env.BOOTSTRAP_TARGET, hostKeywords(env));
}

async function fetchCandidates(env) {
  const response = await fetch(env.SOURCE_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.5",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(DEFAULT_SOURCE_TIMEOUT_MS),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`source returned HTTP ${response.status}`);
  }

  const maximumBytes = parsePositiveInteger(env.MAX_SOURCE_BYTES, DEFAULT_MAX_SOURCE_BYTES);
  const html = await readTextWithLimit(response, maximumBytes);
  return parseMainlandTargets(html, { hostKeywords: hostKeywords(env) });
}

async function refreshState(env, checkedAt) {
  const previous = await loadState(env);
  const candidates = await fetchCandidates(env);
  const result = reconcileState(
    previous,
    candidates,
    checkedAt,
    requiredConfirmations(env.CONFIRMATION_COUNT),
  );
  await env.STATE.put(STATE_KEY, JSON.stringify(result.state));
  return result;
}

async function saveFailure(env, checkedAt, error) {
  let previous = null;
  try {
    previous = await loadState(env);
  } catch (loadError) {
    console.error(JSON.stringify({
      event: "state_load_failed",
      error: String(loadError),
    }));
  }

  const next = recordFailure(
    previous,
    checkedAt,
    error instanceof Error ? error.message : String(error),
    bootstrapTarget(env),
  );
  await env.STATE.put(STATE_KEY, JSON.stringify(next));
}

function jsonResponse(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handleStatus(env) {
  const state = await loadState(env);
  return jsonResponse({
    ok: Boolean(state?.currentTarget),
    sourceUrl: env.SOURCE_URL,
    ...state,
  }, state?.currentTarget ? 200 : 503);
}

async function handleRedirect(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const state = await loadState(env);
  const target = normalizeCandidate(
    state?.currentTarget ?? env.BOOTSTRAP_TARGET ?? "",
    hostKeywords(env),
  );
  if (!target) {
    return jsonResponse({
      ok: false,
      error: "No valid redirect target is available yet.",
    }, 503);
  }

  const location = buildRedirectTarget(
    target,
    request.url,
    parseBoolean(env.PRESERVE_PATH),
  );
  return redirectResponse(location);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === "/__status") return await handleStatus(env);
      return await handleRedirect(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "request_failed",
        pathname,
        error: String(error),
      }));
      return jsonResponse({ ok: false, error: "Temporary redirect service error." }, 503);
    }
  },

  async scheduled(controller, env) {
    const checkedAt = new Date(controller.scheduledTime).toISOString();
    try {
      const result = await refreshState(env, checkedAt);
      console.log(JSON.stringify({
        event: "refresh_completed",
        action: result.action,
        currentTarget: result.state.currentTarget,
        pendingTarget: result.state.pendingTarget,
        pendingCount: result.state.pendingCount,
        candidates: result.state.candidates,
        checkedAt,
      }));
    } catch (error) {
      try {
        await saveFailure(env, checkedAt, error);
      } catch (saveError) {
        console.error(JSON.stringify({
          event: "failure_state_save_failed",
          error: String(saveError),
        }));
      }
      console.error(JSON.stringify({
        event: "refresh_failed",
        error: String(error),
        checkedAt,
      }));
      throw error;
    }
  },
};
