import { describe, expect, it } from "vitest"
import { buildTurns } from "./transcript.ts"
import type { TranscriptRow } from "./types.ts"

describe("buildTurns", () => {
  it("groups a user prompt + assistant response into a single-call turn", () => {
    const rows: TranscriptRow[] = [
      {
        type: "user",
        timestamp: "2026-04-10T12:00:00.000Z",
        message: { role: "user", content: "hello claude" },
      },
      {
        type: "assistant",
        timestamp: "2026-04-10T12:00:02.000Z",
        message: {
          id: "msg_1",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "hi there" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns).toHaveLength(1)
    const turn = turns[0]
    expect(turn?.userText).toBe("hello claude")
    expect(turn?.calls).toHaveLength(1)
    const call = turn?.calls[0]
    expect(call?.messageId).toBe("msg_1")
    expect(call?.text).toBe("hi there")
    expect(call?.model).toBe("claude-sonnet-4-6")
    expect(call?.tokens.input_tokens).toBe(10)
    expect(call?.tokens.output_tokens).toBe(5)
    expect(call?.toolUses).toHaveLength(0)
  })

  it("merges content across rows that share a message.id into one call", () => {
    // Real Claude Code writes each content block as its own JSONL row,
    // all sharing the same message.id. We must aggregate into one AssistantCall.
    const rows: TranscriptRow[] = [
      { type: "user", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "thinking", thinking: "..." }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        type: "assistant",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "text", text: "here is my answer" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
      {
        type: "assistant",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "tool_use", id: "tu_1", name: "Bash", input: { command: "ls" } }],
          usage: { input_tokens: 10, output_tokens: 200 },
        },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns).toHaveLength(1)
    const turn = turns[0]
    expect(turn?.calls).toHaveLength(1)
    const call = turn?.calls[0]
    expect(call?.text).toBe("here is my answer")
    expect(call?.toolUses).toHaveLength(1)
    expect(call?.toolUses[0]?.name).toBe("Bash")
    // Latest usage for the single message.id wins.
    expect(call?.tokens.input_tokens).toBe(10)
    expect(call?.tokens.output_tokens).toBe(200)
  })

  it("splits a tool-loop turn into one AssistantCall per distinct message.id", () => {
    const rows: TranscriptRow[] = [
      { type: "user", timestamp: "2026-04-10T12:00:00.000Z", message: { role: "user", content: "run ls then echo" } },
      {
        type: "assistant",
        timestamp: "2026-04-10T12:00:01.000Z",
        message: {
          id: "msg_a",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "tool_use", id: "tu_1", name: "Bash", input: { command: "ls" } }],
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      },
      {
        type: "user",
        timestamp: "2026-04-10T12:00:02.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "file1" }] },
      },
      {
        type: "assistant",
        timestamp: "2026-04-10T12:00:03.000Z",
        message: {
          id: "msg_b",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "tool_use", id: "tu_2", name: "Bash", input: { command: "echo hi" } }],
          usage: { input_tokens: 200, output_tokens: 10 },
        },
      },
      {
        type: "user",
        timestamp: "2026-04-10T12:00:04.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_2", content: "hi" }] },
      },
      {
        type: "assistant",
        timestamp: "2026-04-10T12:00:05.000Z",
        message: {
          id: "msg_c",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "done" }],
          usage: { input_tokens: 300, output_tokens: 5 },
        },
      },
    ]

    const turns = buildTurns(rows)
    expect(turns).toHaveLength(1)
    const turn = turns[0]
    expect(turn?.calls).toHaveLength(3)

    const [c1, c2, c3] = turn?.calls ?? []
    expect(c1?.messageId).toBe("msg_a")
    expect(c1?.toolUses).toHaveLength(1)
    expect(c1?.toolUses[0]?.output).toBe("file1")
    expect(c1?.tokens.input_tokens).toBe(100)

    expect(c2?.messageId).toBe("msg_b")
    expect(c2?.toolUses).toHaveLength(1)
    expect(c2?.toolUses[0]?.output).toBe("hi")
    expect(c2?.tokens.input_tokens).toBe(200)

    expect(c3?.messageId).toBe("msg_c")
    expect(c3?.text).toBe("done")
    expect(c3?.toolUses).toHaveLength(0)
    expect(c3?.tokens.input_tokens).toBe(300)

    // Tool spans get per-call timing from use → result row timestamps.
    expect(c1?.toolUses[0]?.endMs).toBeGreaterThan(c1?.toolUses[0]?.startMs ?? 0)
  })

  it("skips isMeta, isSidechain, and system/summary/file-history rows by default", () => {
    const rows: TranscriptRow[] = [
      { type: "file-history-snapshot" },
      { type: "system", subtype: "turn_duration" },
      { type: "user", isMeta: true, message: { role: "user", content: "<local-command-caveat>..." } },
      { type: "user", message: { role: "user", content: "real prompt" } },
      {
        type: "assistant",
        isSidechain: true,
        message: { id: "sub", role: "assistant", content: [{ type: "text", text: "from subagent" }] },
      },
      {
        type: "assistant",
        message: { id: "main", role: "assistant", content: [{ type: "text", text: "main response" }] },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns).toHaveLength(1)
    expect(turns[0]?.userText).toBe("real prompt")
    expect(turns[0]?.calls[0]?.text).toBe("main response")
  })

  it("includes sidechain rows when includeSidechain=true (used on subagent files)", () => {
    const rows: TranscriptRow[] = [
      {
        type: "user",
        isSidechain: true,
        promptId: "p-sub-1",
        message: { role: "user", content: "Explore the repo" },
      },
      {
        type: "assistant",
        isSidechain: true,
        message: {
          id: "sub_1",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: "I'll look" }],
          usage: { input_tokens: 3, output_tokens: 5 },
        },
      },
    ]

    const turns = buildTurns(rows, { includeSidechain: true })

    expect(turns).toHaveLength(1)
    expect(turns[0]?.userText).toBe("Explore the repo")
    expect(turns[0]?.calls[0]?.text).toBe("I'll look")
    expect(turns[0]?.calls[0]?.model).toBe("claude-haiku-4-5")
  })

  it("captures promptId on a tool call from its tool_result row", () => {
    const rows: TranscriptRow[] = [
      { type: "user", message: { role: "user", content: "launch subagent" } },
      {
        type: "assistant",
        message: {
          id: "a1",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_agent_1",
              name: "Agent",
              input: { subagent_type: "Explore", description: "find X", prompt: "go look" },
            },
          ],
        },
      },
      {
        type: "user",
        promptId: "prompt-abc",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_agent_1", content: "found X" }],
        },
      },
      {
        type: "assistant",
        message: { id: "a2", role: "assistant", content: [{ type: "text", text: "ok" }] },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns).toHaveLength(1)
    const turn = turns[0]
    expect(turn?.calls).toHaveLength(2)
    const firstCall = turn?.calls[0]
    expect(firstCall?.toolUses).toHaveLength(1)
    expect(firstCall?.toolUses[0]?.name).toBe("Agent")
    expect(firstCall?.toolUses[0]?.promptId).toBe("prompt-abc")
  })

  it("matches tool_use to tool_result by tool_use_id within the emitting call", () => {
    const rows: TranscriptRow[] = [
      { type: "user", message: { role: "user", content: "run ls" } },
      {
        type: "assistant",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "tool_use", id: "tu_1", name: "Bash", input: { command: "ls" } }],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tu_1", content: "file1\nfile2" }],
        },
      },
      {
        type: "assistant",
        message: {
          id: "msg_2",
          role: "assistant",
          content: [{ type: "text", text: "Done." }],
        },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns).toHaveLength(1)
    const turn = turns[0]
    expect(turn?.calls).toHaveLength(2)
    expect(turn?.calls[0]?.toolUses[0]).toMatchObject({
      id: "tu_1",
      name: "Bash",
      input: { command: "ls" },
      output: "file1\nfile2",
      isError: false,
    })
    expect(turn?.calls[1]?.text).toBe("Done.")
  })

  it("starts a new turn when a non-tool-result user message appears", () => {
    const rows: TranscriptRow[] = [
      { type: "user", message: { role: "user", content: "first prompt" } },
      {
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [{ type: "text", text: "reply 1" }] },
      },
      { type: "user", message: { role: "user", content: "second prompt" } },
      {
        type: "assistant",
        message: { id: "a2", role: "assistant", content: [{ type: "text", text: "reply 2" }] },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.userText).toBe("first prompt")
    expect(turns[0]?.calls[0]?.text).toBe("reply 1")
    expect(turns[1]?.userText).toBe("second prompt")
    expect(turns[1]?.calls[0]?.text).toBe("reply 2")
  })

  it("keeps per-call token usage instead of summing across calls", () => {
    // Previously we summed tokens across distinct message.ids, which triple-counts
    // the conversation context for multi-call tool loops. Now each call owns its
    // own usage and the llm_request span reports it per-call.
    const rows: TranscriptRow[] = [
      { type: "user", message: { role: "user", content: "do it" } },
      {
        type: "assistant",
        message: {
          id: "a1",
          role: "assistant",
          content: [{ type: "text", text: "step 1" }],
          usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50 },
        },
      },
      {
        type: "assistant",
        message: {
          id: "a2",
          role: "assistant",
          content: [{ type: "text", text: "step 2" }],
          usage: { input_tokens: 120, output_tokens: 15 },
        },
      },
    ]

    const turns = buildTurns(rows)

    expect(turns[0]?.calls).toHaveLength(2)
    expect(turns[0]?.calls[0]?.tokens.input_tokens).toBe(100)
    expect(turns[0]?.calls[0]?.tokens.cache_read_input_tokens).toBe(50)
    expect(turns[0]?.calls[1]?.tokens.input_tokens).toBe(120)
    expect(turns[0]?.calls[1]?.tokens.output_tokens).toBe(15)
  })
})
