# Session Intent Projection For Taxonomy

> **Status**: Idea
> **Related documentation**: [`dev-docs/taxonomy.md`](../dev-docs/taxonomy.md), [`dev-docs/conversation-intelligence.md`](../dev-docs/conversation-intelligence.md), [`packages/domain/conversation-intelligence/src/use-cases/analyze-session.ts`](../packages/domain/conversation-intelligence/src/use-cases/analyze-session.ts)

## Goal

Stop persisting the full role-prefixed transcript in `taxonomy_observations`. Replace it with a short LLM-generated **user intent** string, embed that, and store only the intent. The result is **~120× less storage** for the taxonomy table, **better clustering signal**, and cheaper LLM naming.

## The Current Cost

Each row in `taxonomy_observations` carries:

| Field | Size |
|---|---|
| `embedding` (voyage-4-large, 2048-D float32) | ~8 KB |
| `projectionMetadata.summary` (full transcript, middle-truncated to `CONVERSATION_INTELLIGENCE_LLM_MAX_DOCUMENT_CHARS = 24 000`) | up to **24 KB** |
| Header columns (ids, hashes, timestamps) | ~1 KB |

So roughly **75% of the row is duplicate transcript text** — the same content already lives in spans and `session_analyses`. On a 5 M-sessions/month tenant with a 30-day live window, this is ~3.6 TB of redundant transcript in ClickHouse.

The clustering pipeline samples at most `TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX = 10 000` newest observations per gardening pass, so we are paying for 99% of that storage on rows that will never be sampled.

## Where The Transcript Is Actually Used

In the taxonomy code path, the transcript string is read in exactly one place:

- `nameClusterUseCase` calls `listAllByCluster` and reads `row.projectionMetadata.summary` to feed the LLM naming prompt with example conversations from the cluster.

The embedding is hot-path (online routing, gardening build). The transcript text only matters at naming time, which fires for a few dozen clusters per gardening pass, not per observation.

## The Schema Already Anticipates The Fix

`TaxonomyProjectionMethod` already declares two values:

```ts
export const TaxonomyProjectionMethod = {
  MomentTextEmbedding: "moment_text_embedding",        // in use today
  SessionUserIntentEmbedding: "session_user_intent_embedding",  // reserved, no caller
} as const
```

`session_user_intent_embedding` is the slot. No schema migration, no enum extension — only the producer side (`analyzeSessionUseCase`) has to start populating it.

## Proposed Model

### 1. Generate a user intent string at analyze time

During `analyzeSessionWorkflow`, after segmentation but before taxonomy emission, produce a short structured intent description such as:

```text
User wants to track delivery of order ACM-78432 before Tuesday and asks
about upgrading shipping speed.
```

Roughly 150–300 characters per session, single sentence, focused on **what the user came to do**. Not the assistant's response, not greetings, not tool calls.

How to produce it:

- **Option A (preferred)**: extend the existing CI segmentation/labeling LLM call to additionally emit a `session_user_intent` field. Conversation intelligence already runs an LLM on every analyzed session, so no new LLM call is required — just an extra schema field on the existing structured-output call.
- **Option B**: a thin dedicated LLM call. Simple, but doubles per-session LLM cost vs Option A.
- **Option C**: deterministic extraction (first user message + simple rules). Free, but loses the "intent" framing — would just be the literal first user turn, which is noisy.

Option A is what conversation intelligence is designed for. The user intent is essentially "what is this conversation about, from the user's side", which is the same shape as labels and topic facets.

### 2. Embed the intent string instead of the transcript

`embedBehaviorSummaryUseCase` already does generic embedding. Switch the input from the transcript to the intent text. Same voyage-4-large model, same 2048-D output. Embedding cost drops because:

- Input tokens: ~6 000 → ~80 per call.
- Voyage pricing is per-token, so ~75× cheaper per embedding.
- For a 5 M-sessions/month tenant: roughly a $X/month line item drops to $X/100.

### 3. Persist intent text as `projectionMetadata.summary`

The field stays — naming still reads `summary` — but its contents change from 24 KB of transcript to ~200 bytes of intent. The `projectionMethod` column on the row becomes `session_user_intent_embedding` so we can tell new rows from old ones.

### 4. Naming gets shorter and sharper

The naming LLM currently sees up to 8–12 FPS-sampled transcripts (24 KB each) and is asked to find the topic. With intent strings:

- The prompt fits comfortably in a small context window.
- Each sample is already focused on intent — no boilerplate, no greetings, no tool noise.
- Topic-shaped names become the path of least resistance, weakening the failure mode the new `TOPIC_POLICY` prompt is fighting.

## Expected Quality Impact

Embedding quality on intent strings should match or beat embedding quality on transcripts for the purpose of topic clustering, because:

- The transcript embedding is dominated by frequent boilerplate (greetings, agent acknowledgements, tool turns) that does not carry topic signal.
- voyage-4-large performs strongly on short, focused inputs.
- Intents are already conceptually what the clustering schedule is trying to recover; clustering them is closer to the actual product question than clustering transcripts.

A concrete prediction: the seeded Acme corpus, which today produces a clean tree of orders / mobile / flights, would produce the same shape with **less centroid drift between passes** (because intent text is less variable than full transcripts) and possibly one more depth-3 split (because intent embeddings separate "order modification" from "order return" more crisply than transcripts do).

## Migration

Because gardening is a clean rebuild every pass and the live window is bounded at `TAXONOMY_OBSERVATION_RETENTION_DAYS = 30`, **no historical migration is needed**:

1. Ship the producer change so new analyses emit `session_user_intent_embedding` rows alongside (or in place of) `moment_text_embedding` rows.
2. Wait 30 days for the live window to fully replace itself.
3. Optionally: backfill via `scripts/taxonomy/rebuild.ts` against the demo project to validate cluster quality on intent embeddings.
4. Drop the `moment_text_embedding` projection entirely (it has no other callers — the enum slot can be removed in a follow-up).

If we want the storage win sooner, a one-time backfill activity can re-emit each session's observation in the new projection.

## Smaller Win That Could Ship Independently

If switching the projection feels like a bigger change than wanted right now, an interim PR can drop the transcript from `taxonomy_observations` without changing the embedding source:

1. Remove `projectionMetadata.summary` from the written row.
2. In `nameClusterUseCase`, instead of reading the summary off the observation row, fetch it from `session_analyses` (keyed by `session_id`, already has the projection text) at naming time.

This gets the storage savings (24 KB → 0 KB per row, ~8 KB embedding stays) immediately, with no behavioral change to clustering. Cluster naming pays one extra read per cluster (~30 reads per gardening pass — negligible).

The full intent-projection change is strictly better — fewer bytes, faster embedding, better clustering signal, sharper naming — but the interim shortcut is one PR if the storage cost is the urgent driver.

## Open Questions

- Is there an existing "intent" field already produced by conversation intelligence that we can reuse without a new LLM emission?
- Should the intent string be regenerated when a session is re-analyzed (`replaceObservationInClusterUseCase` path), or is it stable enough across analysis generations to keep?
- How long should the intent be? 1 sentence vs 1 paragraph. Trade-off: short is cleaner for clustering, longer gives the naming LLM richer context.
- Should we keep the transcript embedding as a fallback during a transition period, so failed intent generations don't lose their session?

## Recommendation

Ship this. It is the highest-leverage single change available on the taxonomy storage profile: roughly 120× less per-row storage, cheaper embeddings, cheaper naming, and likely better cluster quality. The schema already supports it, the migration cost is "do nothing for 30 days", and conversation intelligence is already the right place to produce the intent string.
