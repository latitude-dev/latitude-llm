# How we built a system for agents to fix themselves

A few weeks ago, a developer pushed a refactor touching one of the agents Latitude runs in production. It looked harmless in review. Every request kept going through and latency stayed flat, but the prompt cache hit rate (how often an AI successfully reuses its cache instead of rereading information), which is normally above 80 percent, fell to 30. For perspective, cache reads cost about a tenth of what fresh input tokens do, so the drop tripled our effective token spend on the same traffic.

Thankfully, a monitor in Latitude was watching that rate and the drop opened an incident which, in turn, dispatched Claude Code in the cloud, and a few minutes later a pull request appeared that restored the cache structure the refactor had broken. A developer reviewed the change, merged it, and the hit rate recovered within the hour.

Without that loop, a regression like this tends to pop up weeks later in a cost report, and someone spends an afternoon dissecting deploys to find it. Latitude was built around the idea that the system watching an agent should be able to hand its evidence to the system that writes the fix.

This is the loop:

![Agentic self-healing logic.](article-assets/agents-fix-themselves-loop-simple-dark.png)

Every piece of it exists because the piece before it left a problem behind. Start where every team starts, with an agent in production and a suspicion that something, somewhere, is going wrong.

## Seeing what the agent does

An agent in production fails without failing. The request succeeds, the latency is normal, the logs are clean, and the answer is wrong, or overconfident, or off in a way only the user notices. Nothing in a conventional stack flags any of this, because by every measure the stack understands, the system worked.

The first move is to record everything. Point the agent's OpenTelemetry exporter at Latitude and every interaction arrives as a trace, carrying the model calls, the tool calls, the retrieved context, latency, and cost. Related traces group into sessions, so a ten-turn conversation is a single object rather than ten disconnected rows. If your agent emits OpenTelemetry today, this is a new endpoint rather than a rewrite.

Now you can see everything, which is its own problem. A production agent generates more conversations than anyone will ever read.

## Finding what you can describe

Somewhere in those millions of traces are the five where a user got angry, and keyword search will not find them, because users do not fail in exact strings. So search in Latitude works by meaning. "Users frustrated with checkout" is a query, and it returns the conversations that match it regardless of how anyone phrased their frustration.

Covering all traffic this way sounds expensive, and the reason it is not is that agent traffic is mostly repetition. The same system prompt, tool output, and templated response recur thousands of times a day, so each unique message is embedded once no matter how many traces contain it, and full coverage ends up costing about what a sample would.

Search answers the questions you think to ask. The failures that cost the most tend to be the ones you never do.

## The failures nobody searches for

For those, the traffic has to organize itself. Behaviors cluster sessions by what the user was trying to do and arrange them into a hierarchy of topics, each carrying a trend computed from the last day of traffic against the week before it. When password-reset loops start spiking, the change shows up as a status before anyone has gone looking for it.

So a spike surfaces, or a search turns up something ugly. What you hold at that moment is a pile of traces and a bad feeling, and both evaporate when the tab closes. Three teammates can make the same discovery in the same week and never learn it was the same discovery.

## Making the failure a thing

The failure needs to become an object, something with a name that accumulates evidence instead of scattering it. That starts with saying so on the trace itself. A thumbs-down with specific feedback ("quoted a version we never shipped") is the strongest signal a person can give the system, and automatic flaggers do the same job for common failure categories without waiting for a human.

Each of those scores gets compared against the Signals that already exist and either files under one or founds a new Signal with a generated name, so a scatter of annotations from three teammates converges on a single tracked pattern instead of remaining disconnected complaints. A Signal is any pattern worth following across production, a durable entity with a name, a description, members, and a lifecycle. It is new for its first week, escalating while its counts are above normal, and ongoing otherwise, and if it goes quiet and comes back, the same detection escalates it again.

A Signal's counts are only as current as its last review, though, and nobody is going to reread every new conversation to ask whether it belongs.

## Judging every conversation

Continuous detection needs a machine judge, and the reasonable objection to a machine judge is that it has to earn trust. So an evaluation in Latitude is a small script that scores live traffic and can mix three kinds of rules in whatever combination fits the pattern: plain code checks, semantic similarity against a phrase, and LLM judgment for the parts that need actual reading. Simple ones come from a criteria prompt or a set of conditions, and the advanced path is writing the script yourself.

For Signals born from annotations, Latitude can generate the script instead. GEPA, an evolutionary optimizer, takes the annotations as examples, tests script variants against them, and keeps the one that agrees with the human verdicts most. The finished judge carries its agreement record, so trust in it is a measured number rather than a feeling, and as new annotations arrive the agreement is remeasured and the script re-optimized if it drops.

Detection is now continuous, and this is where most observability tooling stops: a dashboard that knows things. A dashboard does not fix an agent.

## From knowing to acting

Escalation is judged against the Signal's own history, the last day of occurrences compared with the same hours over the week before, so a pattern that is growing stands out from ordinary daily rhythm. Monitors extend the same mechanism to anything else worth watching, a saved search or a raw traffic metric, which is how the cache-hit-rate drop in the opening reached a coding agent.

Dispatch is configured once, under Settings → Integrations, with Claude Code, Cursor, Linear, or a webhook as the target. When a Signal escalates or a monitor opens an incident, the coding agent is woken with a small payload, a prompt, a deep link, and examples of the failing traffic. Latitude is the trigger and the context provider rather than the agent runtime; the dispatched agent runs in your environment, with your credentials, against your repository. It investigates the way an engineer would, reading the Signal and its trend, slicing occurrences to find where they concentrate, and reading the failing conversations, then it fixes the agent's code or prompts, runs the project's checks, and opens a pull request.

A pull request from a coding agent is a proposal, not a fix, and the obvious question is why anyone should trust it.

## Making the fix stick

The answer is the same one engineering has always used: a test. The failing traffic behind the Signal becomes a dataset, and a regression test in your repository, not in Latitude, replays that dataset against the agent as an ordinary CI check on every pull request. The fix has to pass it to merge, and so does every prompt change that comes after.

This check earns its keep. When Latitude ran the loop on its own support agent, the first fix the coding agent proposed looked reasonable and failed the regression check on its own pull request; only the second, which cleared every replayed trace, went in. The monitor keeps watching live traffic in the meantime, so if the failure returns, the Signal escalates again and the loop starts over.

## Where humans stay

Humans remain in two places by design. Annotations are the ground truth every evaluation is optimized against, and a person reviews every pull request before it merges. Everything between those two points, the example-hunting, the context reconstruction, the judgment call about whether a failure is recurring, the trace ids carried from a dashboard into a ticket into an editor, is what got automated.

A failure that would once have become a ticket in someone's backlog now arrives as a pull request waiting for review.

## Start the loop

The order of the argument is the order of adoption. Telemetry first, because the loop can only act on what it can see. Annotate what you find, promote the worst recurring pattern to a Signal, and turn on dispatch last, by which point the coding agent is acting on the same evidence you have been reading all along. The first three steps take an afternoon.

Latitude is MIT-licensed, self-hostable, and the whole workspace is exposed over MCP:

```bash
claude mcp add --transport http latitude https://api.latitude.so/v1/mcp
```

[Github Repo](https://github.com/latitude-dev/latitude-llm)
