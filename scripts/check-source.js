import { parseMainlandTargets } from "../src/parser.js";

const sourceUrl = process.env.SOURCE_URL ?? "https://jmcomictt.site/";
const maximumBytes = 512 * 1024;
const response = await fetch(sourceUrl, {
  headers: {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.5",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  },
  redirect: "follow",
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok || !response.body) {
  throw new Error(`source returned HTTP ${response.status}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let totalBytes = 0;
let html = "";

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel("source response too large");
      throw new Error(`source response exceeds ${maximumBytes} bytes`);
    }
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
} finally {
  reader.releaseLock();
}

const targets = parseMainlandTargets(html);
console.log(JSON.stringify({ sourceUrl, totalBytes, targets }, null, 2));
