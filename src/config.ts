import * as fs from "node:fs/promises";
import * as path from "node:path";

// Persisted per-extension credential store. Lives in the host-provided
// storageDirectory (the SDK's sanctioned place for credentials). Plaintext
// JSON — there is no secret-store API in the beta.

interface Config {
  elevenLabsApiKey?: string;
}

export function getConfigPath(storageDir: string): string {
  return path.join(storageDir, "config.json");
}

/** Returns the trimmed stored key, or null if missing/blank/corrupt. */
export async function readApiKey(storageDir: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(getConfigPath(storageDir), "utf-8");
    const parsed = JSON.parse(raw) as Config;
    const key = typeof parsed.elevenLabsApiKey === "string" ? parsed.elevenLabsApiKey.trim() : "";
    return key.length > 0 ? key : null;
  } catch {
    // Missing file or corrupt JSON → treat as "no key".
    return null;
  }
}

/** Persists the trimmed key, creating the storage directory if needed. */
export async function writeApiKey(storageDir: string, key: string): Promise<void> {
  await fs.mkdir(storageDir, { recursive: true });
  const config: Config = { elevenLabsApiKey: key.trim() };
  await fs.writeFile(getConfigPath(storageDir), JSON.stringify(config));
}

/** Removes the config file; best-effort (ignores a missing file). */
export async function clearApiKey(storageDir: string): Promise<void> {
  try {
    await fs.unlink(getConfigPath(storageDir));
  } catch {
    // Ignore ENOENT and any other unlink failure — clearing is best-effort.
  }
}
