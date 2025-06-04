---
title: Pause a Tool Execution
description: Learn how to pause the execution of a tool and process the data
---

## Prompt

When a tool’s calculation is simple, you can simply return its value to the Latitude SDK, as shown in the [prompt with tools](/examples/sdk/run-prompt-with-tools) example.
However, for more complex calculations, you can pause the execution of the tool, process the data asynchronously, and then respond with the result in the same conversation.
[PROMPTS]

## Code

In this example, you can see how itinerary creation is requested by the AI. The execution is paused, the data is stored (in memory, though you could also store it in your database or Redis), and then the tool execution is resumed with the calculated itinerary.

[CODE]
