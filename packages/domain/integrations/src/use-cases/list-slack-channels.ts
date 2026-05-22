import { Data, Effect } from "effect"
import type { SlackChannel } from "../entities/slack-channel.ts"

/**
 * Port the use case depends on instead of `@platform/slack` directly,
 * so this package stays a pure-domain dep graph. The web layer wires
 * the concrete adapter when invoking the use case.
 */
export interface SlackChannelLister {
  readonly listChannels: (botToken: string) => Effect.Effect<readonly SlackChannel[], SlackChannelListerError, never>
}

export class SlackChannelListerError extends Data.TaggedError("SlackChannelListerError")<{
  readonly reason: "auth" | "rate-limited" | "transport"
  readonly cause?: unknown
}> {
  override get message() {
    return `Slack channel list failed (${this.reason})`
  }
}

export interface ListSlackChannelsInput {
  readonly botToken: string
  readonly channels: SlackChannelLister
}

/**
 * Returns every non-archived channel the bot can see, sorted by name.
 * Private channels only appear here if the bot is already a member —
 * the UI prompts the user to invite the bot to private channels they
 * want to route notifications into.
 */
export const listSlackChannelsUseCase = (
  input: ListSlackChannelsInput,
): Effect.Effect<readonly SlackChannel[], SlackChannelListerError, never> =>
  Effect.gen(function* () {
    const all = yield* input.channels.listChannels(input.botToken)
    const open = all.filter((c) => !c.isArchived)
    return [...open].sort((a, b) => a.name.localeCompare(b.name))
  })
