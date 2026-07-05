const MVP_SCRIPT_PREFIX = `const result = await llm(
  \``

const MVP_SCRIPT_SUFFIX = `\`,
  { schema: z.object({ passed: z.boolean(), feedback: z.string() }) }
)

if (result.passed) {
  return Passed(1, result.feedback)
} else {
  return Failed(0, result.feedback)
}`

export const EVALUATION_CONVERSATION_PLACEHOLDER = ["${", "session.conversation}"].join("")

// Wraps a judge prompt into the MVP sandbox script (one `llm()` call returning the present-verdict
// Passed/Failed). The single source of the judge wrapper, shared by baseline + settings codegen.
// Pure by design: this module is exposed through the package's browser entry.
export const wrapPromptAsEvaluationScript = (prompt: string): string => MVP_SCRIPT_PREFIX + prompt + MVP_SCRIPT_SUFFIX
