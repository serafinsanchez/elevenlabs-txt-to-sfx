# Text to SFX

An Ableton Live extension that generates a sound effect from a text prompt using the
[ElevenLabs Sound Generation API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
and drops it straight into a Session-view clip slot.

Right-click any clip slot → **Generate SFX…** → describe the sound, set a duration,
hit **Generate**. The extension calls ElevenLabs, imports the result into your project,
and creates an audio clip named after your prompt — all in one undo-friendly step.

## Download

**[⬇ Download Text-to-SFX-1.0.0.ablx](https://github.com/serafinsanchez/elevenlabs-txt-to-sfx/releases/download/v1.0.0/Text-to-SFX-1.0.0.ablx)**

Drop the `.ablx` onto Live's **Preferences → Extensions** page (Ableton Live 12 Beta with
Extensions enabled). On first **Generate SFX…** you'll be prompted for your own ElevenLabs
API key, which is stored locally for next time. Developer Mode is not required to use an
installed extension.

## How it works

1. A modal webview collects a **prompt** and a **duration** (0.5–30 s).
2. `POST https://api.elevenlabs.io/v1/sound-generation` returns MP3 audio.
3. The MP3 is written to the extension's temp directory.
4. `resources.importIntoProject()` copies it into the Live project.
5. `clipSlot.createAudioClip()` places it in the right-clicked slot.

Steps 2–5 run inside a native progress dialog with a working Cancel button.

## Prerequisites

- **Node.js ≥ 24**
- **Ableton Live Beta** with Extensions support, **Developer Mode** enabled
  (Preferences → Extensions → Developer Mode).
- An **ElevenLabs API key** (https://elevenlabs.io/app/settings/api-keys). Each user
  supplies their own — the extension prompts for it on first use and stores it locally.

## Setup

```shell
git clone https://github.com/serafinsanchez/elevenlabs-txt-to-sfx.git
cd elevenlabs-txt-to-sfx
npm install   # installs the vendored Ableton Extensions SDK + CLI from ./vendor
# Optional (dev convenience): put your key in .env so you aren't prompted while developing.
cp .env.example .env   # then edit .env and paste ELEVENLABS_API_KEY
```

> The Ableton Extensions SDK is currently a private beta and is **not** published to npm,
> so the `@ableton-extensions/sdk` and `@ableton-extensions/cli` packages are vendored as
> tarballs under [`vendor/`](vendor/) and referenced via `file:` paths in `package.json`.

The API key resolves in this order: a key you've already saved in the extension
(`storageDirectory/config.json`) → the `ELEVENLABS_API_KEY` env var (loaded from `.env`
in dev) → an in-app prompt. Installed users have no `.env`, so they enter the key in the
prompt and it's saved for next time.

## Run

The CLI needs the path to your Live install (the Extension Host). `--temp-directory`
guarantees the extension has a writable temp dir for the downloaded audio.

```shell
# macOS
npm start -- --live "/Applications/Ableton Live 12.4 Beta.app" --temp-directory ./.tmp

# Windows
npm start -- --live "C:\ProgramData\Ableton\Live Beta\Program\Ableton Live Beta.exe" --temp-directory ./.tmp
```

Then in Live's **Session view**, right-click a clip slot → **Generate SFX…**.

## Package for distribution

```shell
npm run package
```

This runs a production build and produces `Text-to-SFX-<version>.ablx`. Install it by
dropping it onto Live's **Preferences → Extensions** page. The bundle is fully
self-contained — both webview modals and all code are inlined, and Live provides the
Node runtime — so end users only need Live Beta with Extensions enabled (Developer Mode
is **not** required to use an installed extension). On first **Generate SFX…**, the
extension prompts each user for their own ElevenLabs API key and stores it locally.

## Troubleshooting

Logs go to your terminal (stdio is inherited) and to the Extension Host log:
`~/Library/Preferences/Ableton/Live 12.x.x/ExtensionHost.txt` (macOS).

- **401** — invalid API key. The extension clears the stored key and re-prompts; paste a
  valid key from https://elevenlabs.io/app/settings/api-keys.
- **422** — duration outside the 0.5–30 s range.
- **"no temp directory available"** — add `--temp-directory ./.tmp` to the run command.
- **No menu item** — confirm Developer Mode is on and the host stayed connected.

## Notes

- `model_id` is omitted so ElevenLabs uses `eleven_text_to_sound_v2`, which is required
  for `duration_seconds` to take effect.
- Output is MP3 (`mp3_44100_128`); Live imports it directly. Switch the `output_format`
  query param to a `pcm_*` value (and add a WAV header) if you need lossless audio.
