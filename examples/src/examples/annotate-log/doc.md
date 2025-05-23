---
title: Annotate log (HITL)
description: Learn how to annotate log data with Latitude SDK to do HITL evaluations
---

This is helpful for doing Human in the Loop (HITL) evaluations of your prompt's performance.

## Prompt

Here we have a simple prompt that ask the LLM to generate a joke. We want to
allow our users to evaluate the quality of the joke and provide feedback.

[PROMPTS]

## How this works?

In this case we're using OpenAI's directly to run the prompt that we have in
Latitude. We get the prompt with Latitude's sdk and then render the messages and
pass it to OpenAI's API.

Once the model finish we upload a log to our prompt in Latitude that you can see
in the logs section of the prompt.

Finally we annotate the log with the feedback that we got from the user. In this
case the user is rating the joke from 1 to 5 and providing a reason.

You can learn more about [HITL (Human In the loop) evaluations in our docs](/guides/evaluations/manual_evaluations)

### Code examples

[CODE]
