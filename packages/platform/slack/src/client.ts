import { WebClient } from "@slack/web-api"

/**
 * Returns a Slack Web API client bound to a bot token. Construction is
 * synchronous and does not make network calls — errors surface per request.
 */
export const createSlackClient = (token: string): WebClient => new WebClient(token)
