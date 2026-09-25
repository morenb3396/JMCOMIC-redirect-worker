import assert from "node:assert/strict";
import test from "node:test";

import { buildRedirectTarget, redirectResponse } from "../src/redirect.js";

test("redirects to the target homepage by default", () => {
  assert.equal(
    buildRedirectTarget(
      "https://comic.example/",
      "https://entry.example/album/123?from=bookmark",
      false,
    ),
    "https://comic.example/",
  );
});

test("can preserve path and query when explicitly enabled", () => {
  assert.equal(
    buildRedirectTarget(
      "https://comic.example/base/",
      "https://entry.example/album/123?from=bookmark",
      true,
    ),
    "https://comic.example/base/album/123?from=bookmark",
  );
});

test("uses a non-permanent, non-cacheable redirect", () => {
  const response = redirectResponse("https://comic.example/");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://comic.example/");
  assert.match(response.headers.get("cache-control"), /no-store/);
});
