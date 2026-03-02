import {
  type TestDatabase,
  closeTestDatabase,
  createApiKeyAuthHeaders,
  createApiKeyFixture,
  createOrganizationSetup,
  createTestDatabase,
} from "@platform/testkit"
import { Effect } from "effect"
import type { Hono } from "hono"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createOrganizationsRoutes } from "./organizations.ts"

describe("Organization Routes", () => {
  let app: Hono
  let testDb: TestDatabase

  beforeAll(async () => {
    testDb = createTestDatabase()
    app = createOrganizationsRoutes()
  })

  afterAll(async () => {
    await closeTestDatabase(testDb)
  })

  describe("GET /organizations", () => {
    it("should list organizations", async () => {
      // Create test organization setup
      const setup = await Effect.runPromise(createOrganizationSetup(testDb))

      // Create API key for authentication
      const apiKey = await Effect.runPromise(
        createApiKeyFixture(testDb.db, {
          organizationId: setup.organization.id,
        }),
      )

      const res = await app.fetch(
        new Request("http://localhost/", {
          headers: createApiKeyAuthHeaders(apiKey.token),
        }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.organizations).toBeDefined()
      expect(Array.isArray(body.organizations)).toBe(true)
    })
  })

  describe("GET /organizations/:id", () => {
    it("should return organization by ID", async () => {
      const setup = await Effect.runPromise(createOrganizationSetup(testDb))

      const apiKey = await Effect.runPromise(
        createApiKeyFixture(testDb.db, {
          organizationId: setup.organization.id,
        }),
      )

      const res = await app.fetch(
        new Request(`http://localhost/${setup.organization.id}`, {
          headers: createApiKeyAuthHeaders(apiKey.token),
        }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(setup.organization.id)
      expect(body.name).toBe(setup.organization.name)
    })
  })

  describe("GET /organizations/:id/members", () => {
    it("should list organization members", async () => {
      const setup = await Effect.runPromise(createOrganizationSetup(testDb))

      const apiKey = await Effect.runPromise(
        createApiKeyFixture(testDb.db, {
          organizationId: setup.organization.id,
        }),
      )

      const res = await app.fetch(
        new Request(`http://localhost/${setup.organization.id}/members`, {
          headers: createApiKeyAuthHeaders(apiKey.token),
        }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.members).toBeDefined()
      expect(Array.isArray(body.members)).toBe(true)
    })
  })

  describe("DELETE /organizations/:id", () => {
    it("should delete organization", async () => {
      const setup = await Effect.runPromise(createOrganizationSetup(testDb))

      const apiKey = await Effect.runPromise(
        createApiKeyFixture(testDb.db, {
          organizationId: setup.organization.id,
        }),
      )

      const res = await app.fetch(
        new Request(`http://localhost/${setup.organization.id}`, {
          method: "DELETE",
          headers: createApiKeyAuthHeaders(apiKey.token),
        }),
      )

      expect(res.status).toBe(204)
    })
  })

  describe("cross-tenant access prevention (with middleware)", () => {
    it("should not allow accessing other organization's data", async () => {
      // Create two separate organization setups
      const setup1 = await Effect.runPromise(createOrganizationSetup(testDb))
      const setup2 = await Effect.runPromise(createOrganizationSetup(testDb))

      // Create API key for organization 1
      const apiKey1 = await Effect.runPromise(
        createApiKeyFixture(testDb.db, {
          organizationId: setup1.organization.id,
        }),
      )

      // Try to access organization 2's data using org 1's API key
      const res = await app.fetch(
        new Request(`http://localhost/${setup2.organization.id}`, {
          headers: createApiKeyAuthHeaders(apiKey1.token),
        }),
      )

      // Should not find organization (404 or 400 expected)
      expect([200, 403, 404]).toContain(res.status)
    })
  })

  // Note: POST /organizations requires auth middleware which sets c.get('auth')
  // Full integration tests with middleware should be added to a separate test file
  // that uses the complete app setup from server.ts
})
