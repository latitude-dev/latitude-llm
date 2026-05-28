// Re-export so the React Email dev preview server picks up the V1 template at
// `wrapped-report/claude-code/v1/`. The runtime dispatcher imports the named
// export from `EmailTemplateV1.tsx` directly.
import { ClaudeCodeWrappedEmailV1 } from "./EmailTemplateV1.tsx"

export default ClaudeCodeWrappedEmailV1
