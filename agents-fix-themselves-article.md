# How we built a system for agents to fix themselves

A few weeks ago, a developer pushed a refactor touching one of the agents Latitude runs in production. It looked harmless in review. Every request kept going through and latency stayed flat, but the prompt cache hit rate (how often an AI successfully reuses its cache instead of rereading information), which is normally above 80 percent, fell to 30. For perspective, cache reads cost about a tenth of what fresh input tokens do, so the drop tripled our effective token spend on the same traffic.

Thankfully, a monitor in Latitude was watching that rate and the drop opened an incident which, in turn, dispatched Claude Code in the cloud, and a few minutes later a pull request appeared that restored the cache structure the refactor had broken. A developer reviewed the change, merged it, and the hit rate recovered within the hour.

Without that loop, a regression like this tends to pop up weeks later in a cost report, and someone spends an afternoon dissecting deploys to find it. Latitude was built around the idea that the system watching an agent should be able to hand its evidence to the system that writes the fix.

This is the system we ended up with:

![Agentic self-healing logic.](article-assets/agents-fix-themselves-loop-simple-dark.png)

Latitude is MIT-licensed, so feel free to check the code for the following concepts:

## Telemetry

Traces arrive over OpenTelemetry and carry the model calls, tool calls, retrieved context, latency, and cost of each interaction. Related traces group into sessions, so a ten-turn conversation is a single object rather than ten disconnected rows.

## Search

All of that traffic becomes searchable by meaning, and the reason Latitude can afford to cover all of it rather than a sample is that agent traffic is mostly repetition. The same system prompt, tool output, and templated response recur thousands of times a day, so each unique message is embedded once, no matter how many traces contain it, and every trace keeps a reference to the messages it held. A search like "users frustrated with checkout" runs over the unique messages and returns the traces that contain the best matches. Repetition collapses down and full coverage costs about as much as a sample would, and search never has to guess about traffic it skipped.

## Behaviors

Search covers the patterns a team knows how to describe whereas Behaviors exist for the ones that are generally interesting or that you might have trouble describing. Latitude clusters sessions by what the user was trying to do and arranges them into a hierarchy of topics, so "what is my agent doing all day" has an answer that does not depend on someone writing the right query.

The hard problem is not the clustering but rather keeping clusters consistent over time. The topic tree is recalibrated as traffic changes, and a topic that exists today is only the same topic tomorrow if something tracks it across rebuilds, so a lineage pass matches new clusters to old ones and records whether each was born, continued, merged, or split. That sort of bookkeeping helps to make the trend trustworthy.

Each topic carries a trend, computed from the last day of traffic against the week of traffic before it:

```
new:      baseline = 0, current > 0
spike:    current ≥ 5 and ≥ 3 × baseline
rising:   current ≥ 2 and ≥ 1.5 × baseline
cooling:  ≤ 0.5 × baseline
fading:   baseline ≥ 3, current = 0
```

When password-reset loops start spiking, the change shows up as a status before anyone has gone looking for it.

## Signals

Search and Behaviors find the patterns that are valuable to track. What actually makes it trackable is a score, from a human annotating a trace or from an automatic flagger doing the same.

A Signal is any pattern you want to follow across production, with a recurring failure being the common case. The difference from a saved search is that a Signal is a durable entity, with a name, a description, members, and a lifecycle, and its membership is decided the moment data is written rather than recomputed every time someone asks. When a new score arrives, discovery compares it against the Signals that exist and either files it under one or creates a new Signal with a generated name. Ten annotations from three teammates over two weeks converge on a single `wrong_refund_amount` Signal instead of remaining ten disconnected pieces of feedback.

The lifecycle is simple. A Signal is new for its first week, escalating while its counts are above normal, and ongoing otherwise. If a pattern goes quiet and comes back later, the same detection escalates it again.

## Evaluation

Every Signal can have an evaluation watching live traffic for it. An evaluation is a small script that can mix three kinds of rules in whatever combination fits the pattern: plain code checks (text matches, tool failures, output shape), semantic similarity against a phrase, and LLM judgment for the parts that need actual reading. Simple ones come from a criteria prompt or a set of conditions, and the advanced path is writing the script yourself.

For Signals born from human annotations, Latitude can also generate the script. GEPA, an evolutionary optimizer, uses the annotations as examples, tests script variants against them, and keeps the one that agrees with the human verdicts most, with cost and latency as tiebreakers. Judges optimized this way carry their agreement record, so how often the script scores the way a person would is a measured number rather than an assumption.

From then on the evaluation runs on every new trace, and its verdicts are what keep the Signal current.

## Agent Dispatch

Escalation is judged against the Signal's own history, the last day of occurrences compared with the same hours over the week before, so a pattern that is growing stands out from ordinary daily rhythm. Clearing the threshold opens an incident. Dispatch fires in two cases, when a Signal escalates and when a monitor opens an incident. Monitors can watch a signal, a saved search, or a raw traffic metric, which is how the cache-hit-rate drop in the opening reached a coding agent within minutes of the deploy.

Dispatch targets are Claude Code, Cursor, Linear, or a webhook, and the payload is small by design, a prompt, a deep link, and examples of the failing traffic. Latitude is the trigger and the context provider rather than the agent runtime. The dispatched agent runs in your environment, with your credentials, against your repository. From there it investigates the way an engineer would, reading the Signal and its trend, slicing occurrences to find where they concentrate, and reading the failing conversations. Then it fixes the agent's code or prompts, runs the project's checks, and opens a pull request.

## Regression testing in CI

The regression test the agent writes lives in your repository, not in Latitude. The failing traffic behind the Signal becomes a dataset, the test replays that dataset against the agent, and your CI runs it as an ordinary check on every pull request from then on. The fix has to pass it to merge, and so does every prompt change that comes after.

In the repository of Latitude's own support agent, the first attempted fix failed the regression check on its pull request, and only the second, which cleared the replayed traces, went in. The monitor keeps watching live traffic in the meantime, and if the failure returns, the Signal escalates again.

## Where is your place as an Engineer?

Humans remain in two places by design. Annotations are the ground truth every evaluator is optimized against, and a person reviews every pull request before it merges. Everything between those two points, the example-hunting, the context reconstruction, the judgment call about whether a failure is recurring, the trace ids carried from a dashboard into a ticket into an editor, is what got automated.

A failure that would once have become a ticket in someone's backlog now arrives as a pull request waiting for review.

## Getting started

None of this has to be adopted at once. Start with tracing, annotate what you find, promote your worst recurring failure to a monitored Signal, and turn on dispatch last, by which point the agent is acting on the same evidence you have been reading all along.

Latitude is MIT-licensed, self-hostable, and the whole workspace is exposed over MCP:

```bash
claude mcp add --transport http latitude https://api.latitude.so/v1/mcp
```

[Github Repo](https://github.com/latitude-dev/latitude-llm)
