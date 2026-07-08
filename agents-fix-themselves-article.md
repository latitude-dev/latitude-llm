# How we built a system for agents to fix themselves

A few weeks ago, a developer pushed a refactor touching one of the agents Latitude runs in production. It looked harmless in review. Every request kept going through and latency stayed flat, but the prompt cache hit rate (how often an AI successfully reuses its cache instead of rereading information), which is normally above 80 percent, fell to 30. For perspective, cache reads cost about a tenth of what fresh input tokens do, so the drop tripled our effective token spend on the same traffic.

Thankfully, a monitor in Latitude was watching that rate and the drop opened an incident which, in turn, dispatched Claude Code in the cloud, and a few minutes later a pull request appeared that restored the cache structure the refactor had broken. A developer reviewed the change, merged it, and the hit rate recovered within the hour.

Without that loop, a regression like this tends to pop up weeks later in a cost report, and someone spends an afternoon dissecting deploys to find it. Latitude was built around the idea that the system watching an agent should be able to hand its evidence to the system that writes the fix.

This is the loop:

![Agentic self-healing logic.](article-assets/agents-fix-themselves-loop-simple-dark.png)

## First, the telemetry

Latitude runs a support agent in Slack. It had been answering questions for months before anyone could say what it did all day. Instrumenting it took one change, pointing its OpenTelemetry exporter at Latitude. Every interaction started arriving as a trace, carrying the model calls, the tool calls, the retrieved context, latency, and cost, and related traces grouped into sessions, so a ten-turn conversation became a single object rather than ten disconnected rows. If your agent emits OpenTelemetry today, this step is a new endpoint rather than a rewrite.

## Finding the failure

With traffic flowing, the shape of the agent's day became visible. Search covers everything the agent has done, by meaning rather than keywords, so "conversations where the user got frustrated" is a query that works. Full coverage is affordable because agent traffic is mostly repetition, the same system prompt and tool outputs recurring thousands of times a day, so each unique message is embedded once no matter how many traces contain it. Behaviors did the part nobody asked for, clustering sessions by what users were trying to do and flagging each topic's trend against the week before it.

The failure that mattered surfaced in an ordinary review of those clusters. In escalation threads, the agent kept asserting specifics it had not verified, version numbers, figures, dates, all delivered with full confidence.

## From annotations to a Signal

Whoever found a case said so, right on the trace. A thumbs-down with specific feedback ("quoted a version we never shipped") on the exact offending message is the strongest signal a person can give the system. Nobody organized this feedback. Each time an annotation arrived, discovery compared it against the Signals that already existed and either filed it under one or created a new Signal with a generated name, so a scatter of annotations from different teammates converged on a single tracked pattern instead of remaining disconnected complaints.

A Signal is any pattern worth following across production, with a recurring failure being the common case. Unlike a saved search, it is a durable entity with a name, a description, members, and a lifecycle. It is new for its first week, escalating while its counts are above normal, and ongoing otherwise, and if it goes quiet and comes back, the same detection escalates it again.

## Teaching the system to judge

The Signal then got an evaluation, a small script that scores live traffic and can mix three kinds of rules in whatever combination fits the pattern: plain code checks, semantic similarity against a phrase, and LLM judgment for the parts that need actual reading. Nobody on the team wrote this one. GEPA, an evolutionary optimizer, took the annotations as examples, tested script variants against them, and kept the one that agreed with the human verdicts most, with cost and latency as tiebreakers. The finished judge carries its agreement record, so how often it scores the way a person would is a measured number, and as new annotations arrive the agreement is remeasured and the script re-optimized if it drops.

From then on, every new conversation was scored on arrival, and the Signal's counts stayed current without anyone watching them.

## Escalation, and a coding agent wakes up

Escalation is judged against the Signal's own history, the last day of occurrences compared with the same hours over the week before, so a pattern that is growing stands out from ordinary daily rhythm. Monitors extend the same mechanism to anything else worth watching, a saved search or a raw traffic metric, which is how the cache-hit-rate drop in the opening found its way to a coding agent.

Dispatch is configured once, under Settings → Integrations, with Claude Code, Cursor, Linear, or a webhook as the target. When the Signal escalated, the coding agent was woken with a small payload, a prompt, a deep link, and examples of the failing traffic. Latitude is the trigger and the context provider rather than the agent runtime; the dispatched agent runs in your environment, with your credentials, against your repository. It investigated the way an engineer would, reading the Signal and its trend, slicing occurrences to find where they concentrated, reading the failing conversations, and then it changed the agent's escalation prompt, ran the project's checks, and opened a pull request.

## The first fix failed

This is the part of the story worth slowing down for. Alongside the fix, the failing traffic behind the Signal became a dataset, and a regression test now lives in the support agent's repository, not in Latitude. The test replays that dataset against the agent, and CI runs it as an ordinary check on every pull request.

The first attempted fix looked reasonable and failed that check on its own pull request. The replayed traces caught what review would not have, and the fix never merged. The second attempt cleared every replayed trace and went in. That test still runs on every prompt change the team makes, and the monitor keeps watching live traffic in the meantime, so if the failure returns, the Signal escalates again and the loop starts over.

## Where humans stayed

Through all of it, people remained in two places by design. Annotations are the ground truth every evaluation is optimized against, and a person reviewed every pull request before it merged. Everything between those two points, the example-hunting, the context reconstruction, the judgment call about whether a failure was recurring, the trace ids carried from a dashboard into a ticket into an editor, is what got automated.

A failure that would once have become a ticket in someone's backlog now arrives as a pull request waiting for review.

## Start the loop

The order of the story is the order of adoption, and none of it has to happen at once. Telemetry first, because the loop can only act on what it can see. Annotate what you find, promote the worst recurring pattern to a Signal, and turn on dispatch last, by which point the coding agent is acting on the same evidence you have been reading all along. The first three steps take an afternoon.

Latitude is MIT-licensed, self-hostable, and the whole workspace is exposed over MCP:

```bash
claude mcp add --transport http latitude https://api.latitude.so/v1/mcp
```

[Github Repo](https://github.com/latitude-dev/latitude-llm)
