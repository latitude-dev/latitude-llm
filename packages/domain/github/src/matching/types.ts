import { z } from "zod"
import { GITHUB_MATCH_ACTIONS, GITHUB_TEXT_SOURCES } from "../constants.ts"

export const githubMatchActionSchema = z.enum(GITHUB_MATCH_ACTIONS)
export type GithubMatchAction = z.infer<typeof githubMatchActionSchema>

export const githubTextSourceSchema = z.enum(GITHUB_TEXT_SOURCES)
export type GithubTextSource = z.infer<typeof githubTextSourceSchema>

export interface MatchTextInput {
  readonly source: GithubTextSource
  readonly text: string
}

export interface MatchResult {
  readonly slug: string
  readonly action: GithubMatchAction
  readonly sources: readonly GithubTextSource[]
}
