import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { ClaudeCodeSpanReader, type ClaudeCodeSpanReaderShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { ClaudeCodeSpanReaderLive } from "./claude-code-span-reader.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const WINDOW = { from: new Date("2026-05-04T00:00:00.000Z"), to: new Date("2026-05-11T00:00:00.000Z") }
const SCOPE = { organizationId: ORG_ID, projectId: PROJECT_ID, ...WINDOW }

const toClickHouseDateTime = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")

interface ToolSpanOverrides {
  readonly spanId: string
  readonly toolName: string
  readonly toolInput: Record<string, unknown>
  readonly workspaceName?: string
  readonly workspacePath?: string
  readonly startTime?: Date
}

const makeToolSpan = (o: ToolSpanOverrides): SpanRow => {
  const startTime = o.startTime ?? new Date("2026-05-06T10:00:00.000Z")
  const metadata: Record<string, string> = { "claude_code.version": "1.2.3" }
  if (o.workspaceName) metadata["workspace.name"] = o.workspaceName
  if (o.workspacePath) metadata["workspace.path"] = o.workspacePath
  return {
    organization_id: ORG_ID as string,
    project_id: PROJECT_ID as string,
    session_id: "s1",
    user_id: "",
    trace_id: o.spanId.padEnd(32, "0"),
    span_id: o.spanId.padEnd(16, "0"),
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toClickHouseDateTime(startTime),
    end_time: toClickHouseDateTime(new Date(startTime.getTime() + 1000)),
    name: "test-span",
    service_name: "test-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata,
    operation: "execute_tool",
    provider: "",
    model: "",
    agent_name: "",
    response_model: "",
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: o.toolName,
    tool_input: JSON.stringify(o.toolInput),
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
  }
}

const ch = setupTestClickHouse()

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

describe("ClaudeCodeSpanReader — getSkillUsage", () => {
  let repo: ClaudeCodeSpanReaderShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* ClaudeCodeSpanReader
      }).pipe(withClickHouse(ClaudeCodeSpanReaderLive, ch.client, ORG_ID)),
    )
  })

  // The testkit truncates every table in its own beforeEach, so seed here
  // (registered after the testkit's hook) rather than once in beforeAll.
  beforeEach(async () => {
    await ch.client.insert({
      table: "spans",
      format: "JSONEachRow",
      values: [
        // Two SKILL.md reads of the same skill from different paths → merge by name.
        makeToolSpan({
          spanId: "a1",
          toolName: "Read",
          toolInput: { file_path: "/repo/.agents/skills/code-review/SKILL.md" },
          workspaceName: "repo",
        }),
        makeToolSpan({
          spanId: "a2",
          toolName: "Read",
          toolInput: { file_path: "/home/me/.claude/skills/code-review/SKILL.md" },
          workspaceName: "repo",
        }),
        // A NotebookRead of a different skill's SKILL.md.
        makeToolSpan({
          spanId: "a3",
          toolName: "NotebookRead",
          toolInput: { file_path: "/repo/.agents/skills/testing/SKILL.md" },
          workspaceName: "repo",
        }),
        // Two Skill tool calls — same slug merges with the reads above.
        makeToolSpan({ spanId: "a4", toolName: "Skill", toolInput: { skill: "code-review" }, workspaceName: "repo" }),
        makeToolSpan({ spanId: "a5", toolName: "Skill", toolInput: { skill: "create-pr" }, workspaceName: "other" }),
        // Non-skill spans that must be ignored.
        makeToolSpan({
          spanId: "b1",
          toolName: "Read",
          toolInput: { file_path: "/repo/src/index.ts" },
          workspaceName: "repo",
        }),
        makeToolSpan({ spanId: "b2", toolName: "Bash", toolInput: { command: "pnpm test" }, workspaceName: "repo" }),
      ],
    })
  })

  it("counts distinct skills and total uses across reads and Skill tool calls", async () => {
    const usage = await runCh(repo.getSkillUsage(SCOPE))
    // code-review (×3: two reads + one Skill), testing (×1), create-pr (×1).
    expect(usage.distinctUsed).toBe(3)
    expect(usage.totalUses).toBe(5)
  })

  it("ranks the top skills by usage, keyed by name only", async () => {
    const usage = await runCh(repo.getSkillUsage(SCOPE))
    expect(usage.top[0]).toEqual({ name: "code-review", count: 3 })
    expect(usage.top.map((s) => s.name)).toEqual(["code-review", "create-pr", "testing"])
  })
})
