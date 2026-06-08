// Dependency-free static contract check for the SFX modal webview.
// Run: node test/check-contract.mjs   (from examples/text-to-sfx)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "src", "interface.html"), "utf8");
const apikeyHtml = readFileSync(join(here, "..", "src", "apikey.html"), "utf8");

const must = [
  ["close_and_send method", /close_and_send/],
  ["serializes a single result string", /JSON\.stringify\(/],
  ["WebKit (macOS) bridge", /webkit\.messageHandlers\.live/],
  ["WebView2 (Windows) bridge", /chrome\.webview/],
  ["prompt input id", /id=["']prompt["']/],
  ["duration input id", /id=["']duration["']/],
  ["duration range 0.5..30", /min=["']0\.5["'][\s\S]*?max=["']30["']/],
  ["reduced-motion handling", /prefers-reduced-motion/],
  ["canvas stage", /<canvas[^>]*id=["']stage["']/],
  ["generate surge function", /function\s+surge\s*\(|const\s+surge\s*=/],
  ["generate handler", /function\s+generate\s*\(/],
  ["cancel handler", /function\s+cancel\s*\(/],
  ["self-contained: no remote scripts", /^(?!.*<script[^>]+src=).*/s],
  ["self-contained: no remote stylesheets", /^(?!.*<link[^>]+stylesheet).*/s],
  ["point-cloud renderer", /function\s+drawCloud\s*\(/],
  ["orbital dial renderer", /function\s+drawDial\s*\(/],
  ["prompt feeds the cloud", /function\s+feed\s*\(/],
  ["duration range is visually-hidden (focusable), not removed", /class=["']vh-range["']/],
  // Loose regression guard: only verifies that at least one `.vh-range`-prefixed
  // block isn't `display:none`; does NOT prove the range is definitively focusable.
  ["vh-range is not display:none", /\.vh-range\s*\{(?:(?!display\s*:\s*none)[\s\S])*?\}/],
  ["additive blend for the cloud", /globalCompositeOperation\s*=\s*["']lighter["']/],
];

const apikeyMust = [
  ["apikey: close_and_send method", /close_and_send/],
  ["apikey: serializes a single result string", /JSON\.stringify\(/],
  ["apikey: WebKit (macOS) bridge", /webkit\.messageHandlers\.live/],
  ["apikey: WebView2 (Windows) bridge", /chrome\.webview/],
  ["apikey: key input id", /id=["']apikey["']/],
  ["apikey: save handler", /function\s+save\s*\(/],
  ["apikey: cancel handler", /function\s+cancel\s*\(/],
  ["apikey: self-contained: no remote scripts", /^(?!.*<script[^>]+src=).*/s],
  ["apikey: self-contained: no remote stylesheets", /^(?!.*<link[^>]+stylesheet).*/s],
];

let failed = 0;
const suites = [
  ["interface.html", html, must],
  ["apikey.html", apikeyHtml, apikeyMust],
];
let total = 0;
for (const [, source, checks] of suites) {
  for (const [name, re] of checks) {
    total++;
    if (!re.test(source)) {
      console.error(`FAIL: ${name}`);
      failed++;
    }
  }
}
if (failed) {
  console.error(`\n${failed} contract check(s) failed.`);
  process.exit(1);
}
console.log(`OK: all ${total} contract checks passed.`);
