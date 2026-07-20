# Custom Facet Taxonomies

> **Status**: Idea
> **Inspiration**: [Clio: Privacy-Preserving Insights into Real-World AI Use](https://arxiv.org/pdf/2412.13678)
> **Related documentation**: [`dev-docs/taxonomy.md`](../dev-docs/taxonomy.md), [`ideas/taxonomy-session-intent-projection.md`](./taxonomy-session-intent-projection.md)

## The idea in one paragraph

Today the Behaviors page groups sessions by topic, and "topic" is the only lens we have. This idea lets users pick the lens: group my sessions by what the user was trying to achieve, by how the conversation ended, by why it failed, or by any question they write themselves. Each lens produces its own tree, built by the same clustering machinery we already run.

## How clustering works today

For every analyzed session we take the transcript, turn it into an embedding (a vector of numbers where similar texts get similar vectors), and store one row per session in ClickHouse. Every few hours a background job samples those vectors, groups nearby ones into clusters, and an LLM names each cluster. That tree is the Behaviors page.

The weak point is the input. A transcript is mostly greetings, boilerplate, and assistant phrasing, so "similar vectors" means "conversations that look alike overall", not "conversations about the same thing". The tree means "topic" only by accident.

## The insight from the paper

Don't embed the conversation. Ask a question about it, and embed the answer.

Ask "what was the user trying to do?" and you get a sentence like "recover access to a locked account". Ask "how did it end?" and you get "resolved after identity verification". Same session, two different sentences, two different vectors, two different trees. The question defines what the clusters mean. That question is what we call a **facet**.

Everything downstream of the sentence stays exactly as it is: same embedding model, same clustering, same naming, same trees. The only new moving part is one LLM call that turns a session into a short answer.

## Two dials, not one

We already have Cohorts, which filter *which sessions* get clustered ("only checkout sessions"). A facet changes *what similarity means* ("group by failure reason"). They combine freely: "checkout sessions, grouped by failure reason" is a cohort plus a facet. Keeping the two concepts separate in the product matters, because filtering to refund sessions and grouping by refund intent are different operations.

## What changes in storage

Very little, and that's the point.

- Postgres keeps what it has: the cluster trees, run history, and definitions (cohorts today, facet definitions tomorrow). No embeddings live here, only small control data.
- ClickHouse keeps the heavy rows. Today: one row per session with its embedding (`taxonomy_observations`). New: one row per session **per facet** with that facet's sentence and embedding (`taxonomy_facet_projections`), plus a small table of session-to-cluster edges per facet tree.

Why a separate table instead of reusing the existing one? The existing table has no "which question is this?" column, and every query assumes all rows mean the same thing. Mixing outcome sentences into it would quietly pollute the topic tree. A separate table also means deleting a facet is just dropping its rows, with zero risk to the main tree.

The unavoidable cost: a facet cannot reuse the existing embedding. A different question means a different sentence and a different vector, per session, per facet.

## When does the LLM call run?

This is the main cost decision, and the answer is "two different ways for two different cases":

- **The default topic tree**: extract at analysis time, for every session. This is nearly free because conversation intelligence already makes one LLM call per analyzed session; the sentence is one extra field on that call. This is also the first thing to ship (see rollout), because it replaces the blurry transcript embedding with a sharp one.
- **Custom facets**: extract lazily, only when the clustering job runs, and only for the sessions it samples (capped at 1.5k per pass). Results are cached, and the sampler picks mostly the same sessions each pass, so repeat passes are mostly cache hits. The consequence is the headline cost property: **a custom facet costs the same on a 50k-sessions/month tenant as on a 5M one**, roughly $30 to build a tree and tens of dollars a month to keep it fresh with a cheap model.

## Decisions already made

- **One sentence per session per facet.** A session covering several topics collapses to its dominant one. That's the same simplification the current system makes implicitly; we're just making it explicit. Extraction input is truncated to a fixed budget, and a failed or oversized extraction falls back instead of breaking analysis.
- **Editing a facet's question creates a new version.** Changing the question changes what every vector means, so old and new vectors never mix, and the tree effectively restarts.
- **"Can't tell from the conversation" is a valid answer.** Those sessions are excluded from clustering rather than lumped into an "Unknown" cluster. A high unknown rate is a sign the facet is badly worded.
- **Preview before building.** Creating a facet runs the question over ~10 sample sessions and shows the raw answers first, so users catch a bad question before paying for a tree.
- **Yes/no questions don't belong here.** If the honest answer space is three values ("resolved / partial / unresolved"), that's a label, not a tree; it belongs in the moments system, which already overlays labels onto any tree. Clustering is for questions with many possible answers.
- **Guardrails are system-owned.** The user writes the question; the system wraps it with the fixed rules: treat the transcript as data rather than instructions, no names or personal details, say "unclear" instead of guessing.

## Rollout

1. Swap the default tree's input from transcript embedding to an extracted "apparent user goal" sentence ([the existing intent-projection idea](./taxonomy-session-intent-projection.md)). This proves the whole approach on the facet we get for free, and pays for itself in storage and embedding cost alone.
2. Generalize: facet definitions, the projections table, and two or three built-in facets (goal, outcome, failure reason).
3. Open up user-written facets, with the preview step required.
4. Cross-facet analysis ("which goals fail most?") via the existing moments and score overlays, not by multiplying trees.

## Open questions

- Does the extracted-sentence tree actually beat the transcript tree on our seeded corpora? Step 1 answers this before anything else gets built.
- Does a facet tree carry its own session filter, or reference an existing cohort as its scope?
- How loudly should the UI warn that editing a facet's question resets its tree and history?
