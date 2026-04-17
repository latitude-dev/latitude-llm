import { describe, expect, it } from "vitest"
import { buildTurns } from "./transcript.ts"
import type { TranscriptRow } from "./types.ts"

describe("buildTurns", () => {
  it("groups a user prompt + assistant response into a single turn", () => {
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
    expect(turns[0]?.userText).toBe("hello claude")
    expect(turns[0]?.assistantText).toBe("hi there")
    expect(turns[0]?.model).toBe("claude-sonnet-4-6")
    expect(turns[0]?.tokens.input_tokens).toBe(10)
    expect(turns[0]?.tokens.output_tokens).toBe(5)
    expect(turns[0]?.toolCalls).toHaveLength(0)
  })

  it("merges content across rows that share a message.id (one-block-per-row format)", () => {
    // Real Claude Code writes each content block as its own JSONL row,
    // all sharing the same message.id. We must aggregate — not dedupe.
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
    expect(turns[0]?.assistantText).toBe("here is my answer")
    expect(turns[0]?.toolCalls).toHaveLength(1)
    expect(turns[0]?.toolCalls[0]?.name).toBe("Bash")
    // Usage is dedup'd per message.id (latest wins per id), then summed across ids.
    // All 3 rows share msg_1, so only the last row's usage counts.
    expect(turns[0]?.tokens.input_tokens).toBe(10)
    expect(turns[0]?.tokens.output_tokens).toBe(200)
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
    expect(turns[0]?.assistantText).toBe("main response")
  })

  it("includes sidechain rows when includeSidechain=true (used on subagent files)", () => {
    // This mirrors a real subagent transcript: every row has isSidechain:true,
    // the first is the synthetic user prompt injected by Claude Code.
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
    expect(turns[0]?.assistantText).toBe("I'll look")
    expect(turns[0]?.model).toBe("claude-haiku-4-5")
  })

  it("captures promptId on a tool call from its tool_result row", () => {
    // In real transcripts, the promptId we need to stitch subagents lives on the tool_result
    // row (a user-role row), not on the tool_use row. Assert we lift it onto the ToolCall.
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
    expect(turns[0]?.toolCalls).toHaveLength(1)
    expect(turns[0]?.toolCalls[0]?.name).toBe("Agent")
    expect(turns[0]?.toolCalls[0]?.promptId).toBe("prompt-abc")
  })

  it("matches tool_use to tool_result by tool_use_id", () => {
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
    expect(turns[0]?.assistantText).toBe("Done.")
    expect(turns[0]?.toolCalls).toHaveLength(1)
    expect(turns[0]?.toolCalls[0]).toMatchObject({
      id: "tu_1",
      name: "Bash",
      input: { command: "ls" },
      output: "file1\nfile2",
      isError: false,
    })
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
    expect(turns[0]?.assistantText).toBe("reply 1")
    expect(turns[1]?.userText).toBe("second prompt")
    expect(turns[1]?.assistantText).toBe("reply 2")
  })

  it("aggregates usage across multiple assistant messages in the same turn", () => {
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

    expect(turns[0]?.tokens.input_tokens).toBe(220)
    expect(turns[0]?.tokens.output_tokens).toBe(25)
    expect(turns[0]?.tokens.cache_read_input_tokens).toBe(50)
  })
})
