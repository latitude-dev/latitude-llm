# PromptL Syntax Guide

**Version 1.0.0**
Latitude
January 2026

> **Note:**
> This document is for agents and LLMs to follow when writing, maintaining,
> or editing PromptL prompts for the Latitude platform. Humans may also find
> it useful, but guidance here is optimized for AI-assisted prompt creation.

---

## Abstract

PromptL is a versatile, human-readable language that simplifies defining and managing dynamic prompts for LLMs. It offers a readable and maintainable syntax with dynamic flexibility through variables, conditionals, and loops. This guide covers all PromptL syntax features including configuration, messages, variables, control flow, chains, tools, agents, and advanced patterns.

---

## Table of Contents

1. [Prompt Structure](#1-prompt-structure)
2. [Configuration](#2-configuration)
3. [Messages](#3-messages)
4. [Variables](#4-variables)
5. [Conditionals](#5-conditionals)
6. [Loops](#6-loops)
7. [Chains and Steps](#7-chains-and-steps)
8. [Tools](#8-tools)
9. [Agents](#9-agents)
10. [Prompt References (Snippets)](#10-prompt-references-snippets)
11. [Content Types](#11-content-types)
12. [Mocking](#12-mocking)
13. [Structured Output (JSON Schema)](#13-structured-output-json-schema)
14. [Best Practices](#14-best-practices)

---

## 1. Prompt Structure

A PromptL prompt consists of two main sections:

1. **Configuration Section** (optional): YAML frontmatter defining model settings
2. **Messages Section**: The conversational content

### Basic Structure

```
---
provider: OpenAI
model: gpt-4o
temperature: 0.7
---

You are a helpful assistant.

<user>
  {{ user_question }}
</user>
```

The configuration section is enclosed between triple dashes (`---`) and written in YAML format. Everything after the configuration block is the message content.

### Without Configuration

Prompts can omit the configuration section entirely for simple use cases:

```
You are a helpful assistant that answers questions about programming.

<user>
  How do I reverse a string in Python?
</user>
```

---

## 2. Configuration

The configuration section defines how the LLM will behave. It uses YAML format and is enclosed between `---` delimiters.

### Common Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `provider` | string | LLM provider (e.g., `OpenAI`, `Anthropic`, `Latitude`) |
| `model` | string | Model identifier (e.g., `gpt-4o`, `claude-3-opus`) |
| `temperature` | number | Randomness (0.0 = deterministic, 1.0+ = creative) |
| `top_p` | number | Nucleus sampling probability (0.0-1.0) |
| `max_tokens` | number | Maximum response tokens |
| `type` | string | Prompt type: `prompt` (default) or `agent` |
| `maxSteps` | number | Maximum execution steps for chains/agents (default: 20, max: 150) |
| `tools` | array | Tool definitions for function calling |
| `agents` | array | Sub-agent paths for agent orchestration |
| `schema` | object | JSON schema for structured output |

### Example Configuration

```yaml
---
provider: OpenAI
model: gpt-4o
temperature: 0.6
top_p: 0.9
max_tokens: 2000
---
```

### Agent Configuration

```yaml
---
provider: OpenAI
model: gpt-4o
type: agent
maxSteps: 40
tools:
  - latitude/search
agents:
  - agents/researcher
  - agents/writer
---
```

### Parameter Types Configuration

Define types for input parameters in the Playground or shared prompts:

```yaml
---
provider: OpenAI
model: gpt-4o
parameters:
  user_input:
    type: text
  image_upload:
    type: image
  data_file:
    type: file
---
```

---

## 3. Messages

Messages define the conversational flow. Each message has a role that determines its purpose.

### Message Roles

| Role | Tag | Purpose |
|------|-----|---------|
| System | `<system>` | Sets context and rules for the assistant |
| User | `<user>` | Represents user input |
| Assistant | `<assistant>` | Captures assistant responses or provides context |
| Tool | `<tool>` | Represents tool interaction results |

### Shorthand Tags

```
<system>
  You are a helpful coding assistant.
</system>

<user>
  Write a function to calculate factorial.
</user>

<assistant>
  Here's a factorial function in Python:
</assistant>
```

### Generic Message Tag

For explicit role specification:

```
<message role="system">
  System instructions here.
</message>

<message role="user">
  User message here.
</message>
```

### Implicit System Message

Text before any message tag is treated as a system message:

```
You are a playful AI assistant that knows about animals.

<user>
  What is the largest mammal?
</user>
```

The first line becomes a system message automatically.

### Tool Messages

Tool messages represent responses from tool calls:

```
<tool id="call_123" name="get_weather">
  {"temperature": 72, "conditions": "Sunny"}
</tool>
```

---

## 4. Variables

Variables enable dynamic content in prompts using double curly braces (`{{ }}`).

### Basic Variable Usage

```
<user>
  My name is {{ name }} and I love {{ hobby }}.
</user>
```

### Input Parameters

Variables without defined values become input parameters:

```
<user>
  Tell me about {{ topic }}.
</user>
```

The `topic` variable will be provided when running the prompt.

### Default Values

Provide fallback values with the `||` operator:

```
<user>
  Hello, {{ name || "friend" }}!
</user>
```

### Setting Variables

Define variables within the prompt:

```
{{ set greeting = "Hello, World!" }}

<system>
  {{ greeting }}
</system>
```

### Expressions

PromptL supports logic expressions:

```
{{ count + 1 }}
{{ isActive && hasPermission }}
{{ items.length }}
{{ user.name }}
```

### Object Access

Access nested properties:

```
{{ user.profile.name }}
{{ data[0].value }}
{{ config['setting-name'] }}
```

---

## 5. Conditionals

Conditionals enable dynamic content based on conditions.

### Basic Syntax

```
{{ if condition }}
  Content when true
{{ endif }}
```

### If-Else

```
{{ if isPremium }}
  You have access to all features.
{{ else }}
  Upgrade to premium for more features.
{{ endif }}
```

### Complex Conditions

```
{{ if user.role == "admin" }}
  <system>You have admin privileges.</system>
{{ else if user.role == "moderator" }}
  <system>You have moderator privileges.</system>
{{ else }}
  <system>You are a regular user.</system>
{{ endif }}
```

### Conditionals Within Messages

```
<system>
  You are a helpful assistant.
  {{ if includeDisclaimer }}
  Always include a disclaimer about AI limitations.
  {{ endif }}
</system>
```

### Conditional Messages

```
{{ if showHistory }}
<assistant>
  Here's what we discussed previously...
</assistant>
{{ endif }}

<user>
  {{ question }}
</user>
```

---

## 6. Loops

Loops dynamically generate content by iterating over lists or arrays.

### Basic For Loop

```
{{ for item in items }}
  - {{ item }}
{{ endfor }}
```

### Loop with Index

```
{{ for item, index in items }}
  {{ index + 1 }}. {{ item }}
{{ endfor }}
```

### Else Clause for Empty Lists

```
{{ for task in tasks }}
  - {{ task.name }}
{{ else }}
  No tasks found.
{{ endfor }}
```

### Nested Loops

```
{{ for category in categories }}
## {{ category.name }}
{{ for item in category.items }}
  - {{ item }}
{{ endfor }}
{{ endfor }}
```

### Loop Inside Messages

```
<system>
You are an expert in the following topics:
{{ for topic in expertise }}
- {{ topic }}
{{ endfor }}
</system>
```

### Generating Multiple Messages

```
{{ for message in conversation_history }}
<message role="{{ message.role }}">
  {{ message.content }}
</message>
{{ endfor }}
```

### Conditional Inside Loops

```
{{ for user in users }}
  {{ if user.active }}
    - {{ user.name }} (Active)
  {{ else }}
    - {{ user.name }} (Inactive)
  {{ endif }}
{{ endfor }}
```

---

## 7. Chains and Steps

Chains break complex workflows into multiple steps, with each step receiving the model's response before continuing.

### Basic Chain

```yaml
---
provider: OpenAI
model: gpt-4o
---
```

```
<step>
  Analyze the following text and identify the main themes:
  {{ text }}
</step>

<step>
  Based on the themes identified, provide recommendations.
</step>
```

### Named Steps

Use the `as` attribute to capture step output in a variable:

```
<step as="analysis">
  Analyze the following data:
  {{ data }}
</step>

<step>
  Based on the analysis:
  {{ analysis }}

  Provide actionable recommendations.
</step>
```

### Step-Specific Configuration

Override configuration for specific steps:

```yaml
---
provider: OpenAI
model: gpt-4o
---
```

```
<step>
  Think about the problem carefully.
</step>

<step schema={{
  {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'number' }
    },
    required: ['answer', 'confidence']
  }
}}>
  Provide your final answer.
</step>
```

### How Chains Work

1. The engine executes content up to the first `<step>` tag
2. Sends to the model, waits for response
3. Response is added as an assistant message
4. Continues to the next step
5. Repeats until all steps are complete

---

## 8. Tools

Tools enable the model to call external functions.

### Defining Tools in Configuration

```yaml
---
provider: OpenAI
model: gpt-4o
tools:
  - get_weather:
      description: Get current weather for a location
      parameters:
        type: object
        properties:
          location:
            type: string
            description: City name or coordinates
          units:
            type: string
            enum: [celsius, fahrenheit]
            description: Temperature units
        required:
          - location
---
```

### Multiple Tools

```yaml
---
provider: OpenAI
model: gpt-4o
tools:
  - search_database:
      description: Search the product database
      parameters:
        type: object
        properties:
          query:
            type: string
          category:
            type: string
        required:
          - query
  - calculate_price:
      description: Calculate total price with discounts
      parameters:
        type: object
        properties:
          items:
            type: array
            items:
              type: object
          discount_code:
            type: string
        required:
          - items
---
```

### Built-in Latitude Tools

```yaml
tools:
  - latitude/search  # Web search capability
```

### Tool Response Handling

When a tool is called, provide the response in a tool message:

```
<tool id="call_abc123" name="get_weather">
  {"temperature": 72, "conditions": "Sunny", "humidity": 45}
</tool>
```

---

## 9. Agents

Agents are autonomous prompts that can dynamically decide actions, use tools, and reason through multiple steps.

### Defining an Agent

```yaml
---
provider: OpenAI
model: gpt-4o
type: agent
maxSteps: 40
tools:
  - latitude/search
---

Research and write a comprehensive summary about {{ topic }}.
```

### Agent with Sub-Agents

```yaml
---
provider: OpenAI
model: gpt-4o
type: agent
maxSteps: 50
agents:
  - agents/researcher
  - agents/fact_checker
  - agents/writer
tools:
  - latitude/search
---

You are a content creation coordinator. Use the available agents to:
1. Research the topic thoroughly
2. Verify all facts
3. Write a polished article

Topic: {{ topic }}
```

### Agent with Schema Output

```yaml
---
provider: OpenAI
model: gpt-4o
type: agent
tools:
  - latitude/search
schema:
  type: object
  properties:
    summary:
      type: string
      description: Executive summary
    key_findings:
      type: array
      items:
        type: string
    recommendations:
      type: array
      items:
        type: string
  required:
    - summary
    - key_findings
---

Analyze the market trends for {{ industry }} and provide actionable insights.
```

### How Agents Work

1. **Goal Understanding**: Agent analyzes the initial prompt
2. **Planning**: Internally plans the first step
3. **Action**: Decides to call a tool or generate a response
4. **Observation**: Receives tool responses
5. **Reasoning**: Based on context, plans next action
6. **Repeat**: Steps 3-5 repeat until goal is achieved
7. **Final Answer**: Agent provides the final result

### Agent Best Practices

- Set appropriate `maxSteps` to prevent infinite loops
- Provide clear goal descriptions
- Use structured schemas for consistent output
- Break complex tasks into sub-agents

---

## 10. Prompt References (Snippets)

Reference other prompts to create modular, reusable components.

### Basic Reference

```
<prompt path="shared/system-instructions" />

<user>
  {{ user_question }}
</user>
```

### Reference with Parameters

```
<prompt path="templates/greeting" name={{ user_name }} />
```

### Relative vs Absolute Paths

```
<!-- Relative path (from current prompt location) -->
<prompt path="./helpers/format" />

<!-- Absolute path (from project root) -->
<prompt path="shared/policies/disclaimer" />
```

### Common Use Cases

**Shared System Instructions:**
```
<!-- shared/base-instructions.promptl -->
You are a helpful assistant created by {{ company_name }}.
Always be polite and professional.

<!-- main-prompt.promptl -->
<prompt path="shared/base-instructions" company_name="Acme Corp" />

<user>
  {{ question }}
</user>
```

**Reusable Policies:**
```
<!-- shared/safety-policy.promptl -->
Never provide harmful information.
Always recommend consulting professionals for medical/legal advice.

<!-- customer-support.promptl -->
<system>
<prompt path="shared/safety-policy" />

You are a customer support agent.
</system>
```

---

## 11. Content Types

PromptL supports different content types beyond text.

### Text Content (Default)

```
<content type="text">This is plain text.</content>
<!-- or shorthand -->
<content-text>This is plain text.</content-text>
```

### Image Content

```
<user>
  What's in this image?
  <content-image>{{ image_url }}</content-image>
</user>
```

With base64 encoding:
```
<content-image>data:image/png;base64,{{ base64_image_data }}</content-image>
```

### File Content

```
<user>
  Analyze this document:
  <content-file mime="application/pdf">{{ file_url }}</content-file>
</user>
```

### Tool Call Content

Within assistant messages:
```
<assistant>
  Let me check the weather for you.
  <tool-call id="call_123" name="get_weather">
    {"location": "New York"}
  </tool-call>
</assistant>
```

### Important Notes

- Not all providers support all content types
- Check your provider's documentation for compatibility
- Images require models with vision capabilities (e.g., GPT-4V, Claude 3)
- File support varies by provider

---

## 12. Mocking

Mocking allows you to simulate conversation history for testing and development.

### Mocking Assistant Responses

Pretend the assistant has already replied:

```
<system>
  You are a helpful math tutor.
</system>

<user>
  What is 2 + 2?
</user>

<assistant>
  2 + 2 equals 4.
</assistant>

<user>
  Now what is 4 + 4?
</user>
```

### Mocking Tool Calls

Simulate tool invocations and responses:

```
<assistant>
  <tool-call id="call_weather_1" name="get_weather">
    {"location": "Paris"}
  </tool-call>
</assistant>

<tool id="call_weather_1" name="get_weather">
  {"temperature": 18, "conditions": "Cloudy"}
</tool>

<user>
  Thanks! What should I wear?
</user>
```

### Use Cases for Mocking

- Testing prompt behavior with specific conversation history
- Developing prompts that depend on prior context
- Creating few-shot examples
- Testing tool integration logic

---

## 13. Structured Output (JSON Schema)

Define JSON schemas to ensure consistent, validated responses.

### Basic Schema

```yaml
---
provider: OpenAI
model: gpt-4o
schema:
  type: object
  properties:
    sentiment:
      type: string
      enum: [positive, negative, neutral]
    confidence:
      type: number
      minimum: 0
      maximum: 1
    explanation:
      type: string
  required:
    - sentiment
    - confidence
---

Analyze the sentiment of this text:
{{ text }}
```

### Complex Schema

```yaml
---
provider: OpenAI
model: gpt-4o
schema:
  type: object
  properties:
    title:
      type: string
      description: Article title
    sections:
      type: array
      items:
        type: object
        properties:
          heading:
            type: string
          content:
            type: string
        required:
          - heading
          - content
    tags:
      type: array
      items:
        type: string
    metadata:
      type: object
      properties:
        word_count:
          type: integer
        reading_time_minutes:
          type: number
  required:
    - title
    - sections
  additionalProperties: false
---
```

### Schema in Steps

For chains, define schema on specific steps:

```
<step>
  Think about the problem carefully.
</step>

<step schema={{
  {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      reasoning: { type: 'string' }
    },
    required: ['answer', 'reasoning'],
    additionalProperties: false
  }
}}>
  Provide your structured answer.
</step>
```

### Schema with Agents

For agents, the schema applies only to the final output:

```yaml
---
type: agent
provider: OpenAI
model: gpt-4o
tools:
  - latitude/search
schema:
  type: object
  properties:
    findings:
      type: array
      items:
        type: string
    conclusion:
      type: string
  required:
    - findings
    - conclusion
---

Research {{ topic }} and provide structured findings.
```

---

## 14. Best Practices

### Prompt Structure

**DO:**
- Start with clear system instructions
- Use descriptive variable names
- Break complex logic into steps or chains
- Include examples for few-shot learning

**DON'T:**
- Overcomplicate prompts with unnecessary logic
- Use deeply nested conditionals
- Forget to handle empty/null cases

### Variables

**DO:**
```
{{ user_name || "User" }}
{{ items.length > 0 ? items : [] }}
```

**DON'T:**
```
{{ x }}  <!-- Non-descriptive name -->
{{ data }}  <!-- Ambiguous -->
```

### Conditionals

**DO:**
```
{{ if user.preferences.language == "es" }}
  Responde en espanol.
{{ else }}
  Respond in English.
{{ endif }}
```

**DON'T:**
```
{{ if a }}
  {{ if b }}
    {{ if c }}
      <!-- Deeply nested - hard to maintain -->
    {{ endif }}
  {{ endif }}
{{ endif }}
```

### Loops

**DO:**
```
{{ for item in items }}
  {{ if item.active }}
    - {{ item.name }}
  {{ endif }}
{{ else }}
  No items found.
{{ endfor }}
```

**DON'T:**
```
{{ for a in list1 }}
  {{ for b in list2 }}
    {{ for c in list3 }}
      <!-- Very complex nested loops -->
    {{ endfor }}
  {{ endfor }}
{{ endfor }}
```

### Chains

**DO:**
```
<step as="analysis">
  Analyze the input: {{ data }}
</step>

<step>
  Based on {{ analysis }}, provide recommendations.
</step>
```

**DON'T:**
- Create too many steps for simple tasks
- Forget to use `as` attribute when needing step results

### Agents

**DO:**
```yaml
---
type: agent
maxSteps: 30
tools:
  - latitude/search
---

Clear goal: Research and summarize {{ topic }}.
```

**DON'T:**
- Set `maxSteps` too high without reason
- Provide vague or ambiguous goals
- Give agents too many tools without purpose

### Tool Definitions

**DO:**
```yaml
tools:
  - get_customer_data:
      description: Retrieves customer information by ID
      parameters:
        type: object
        properties:
          customer_id:
            type: string
            description: Unique customer identifier
        required:
          - customer_id
```

**DON'T:**
```yaml
tools:
  - get_data:  <!-- Vague name -->
      description: Gets data  <!-- Vague description -->
      parameters:
        type: object
        properties:
          id:
            type: string  <!-- Missing description -->
```

### Modularity with Snippets

**DO:**
- Create shared prompts for common patterns
- Use parameters for customization
- Keep snippets focused and single-purpose

**DON'T:**
- Create overly large, monolithic snippets
- Duplicate code across multiple prompts
- Create circular references

---

## Complete Examples

### Simple Q&A Prompt

```yaml
---
provider: OpenAI
model: gpt-4o
temperature: 0.7
---
```

```
You are a helpful assistant that answers questions accurately and concisely.

<user>
  {{ question }}
</user>
```

### Customer Support with Tools

```yaml
---
provider: OpenAI
model: gpt-4o
temperature: 0.3
tools:
  - lookup_order:
      description: Look up order details by order ID
      parameters:
        type: object
        properties:
          order_id:
            type: string
            description: The order ID to look up
        required:
          - order_id
  - check_inventory:
      description: Check product inventory levels
      parameters:
        type: object
        properties:
          product_id:
            type: string
        required:
          - product_id
---
```

```
<system>
You are a customer support agent for an e-commerce platform.
- Always be polite and helpful
- Use the available tools to look up information
- Never make up order or inventory information
</system>

<user>
  {{ customer_message }}
</user>
```

### Multi-Step Analysis Chain

```yaml
---
provider: OpenAI
model: gpt-4o
temperature: 0.5
---
```

```
<step as="extraction">
Extract the key data points from this text:
{{ document }}

List each data point clearly.
</step>

<step as="analysis">
Analyze the extracted data:
{{ extraction }}

Identify patterns, trends, and anomalies.
</step>

<step schema={{
  {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      key_insights: {
        type: 'array',
        items: { type: 'string' }
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['summary', 'key_insights', 'recommendations']
  }
}}>
Based on your analysis:
{{ analysis }}

Provide a final structured report.
</step>
```

### Research Agent with Sub-Agents

```yaml
---
provider: OpenAI
model: gpt-4o
type: agent
maxSteps: 50
tools:
  - latitude/search
agents:
  - agents/fact-checker
  - agents/summarizer
schema:
  type: object
  properties:
    topic:
      type: string
    summary:
      type: string
    sources:
      type: array
      items:
        type: object
        properties:
          title:
            type: string
          url:
            type: string
    key_points:
      type: array
      items:
        type: string
  required:
    - topic
    - summary
    - key_points
---
```

```
You are a research coordinator. Your task is to:

1. Use web search to gather information about {{ topic }}
2. Use the fact-checker agent to verify key claims
3. Use the summarizer agent to create concise summaries
4. Compile everything into a comprehensive report

Be thorough but efficient. Focus on credible sources.
```

### Dynamic Few-Shot Learning

```yaml
---
provider: OpenAI
model: gpt-4o
temperature: 0.3
---
```

```
<system>
You are an expert classifier. Learn from the examples below.
</system>

{{ for example in examples }}
<user>
{{ example.input }}
</user>

<assistant>
{{ example.output }}
</assistant>
{{ endfor }}

<user>
{{ new_input }}
</user>
```

---

## References

- [Latitude Documentation](https://docs.latitude.so)
- [PromptL Syntax Guide](https://docs.latitude.so/promptl/syntax)
- [Latitude Prompt Configuration](https://docs.latitude.so/guides/prompt-manager/configuration)
- [Latitude Agents Guide](https://docs.latitude.so/guides/prompt-manager/agents)