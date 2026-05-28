// Re-export so the React Email dev preview server picks up the V2 template at
// `wrapped-report/claude-code/v2/`. The runtime dispatcher imports the named
// export from `EmailTemplateV2.tsx` directly.
import { ClaudeCodeWrappedEmailV2 } from "./EmailTemplateV2.tsx"

export default ClaudeCodeWrappedEmailV2
