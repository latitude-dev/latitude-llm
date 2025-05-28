---
title: Render a prompt with steps
description: Learn how to render the steps of a prompt with the Latitude SDK
---

## Prompt

Chains and Steps are used to create multi-step prompts that can interact with the AI model in stages. Chains in PromptL allow you to break complex workflows into smaller, manageable steps. You can read more [about it here](/promptl/advanced/chains#chains-and-steps).

In this example, we use two steps. In the first step, we ask the model to think about the answer. Then, in the second step, we ask it to provide an explanation for why it chose that answer.

[PROMPTS]

## Code

The key point to understand is that for each `<step>` found in the prompt, the SDK will invoke `onStep`. At that point, you can ask your LLM to provide a response.

[CODE]
