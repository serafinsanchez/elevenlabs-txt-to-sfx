// Unit tests for src/config.ts (run via tsx so the .ts import resolves).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  readApiKey,
  writeApiKey,
  clearApiKey,
  getConfigPath,
} from "../src/config.ts";

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), "sfx-cfg-"));

test("write then read round-trips the key", async () => {
  const dir = await tmpDir();
  await writeApiKey(dir, "sk_test_123");
  assert.equal(await readApiKey(dir), "sk_test_123");
});

test("read returns null when the config file is missing", async () => {
  const dir = await tmpDir();
  assert.equal(await readApiKey(dir), null);
});

test("read returns null on corrupt JSON", async () => {
  const dir = await tmpDir();
  await fs.writeFile(getConfigPath(dir), "{ not json");
  assert.equal(await readApiKey(dir), null);
});

test("read returns null when the stored key is blank", async () => {
  const dir = await tmpDir();
  await fs.writeFile(getConfigPath(dir), JSON.stringify({ elevenLabsApiKey: "   " }));
  assert.equal(await readApiKey(dir), null);
});

test("write trims the key before storing", async () => {
  const dir = await tmpDir();
  await writeApiKey(dir, "  sk_pad  ");
  assert.equal(await readApiKey(dir), "sk_pad");
});

test("write creates the storage directory if it does not exist", async () => {
  const base = await tmpDir();
  const nested = path.join(base, "deep", "store");
  await writeApiKey(nested, "sk_nested");
  assert.equal(await readApiKey(nested), "sk_nested");
});

test("clear removes the file and is a no-op when already absent", async () => {
  const dir = await tmpDir();
  await writeApiKey(dir, "sk_x");
  await clearApiKey(dir);
  assert.equal(await readApiKey(dir), null);
  await clearApiKey(dir); // must not throw
});
