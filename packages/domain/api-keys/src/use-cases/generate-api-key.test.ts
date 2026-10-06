import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { SANDBOX_API_KEY_TOKEN_PREFIX } from "../constants.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"
import { createFakeApiKeyRepository } from "../testing/index.ts"
import { generateApiKeyUseCase } from "./generate-api-key.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

const project = createProject({
  id: PROJECT_ID,
  organizationId: ORG_ID,
  name: "Primary",
  slug: "primary",
})

const mint = (isSandbox: boolean, projectId?: ProjectId) => {
  const sqlClient: SqlClientShape = {
    organizationId: ORG_ID,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: () => Effect.die(new Error("unexpected query")),
  }

  const { repository } = createFakeApiKeyRepository()
  const { repository: projects } = createFakeProjectRepository([project])

  return Effect.runPromise(
    generateApiKeyUseCase({
      name: "My key",
      isSandbox,
      ...(projectId ? { projectId } : {}),
    }).pipe(
      Effect.provideService(SqlClient, sqlClient),
      Effect.provideService(ApiKeyRepository, repository),
      Effect.provideService(ProjectRepository, projects),
      Effect.provideService(OutboxEventWriter, {
        write: (_event: OutboxWriteEvent) => Effect.void,
      }),
    ),
  )
}

describe("generateApiKeyUseCase", () => {
  it("prefixes the token with lat_sandbox_ when isSandbox is true", async () => {
    const apiKey = await mint(true)
    expect(apiKey.token.startsWith(SANDBOX_API_KEY_TOKEN_PREFIX)).toBe(true)
    expect(apiKey.projectId).toBeNull()
  })

  it("leaves the token unprefixed when isSandbox is false", async () => {
    const apiKey = await mint(false)
    expect(apiKey.token.startsWith(SANDBOX_API_KEY_TOKEN_PREFIX)).toBe(false)
    expect(apiKey.projectId).toBeNull()
  })

  it("binds the key to a project in the org", async () => {
    const apiKey = await mint(false, PROJECT_ID)
    expect(apiKey.projectId).toBe(PROJECT_ID)
  })

  it("rejects a projectId that is not in the org", async () => {
    await expect(mint(false, ProjectId("qqqqqqqqqqqqqqqqqqqqqqqq"))).rejects.toMatchObject({
      _tag: "ProjectNotFoundError",
    })
  })
})
