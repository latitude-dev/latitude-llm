---
title: Content moderation system
description: Learn how to build a content moderation system that can analyze user-generated content and provide feedback on its appropriateness.
---

<Card
title="Live example"
href="https://app.latitude.so/share/d/9ed3ab72-5492-4cec-b490-71112bc608b9"
arrow="true"
cta="Copy to your Latitude">
You can play with this example in the Latitude Playground.
</Card>

## Overview

In this example, we will create a content moderation system that can analyze user-generated content and provide feedback on its appropriateness. The agent uses subagents to handle different aspects of content moderation efficiently.

## Multi-Agent Architecture

The system uses specialized subagents for different responsibilities:

- **main**: Coordinates the moderation process by dispatching content to all subagents, gathering their evaluations, and generating the final decision based on their collective input.
- **rule_checker**: Runs deterministic, rule-based checks—such as profanity filters or length validation—against the content, ensuring compliance with explicitly defined policies.
- **toxicity_analyzer**: Analyzes content for toxicity and subtle forms of harm like harassment, hate speech, or threats, taking context and intent into account, even in ambiguous or nuanced cases.
- **safety_scorer**: Calculates comprehensive risk and safety scores for the content, highlighting any areas of concern, escalation potential, or need for human review.

<Note>
All the tools used in the sub-agents have to be defined in the main prompt.
</Note>

## The prompts

[PROMPTS]

## Breakdown

Let's break down the example step by step to understand how it works.

<Steps>
  <Step title="Main Prompt">
    The main prompt acts as the central coordinator. It receives user-generated content, delegates the moderation tasks to the specialized subagents, aggregates their results, and produces a structured final decision with confidence and reasoning.
  </Step>
  <Step title="rule_checker">
    The rule_checker agent checks for clear, rule-based violations—like banned words, excessive length, or explicit policy breaches—using programmatic filters and deterministic logic.
  </Step>
  <Step title="toxicity_analyzer">
    The toxicity_analyzer (or toxicity_evaluator) uses advanced AI to evaluate whether the content contains toxicity, harassment, hate speech, or other forms of harmful language, considering nuance, context, and potential for implicit harm.
  </Step>
  <Step title="safety_scorer">
    The safety_scorer calculates various risk scores for the content, such as immediate harm, community impact, and escalation risk, and determines whether the situation requires human review or additional monitoring.
  </Step>
  <Step title="Final Decision">
    The main agent synthesizes all subagent outputs, weighing rule violations, toxicity, and risk scores to make a final moderation decision. This decision includes a confidence score, explanation, and recommended action for handling the content.
  </Step>
</Steps>

## Structured Output

Main prompt returns a [structured output](/guides/prompt-manager/json-output) because the moderation process must be machine-readable and reliable, allowing easy integration with other systems and clear auditing of every moderation decision.

## Code

In the code we prepared 4 cases of possible user input from different sources. In github you [have the code](https://github.com/latitude-dev/latitude-llm/blob/main/examples/package.json#L34) but the idea is to launch this code with different types of possible input to see how it works.

```bash
pnpm run ts:cases:content_moderation --type toxicity
```

The important part is that you can see the use of tools. The tools defined in the code are used to respond to the tools defined in the main prompt. These kind of tools are on your control and are things that usually don't need an LLM or AI to be responded like measure the length of the text of if the the text contains words that yout put in a blacklist.

[CODE]

## Resources

- [Custom Tools](/guides/prompt-manager/tools) - How to integrate with customer databases and CRM systems
- [Tool call SDK example](/examples/sdk/run-prompt-with-tools) - A simple example of how to run a prompt with tools with Latitude SDK.
- [JSON Schema Output](/guides/prompt-manager/json-output) - Ensuring consistent response formatting
