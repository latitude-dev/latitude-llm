# The page

> Read [`score.md`](score.md) for the arithmetic behind every figure here.

## What the page must do

The score is the headline. The list under it is the product.

A user arrives asking whether their agent is good. They should leave knowing three things: how the
agent is doing, what is costing them the most, and where to go to fix it. Every point the agent lost
must trace to a named cause, and every cause must link to a page that already exists.

The page fails if a user reads a dimension score and cannot tell what to do next. That is what
happened to the first version of this design, which named five qualities with no home in the app.

## Where it lives

First in the sidebar, in the Observe group, above Sessions.

The score answers the question a user opens Latitude with. Putting it anywhere else guarantees it is
the page nobody visits, which would make any complaint about added complexity true by construction.

## Two levels

Level one is the score with its five dimension scores. Level two is the ranked causes under each
dimension.

Nothing else. A third level of nesting would hide the causes, and the causes are the reason the page
exists.

### Level one

The score, its interval, the window, and the eligible session count. Then the five dimension scores,
each linking to its own section further down the page.

Beside the score, and clearly outside it, sit the figures the score does not measure: cost per
session, time to first token, and their trends. A user wants those numbers on this page. They cannot
be scored, because rule 2 excludes them, so they are shown and labelled as shown.

A dimension that was not measured says so and says why, rather than rendering blank or rendering 100.

### Level two

One section per dimension, in the same order as level one. Each section holds its dimension score,
its denominator, and its causes ranked by gain.

Every cause row carries six things.

| Column | What it says |
| --- | --- |
| Severity | whether the cause ruined the sessions or degraded them |
| Cause | what happened, in the agent's own terms |
| Sessions | how many sessions it touched, and how that moved since the last snapshot |
| Points | the gain, meaning what the score recovers if this cause alone is fixed |
| Cost | money spent inside the affected sessions, when the window is large enough to bother |
| Destination | the page where a user acts on it |

Gain sorts the list, because it is the only number that answers "what do I get for fixing this". A
user can re-sort by any column, because points are not the only thing that matters. A cause worth
three points that burns four thousand dollars a month can matter more than one worth six points that
costs nothing.

## A worked example

```
Agent score   74 / 100      interval 2.1   ·   7 days   ·   1,240 sessions

              $0.11 per session   up 34%          time to first token 2.4s   up 12%
                                                  shown, not scored

   62   Outcome        Did the agent do what it was asked to?
   43   Reliability    Can the agent succeed every time?
   87   Cost           Does the agent waste money?
   71   Speed          Does the agent waste time?
   80   Safety         2 confirmed failures. Not a rate, see below

              A confirmed safety failure caps this score at 80.

────────────────────────────────────────────────────────────────────────────

43   Reliability                                              lost 11.4 points
     over 1,240 eligible sessions

  ruined     search_docs failed and never recovered      412 sessions   -8.1
             up from 260 last week          $1,240            Tools › search_docs

  ruined     Answers truncated on gpt-4o-mini            188 sessions   -5.2
             new this week                                    Sessions

  degraded   Provider rejected a call, then retried      340 sessions   -1.2
             down from 480                                    Sessions

  degraded   Empty response                    signal    126 sessions   -0.9
             flat                              $310           Signal

     Fixing the top two takes the score from 74 to 80, where the safety cap holds it.

────────────────────────────────────────────────────────────────────────────

62   Outcome
     over 890 analyzed sessions, 72% of eligible traffic

  ruined     Users corrected the agent                   204 sessions   -6.4
             up from 150                                      Behaviors

  ruined     Refund flow loops             signal        190 sessions   -3.8
             escalating                        $840           Signal

  degraded   The agent stalled                            64 sessions   -0.8
             flat                                             Sessions
```

The two figures at the top of the example carry the whole reframing. Cost per session went up 34% and
the Cost dimension still reads 87, because the dimension measures waste rather than spend. The page
has to make that legible or the two numbers look like a contradiction. The dimension's own question
does that work: "Does the agent waste money?" is answered by 87, and "how much am I spending?" is
answered by the figure beside it.

The example also shows the safety cap doing its job. Two confirmed failures hold the composite at 80,
so fixing the two largest Reliability causes takes the score to the ceiling and no further. The top-k
preview must respect the cap, otherwise it promises points the cap will not release. The page says
where the ceiling came from, so the user knows the next move is the safety finding rather than another
reliability fix.

## Where each row goes

Every cause resolves to one destination, and all six already exist.

| Destination | Rows that go there |
| --- | --- |
| Sessions | run failures, truncation, provider rejections, stalls |
| Tools | failing tools, thrashing, repeated calls, dead definitions |
| Memory | repeated searches, no-op writes, reverted writes |
| Cost | the cache gap, with the recoverable spend the Cost page already models |
| Signals | any row sourced from a signal, which lands on that signal's page |
| Behaviors | user corrections, abandonment, frustration, which cluster by topic there |

A row sourced from a signal is the strongest case, because the signal page already carries examples,
patterns, a lifecycle, agent dispatch and GitHub resolution. The score does not reinvent any of that.
It ranks signals by what they cost and links out.

## Recommendations come in two tiers

The line between them is whether Latitude knows the fix or only knows where to look.

**Mechanical.** The metric definition determines the fix, so the text is exact and needs no model.
Dead tool definitions name the unused tools and their estimated monthly cost. Truncation names the
model whose output limit to raise. A repeated call names the tool and the arguments. A cache gap
reports the measured rate against the achievable one.

**Evidence-backed.** For a signal, Latitude does not know the fix and does not pretend to. It shows
the signal's name and description, its example sessions, and where it concentrates. Concentration is
free: `aggregateDimensionBySignal` already computes the conditional rate against the base rate over
model, provider, tool, tag and finish reason. "Four times more likely on model X" is a real lead.

A third tier, where a model writes advice per cause, is out of scope. It is the part most likely to be
wrong, it costs money on every project every day, and the two tiers above carry the specifics.

## Safety's panel is different

Safety cannot show a rate, because every safety flagger samples and screening decisions are not
stored. Its panel says so.

It shows the confirmed count against the population that was examined, for example "2 confirmed in
412 examined sessions". It shows the exposure counts as context, for example "340 injection attempts
received, 0 complied with". It does not show a percentage of traffic, and it labels its score as a
floor rather than an estimate.

Once screening decisions are stored, Safety becomes a rate like the other four and this panel
simplifies.

## Below the floor

Under 200 eligible sessions the page withholds the score and the dimension scores. It withholds
nothing else.

Every cause is a count, and counts are honest at any sample size. Ten sessions with two thrashing
loops and a truncated response is worth reading, and it is exactly what a user testing an agent before
launch wants.

The header reads "collecting, 40 of 200 sessions". The cause list ranks by affected sessions instead of
by gain, because gain needs a deficit to exist. The recommendations are unchanged.

## The trend

A daily chart of the score, with the dimensions available as series.

The chart matters more than it looks. The score lags by the whole window, so a fix shipped today
barely moves a 7 day number tomorrow. The chart is where a user sees the fix landing.

Two things the chart must mark. A change in the scoring version, because a drop caused by a better
flagger must not read as the agent getting worse. And a change in the window length, because a score
over 30 days and a score over 7 days answer slightly different questions.

## What the page must never say

**A defect percentage.** The signal metric's rate is not the true defect rate, because hints bypass
sampling and troubled sessions are examined more often than clean ones. The page shows point
contributions and session counts, both exactly true, and never "12% of your sessions have issues".
[`signals.md`](signals.md) covers why.

**A safety percentage.** No denominator exists. Counts only.

**That a dimension is perfect when it was not measured.** A dimension below its floor reads as not
measured, with the reason.
