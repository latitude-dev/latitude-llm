import { describe, expect, it } from "vitest"
import {
  AgentToolLoadState,
  LIST_LOADED_TOOLS_TOOL_NAME,
  NAVIGATE_TOOL_NAME,
  SEARCH_TOOLS_TOOL_NAME,
  searchAgentTools,
  TOOL_IDLE_STEP_LIMIT,
  type ToolSearchRecord,
} from "./agent-tool-search.ts"

const records = [
  {
    name: "listSignals",
    title: "List signals",
    description: "Lists signals across projects.",
    group: "signals",
    access: "read-only",
  },
  {
    name: "createSignal",
    title: "Create signal",
    description: "Creates a signal in a project.",
    group: "signals",
    access: "write",
  },
  {
    name: "deleteDataset",
    title: "Delete dataset",
    description: "Deletes a dataset by slug.",
    group: "datasets",
    access: "destructive",
  },
] satisfies ToolSearchRecord[]

describe("searchAgentTools", () => {
  it("ranks matching tools and respects the access ceiling", () => {
    expect(searchAgentTools(records, { query: "signals", maxAccess: "read-only" }).map((tool) => tool.name)).toEqual([
      "listSignals",
    ])

    expect(searchAgentTools(records, { query: "signal", maxAccess: "write" }).map((tool) => tool.name)).toEqual([
      "createSignal",
      "listSignals",
    ])
  })

  it("returns an empty result for blank or unmatched queries", () => {
    expect(searchAgentTools(records, { query: "   " })).toEqual([])
    expect(searchAgentTools(records, { query: "slack" })).toEqual([])
  })
})

describe("AgentToolLoadState", () => {
  it("keeps core tools active and evicts loaded tools after the idle window", () => {
    const state = new AgentToolLoadState({
      coreToolNames: [SEARCH_TOOLS_TOOL_NAME, LIST_LOADED_TOOLS_TOOL_NAME, NAVIGATE_TOOL_NAME],
    })

    expect(state.activeToolNames(0)).toEqual([SEARCH_TOOLS_TOOL_NAME, LIST_LOADED_TOOLS_TOOL_NAME, NAVIGATE_TOOL_NAME])

    state.load(["listSignals"], 0)
    expect(state.activeToolNames(1)).toEqual([
      SEARCH_TOOLS_TOOL_NAME,
      LIST_LOADED_TOOLS_TOOL_NAME,
      NAVIGATE_TOOL_NAME,
      "listSignals",
    ])

    state.markUsed("listSignals", 3)
    expect(state.loadedToolNames(3)).toEqual(["listSignals"])
    expect(state.loadedToolNames(3 + TOOL_IDLE_STEP_LIMIT)).toEqual(["listSignals"])
    expect(state.loadedToolNames(4 + TOOL_IDLE_STEP_LIMIT)).toEqual([])
  })
})
