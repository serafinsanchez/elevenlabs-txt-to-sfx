import {
  initialize,
  ClipSlot,
  type ActivationContext,
  type ApiVersion,
  type Handle,
} from "@ableton-extensions/sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// esbuild inlines these HTML files as strings (see the `.html` loader in build.ts).
import modalInterface from "./interface.html";
import apiKeyModal from "./apikey.html";
import { readApiKey, writeApiKey, clearApiKey } from "./config.js";

// ElevenLabs Sound Generation endpoint. `output_format=mp3_44100_128` returns MP3
// bytes, which Live imports directly via `importIntoProject` (no WAV header needed).
const ELEVEN_ENDPOINT =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";

type Context = ReturnType<typeof initialize>;

interface SfxModalResult {
  prompt: string | null; // null when the user cancels
  duration: number; // seconds, 0.5–30
}
interface ApiKeyModalResult {
  apiKey: string | null; // null when the user cancels
}

type GenerateResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; status: number; body: string };

// Single ElevenLabs request, isolated so the 401 retry path stays clean.
async function generateSfx(
  apiKey: string,
  prompt: string,
  duration: number,
  signal: AbortSignal,
): Promise<GenerateResult> {
  const res = await fetch(ELEVEN_ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    // model_id omitted → defaults to eleven_text_to_sound_v2, required for
    // duration_seconds to take effect.
    body: JSON.stringify({ text: prompt, duration_seconds: duration }),
    signal,
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true, bytes: Buffer.from(await res.arrayBuffer()) };
}

// Show the key modal; on Save persist + return the key, on Cancel return null.
async function promptForApiKey(context: Context, storageDir: string): Promise<string | null> {
  const raw = await context.ui.showModalDialog(
    `data:text/html,${encodeURIComponent(apiKeyModal)}`,
    460,
    260,
  );
  const { apiKey } = JSON.parse(raw) as ApiKeyModalResult;
  if (!apiKey) return null;
  // Persisted immediately; validity is checked lazily by the generate call (401 → clear + re-prompt).
  await writeApiKey(storageDir, apiKey);
  return apiKey;
}

// Resolve the key: stored config → env var (dev .env fallback) → modal.
// Returns null only if the user cancels the modal.
async function resolveApiKey(context: Context, storageDir: string): Promise<string | null> {
  const stored = await readApiKey(storageDir);
  if (stored) return stored;

  const env = process.env.ELEVENLABS_API_KEY?.trim();
  if (env) return env;

  return promptForApiKey(context, storageDir);
}

type Outcome = "ok" | "unauthorized" | "error";

// One full generate → import → clip pass inside a progress dialog. Returns
// "unauthorized" on a 401 (caller handles re-prompt) without prompting itself,
// so we never stack a modal on top of the progress dialog.
async function runGeneration(
  context: Context,
  clipSlot: ClipSlot<ApiVersion>,
  tempDir: string,
  apiKey: string,
  prompt: string,
  duration: number,
): Promise<Outcome> {
  let outcome: Outcome = "ok";
  await context.ui.withinProgressDialog(
    "Generating SFX…",
    { progress: 0 },
    async (update, signal) => {
      await update(`Generating "${prompt}"…`, undefined); // indeterminate

      const result = await generateSfx(apiKey, prompt, duration, signal);
      if (!result.ok) {
        if (result.status === 401) {
          outcome = "unauthorized";
          return;
        }
        console.error(`Text to SFX: ElevenLabs error ${result.status}: ${result.body}`);
        outcome = "error";
        return;
      }
      signal.throwIfAborted();

      // The host hands us a temp directory path but doesn't guarantee it exists;
      // create it before writing.
      await fs.mkdir(tempDir, { recursive: true });
      const tmpPath = path.join(tempDir, `sfx-${Date.now()}.mp3`);
      await fs.writeFile(tmpPath, result.bytes);

      await update("Importing into project…", 70);
      const imported = await context.resources.importIntoProject(tmpPath);
      signal.throwIfAborted();

      await update("Creating clip…", 90);
      const clip = await clipSlot.createAudioClip({ filePath: imported, isWarped: false });
      clip.name = prompt.slice(0, 32);
    },
  );
  return outcome;
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");
  console.log("[text-to-sfx] activate() running; host API:", activation.hostApiVersion);

  context.commands.registerCommand("sfx.generate", (arg: unknown) =>
    void (async (handle: Handle) => {
      const clipSlot = context.getObjectFromHandle(handle, ClipSlot);

      const storageDir = context.environment.storageDirectory;
      if (!storageDir) {
        console.error(
          "Text to SFX: no storage directory available (run with --storage-directory)",
        );
        return;
      }

      const tempDir = context.environment.tempDirectory;
      if (!tempDir) {
        console.error(
          "Text to SFX: no temp directory available (run with --temp-directory)",
        );
        return;
      }

      // 1) Ensure we have an API key (stored → env → modal).
      const apiKey = await resolveApiKey(context, storageDir);
      if (!apiKey) return; // user cancelled the key modal

      // 2) Ask the user for a prompt + duration.
      const raw = await context.ui.showModalDialog(
        `data:text/html,${encodeURIComponent(modalInterface)}`,
        480,
        320,
      );
      const { prompt, duration } = JSON.parse(raw) as SfxModalResult;
      if (!prompt) return; // Cancel / empty prompt

      // 3) Generate. On 401, clear the bad key, re-prompt, and retry once.
      let outcome = await runGeneration(context, clipSlot, tempDir, apiKey, prompt, duration);
      if (outcome === "unauthorized") {
        await clearApiKey(storageDir);
        const retryKey = await promptForApiKey(context, storageDir);
        if (!retryKey) return; // user cancelled the re-prompt
        outcome = await runGeneration(context, clipSlot, tempDir, retryKey, prompt, duration);
        if (outcome === "unauthorized") {
          console.error("Text to SFX: ElevenLabs rejected the API key again (401). Aborting.");
        }
      }
    })(arg as Handle).catch((e) => { if (e?.name !== "AbortError") console.error(e); }),
  );

  context.ui
    .registerContextMenuAction("ClipSlot", "Generate SFX…", "sfx.generate")
    .then(() => console.log("[text-to-sfx] registered ClipSlot context menu action"))
    .catch((e) => console.error("[text-to-sfx] context menu registration FAILED:", e));
}
