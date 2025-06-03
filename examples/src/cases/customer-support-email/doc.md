---
title: Customer Support Email Generator
description: Learn how to build an intelligent customer support agent that generates personalized email responses
---

<Card
title="Live example"
href="https://app.latitude.so/share/d/e9b20d49-45af-430f-8f4b-cb5b3d8dfc57"
arrow="true"
cta="Copy to your Latitude">
You can play with this example in the Latitude Playground.
</Card>

## Overview

In this example, we will create a Dynamic Customer Support Email Generator that can analyze customer queries, gather relevant customer information, and generate personalized, professional email responses. The agent uses subagents to handle different aspects of customer support efficiently.

## Multi-Agent Architecture

The system uses specialized subagents for different responsibilities:

- **main**: Orchestrates the process and makes decisions
- **customer_researcher**: Gathers customer data and context
- **email_composer**: Creates the actual email response

<Note>
All the tools used in the sub-agents have to be defined in the main prompt.
</Note>

## The prompts

[PROMPTS]

## Breakdown

Let's break down the example step by step to understand how it works.

#### Customer Context Gathering

The customer researcher agent uses custom tools to fetch relevant information:

```markdown
- get_customer_details: Retrieves account information
- get_order_history: Gets purchase history
- check_known_issues: Identifies related problems
```

#### Intelligent Query Analysis

The main agent analyzes queries for:

- Emotional sentiment (angry, confused, urgent)
- Issue type (technical, billing, feature request)
- Information completeness
- Priority level

#### Personalized Response Generation

The email composer creates responses that:

- Use customer-specific information
- Match appropriate tone and urgency
- Include relevant account details
- Provide actionable solutions

#### Structured Output

Uses JSON schema to ensure consistent response format with subject, body, and metadata.

### Why This Multi-Agent Approach Works

Similar to the [Deep Search example](/examples/cases/deep-search), separating responsibilities prevents context bloat and improves performance:

1. **Customer researcher** focuses solely on data gathering
2. **Email composer** specializes in communication
3. **Main coordinator** handles decision-making and orchestration

This prevents any single agent from becoming overloaded with too many responsibilities while maintaining conversation context efficiency.

Looking at the prompts I implemented in the previous conversation, I chose different LLM providers strategically based on their specific strengths and the requirements of each component.

## Code

You can play with this example using the Latitude SDK.

[CODE]

## Provider Selection Rationale

<AccordionGroup>
  <Accordion title="Main coordinator - Google Gemini Flash">
    1. **Fast Performance**: Designed for quick coordination tasks.
    2. **Cost Effective**: Competitive pricing for simple tasks.
    3. **JSON Support**: Good structured output capabilities
  </Accordion>

  <Accordion title="Customer researcher - OpenAI GPT-4.1">
    1. **Tool Integration**: OpenAI has excellent tool calling capabilities and strict compatibility mode for reliable function execution
    2. **Data Processing**: GPT-4o excels at analyzing and synthesizing information from multiple sources
    3. **Reasoning**: Better at complex reasoning tasks required for customer data analysis
  </Accordion>

  <Accordion title="Email composer - Anthropic Claude Sonnet">
    1. **Writing Quality**: Anthropic models are particularly strong at generating high-quality, nuanced text
    2. **Tone Control**: Superior at maintaining consistent professional tone and empathy
    3. **Temperature**: Used `temperature: 0.4` for creative but controlled email generation
  </Accordion>
</AccordionGroup>

### Strategic Benefits

This multi-provider strategy optimizes for:

- **Cost**: Using cheaper models for coordination, expensive models only where needed
- **Performance**: Leveraging each provider's strengths (OpenAI for tools, Anthropic for writing)
- **Reliability**: Distributing risk across multiple providers
- **Quality**: Matching model capabilities to specific task requirements

<Warning>This rationale might vary with the past of time because provider capabilities and pricing change frequently. We recomend to [evaluate your prompts](/guides/evaluations/overview)</Warning>
<Info>
Using Latitude is easy to switch between providers if needed. If you find that one provider's model is not performing as expected, you can quickly change the model in the prompt configuration without rewriting the entire agent logic. You can create your own providers check [provider documentation](/guides/getting-started/providers) for more information.
</Info>

## Resources

- [Customer Support Best Practices](/guides/prompt-manager/prompt-best-practices) - Learn more about effective customer support prompting
- [Custom Tools](/guides/prompt-manager/tools) - How to integrate with customer databases and CRM systems
- [Tool call SDK example](/examples/sdk/run-prompt-with-tools) - A simple example of how to run a prompt with tools with Latitude SDK.
- [JSON Schema Output](/guides/prompt-manager/json-output) - Ensuring consistent response formatting
- [Configuring providers](/guides/getting-started/providers) - How to configure and use different LLM providers in Latitude
