import { EvaluationRepository } from "@domain/evaluations"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  issueIdSchema,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  resolveSettings,
  type SettingsReader,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import type { Issue } from "../entities/issue.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

export const issueLifecycleCommandSchema = z.enum(["resolve", "unresolve", "ignore", "unignore"])

export type IssueLifecycleCommand = z.infer<typeof issueLifecycleCommandSchema>

const applyIssueLifecycleCommandInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  issueIds: z.array(issueIdSchema).min(1),
  command: issueLifecycleCommandSchema,
  keepMonitoring: z.boolean().optional(),
  now: z.date().optional(),
})

export type ApplyIssueLifecycleCommandInput = z.input<typeof applyIssueLifecycleCommandInputSchema>

export interface IssueLifecycleCommandItem {
  readonly issueId: string
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
  readonly updatedAt: Date
  readonly changed: boolean
}

export interface ApplyIssueLifecycleCommandResult {
  readonly command: IssueLifecycleCommand
  readonly keepMonitoring: boolean | null
  readonly items: readonly IssueLifecycleCommandItem[]
}

export type ApplyIssueLifecycleCommandError =
  | BadRequestError
  | ConcurrentSqlTransactionError
  | NotFoundError
  | RepositoryError

const toLifecycleCommandItem = (issue: Issue, changed: boolean): IssueLifecycleCommandItem => ({
  issueId: issue.id,
  resolvedAt: issue.resolvedAt,
  ignoredAt: issue.ignoredAt,
  updatedAt: issue.updatedAt,
  changed,
})

const applyCommandToIssue = (input: {
  readonly issue: Issue
  readonly command: IssueLifecycleCommand
  readonly now: Date
}): {
  readonly nextIssue: Issue
  readonly changed: boolean
} => {
  switch (input.command) {
    case "resolve":
      if (input.issue.resolvedAt !== null) {
        return {
          nextIssue: input.issue,
          changed: false,
        }
      }

      return {
        nextIssue: {
          ...input.issue,
          resolvedAt: input.now,
          updatedAt: input.now,
        },
        changed: true,
      }
    case "unresolve":
      if (input.issue.resolvedAt === null) {
        return {
          nextIssue: input.issue,
          changed: false,
        }
      }

      return {
        nextIssue: {
          ...input.issue,
          resolvedAt: null,
          updatedAt: input.now,
        },
        changed: true,
      }
    case "ignore":
      if (input.issue.ignoredAt !== null) {
        return {
          nextIssue: input.issue,
          changed: false,
        }
      }

      return {
        nextIssue: {
          ...input.issue,
          ignoredAt: input.now,
          updatedAt: input.now,
        },
        changed: true,
      }
    case "unignore":
      if (input.issue.ignoredAt === null) {
        return {
          nextIssue: input.issue,
          changed: false,
        }
      }

      return {
        nextIssue: {
          ...input.issue,
          ignoredAt: null,
          updatedAt: input.now,
        },
        changed: true,
      }
  }
}

const shouldArchiveLinkedEvaluations = (input: {
  readonly command: IssueLifecycleCommand
  readonly keepMonitoring: boolean | null
}): boolean => {
  if (input.command === "ignore") {
    return true
  }

  return input.command === "resolve" && input.keepMonitoring === false
}

export const applyIssueLifecycleCommandUseCase = (
  input: ApplyIssueLifecycleCommandInput,
): Effect.Effect<
  ApplyIssueLifecycleCommandResult,
  ApplyIssueLifecycleCommandError,
  EvaluationRepository | IssueRepository | SettingsReader | SqlClient
> =>
  Effect.gen(function* () {
    const parsed = applyIssueLifecycleCommandInputSchema.parse(input)
    const sqlClient = yield* SqlClient
    const keepMonitoring =
      parsed.command === "resolve"
        ? (parsed.keepMonitoring ?? (yield* resolveSettings({ projectId: parsed.projectId })).keepMonitoring)
        : null
    const issueIds = [...new Set(parsed.issueIds)]
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const evaluationRepository = yield* EvaluationRepository
        const items: IssueLifecycleCommandItem[] = []

        for (const issueId of issueIds) {
          const issue = yield* issueRepository.findByIdForUpdate(issueId)

          if (issue.projectId !== parsed.projectId) {
            return yield* new BadRequestError({
              message: `Issue ${issue.id} does not belong to project ${parsed.projectId}`,
            })
          }

          const { nextIssue, changed } = applyCommandToIssue({
            issue,
            command: parsed.command,
            now,
          })

          if (changed) {
            yield* issueRepository.save(nextIssue)

            if (shouldArchiveLinkedEvaluations({ command: parsed.command, keepMonitoring })) {
              yield* evaluationRepository.archiveByIssueId({
                projectId: parsed.projectId,
                issueId,
              })
            }
          }

          items.push(toLifecycleCommandItem(nextIssue, changed))
        }

        return {
          command: parsed.command,
          keepMonitoring,
          items,
        } satisfies ApplyIssueLifecycleCommandResult
      }),
    )
  })
