---
title: Render a prompt with steps
description: Learn how to render steps of a prompt with Latitude SDK
---

## Prompt

Chains and Steps are used to create multi-step prompts that can interact with the AI model in stages. Chains in PromptL allow you to break complex workflows into smaller, manageable steps. You can read more [about it here](/promptl/advanced/chains#chains-and-steps).

In this example we use 2 steps. The first we ask the model to think about the
answer. Then in the second step we ask to provide an explanation on why it chose
that answer.

[PROMPTS]

## Code

The important part is to understand that on each `<step>` found in the prompt
the SDK will invoke `onStep` and here you can ask your LLM to provide a
response.

[CODE]
