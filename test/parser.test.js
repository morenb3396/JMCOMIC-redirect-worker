import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCandidate,
  parseMainlandTargets,
} from "../src/parser.js";

const CURRENT_PAGE_FIXTURE = `
<!doctype html>
<html><body>
  <h2>國際通用網域</h2>
  <a href="https://18comic.vip">18comic.vip</a>
  <a href="https://18comic.ink">18comic.ink</a>
  <h2>東南亞路線建議使用</h2>
  <a href="https://jmcomic-zzz.one">jmcomic-zzz.one</a>
  <h2>內地網域</h2>
  <p>請使用Chrome瀏覽器開啟</p>
  <a href="https://comic18j-hbd.space">comic18j-hbd.space</a>
  <span>分流1</span>
  <a href="https://comic18j-hbd.online/">comic18j-hbd.online</a>
  <span>分流2</span>
  <a href="https://comic18j-jjeg.club">comic18j-jjeg.club</a>
  <h2>APP軟件下載!!!</h2>
  <a href="https://jm-uu.cc/ZNPJam">jm-uu.cc/ZNPJam</a>
</body></html>`;

test("extracts only mainland targets in page order", () => {
  assert.deepEqual(parseMainlandTargets(CURRENT_PAGE_FIXTURE), [
    "https://comic18j-hbd.space/",
    "https://comic18j-hbd.online/",
    "https://comic18j-jjeg.club/",
  ]);
});

test("supports simplified Chinese section labels and entity encoded links", () => {
  const html = `
    <h2>内地网域</h2>
    <a href=&quot;https://jm-example.example/path&quot;>jm-example.example/path</a>
    <h2>APP软件下载</h2>
    <a href="https://jm-download.example/app">download</a>`;
  assert.deepEqual(parseMainlandTargets(html), [
    "https://jm-example.example/path",
  ]);
});

test("fails closed when the mainland section is missing", () => {
  assert.throws(
    () => parseMainlandTargets("<p>comic.example</p>"),
    /mainland section marker not found/,
  );
});

test("normalizes HTTPS targets and rejects unrelated or unsafe candidates", () => {
  assert.equal(normalizeCandidate("comic.example", ["comic"]), "https://comic.example/");
  assert.equal(normalizeCandidate("http://jm.example/path", ["jm"]), "https://jm.example/path");
  assert.equal(normalizeCandidate("https://example.org/", ["comic", "jm"]), null);
  assert.equal(normalizeCandidate("https://user:pass@comic.example/", ["comic"]), null);
  assert.equal(normalizeCandidate("http://localhost/", ["comic"]), null);
});
