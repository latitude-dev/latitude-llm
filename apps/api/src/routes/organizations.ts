import { type CreateOrganizationInput, createOrganizationUseCase } from "@domain/organizations"
import { OrganizationId, generateId } from "@domain/shared"
import {
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import type { AuthContext, OrganizationScopedEnv } from "../types.ts"

/**
 * Organization routes
 *
 * - POST /organizations - Create organization
 * - GET /organizations - List user's organizations
 * - GET /organizations/:id - Get organization by ID
 * - GET /organizations/:id/members - List organization members
 * - DELETE /organizations/:id - Delete organization
 */

export const createOrganizationsRoutes = () => {
  const app = new Hono<OrganizationScopedEnv>()

  // POST /organizations - Create organization
  app.post("/", async (c) => {
    const body = (await c.req.json()) as {
      readonly name: string
    }

    const auth = c.get("auth") as AuthContext
    const organizationId = OrganizationId(generateId())
    const organization = await runCommand(c.get("db"))(async (txDb) => {
      const organizationRepository = createOrganizationPostgresRepository(txDb)

      const input: CreateOrganizationInput = {
        id: organizationId,
        name: body.name,
        creatorId: auth.userId,
      }

      return Effect.runPromise(createOrganizationUseCase(organizationRepository)(input))
    })

    return c.json(organization, 201)
  })

  // GET /organizations - List user's organizations
  app.get("/", async (c) => {
    const organizations = await runCommand(c.get("db"))(async (txDb) => {
      const organizationRepository = createOrganizationPostgresRepository(txDb)
      return Effect.runPromise(organizationRepository.findAll())
    })
    return c.json({ organizations }, 200)
  })

  // GET /organizations/:id - Get organization by ID
  app.get("/:id", async (c) => {
    const organization = c.var.organization

    return c.json(organization, 200)
  })

  // GET /organizations/:id/members - List organization members
  app.get("/:id/members", async (c) => {
    const organizationId = c.var.organization.id

    const members = await runCommand(c.get("db"))(async (txDb) => {
      const membershipRepository = createMembershipPostgresRepository(txDb)
      return Effect.runPromise(membershipRepository.findByOrganizationId(organizationId))
    })

    return c.json({ members }, 200)
  })

  // DELETE /organizations/:id - Delete organization
  app.delete("/:id", async (c) => {
    const id = c.var.organization.id

    await runCommand(c.get("db"))(async (txDb) => {
      const organizationRepository = createOrganizationPostgresRepository(txDb)

      return Effect.runPromise(organizationRepository.delete(id))
    })
    return c.body(null, 204)
  })

  return app
}
