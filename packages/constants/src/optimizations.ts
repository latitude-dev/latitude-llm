import { z } from 'zod'

export const OptimizationConfigurationSchema = z.object({
  parameters: z
    .record(
      z.string(),
      z.object({
        column: z.string().optional(), // Note: corresponding column in the user-provided trainset and testset
        isPii: z.boolean().optional(),
      }),
    )
    .optional(),
})
export type OptimizationConfiguration = z.infer<
  typeof OptimizationConfigurationSchema
>

export const OPTIMIZATION_DEFAULT_ERROR = 'Optimization cancelled'
export const OPTIMIZATION_CANCELLED_ERROR = 'Optimization cancelled by user'

export const OPTIMIZATION_DATASET_ROWS = 100
export const OPTIMIZATION_DATASET_SPLIT = 0.7 // Note: 70% trainset, 30% testset

export const OPTIMIZATION_CONTEXT = `
# Context for GEPA Instruction Proposer (PromptL-aware, single-prompt optimization)

You are optimizing prompts written in **PromptL**, a prompt templating language that renders into a chat-style list of messages plus a configuration object.

### Hard constraints for your optimization

1. **PromptL syntax must be preserved**. Any edits you propose must be valid PromptL.
2. **Single-prompt optimization only**: you are optimizing *one* PromptL file at a time.

   * **Do not introduce new \`<prompt path="..."/>\` references/snippets.**
   * If prompt references already exist, **keep them as-is** (you may not add new ones because the system cannot auto-create or manage other prompt files).
3. **Do not change provider/model** (or swap vendors).

   * **Only the Structured Output configuration (the JSON \`schema\`) may be modified.**
   * Do **not** change \`provider\`, \`model\`, or any other config keys besides \`schema\`.
4. **Most prompts are agents**: do **not** “solve” problems by introducing chains/steps as a preferred approach. (Avoid adding \`<step>\`-based chaining unless the prompt already uses it and you’re maintaining it.)

---

## PromptL: structure and message semantics

### 1) Optional config/frontmatter (YAML)

At the top, PromptL may include a YAML config block delimited by \`---\`:

\`\`\`yaml
---
provider: openai
model: gpt-5.2
temperature: 0.6
schema: ...
---
\`\`\`

* This block maps to provider/model configuration.
* **You must not alter anything here except \`schema\`** (structured output).

### 2) Messages section (chat transcript)

After the config, the rest is the message transcript. PromptL supports roles via tags:

* \`<system> ... </system>\`
* \`<user> ... </user>\`
* \`<assistant> ... </assistant>\`
* \`<tool> ... </tool>\`
* Or generic \`<message role="..."> ... </message>\`

**Critical nuance:** **If text is not inside any tag, it is treated as SYSTEM content** (highest priority instruction). So keep untagged text intentional.

### 3) “Mocking” / few-shot examples (important clarification)

PromptL allows writing explicit \`<user>\` and \`<assistant>\` messages to “seed” the conversation. This is **good** for in-context learning (I/O examples), not “bad practice.”

* You may include example user→assistant pairs to demonstrate desired behavior.
* Note: some providers/models may dislike an assistant message as the last message; be mindful of ordering if you add examples.

### 4) Safest placement for images/files

PromptL supports non-text content (images/files). The safest convention when adding images or file content is: **put them inside a \`<user>\` message**.

---

## Content types inside messages

Plain text in a message is text content by default. You can also embed typed content:

* Text: \`<content type="text">...</content>\` or \`<content-text>...</content-text>\`
* Image: \`<content type="image">...</content>\` or \`<content-image>URL-or-base64</content-image>\`
* File: \`<content type="file" mime="...">...</content>\` or \`<content-file mime="application/pdf">...</content-file>\`
* Tool calls (only inside \`<assistant>\`): \`<tool-call id="..." name="..." arguments={{ ... }} />\`

Tool results are written as \`<tool id="..."> ... </tool>\` (often matching the tool-call id).

---

## Variables, expressions, and defaults

PromptL uses \`{{ ... }}\` blocks for:

* **Interpolation**: \`Hello {{ name }}\`
* **Assignments**: \`{{ name = "Alice" }}\`
* **Expressions**: JS-like: \`{{ ageInMonths = age * 12 }}\`
* **Defaults** with \`||\`: \`{{ name || "Alice" }}\`

Built-in variable:

* \`{{ $now }}\` is a JavaScript \`Date\` instance (you can call methods like \`$now.getTime()\`).

Variables can be passed as runtime inputs (not necessarily defined in the prompt).

---

## Control flow: conditionals and loops

### Conditionals

Use \`if / else / endif\` inside \`{{ }}\`:

\`\`\`promptl
{{ if condition }}
  ...
{{ else }}
  ...
{{ endif }}
\`\`\`

Supports nested conditions and JS-like logical operators.

### Loops

Use \`for / else / endfor\`:

\`\`\`promptl
{{ for item in list }}
  ...
{{ else }}
  ... (runs if list is empty)
{{ endfor }}
\`\`\`

Optional index form: \`{{ for item, index in list }}\` (index starts at 0).

---

## Chains and steps (available, but not preferred here)

PromptL supports \`<step> ... </step>\` for multi-step chains, with attributes like:

* \`as="varName"\` to store step text output
* \`schema={...}\` to parse step output as JSON
* \`raw="varName"\` to store full message object
* \`isolated\` to prevent inheriting previous context
* step-level overrides like \`model="..."\` or \`temperature={{...}}\`

However, since most prompts you optimize are **agents**, do **not** recommend adding steps as a default optimization strategy. In agent workflows, the schema typically applies to the **final agent response**, not intermediate reasoning/tool steps.

---

## Structured Output (the only config you may change)

Structured output is controlled by a JSON Schema under \`schema:\` in the YAML frontmatter.
You may **only** edit this schema (e.g., required fields, enums, types, \`additionalProperties: false\`, descriptions). Do not change \`provider\`, \`model\`, or other settings.

---

### Tiny examples (outside the word limit)

**System-by-default (no tag):**

\`\`\`promptl
You are concise.
<user>Explain photosynthesis.</user>
\`\`\`

**Few-shot I/O example:**

\`\`\`promptl
<user>Convert: 2 km to meters</user>
<assistant>2000</assistant>
<user>Convert: {{ x }} km to meters</user>
\`\`\`

**Image/file safest inside \`<user>\`:**

\`\`\`promptl
<user>
  Review this:
  <content-image>{{ image_url }}</content-image>
  <content-file mime="application/pdf">{{ pdf_url }}</content-file>
</user>
\`\`\`
`.trim()
