# Voice agent STT/TTS spans and playable audio

> **Investigation**: LAT-720 (2026-07-02)
> **Related docs**: `docs/telemetry/frameworks/livekit.mdx`, `docs/telemetry/frameworks/vercel-ai-sdk-v7.mdx`, `docs/telemetry/frameworks/elevenlabs.mdx`

## Question

Can STT and TTS spans be ingested and rendered as **playable audio** — and is that feasible?

## Product decision

**Do not put STT/TTS into the Conversation tab.** That tab is scoped to LLM generation (`chat` / `text_completion` / `generate_content` rollup). Voice pipeline steps belong on their own spans.

**Show playable audio in the span detail UI** when a `transcribe` or `speech` span (or any span whose messages carry audio parts) is selected in the Spans tab.

## Executive summary

| Layer | Status | Playable audio? |
| --- | --- | --- |
| **Span detail UI** | `VoiceSpanSection` renders input/output with native `<audio controls>` via `Part` | Yes, when span messages include audio `uri`/`blob` parts |
| **Conversation tab** | LLM-only by design (rollup gate) | Out of scope — not the right surface |
| **Span ingestion** | STT/TTS spans ingest when they carry `gen_ai.*` attrs (or smart filter disabled for LiveKit) | Yes |
| **Content parsers** | `parseVoice` maps flat text + audio attrs → GenAI messages; LiveKit `audio_content` still → transcript text only | Partial — audio requires instrumentation |

**Bottom line:** Playable audio is **feasible and belongs in span UI**, not the conversation tab. Frameworks still rarely emit audio bytes/URLs in span payloads; customers must attach audio via documented attrs or `gen_ai.{input,output}.messages` until frameworks/SDKs do more.

## Span UI (implemented)

`VoiceSpanSection` in the trace/session Spans tab detail panel:

- Activates for `operation === "transcribe"` or `"speech"`, or any span whose `input_messages` / `output_messages` contain audio parts
- Renders **Input** and **Output** blocks: audio players first, then transcript/text
- Reuses `@repo/ui` `Part` → `AudioContent` for `uri` and `blob` audio parts
- Span tree icons: `MicIcon` (transcribe), `Volume2Icon` (speech)

Voice spans use `VoiceSpanSection` instead of the generic `LlmSections` layout.

## Ingestion: `parseVoice` content parser

Handles spans that carry flat voice attrs instead of `gen_ai.{input,output}.messages`:

| Attribute | Role |
| --- | --- |
| `gen_ai.input.text` | STT/TTS input text |
| `gen_ai.output.text` | STT transcript / output text |
| `lk.user_transcript` | LiveKit STT transcript (when `operation=transcribe`) |
| `lk.input_text` | LiveKit TTS input text (when `operation=speech`) |
| `gen_ai.input.audio` / `voice.input.audio` / `latitude.audio.input` | Input audio (base64 blob) |
| `gen_ai.output.audio` / `voice.output.audio` / `latitude.audio.output` | Output audio (base64 blob) |
| `gen_ai.input.audio.uri` / `voice.input.uri` / `latitude.audio.input.uri` | Input audio URL |
| `gen_ai.output.audio.uri` / `voice.output.uri` / `latitude.audio.output.uri` | Output audio URL |
| `openai.agents.audio.{input,output}_format` | MIME hint (e.g. `mp3`, `pcm16`) |

`gen_ai.{input,output}.messages` still wins when present (gen_ai parser runs first).

## What frameworks emit today

| Framework | STT/TTS spans | Audio in span payload |
| --- | --- | --- |
| **LiveKit** | Yes (with `disableSmartFilter`) | Transcript/text only (`lk.user_transcript`, `lk.input_text`); no raw audio |
| **OpenAI Agents** | Yes (`transcribe` / `speech` ops) | Text + format metadata only |
| **Vercel AI SDK 7** | Manual spans only | Docs example stores byte count, not audio |
| **ElevenLabs hosted** | No | Not exported |

## Remaining gaps

1. **Frameworks don't ship audio by default** — customers must attach URLs or base64 via the attrs above, or put audio parts in `gen_ai.{input,output}.messages` manually.
2. **LiveKit `audio_content` in chat_ctx** — still normalized to transcript text only; extend parser if LiveKit adds audio URL fields.
3. **Payload size** — inline base64 impractical beyond short clips; prefer durable URLs.
4. **No object-storage pipeline** for `file_id` audio attachments.

## Instrumentation example (TTS with playable output)

```json
{
  "gen_ai.operation.name": "speech",
  "gen_ai.request.model": "tts-1",
  "gen_ai.input.text": "It's sunny today.",
  "gen_ai.output.audio.uri": "https://cdn.example.com/tts/turn-42.mp3",
  "gen_ai.output.audio.mime_type": "audio/mpeg"
}
```

Or embed in messages (also works on any span):

```json
{
  "gen_ai.operation.name": "speech",
  "gen_ai.output.messages": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"It's sunny.\"},{\"type\":\"uri\",\"modality\":\"audio\",\"uri\":\"https://cdn.example.com/out.mp3\",\"mime_type\":\"audio/mpeg\"}]}]"
}
```

## Recommended follow-up

| Phase | Scope |
| --- | --- |
| **1** | Document instrumentation contract in Mintlify (`vercel-ai-sdk-v7`, `livekit`) |
| **2** | SDK helpers to set `gen_ai.output.audio.uri` / upload + URL on manual STT/TTS spans |
| **3** | Object storage + signed URLs for large audio blobs |

## Tasks

### Investigation (LAT-720)

- [x] **INV-1**: Audit UI audio rendering support
- [x] **INV-2**: Audit OTLP parsers and framework telemetry
- [x] **INV-3**: Confirm conversation tab is LLM-only (rollup gate) — out of scope
- [x] **INV-4**: Implement span-level voice UI + `parseVoice` parser

**Exit gate**: Span detail shows audio controls for voice spans when audio is present in span payload.
