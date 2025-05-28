---
title: Annotate log (HITL)
description: Learn how to annotate log data with the Latitude SDK to perform HITL evaluations
---

This guide explains how to perform Human-in-the-Loop (HITL) evaluations of your prompt’s performance.

## Prompt

In this example, we have a simple prompt that asks the LLM to generate a joke. We want users to be able to evaluate the quality of the joke and provide feedback.

[PROMPTS]

## How does this work?

In this scenario, we use OpenAI’s API directly to run the prompt defined in Latitude. We retrieve the prompt using Latitude’s SDK, display the messages, and send them to the OpenAI API.

Once the model completes its response, we upload a log to our prompt in Latitude, which you can view in the prompt’s logs section.

Finally, we annotate the log with the feedback received from the user. In this case, the user rates the joke on a scale from 1 to 5 and provides a reason for their rating.

You can learn more about [HITL (Human-in-the-Loop) evaluations in our documentation](/guides/evaluations/humans-in-the-loop).

### Code examples

[CODE]
