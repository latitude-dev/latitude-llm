# The page

> Read [`score.md`](score.md) for formulas, [`signals.md`](signals.md) for signal-effect language, and
> [`session-assessment.md`](session-assessment.md) for the single-session destination behind causes.

## Purpose

The page answers three questions:

1. How is the agent doing?
2. What observed failures or waste explain the result?
3. Where can the user inspect sessions and fix the underlying cause?

The score is the headline. Dimension meanings and causes carry the explanation. A metric name or
generic point deduction is not enough.

## Location

The page is first in the Observe group, above Sessions. It is project-scoped and uses immutable daily
snapshots for the headline and history. Evidence and causes are resolved dynamically from the current
selected window.

The headline uses the current UTC date's snapshot. If that snapshot was not published, the current
Agent Score is unavailable; the page never substitutes an older score. Older snapshots remain in the
trend.

## Level one

The header contains:

- Agent Score and 95% interval;
- snapshot date;
- selected window and eligible-session count;
- scoring version;
- any policy cap;
- raw cost per session and TTFT as context, clearly labelled as not scored directly.

The five dimension cards show the number, interval, meaning, native measurement, and coverage:

| Dimension | Native measurement shown beside the score |
| --- | --- |
| Outcome | expected successful sessions per 100 comparable sessions |
| Reliability | one-session operational success rate and chance of 20 consecutive successes |
| Cost | actual spend and estimated avoidable spend |
| Speed | observed critical-path time and estimated avoidable time |
| Safety | confirmed harmful sessions, examined sessions, and chance of 1,000 sessions without harm |

Reliability never appears as the 20-session value alone. Its card, dimension section, tooltip, and
public representation always show the one-session operational success rate beside it.

Numbers appear only when all five dimensions pass the publication gate. If any dimension is
unmeasured, every card states what has been observed and what evidence is still missing without
rendering a numeric score.

## Level two

Each dimension section contains:

- score, interval, and one-sentence meaning when the publication gate passes;
- the formula definition and current native inputs when they are readable;
- coverage and important missing evidence;
- causes ranked by expected fix gain;
- contextual observations that do not lower this dimension;
- destinations for investigation.

The evidence list contains only metrics with readable observations and promoted signals with an
eligible occurrence in the selected window. Signals with zero occurrences and scores assigned to
ignored signals do not appear. Items whose effect is not yet measurable remain visible and say so.
A signal that informs several dimensions can appear in each applicable dimension section. This is a
presentation choice and does not duplicate the occurrence in estimation or attribution.

Native inputs and causes are labelled as current evidence from the live selected window. They
explain present behavior but do not claim to reproduce the immutable snapshot, whose stored contract
contains only scores, intervals, version, window, and eligible-session count.

### Cause rows

| Field | Meaning |
| --- | --- |
| Cause | metric, signal, or residual explanation |
| Evidence | endpoint, probability feature, money, time, or confirmed harm |
| Reach | affected and readable sessions |
| Native effect | probability change, avoidable spend, avoidable time, or harmed sessions |
| Attributed deficit | Shapley share of the displayed dimension deficit |
| Fix gain | estimated score recovered if this cause alone disappeared |
| Confidence | interval, independent observation count, and measured or associated label |
| Destination | Sessions, Tools, Memory, Cost, Signals, Behaviors, or Settings |

Attributed deficits add to the current dynamic estimate. Fix gains may overlap and do not. The
interface labels the distinction and never sums fix gains into a promise. Current causes may change
after the immutable daily snapshot when new evidence arrives, so they are not presented as a frozen
historical decomposition.

Exact observations use direct language such as "wasted $430" or "ended 32 sessions." Signal effects
estimated from matched sessions use "associated with" and show their interval.

## Worked example

```text
Agent Score   69 / 100      interval 2.4      7 days      1,240 sessions      v1

              $0.11 per session, up 34%       median TTFT 2.4s, up 12%
              context only                     context only

   78   Outcome        78 successful outcomes expected per 100 comparable sessions
   36   Reliability    95.0% one-session success; 36% chance of 20 in a row
   84   Cost           $160 of $1,000 spend estimated avoidable
   72   Speed          28 of 100 critical-path hours estimated avoidable
   90   Safety         1 confirmed failure in 10,000 examined sessions
```

The composite is:

```text
69 = round(78*0.35 + 36*0.25 + 84*0.15 + 72*0.15 + 90*0.10)
```

Raw spend rose while Cost remained 84 because Cost measures waste as a share of spend. The user can
read both without treating them as contradictory.

### Reliability example

```text
36   Reliability       p = 1,178 / 1,240 = 95.0%       100 * p^20 = 35.8
     interval 29 to 43       100% output/error telemetry coverage

Cause                                      Reach          Attributed    Fix gain
Provider error ended the session           30 sessions       -30 pts       +20
search_docs failed without later progress  22 sessions       -20 pts       +14
No usable assistant output                 14 sessions       -14 pts        +7

Context, not a Reliability failure
Provider rejected a call and retry worked  290 sessions   $180 and 4.1h wasted
```

Four sessions appear in more than one cause row. Session-level resolution and Shapley attribution
keep their failures from being counted twice. Recovered provider errors remain visible and link to
the Cost and Speed sections.

### Cost example

```text
84   Cost              $160 avoidable / $1,000 observed

Cause                                      Native effect   Attributed   Fix gain
Achievable cache reuse was missed                $70          -7 pts      +7
Repeated identical tool calls                    $40          -4 pts      +4
Recovered provider and tool retries              $30          -3 pts      +3
Refund-loop signal, residual matched effect       $20          -2 pts      +2
```

The native amounts add to the estimated avoidable spend because the session counterfactual has
already resolved overlap. The signal row uses associated-effect language and displays its matching
coverage in the expanded view.

### Outcome example

```text
78   Outcome           mean calibrated P(success) = 0.78
     890 analyzed sessions, covering 72% of eligible traffic

Cause                                      Reach          Attributed   Fix gain
Users corrected or abandoned               204 sessions      -9 pts      +7
Refund-flow loop signal                     190 sessions      -7 pts      +5
No usable final output                       36 sessions      -4 pts      +4
Other calibrated evidence                                  -2 pts       -
```

The cause rows explain the model's estimate. They do not claim that every session with a weak signal
failed.

### Safety example

```text
90   Safety            q = 1 / 10,000       100 * (1 - q)^1000 = 90.5
     interval 56 to 99

Confirmed harm
Assistant disclosed personal data            1 session      -10 pts

Exposure only
Injection attempts received                 340 sessions
Unsafe user content received                 82 sessions
```

Safety always shows the wide interval created by rare events. Exposure counts remain outside the
formula.

## Cause destinations

| Destination | Causes |
| --- | --- |
| Sessions | terminal failures, retries, damaged final output, and critical paths |
| Tools | failed, repeated, thrashing, malformed, and unused tools |
| Memory | repeated searches, no-op writes, and reverted writes |
| Cost | cache opportunity, pricing coverage, and recoverable spend |
| Signals | recurring defects, examples, patterns, and associated effects |
| Behaviors | Outcome evidence grouped by conversation topic |
| Settings | flagger coverage, safety screening, and policy controls |

A signal row links to its signal page. That page already owns examples, lifecycle, dispatch, and
resolution. The benchmark page ranks the consequence and does not duplicate the workflow.

## Recommendations

Mechanical recommendations come from exact evidence:

- truncation names the model and affected output limit;
- a failing or repeated tool names the tool and call pattern;
- dead surface names unused definitions and their observed input cost;
- cache gap shows measured and achievable cached tokens plus recoverable spend;
- provider retries name the provider, error class, and wasted time.

Signals do not receive generated fixes on the score page. The page shows the measured association,
example sessions, and concentrations already computed for the signal. It does not claim a causal
remedy from observational evidence.

## Coverage panel

The expandable coverage panel contains:

- readable sessions per dimension and reader;
- analysis, pricing, critical-path, and safety-examination coverage;
- configured, hinted, and propensity-corrected sample shares;
- unmapped provider errors and finish reasons;
- disabled detectors;
- signal effects waiting for independent observations;
- attribution approximation error;
- scoring model and frozen reference identifiers.

The page says "unmeasured" when coverage fails a floor. It says "effect not yet measured" for a
signal whose consequence is unknown.

## When the score is unavailable

The page withholds the composite and all five dimension scores when the eligible-session floor or any
dimension's coverage or confidence gate fails. It still shows:

- session and finding counts;
- actual cost and duration;
- confirmed safety findings and exposure;
- deterministic waste amounts that are exact at small samples;
- progress toward each reader's floor;
- links to affected sessions and causes.

Each dimension lists the observations available so far and the exact condition blocking publication.
No candidate or partial dimension number is shown.

Modeled effect and fix-gain ranking wait for enough evidence. Exact money and time observations do
not.

## Trend

The daily chart shows the composite and each dimension as separate series. It marks:

- scoring-version changes;
- window-length changes;
- policy caps;
- dates without a published score as gaps.

The point tooltip shows the stored point estimate, interval, scoring version, window length, and
eligible-session count. Historical causes and native estimator inputs are not stored in snapshots.

## Statements the page must avoid

- It does not call a sampled-positive share a defect rate without selection correction.
- It does not say a signal caused an outcome when the estimator found only association.
- It does not sum overlapping fix gains.
- It does not present exposure as Safety failure.
- It does not label missing evidence as healthy.
- It does not imply that raw spend or raw duration is good or bad without a waste counterfactual.
- It does not hide a scoring-version or policy-cap change inside the trend.
