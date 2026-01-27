---
name: promptl
description: PromptL syntax guide for writing prompts in the Latitude platform. This skill should be used when writing, reviewing, or editing PromptL prompts. Triggers on tasks involving creating prompts, configuring LLM parameters, using variables, conditionals, loops, chains, tools, agents, or any prompt engineering in Latitude.
license: MIT
metadata:
  author: latitude
  version: "1.0.0"
---

# PromptL Syntax Guide

Comprehensive guide for writing PromptL prompts in the Latitude platform. PromptL is a versatile, human-readable language that simplifies defining and managing dynamic prompts for LLMs.

## When to Apply

Reference these guidelines when:
- Writing new PromptL prompts for Latitude
- Configuring LLM models and parameters
- Using variables, conditionals, or loops in prompts
- Creating multi-step chains or agentic workflows
- Defining tools for function calling
- Referencing other prompts (snippets)
- Working with structured JSON output schemas

## Syntax Categories

| Category | Purpose | Key Syntax |
|----------|---------|------------|
| Configuration | Define model, provider, and parameters | `---` YAML block |
| Messages | Structure conversations | `<system>`, `<user>`, `<assistant>`, `<tool>` |
| Variables | Dynamic content | `{{ variable }}` |
| Conditionals | Dynamic flow control | `{{ if }}`, `{{ else }}`, `{{ endif }}` |
| Loops | Iterate over lists | `{{ for item in list }}`, `{{ endfor }}` |
| Chains | Multi-step prompts | `<step>` |
| Tools | Function calling | `tools:` in config |
| Agents | Autonomous workflows | `type: agent` |
| Snippets | Reusable prompts | `<prompt path="..." />` |
| Content | Multi-modal content | `<content-image>`, `<content-file>` |

## Quick Reference

### Configuration Block
```yaml
---
provider: OpenAI
model: gpt-4o
temperature: 0.7
top_p: 0.9
maxSteps: 20
---
```

### Message Tags
- `<system>` - System instructions
- `<user>` - User messages
- `<assistant>` - Assistant responses
- `<tool>` - Tool interaction results
- `<message role="...">` - Generic message tag

### Variables
```
{{ variable_name }}
{{ variable || "default" }}
{{ set myVar = "value" }}
```

### Conditionals
```
{{ if condition }}
  content
{{ else }}
  alternative
{{ endif }}
```

### Loops
```
{{ for item, index in items }}
  {{ index }}: {{ item }}
{{ else }}
  No items
{{ endfor }}
```

### Chains (Multi-step)
```
<step as="result">
  First step content
</step>

<step>
  Use {{ result }} from previous step
</step>
```

### Tools Configuration
```yaml
tools:
  - tool_name:
      description: What the tool does
      parameters:
        type: object
        properties:
          param_name:
            type: string
            description: Parameter description
        required:
          - param_name
```

### Agents
```yaml
---
type: agent
provider: OpenAI
model: gpt-4o
tools:
  - latitude/search
agents:
  - agents/sub-agent-path
maxSteps: 40
---
```

### Structured Output
```yaml
schema:
  type: object
  properties:
    field_name:
      type: string
      description: Field description
  required:
    - field_name
```

### Prompt References (Snippets)
```
<prompt path="relative/path/to/prompt" />
<prompt path="shared/policies" variable={{ value }} />
```

### Content Types
```
<content-text>Plain text</content-text>
<content-image>{{ image_url }}</content-image>
<content-file mime="application/pdf">{{ file_data }}</content-file>
```

## How to Use

Read the `AGENTS.md` file for the complete detailed guide with all syntax explanations, examples, and best practices.

Each section contains:
- Detailed explanation of the feature
- Correct usage examples
- Common mistakes to avoid
- Best practices and tips