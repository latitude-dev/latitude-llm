import type { KnownBlock } from "@slack/web-api"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { postWithImageFallback } from "./messages.ts"

const header: KnownBlock = { type: "header", text: { type: "plain_text", text: "Support Agent" } }
const section: KnownBlock = { type: "section", text: { type: "mrkdwn", text: "*Agent Score · 67.9*" } }
const image: KnownBlock = { type: "image", image_url: "http://localhost:3000/ring.png", alt_text: "Agent Score 67.9" }

/** The shape `@slack/web-api` throws, captured from a real rejection. */
const imageDownloadFailure = {
  code: "slack_webapi_platform_error",
  data: {
    ok: false,
    error: "invalid_blocks",
    errors: ["downloading image failed [json-pointer:/blocks/2/image_url]"],
  },
}

const recordingPost = (outcomes: readonly ("fail-image" | "fail-other" | "ok")[]) => {
  const calls: (readonly KnownBlock[])[] = []
  const post = (blocks: readonly KnownBlock[]) => {
    const outcome = outcomes[calls.length] ?? "ok"
    calls.push(blocks)
    if (outcome === "fail-image") return Effect.fail(imageDownloadFailure)
    if (outcome === "fail-other") return Effect.fail({ data: { error: "invalid_blocks", errors: ["missing text"] } })
    return Effect.succeed({ ts: "1726000000.000100" })
  }
  return { calls, post }
}

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(Effect.result(effect))

describe("postWithImageFallback", () => {
  it("posts once when Slack accepts the message", async () => {
    const { calls, post } = recordingPost(["ok"])

    await run(postWithImageFallback([header, section, image], post))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(image)
  })

  it("reposts without the image when Slack cannot download it", async () => {
    const { calls, post } = recordingPost(["fail-image", "ok"])

    const result = await run(postWithImageFallback([header, section, image], post))

    expect(result._tag).toBe("Success")
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual([header, section])
  })

  it("keeps every other block, in order, when it drops the image", async () => {
    const { calls, post } = recordingPost(["fail-image", "ok"])

    await run(postWithImageFallback([header, image, section], post))

    expect(calls[1]).toEqual([header, section])
  })

  it("passes through an invalid_blocks rejection that removing images would not fix", async () => {
    const { calls, post } = recordingPost(["fail-other"])

    const result = await run(postWithImageFallback([header, section, image], post))

    expect(result._tag).toBe("Failure")
    expect(calls).toHaveLength(1)
  })

  it("does not repost when there was no image to remove", async () => {
    const { calls, post } = recordingPost(["fail-image"])

    const result = await run(postWithImageFallback([header, section], post))

    expect(result._tag).toBe("Failure")
    expect(calls).toHaveLength(1)
  })

  it("reports the second failure if the text-only post fails too, and does not try a third time", async () => {
    const { calls, post } = recordingPost(["fail-image", "fail-other"])

    const result = await run(postWithImageFallback([header, section, image], post))

    expect(result._tag).toBe("Failure")
    expect(calls).toHaveLength(2)
  })
})
