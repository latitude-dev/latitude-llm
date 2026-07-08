import type { OperationAccess, ToolsetTool } from "@repo/operations"

export const SEARCH_TOOLS_TOOL_NAME = "searchTools"
export const LIST_LOADED_TOOLS_TOOL_NAME = "listLoadedTools"
export const NAVIGATE_TOOL_NAME = "navigateTo"

export const TOOL_IDLE_STEP_LIMIT = 5
export const TOOL_SEARCH_RESULT_LIMIT = 5

const ACCESS_RANK = { "read-only": 0, write: 1, destructive: 2 } as const satisfies Record<OperationAccess, number>

export interface ToolSearchRecord {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly group: string
  readonly access: OperationAccess
}

interface ToolSearchResult extends ToolSearchRecord {
  readonly score: number
}

const wordsOf = (value: string): string[] =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)

const unique = <T>(values: Iterable<T>): T[] => [...new Set(values)]

const recordTokens = (record: ToolSearchRecord): string[] =>
  unique(wordsOf([record.name, record.title, record.group, record.access, record.description].join(" ")))

const scoreRecord = (record: ToolSearchRecord, queryTokens: readonly string[]): number => {
  const tokens = recordTokens(record)
  const searchable = [record.name, record.title, record.group, record.description].join(" ").toLowerCase()

  return queryTokens.reduce((score, queryToken) => {
    if (record.name.toLowerCase() === queryToken) return score + 25
    if (record.group.toLowerCase() === queryToken) return score + 16
    if (tokens.includes(queryToken)) return score + 12
    if (tokens.some((token) => token.startsWith(queryToken))) return score + 8
    if (searchable.includes(queryToken)) return score + 4
    return score
  }, 0)
}

export const createToolSearchIndex = (tools: ReadonlyArray<ToolsetTool>): ToolSearchRecord[] =>
  tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    group: tool.group,
    access: tool.access,
  }))

export const searchAgentTools = (
  records: ReadonlyArray<ToolSearchRecord>,
  input: {
    readonly query: string
    readonly maxAccess?: OperationAccess
    readonly limit?: number
  },
): ToolSearchResult[] => {
  const queryTokens = unique(wordsOf(input.query))
  if (queryTokens.length === 0) return []

  const maxRank = ACCESS_RANK[input.maxAccess ?? "destructive"]
  return records
    .filter((record) => ACCESS_RANK[record.access] <= maxRank)
    .map((record) => ({ ...record, score: scoreRecord(record, queryTokens) }))
    .filter((record) => record.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (ACCESS_RANK[a.access] !== ACCESS_RANK[b.access]) return ACCESS_RANK[a.access] - ACCESS_RANK[b.access]
      return a.name.localeCompare(b.name)
    })
    .slice(0, input.limit ?? TOOL_SEARCH_RESULT_LIMIT)
}

export class AgentToolLoadState {
  readonly #coreToolNames: readonly string[]
  readonly #idleStepLimit: number
  readonly #loaded = new Map<string, number>()

  constructor({
    coreToolNames,
    idleStepLimit = TOOL_IDLE_STEP_LIMIT,
  }: {
    readonly coreToolNames: readonly string[]
    readonly idleStepLimit?: number
  }) {
    this.#coreToolNames = coreToolNames
    this.#idleStepLimit = idleStepLimit
  }

  load(toolNames: readonly string[], stepNumber: number): void {
    for (const name of toolNames) {
      if (this.#coreToolNames.includes(name)) continue
      this.#loaded.set(name, stepNumber)
    }
  }

  markUsed(toolName: string, stepNumber: number): void {
    if (this.#loaded.has(toolName)) this.#loaded.set(toolName, stepNumber)
  }

  activeToolNames(stepNumber: number): string[] {
    this.#evictIdle(stepNumber)
    return [...this.#coreToolNames, ...this.#loaded.keys()]
  }

  loadedToolNames(stepNumber: number): string[] {
    this.#evictIdle(stepNumber)
    return [...this.#loaded.keys()]
  }

  #evictIdle(stepNumber: number): void {
    for (const [name, lastUsedStep] of this.#loaded) {
      if (stepNumber - lastUsedStep > this.#idleStepLimit) this.#loaded.delete(name)
    }
  }
}
