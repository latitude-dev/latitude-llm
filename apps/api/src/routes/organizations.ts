import { type CreateOrganizationInput, createOrganizationUseCase } from "@domain/organizations"
import { OrganizationId, PermissionError, generateId } from "@domain/shared"
import { createMembershipPostgresRepository, createOrganizationPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import { extractParam } from "../lib/effect-utils.ts"
import type { AuthContext } from "../types.ts"

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
  const app = new Hono()
  const assertOrganizationAccess = (auth: AuthContext, organizationId: string) => {
    if (auth.organizationId !== organizationId) {
      throw new PermissionError({
        message: "You do not have access to this organization",
        workspaceId: organizationId,
      })
    }
  }

  app.use("/:id", async (c, next) => {
    const auth = c.get("auth") as AuthContext
    assertOrganizationAccess(auth, c.req.param("id"))
    await next()
  })

  app.use("/:id/*", async (c, next) => {
    const auth = c.get("auth") as AuthContext
    assertOrganizationAccess(auth, c.req.param("id"))
    await next()
  })

  // POST /organizations - Create organization
  app.post("/", async (c) => {
    const organizationRepository = createOrganizationPostgresRepository(c.get("db"))
    const body = (await c.req.json()) as {
      readonly name: string
      readonly slug: string
    }

    const auth = c.get("auth") as AuthContext

    const input: CreateOrganizationInput = {
      id: OrganizationId(generateId()),
      name: body.name,
      slug: body.slug,
      creatorId: auth.userId,
    }

    const organization = await Effect.runPromise(createOrganizationUseCase(organizationRepository)(input))

    return c.json(organization, 201)
  })

  // GET /organizations - List user's organizations
  app.get("/", async (c) => {
    const organizationRepository = createOrganizationPostgresRepository(c.get("db"))
    const organizations = await Effect.runPromise(organizationRepository.findAll())
    return c.json({ organizations }, 200)
  })

  // GET /organizations/:id - Get organization by ID
  app.get("/:id", async (c) => {
    const organizationRepository = createOrganizationPostgresRepository(c.get("db"))
    const id = extractParam(c, "id", OrganizationId)
    if (!id) {
      throw new BadRequestError({ httpMessage: "Organization ID required" })
    }

    const organization = await Effect.runPromise(organizationRepository.findById(id))

    if (!organization) {
      throw new BadRequestError({ httpMessage: "Organization not found" })
    }

    return c.json(organization, 200)
  })

  // GET /organizations/:id/members - List organization members
  app.get("/:id/members", async (c) => {
    const membershipRepository = createMembershipPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "id", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID required" })
    }

    const members = await Effect.runPromise(membershipRepository.findByOrganizationId(organizationId))

    return c.json({ members }, 200)
  })

  // DELETE /organizations/:id - Delete organization
  app.delete("/:id", async (c) => {
    const organizationRepository = createOrganizationPostgresRepository(c.get("db"))
    const id = extractParam(c, "id", OrganizationId)
    if (!id) {
      throw new BadRequestError({ httpMessage: "Organization ID required" })
    }

    await Effect.runPromise(organizationRepository.delete(id))
    return c.body(null, 204)
  })

  return app
}
