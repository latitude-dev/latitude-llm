import { OutboxEventWriter } from "@domain/events"
import { ProjectNotFoundError, ProjectRepository } from "@domain/projects"
import {
  type ApiKeyId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  type ValidationError,
} from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import { SANDBOX_API_KEY_TOKEN_PREFIX } from "../constants.ts"
import { createApiKey, generateApiKeyToken } from "../entities/api-key.ts"
import { InvalidApiKeyNameError } from "../errors.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"

export interface GenerateApiKeyInput {
  readonly id?: ApiKeyId
  readonly name: string
  readonly isSandbox: boolean
  readonly actorUserId?: string
  /**
   * Target org for the key. Defaults to the current `SqlClient` scope. Pass it
   * to mint a key in a *different* org within the caller's transaction — e.g.
   * `createSandboxUseCase` runs in the parent scope but seeds the key into the
   * new sandbox org (admin client, so RLS doesn't block the cross-org insert).
   */
  readonly organizationId?: OrganizationId
  /**
   * Bind the key to a single project in the target org. Omit (or pass `null`)
   * for an org-wide key. The project must belong to `organizationId`.
   */
  readonly projectId?: ProjectId | null
}

export type GenerateApiKeyError =
  | RepositoryError
  | ValidationError
  | InvalidApiKeyNameError
  | CryptoError
  | ProjectNotFoundError

export const generateApiKeyUseCase = Effect.fn("apiKeys.generateApiKey")(function* (input: GenerateApiKeyInput) {
  const organizationId = input.organizationId ?? (yield* SqlClient).organizationId
  if (input.id) {
    yield* Effect.annotateCurrentSpan("apiKey.id", input.id)
  }

  if (!input.name || input.name.trim().length === 0) {
    return yield* new InvalidApiKeyNameError({
      name: input.name,
      reason: "Name cannot be empty",
    })
  }

  if (input.name.length > 256) {
    return yield* new InvalidApiKeyNameError({
      name: input.name,
      reason: "Name exceeds 256 characters",
    })
  }

  const projectId = input.projectId ?? null
  if (projectId) {
    const projects = yield* ProjectRepository
    const project = yield* projects
      .findById(projectId)
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new ProjectNotFoundError({ id: projectId, organizationId })),
        ),
      )
    if (project.organizationId !== organizationId) {
      return yield* new ProjectNotFoundError({ id: projectId, organizationId })
    }
  }

  const token = generateApiKeyToken(input.isSandbox ? SANDBOX_API_KEY_TOKEN_PREFIX : "")
  const tokenHash = yield* hash(token)
  const apiKey = createApiKey({
    id: input.id,
    organizationId,
    projectId,
    token,
    tokenHash,
    name: input.name.trim(),
  })

  const repo = yield* ApiKeyRepository
  yield* repo.save(apiKey)

  const outboxEventWriter = yield* OutboxEventWriter
  yield* outboxEventWriter.write({
    eventName: "ApiKeyCreated",
    aggregateType: "api_key",
    aggregateId: apiKey.id,
    organizationId,
    payload: {
      organizationId,
      actorUserId: input.actorUserId ?? "",
      apiKeyId: apiKey.id,
      name: apiKey.name,
    },
  })

  return apiKey
})
