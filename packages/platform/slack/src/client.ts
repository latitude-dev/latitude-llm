import { WebClient } from "@slack/web-api"

/**
 * Returns a Slack Web API client bound to a bot token. Construction is
 * synchronous and does not make network calls — errors surface per request.
 *
 * `timeoutMs` caps each request — useful for best-effort calls like
 * `auth.revoke` on disconnect where waiting more than a few seconds
 * for Slack to respond degrades UX.
 */
export const createSlackClient = (token: string, options?: { readonly timeoutMs?: number }): WebClient =>
  new WebClient(token, options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : undefined)
