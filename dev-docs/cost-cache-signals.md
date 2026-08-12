# Cache findings as signals

How the cost section's cache verdicts become signals, why the gates are where they are, and
the QA plan that proves it.

Background on the verdict itself: `dev-docs/prompt-cache-ttl-detection.md` for why the cache
lifetime is a static table, and the cost section's own panel for what a reader sees.

## One classifier, two consumers

The judgment is `judgeCacheEconomics` over a ClickHouse read, and the fireability of that
judgment is `evaluateCacheFinding` / `reviewCacheFindings` — both in `@domain/spans`, both
pure, both browser-safe.

| Consumer | Reads | Adds |
| --- | --- | --- |
| Cost panel (`apps/web` cache-economics panel) | `judgeCacheEconomics` for the selected window | a lifetime control for exploration, and a badge linking to a signal when one is open |
| Signal producer (`syncCacheFindingSignalsUseCase`) | the same function over three weekly windows | the gates below, plus the open/refresh/resolve lifecycle |

Nothing recomputes a verdict. The producer copies `documented` onto the signal verbatim, so
what a dispatched agent is briefed on is what the panel shows. The drift check is split
across the two sides so each lives with its consumer:

- `packages/platform/db-clickhouse/.../cache-signal-gates.test.ts` — the producer never
  alters a number it read, and never fires on a lifetime the reader chose.
- `apps/web/.../cache-economics-view.test.ts` — the panel's actionable-state list is pinned
  to `CACHE_SIGNAL_STATES`, so a fourth actionable state cannot appear on one side only.

## The gates

Every one must hold. They report *which* one bound (`CacheFindingSuppression`), because a
finding suppressed by the wrong gate is a bug that a zero count hides.

| Gate | Rule | Why |
| --- | --- | --- |
| `notActionable` | state ∈ `cacheIt`, `stopCaching`, `investigate` | the other three states exist to say nothing |
| `sampleFloor` | ≥ `CACHE_SIGNAL_MIN_CALLS` (100) calls in the window | five times the panel's floor; a rate over 20 calls can hold a table row but not a dispatch |
| `unknownCeiling` | the documented lifetime, ceiling, break-even and measured rate all exist | without a ceiling we cannot say the gap is reachable, which is the whole premise. `investigate/overpaying` is reachable with a null ceiling, so this is load-bearing rather than implied |
| `lifetimeAmbiguous` | the verdict is the same across every lifetime a provider could plausibly be running | if a customer opted into Anthropic's 1-hour cache, "stop caching" is actively wrong advice. Two plausible lifetimes disagreeing means we do not know the verdict |
| `spendFloor` | `savingsClearsFloor` — the same absolute-weekly **and** relative-share bar the recommendation cards use | "save $0.12/week" is not worth anyone's afternoon |
| `unstable` | the same state fires in all `CACHE_SIGNAL_STABILITY_WINDOWS` (3) windows of `CACHE_SIGNAL_WINDOW_DAYS` (7) | a rate sitting on a threshold crosses it most weeks by chance; a signal that reopens every other day is a false-positive generator however sound each run was |

Hysteresis is **derived from the data**, not from a stored counter: `cacheFindingWindows`
snaps three disjoint weekly windows to UTC midnight and each is judged independently. The
same history always yields the same decision, there is nothing to backfill or corrupt, and a
second run on the same day is a no-op.

### The sample floor cannot go much higher

`stopCaching` needs a ceiling under break-even. For every provider that charges for writes
that means almost no call arriving within the cache lifetime of another — and the same
cadence caps how many calls a week there can be. At one call per 1.7 hours, a week holds
about a hundred. A floor of a few hundred would silently delete the one recommendation that
saves money without touching the hit rate. That interaction is why 100, not 200.

## Lifecycle

`cache_findings` is a projection keyed by `fingerprint` = `cache:{provider}:{model}:{state}`,
unique per project. The uniqueness is a database constraint, so fire-once survives two
concurrent sweeps rather than depending on a read.

- **Open** once per fingerprint, writing a `signals` row with `source: "cost"`,
  `origin: "system"` and no centroid — a cache finding is measured, not clustered from score
  feedback, so it must not enter the discovery embedding space.
- **Stay quiet** while it persists. A refresh moves the measures and `lastObservedAt`;
  `firstObservedAt` does not, because how long a finding has gone unacted is what tells a
  reader whether anyone is on it.
- **State change** opens a new signal and resolves the old one. `Investigate` becoming
  `Stop caching` is a different fix, not an edit to something someone already read.
- **Resolve** when the finding clears, through `applySignalLifecycleCommandUseCase` — the
  same path a person resolving it from the inbox takes, not a second write. The signal is
  archived **first** and its row dropped **second**: the other order leaves a signal open in
  the inbox with nothing left to find it by, and no later sweep can recover it. A crash
  between the two steps leaves an archived row that the next sweep reads as
  already-handled-and-not-firing, and deletes.
- **Respect a decision**: `listByProject` returns rows whose signal is resolved or ignored,
  and the producer skips them. That direction is load-bearing and easy to get backwards —
  *hiding* archived rows from the producer is exactly what makes it re-fire, because a
  finding measured from steady traffic is still true tomorrow, so a hidden row reads as new
  on every sweep and opens a fresh signal daily. The row is the tombstone. A signal that was
  soft-deleted is a different case: that is not a decision to suppress anything, so the
  finding opens a new signal and takes the row over.

There is deliberately **no auto-reopen** of a resolved cost signal whose finding is still
firing. Reopening would undo the resolve the user just made, and `SignalRegressed` requires a
`triggerScoreId` a measured finding cannot supply. A finding that genuinely clears and later
returns does get a new signal — its row was dropped when it cleared — which is the
reopen-on-regression behaviour that matters. A verdict that *changes* is a different
fingerprint and gets its own signal either way.

## Dispatch

`SignalCreated` already fans out to `agent-dispatch/request` and to the discovery
notification, so a cost finding reaches a configured Cursor or Claude Code cloud agent with
no publisher of its own. `buildDispatchContextFromSignal` attaches a `cacheFinding` block —
the LAT-811 shape (`provider, model, state, urgency, actualRate, breakEvenRate, ceilingRate,
estimatedSavingsUsd, calls, cacheLifetimeSeconds, windowDays`) — read from the persisted
finding rather than recomputed, so the agent is briefed on the numbers the signal was opened
on and not on a fresh read that has since moved.

This payload is **internal**. LAT-811 is deliberately delayed pending validation that the
cost section earns its place, and `defineOperation` publishes to HTTP, MCP, both SDKs and the
CLI at once with no experimental tier. The shape is chosen so exposing it later is a mapping.

The brief itself (`renderCacheFindingPrompt`) is not trace-shaped: there are no member traces
to read and no failure to reproduce. It hands over the measured numbers and the lever list
(a timestamp or request id ahead of the breakpoint, non-deterministic key ordering, tool
definitions that change between calls, a breakpoint after the variable part of the prompt) and
tells the agent to stop rather than guess. A speculative change to prompt assembly is how a
cache recommendation turns into a regression.

Manual dispatch needs nothing new: a cost signal is a signal, so the signal detail page's
existing **Send to** menu already offers it.

## Where it runs

`cost-findings` queue topic, owned by `apps/workers/src/workers/cache-findings.ts`.

- `sweep` — daily at 05:00 UTC, fans out one `sync` per live project (reusing
  `listGardenableProjectRefs`, which already excludes demo and showcase projects).
- `sync` — three `getCacheEconomics` reads, judged, then
  `syncCacheFindingSignalsUseCase`. Throttled at 20h per project, so a second sweep the same
  day is dropped rather than re-scanning.

Daily rather than hourly because the finding has to hold for three weeks; a tighter cadence
would buy ClickHouse scans and move nothing. Sandbox orgs are filtered at dispatch time by
`requestAgentDispatchUseCase`, so no customer tokens are spent on Test Mode traffic.

## QA plan

Run the report to see every case at once:

```
pnpm --filter @platform/db-clickhouse ch:cache-signals:report
pnpm --filter @platform/db-clickhouse ch:cache-signals:report --set=negatives
```

The feeder is `cache-feeder.ts`: `CostCohort` already parameterises provider, model, arrival
cadence and cache behaviour, and the feeder supplies the read — reproducing what
`getCacheEconomics` returns for a window, including the detail that matters most (gaps are
taken between consecutive calls to the same **agent** across its whole traffic, never within
a session). Fixtures live in `cache-signal-qa.ts` and reuse the LAT-809 model identities.

### Must fire

| Case | Shape |
| --- | --- |
| `Cache it` | caching off, 95k-token prompts, bursts of six 40s apart on a no-write-premium model |
| `Stop caching` | isolated calls 1.7h apart on Anthropic's 5-minute family, 75% of the prompt written for a discount that never arrives |
| `Investigate` | caching on at a 6% rate against an 85% ceiling |

### Must not fire — these matter more

| Case | Gate that must bind |
| --- | --- |
| sparse traffic with a low rate | `sampleFloor` (sized above the panel's 20-call floor, so the gate under test is the one that holds) |
| already at or above the ceiling | `notActionable` — the residual gap is the fresh suffix every call carries |
| a genuinely free model | `notActionable` — zero spend cannot be reduced |
| below the spend floor | `spendFloor` — a real reachable gap worth a fraction of a cent |
| below the sample floor | `sampleFloor` — the `Cache it` shape at a twentieth of the volume |
| a series oscillating around the threshold | `unstable` — asserted over **every** rolling three-window view, plus a check that the series really does alternate so the case cannot pass for the wrong reason |
| a project younger than three weeks | nothing fires; there is no history to have held |
| **archetype A (healthy)** | nothing fires. This is the canonical case: one finding here means the gates are wrong |

One result from archetype A is worth knowing about rather than trusting. Its `gpt-5.4` cohort
bursts ten calls a day, and `gpt-5.4`'s documented lifetime is a full day — so every burst is
warm against the one before it, the ceiling is about 99%, and the measured 83% genuinely does
leave money. The panel says `investigate` there and is right; what keeps it out of the inbox
is the 100-call weekly floor, which ten calls a day does not clear. The archetype was
calibrated against a 30-day panel window before ceilings existed, and
`lifetime-coverage.test.ts` only checks lifetime sensitivity across 5m/30m/1h, so the one-day
case never came up. A test pins this exact suppression, so raising that cohort's volume would
fail loudly instead of quietly turning the calm archetype into a firing one.

### End to end

`--set=<name> --write=<projectId>` feeds a fixture's spans into ClickHouse. Then: the cost
panel should show the row under its heading, the daily sweep (or a manual `cost-findings`
`sync` publish) should open exactly the signals the report predicted, the badge on the panel
row should link to it, and **Send to** on the signal should render a brief carrying the same
numbers.
