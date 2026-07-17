# Taxonomy glossary — adaptive-clustering harness terms

A developer's reference for the mathematical and machine-learning terms used in
the taxonomy adaptive-clustering work (the calibration harness under
`packages/domain/taxonomy/src/calibration/` and its `BASELINES.md`, introduced in
PR #4079). No math background assumed; each entry leads with the plain idea, then
ties it back to how the harness uses it.

---

## 1. Vectors and similarity (the embedding space)

**Vector / embedding.** A list of numbers that represents something as a point
in space. Here, each user session is turned into a list of 2048 numbers (an
"embedding") by a model. Sessions about similar topics end up as points near
each other. "2048 dimensions" just means the list is 2048 numbers long — you
can't picture 2048 axes, but all the geometry (distance, angle) works the same
as it does in 2D or 3D.

**L2 norm.** The length of a vector in the ordinary ruler sense: the
straight-line distance from the origin to the point. Computed as the square root
of the sum of the squared components (the Pythagorean theorem, generalized to
many dimensions).

**L2-normalized.** Every vector has been divided by its own length so it comes
out to length exactly 1. Geometrically you keep each point's *direction* but
discard its *magnitude* — every point is slid onto the surface of a unit sphere.
This is done so that comparisons only care about direction (topic), not length.

**Dot product.** Multiply two vectors component-by-component and add up the
results — a single number. Cheap to compute (no square roots, no division).

**Cosine similarity.** A measure of how alike two vectors are based on the
*angle* between them, ignoring length. Runs from -1 (opposite) through 0
(unrelated) to 1 (same direction). Its full formula divides the dot product by
both vectors' lengths — but when both are already L2-normalized, those lengths
are 1, so cosine similarity collapses to *just the dot product*. That's why the
artifact says normalizing lets it skip the expensive part.

**Centroid.** The average position of a group of points — the group's center of
mass. In this system, each final category is represented by its centroid, and
new sessions are compared against those centroids to decide where they belong.

---

## 2. Clustering and the tree

**Clustering.** Grouping points so that similar ones land together, without
being told the groups in advance ("unsupervised"). The goal here is to discover
what topics users talk about automatically.

**Divisive hierarchical clustering.** A top-down strategy: start with everything
in one big bucket, then repeatedly ask "does this bucket actually contain more
than one topic?" If yes, split it and recurse into each piece; if no, stop. The
opposite approach (bottom-up, merging small groups) is "agglomerative" — not
used here.

**Tree / node / root / leaf / depth.** The output of divisive clustering is a
tree. The **root** is the starting bucket with all sessions. A **node** is any
bucket. A **leaf** is a bucket that was never split — it becomes a final
category. **Depth** is how many splits down you are: root is depth 0, its
children depth 1, and so on. The **depth schedule** is a table saying how strict
the split rules should be at each depth.

**k-means.** A classic clustering algorithm: to split a bucket into K groups,
guess K centers, assign each point to its nearest center, recompute each center
as the average of its assigned points, and repeat until things stop moving.
**K** is simply the number of groups you're splitting into.

**Spherical k-means.** k-means adapted to work with cosine similarity on the
unit sphere (directions) instead of ordinary straight-line distance. Appropriate
because the embeddings are L2-normalized.

**k-means++ initialization.** k-means' final answer depends on where you place
the initial centers. Pure-random placement can give bad results. k-means++ is a
smarter way to pick the starting centers — spreading them out so they're
unlikely to bunch up — which gives better, more reliable clusters. The artifact
stresses that both builders share the *same* k-means++ init and *same* seed so
the comparison is fair.

**Calinski–Harabasz score (variance-ratio criterion).** A single number scoring
how good a particular split is. Intuitively: how far apart the groups are from
each other, divided by how tight each group is internally (with an adjustment
for how many groups you made). Higher is better. It's used to pick the best K —
try K = 2, 3, 4…, score each, keep the winner.

---

## 3. The split-acceptance gate (the heart of the PR)

**Gate.** A yes/no test that decides whether a proposed split is real enough to
keep. The whole PR is about replacing one kind of gate with a better one.

**Absolute gate / `maxSiblingCosine`.** The *old* test. It looks only at how
similar two proposed sibling centroids are (their cosine) and rejects the split
if that similarity is above a fixed ceiling (e.g. 0.85). Problem: it can't tell
"these are secretly the same topic" from "these are genuinely different topics
that share specialized vocabulary." Narrow-domain products break it, because all
their real topics sit very close together (cosine 0.97–0.98) and every split
gets wrongly rejected.

**Sibling centroid cosine.** The cosine similarity between the centers of two
proposed sibling groups — i.e. how close the two candidate topics sit. High
means they look similar.

**Within-child spread / within-distance.** How tightly bunched a candidate
group's own members are around their own center. A tight group has small spread;
a loose, diffuse group has large spread.

**Relative separation.** The *new* test's core quantity: the gap between sibling
centroids **divided by** the within-child spread. It asks "is the gap between
the two blobs bigger than the blobs themselves?" A ratio well above 1 means a
real boundary; a ratio near 0 means one blob that k-means arbitrarily sliced in
half. This fixes the narrow-domain problem because tight groups have small
spread, so even a small absolute gap can still be *large relative to the
spread*.

**`minRelativeSeparation`.** The threshold the relative-separation ratio must
clear for a split to be accepted (**0.45 / 0.55 / 0.65** by depth). Calibrated on
the **real** narrow-domain pilot corpus, not the synthetic fixtures. On the
synthetic blobs, coherent boundaries land ≥ 1.2 and spurious ones ≤ 0.29 — a wide
empty gap that would allow almost any threshold. Real embeddings are messier:
coherent intent boundaries there sit at ~0.45–0.90 with no clean gap, so a
synthetic-only value (~0.6) collapses the real tree. 0.45 at the root is what
resolves the pilot's single production cluster into four coherent intents; it
tightens with depth. See `BASELINES.md`.

**Dominant-child protection / `maxDominantChildFraction`.** A guardrail (set to
0.9): if one proposed child would keep more than 90% of the parent's members,
that's not a real partition — it's k-means peeling off a tiny splinter and
calling the leftover 90% a "sibling." Such splits are rejected.

**Routing threshold / member-confidence routing / admission.** Separate from
*whether to split*, each accepted category gets a similarity bar that a *future*
session must clear to be filed under it. Set from the lower tail of that
category's own members' similarity to its center, so roughly 85% of its known
members would still get admitted. This stops ambiguous new sessions from being
dumped into whatever narrow category they're marginally closest to.

**`fellBackToStatic` / fallback.** A safety flag. If an adaptive split ever
produces a broken (non-finite — see below) number, this flag flips true, and
later phases will fall back to the old static builder for that run rather than
save garbage.

**`1e-6` floor / non-finite.** A numerical-safety detail. Dividing by a number
very close to zero produces "non-finite" values — `NaN` (not-a-number) or
`Infinity`. Since relative separation divides by the within-child spread, and a
group of identical points has spread zero, the code clamps the divisor to a tiny
minimum (0.000001) so the division can never blow up. One fixture deliberately
includes 40 identical vectors to prove this works.

---

## 4. Evaluation metrics (scoring the results)

**Purity.** For each cluster, find its most common true label, count how many of
its members carry that label, then total across clusters and divide by all
points. 1.0 means every cluster contains only one true topic. Answers: "are the
clusters clean?"

**Per-group / per-label recall.** For each true topic, what fraction of that
topic's sessions ended up gathered into a single cluster rather than scattered.
Answers: "did we keep each topic together?"

**ARI (Adjusted Rand Index).** Measures how much two different groupings of the
same items agree, corrected for the agreement you'd expect by pure chance. 1.0 =
identical groupings; ~0 = no better than random; negative = worse than random.
The "adjusted" part is what stops trivial or lucky agreement from looking
meaningful. Used two ways here: comparing adaptive vs static on easy corpora
(should agree → recorded 1.000), and comparing adaptive against itself on
overlapping subsamples (should be stable → ~0.99 on synthetic fixtures, **0.85 on
the real pilot**; the floor is set to 0.8).

**Partition.** Any way of dividing a set into non-overlapping groups. Both a
clustering result and the ground-truth labels are partitions of the same
sessions.

**Partition signature.** A deterministic fingerprint (like a hash) of a
partition, so two runs can be checked for producing the *exact* same grouping.
Enables the "deterministic" guarantee — same input, byte-identical output.

**Unimodal.** Describes data with a single peak/blob — genuinely one topic. The
"unimodal fixture" is a stress test that *must not* be split; if the gate ever
carves it up, the gate is too loose. ("Bimodal" would mean two natural peaks.)

**Quantile.** A cutoff point in sorted data. The 0.8-quantile is the value below
which 80% of the data falls (same idea as the 80th percentile, expressed as
0–1). The code uses quantiles instead of the maximum or minimum precisely so a
single outlier can't distort the measurement — e.g. the within-child spread uses
the 0.8-quantile of member distances, not the single farthest member.

---

## 5. Fixtures and determinism

**Fixture / corpus.** A fixed, known dataset used for testing. The *committed*
corpora are synthetic collections of embedding vectors with known labels,
generated on the fly rather than loaded from a file. The schedule numbers were
*additionally* calibrated against real pilot embeddings pulled from production for
offline analysis and deliberately **not committed** (see `BASELINES.md` →
"Validation on the real pilot corpus").

**PRNG (pseudo-random number generator).** An algorithm that produces
random-*looking* numbers from a deterministic formula. Not truly random — the
whole sequence is fixed once it starts.

**Seed / seeded PRNG.** The seed is the PRNG's starting value. Because the
sequence is fully determined by the seed, the same seed always replays the
identical sequence on every machine. "No `Math.random`" means they avoid
JavaScript's implicitly-seeded (unreproducible) generator in favor of a seed
they control — so fixtures come out identical every run and the recorded numbers
stay checkable.

**Deterministic.** Same input always produces exactly the same output, with no
reliance on randomness, wall-clock time, or machine specifics. Essential here
because the test suite asserts exact recorded numbers.

**Anchor direction / `anchorWeight`.** The knob that generates narrow-domain
geometry. Pick one shared "anchor" direction for the whole corpus, then blend
each group's own random direction toward that anchor by `anchorWeight`. A higher
weight pulls the groups' centers closer together — that's how they synthetically
reproduce the 0.97–0.98 sibling-cosine crowding of a real narrow-domain product.

**Spread (fixture parameter).** How loosely scattered a generated group's points
are around its center. Small spread = a tight blob; used to build the "tight
blobs, small gap" shape that defeats the old gate but passes the new one.

**Cross-sample ARI.** Run the adaptive builder on two heavily-overlapping
subsamples of the same corpus (split by index remainder, not randomly, to stay
deterministic) and measure ARI between the two results. High agreement means the
builder is stable and not overreacting to small input changes.

---

## 6. Rollout and operational terms

**Baseline.** The recorded "known-good" numbers (in `BASELINES.md`) that future
phases must not regress below.

**Regression.** A change that makes something worse than before. "Broad-domain
regression" tests check the new gate didn't degrade the cases the old gate
already handled well.

**Exit criteria.** The pass/fail bar this phase had to clear (e.g. purity ≥
0.85, recall ≥ 0.85, cross-sample ARI ≥ 0.8, runtime ≤ 1.25× static). The
27-assertion test file enforces them on synthetic fixtures; labeled purity and
recall on the real pilot remain provisional pending human labels (see
`BASELINES.md`).

**A/B.** Comparing two variants under otherwise-identical conditions. Here:
static builder vs adaptive builder, where the *only* difference is the
split-acceptance gate — which is why the code forks k-means verbatim rather than
sharing it.

**Node cap / churn ceiling / fallback ceiling / shadow window.** Rollout limits
for later phases. **Node cap** (128) caps how many categories the tree may grow.
**Churn ceiling** (0.5) limits how much the taxonomy is allowed to change
between rebuilds. **Fallback ceiling** (0.05) limits how often the adaptive
builder may bail out to static. **Shadow window** (14 days) is a period where
the new system runs alongside production without affecting it, so its behavior
can be observed safely.

**RSS (Resident Set Size).** The amount of actual physical RAM a process is
using. "Peak RSS ~300 MB (≤ 512 MB worker budget)" means the worst-case memory
use stayed under the memory a background worker is allowed.

**Runtime ratio (~0.98× static).** How long adaptive takes relative to static.
0.98× means it's essentially the same speed — the extra adaptive work is dwarfed
by the shared k-means step.

**Knip.** A linter that flags unused/dead exports in the codebase. Since the
harness is intentionally *not* exported (so it never ships to production), Knip
would wrongly flag all of it — hence a small config addition telling Knip to
ignore that one folder.

**Gardening.** Latitude's internal name for the background job that builds the
taxonomy tree from session embeddings.
