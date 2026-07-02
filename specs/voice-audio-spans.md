# Voice agent STT/TTS spans and playable session audio

> **Investigation**: LAT-720 (2026-07-02)
> **Related docs**: `docs/telemetry/frameworks/livekit.mdx`, `docs/telemetry/frameworks/vercel-ai-sdk-v7.mdx`, `docs/telemetry/frameworks/elevenlabs.mdx`, `dev-docs/conversation-timeline.md`

## Question

Can STT and TTS spans be ingested and rendered as **playable audio** in the session Conversation tab — and is that feasible at all?

## Executive summary

| Layer | Status today | Playable audio? |
| --- | --- | --- |
| **Conversation UI** | Ready — `AudioContent` renders `uri` and `blob` parts with `modality: "audio"` | Yes, if messages contain audio parts |
| **Span ingestion** | STT/TTS spans can be stored when frameworks emit them with `gen_ai.*` attrs | Partial — frameworks emit **text**, not audio |
| **Content parsers** | LiveKit `audio_content` → transcript text only; OpenAI Agents transcription/speech → flat text attrs | No audio extracted |
| **Trace/session rollup** | Conversation built only from `chat` / `text_completion` / `generate_content` spans | STT/TTS spans excluded |
| **Session Conversation tab** | Shows the **latest trace's** rolled-up conversation only | Multi-turn voice sessions not stitched |

**Bottom line:** Playable audio in the Conversation UI is **technically feasible** (the renderer already exists, same as images), but **not achievable out of the box** for voice agents today. Frameworks do not put raw audio into span payloads, parsers normalize audio to text, and rollup gates exclude `transcribe` / `speech` operations from the conversation model.

## What works today

### UI (`@repo/ui` genai-conversation)

The conversation renderer already supports playable audio:

- `{ type: "uri", modality: "audio", mime_type: "audio/mpeg", uri: "https://…" }` → native `<audio controls>`
- `{ type: "blob", modality: "audio", mime_type: "audio/mpeg", content: "<base64>" }` → data-URI player

See `packages/ui/src/components/genai-conversation/parts/media-content.tsx` and the design-system chat fixture (`apps/web/src/routes/design-system/chat.tsx`).

Images follow the same pattern (`uri` / `blob` + `modality: "image"`). Audio is the same class of feature.

### Span storage

Parsed `input_messages` / `output_messages` are stored as JSON on each span row in ClickHouse (`spans.input_messages`, `spans.output_messages`). Any GenAI message part shape rosetta accepts — including audio `uri` and `blob` parts — can be persisted if the OTLP content parser produces it.

The gen_ai content parser passes multimodal `uri` parts through verbatim (`packages/domain/spans/src/otlp/content/genai.ts`).

## What does not work today

### 1. Frameworks emit text, not audio

**LiveKit Agents** (`lk.chat_ctx`):

- `audio_content` items carry a `transcript` field.
- Latitude's parser maps them to `{ type: "text", content: transcript }` — audio bytes/URLs are discarded.
- See `packages/domain/spans/src/otlp/content/livekit.ts` and `docs/telemetry/frameworks/livekit.mdx`.

**OpenAI Agents SDK** (Latitude instrumentation):

- `transcription` spans: `gen_ai.operation.name = transcribe`, `gen_ai.output.text = <transcript>`
- `speech` spans: `gen_ai.operation.name = speech`, `gen_ai.input.text = <text>`, `openai.agents.audio.output_format`
- No audio payload in span attributes.
- See `packages/telemetry/typescript/src/sdk/instrumentations/openai-agents/instrumentation.ts`.

**Vercel AI SDK 7**:

- `@ai-sdk/otel` traces LLM calls only.
- Docs recommend **manual spans** for `transcribe()` / `generateSpeech()`; the TTS example stores only `voice.output.bytes` (byte count), not audio.
- See `docs/telemetry/frameworks/vercel-ai-sdk-v7.mdx`.

**ElevenLabs Agents** (hosted):

- STT/TTS run on ElevenLabs infrastructure and are **not exported** to third parties.
- Only the custom-LLM step is observable.
- See `docs/telemetry/frameworks/elevenlabs.mdx`.

**General voice-agent architecture** (from team discussion on LAT-720):

```
Receive audio → STT → text → LLM (captured) → TTS → audio out
```

STT and TTS typically sit **outside** the generation span the customer instruments. Even when STT/TTS spans exist (e.g. LiveKit with `disableSmartFilter: true`), they carry transcripts/text, not playable media.

### 2. Smart filter drops STT/TTS by default (LiveKit)

Latitude's smart filter exports spans with `gen_ai.*` / known LLM instrumentation scopes. LiveKit STT/TTS/VAD spans often lack those attributes and are **filtered out** unless `disableSmartFilter: true` on `LatitudeSpanProcessor`.

### 3. Conversation rollup excludes STT/TTS operations

Migration `00040_gate_rollup_conversation_and_usage_by_operation.sql` gates trace/session conversation to:

```sql
operation IN ('chat', 'text_completion', 'generate_content')
```

`transcribe` and `speech` spans are **never** rolled into `TraceDetail.allMessages` or session `output_messages`, even if they carry `output_messages` with audio parts.

`findMessagesForTrace` / `findMessagesForSession` use the same operation allowlist (plus `execute_tool` for timeline mapping):

```sql
operation IN ('chat', 'text_completion', 'generate_content', 'execute_tool')
```

### 4. Session Conversation tab shows one trace

The session Conversation tab mounts the **latest ingested trace's** conversation (`conversation-tab.tsx` comment: "renders the latest ingested trace's conversation"). A voice session with one trace per user turn does not show a merged multi-turn transcript with inline audio across turns.

### 5. No object-storage pipeline for `file_id` audio

`{ type: "file", file_id: "…" }` parts render a non-playable `FileCard` (no resolvable source). There is no ingest-time upload that turns audio bytes into a durable `file_id` + signed URL.

### 6. Payload size constraints

- Inline OTLP queue payloads cap at **50 KB** (`INLINE_PAYLOAD_MAX_BYTES` in `ingest-spans.ts`); larger batches go to disk.
- Base64 audio in span JSON is impractical for anything beyond short clips (a few seconds of MP3 is hundreds of KB).
- Claude Code telemetry clamps oversized span attributes (~150 KB per attribute).
- Durable audio needs **URI references** (customer-hosted or Latitude object storage), not inline blobs.

## Feasibility assessment

### Can we render playable audio?

**Yes** — the UI path is done. Any conversation message containing a valid `uri` or small `blob` audio part will render a native audio player.

### Can we ingest STT/TTS spans?

**Yes, partially:**

- Spans with `gen_ai.operation.name` of `transcribe` or `speech` ingest and appear in the Spans tab.
- They resolve operation, model, provider, and text attributes.
- They do **not** surface in the Conversation tab today (rollup gate).

### Can we get playable audio without customer changes?

**No.** No supported framework currently emits audio bytes or durable audio URLs in span message payloads.

### What would it take to ship playable voice in sessions?

Recommended phases:

#### Phase 1 — Text-only STT/TTS in conversation (lower effort)

1. Extend rollup + `findMessagesFor*` gates to include `transcribe` and `speech` (and decide usage/cost treatment).
2. Add content parsing for `gen_ai.input.text` / `gen_ai.output.text` → GenAI messages when `gen_ai.input.messages` / `gen_ai.output.messages` are empty.
3. Map OpenAI Agents transcription → user message with transcript; speech → assistant message with input text.
4. Document manual instrumentation pattern: put transcript in `gen_ai.output.messages` on STT spans (already in Vercel AI SDK docs).

**Outcome:** STT/TTS steps visible as text in conversation; still no audio playback.

#### Phase 2 — Playable audio when customers provide URLs or small blobs (medium effort)

1. Document instrumentation contract:
   - STT input: `{ type: "uri", modality: "audio", uri: "<input-audio-url>", mime_type: "audio/…" }` on user message in `gen_ai.input.messages`
   - TTS output: same on assistant `output_messages`, or `blob` for short clips
2. Extend LiveKit parser: if `audio_content` carries an `audio` / `url` field (not just `transcript`), emit a `uri` part alongside the transcript text.
3. Optionally add span-detail audio player for spans that carry audio parts but fall outside rollup (debugging).

**Outcome:** Customers who upload audio to their own storage (S3, etc.) and reference URLs in span attrs get playable audio — same model as images.

#### Phase 3 — First-class audio storage (larger effort)

1. Ingest-time or SDK-side upload of audio bytes → SeaweedFS / org object store.
2. Resolve `file_id` parts to signed URLs in the web app (like a future file-attachment product surface).
3. Session-wide conversation merge across traces (multi-turn voice sessions).
4. Timeline: STT/TTS spans as first-class activity categories on the conversation minimap.

**Outcome:** Langfuse-parity voice observability for voice-agent customers.

## Instrumentation guidance (interim)

Until product work lands, customers who need audio in Latitude should:

1. **Disable smart filter** for LiveKit if they want STT/TTS spans at all: `LatitudeSpanProcessorOptions({ disableSmartFilter: true })`.
2. **Manual spans** for STT/TTS with explicit `gen_ai.input.messages` / `gen_ai.output.messages` containing:
   - `uri` parts pointing to **durable, browser-reachable** audio URLs (signed S3, CDN, etc.)
   - transcript as `text` parts on the same message
3. Accept that rolled-up Conversation tab will **not** show those messages until rollup gates are extended.
4. View individual STT/TTS spans in the **Spans tab** (span detail shows `input_messages` / `output_messages` when present).

Example TTS output message alongside text:

```json
{
  "role": "assistant",
  "parts": [
    { "type": "text", "content": "It's sunny today." },
    {
      "type": "uri",
      "modality": "audio",
      "mime_type": "audio/mpeg",
      "uri": "https://cdn.example.com/tts/turn-42.mp3"
    }
  ]
}
```

## Comparison to Langfuse

Langfuse voice-agent users typically see audio when the **integration** attaches media to observations (often via base64 or external URL in the observation payload). Latitude's equivalent hook is GenAI message `uri`/`blob` parts on span messages — the renderer is ready, but the ingestion path and rollup model do not yet promote STT/TTS audio into the session conversation.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Investigation (LAT-720)

- [x] **INV-1**: Audit UI audio rendering support
- [x] **INV-2**: Audit OTLP parsers and framework telemetry for audio payloads
- [x] **INV-3**: Audit rollup gates and session conversation assembly
- [x] **INV-4**: Document feasibility and recommended implementation phases

**Exit gate**: Written findings with clear yes/no on playable audio feasibility and a phased path forward.
