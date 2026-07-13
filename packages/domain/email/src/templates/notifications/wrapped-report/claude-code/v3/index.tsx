// Re-export so the React Email dev preview server picks up the V3 template at
// `wrapped-report/claude-code/v3/`. The runtime dispatcher imports the named
// export from `EmailTemplateV3.tsx` directly.
import { ClaudeCodeWrappedEmailV3 } from "./EmailTemplateV3.tsx"

export default ClaudeCodeWrappedEmailV3
