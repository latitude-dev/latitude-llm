import { generateId, type OrganizationSettings, type ProjectSettings } from "@domain/shared"
import type { PostgresDb } from "@platform/db-postgres"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { members, organizations, users } from "@platform/db-postgres/schema/better-auth"
import { projects } from "@platform/db-postgres/schema/projects"
import { type CryptoError, encrypt, hashToken } from "@repo/utils"
import type { Effect as EffectType } from "effect"
import { Data, Effect } from "effect"

class FixtureError extends Data.TaggedError("FixtureError")<{ cause: unknown }> {}

import type { TestDatabase } from "./test-database.ts"
import { generateTestId } from "./test-database.ts"

/**
 * User fixture input
 */
export interface UserFixtureInput {
  readonly email?: string
  readonly name?: string
  readonly emailVerified?: boolean
}

/**
 * User fixture result
 */
export interface UserFixture {
  readonly id: string
  readonly email: string
  readonly name: string | null
}

/**
 * Create a test user
 */
export const createUserFixture = (
  db: PostgresDb,
  input: UserFixtureInput = {},
): EffectType.Effect<UserFixture, FixtureError> => {
  const testId = generateTestId()
  const email = input.email ?? `test-${testId}@example.com`
  const name = input.name ?? `Test User ${testId}`

  return Effect.tryPromise({
    try: async () => {
      const userId = generateId()
      const [userRow] = await db
        .insert(users)
        .values({
          id: userId,
          email,
          name,
          emailVerified: input.emailVerified ?? true,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
        })

      return userRow
    },
    catch: (error) => new FixtureError({ cause: error }),
  })
}

/**
 * Organization fixture input
 */
export interface OrganizationFixtureInput {
  readonly name?: string
  readonly slug?: string
}

/**
 * Organization fixture result
 */
export interface OrganizationFixture {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly settings: OrganizationSettings | null
}

/**
 * Create a test organization
 */
export const createOrganizationFixture = (
  db: PostgresDb,
  input: OrganizationFixtureInput = {},
): EffectType.Effect<OrganizationFixture, FixtureError> => {
  const testId = generateTestId()
  const name = input.name ?? `Test Organization ${testId}`
  const slug = input.slug ?? `test-org-${testId}`

  return Effect.tryPromise({
    try: async () => {
      const orgId = generateId()
      const [org] = await db
        .insert(organizations)
        .values({
          id: orgId,
          name,
          slug,
          settings: null,
        })
        .returning({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          settings: organizations.settings,
        })

      return org
    },
    catch: (error) => new FixtureError({ cause: error }),
  })
}

/**
 * Membership fixture input
 */
export interface MembershipFixtureInput {
  readonly organizationId: string
  readonly userId: string
  readonly role?: "owner" | "admin" | "member"
}

/**
 * Membership fixture result
 */
export interface MembershipFixture {
  readonly id: string
  readonly organizationId: string
  readonly userId: string
  readonly role: string
}

/**
 * Create a test membership
 */
export const createMembershipFixture = (
  db: PostgresDb,
  input: MembershipFixtureInput,
): EffectType.Effect<MembershipFixture, FixtureError> => {
  return Effect.tryPromise({
    try: async () => {
      const memberId = generateId()
      const [memberRow] = await db
        .insert(members)
        .values({
          id: memberId,
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.role ?? "member",
        })
        .returning({
          id: members.id,
          organizationId: members.organizationId,
          userId: members.userId,
          role: members.role,
        })

      return memberRow
    },
    catch: (error) => new FixtureError({ cause: error }),
  })
}

/**
 * Project fixture input
 */
export interface ProjectFixtureInput {
  readonly name?: string
  readonly slug?: string
  readonly organizationId: string
}

/**
 * Project fixture result
 */
export interface ProjectFixture {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly organizationId: string
  readonly settings: ProjectSettings | null
}

/**
 * Create a test project
 */
export const createProjectFixture = (
  db: PostgresDb,
  input: ProjectFixtureInput,
): EffectType.Effect<ProjectFixture, FixtureError> => {
  const testId = generateTestId()
  const name = input.name ?? `Test Project ${testId}`
  const slug = input.slug ?? `test-project-${testId}`

  return Effect.tryPromise({
    try: async () => {
      const projectId = generateId()
      const [projectRow] = await db
        .insert(projects)
        .values({
          id: projectId,
          name,
          slug,
          organizationId: input.organizationId,
          settings: null,
        })
        .returning({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          organizationId: projects.organizationId,
          settings: projects.settings,
        })

      return projectRow
    },
    catch: (error) => new FixtureError({ cause: error }),
  })
}

/**
 * API Key fixture input
 */
export interface ApiKeyFixtureInput {
  readonly name?: string
  readonly organizationId: string
  readonly encryptionKey: Buffer
}

/**
 * API Key fixture result.
 * The `token` field contains the plaintext token for use in test auth headers.
 */
export interface ApiKeyFixture {
  readonly id: string
  readonly token: string
  readonly name: string | null
  readonly organizationId: string
}

/**
 * Create a test API key with encrypted token and hash.
 */
export const createApiKeyFixture = (
  db: PostgresDb,
  input: ApiKeyFixtureInput,
): EffectType.Effect<ApiKeyFixture, FixtureError | CryptoError> => {
  const testId = generateTestId()
  const name = input.name ?? `Test API Key ${testId}`

  return Effect.gen(function* () {
    const apiKeyId = generateId()
    const plaintextToken = `lat_test_${generateId()}`
    const tokenHash = yield* hashToken(plaintextToken)
    const encryptedToken = yield* encrypt(plaintextToken, input.encryptionKey)

    const [apiKeyRow] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(apiKeys)
          .values({
            id: apiKeyId,
            token: encryptedToken,
            tokenHash,
            name,
            organizationId: input.organizationId,
          })
          .returning({
            id: apiKeys.id,
            name: apiKeys.name,
            organizationId: apiKeys.organizationId,
          }),
      catch: (error) => new FixtureError({ cause: error }),
    })

    return { ...apiKeyRow, token: plaintextToken }
  })
}

/**
 * Complete organization setup with owner
 */
export interface OrganizationSetup {
  readonly user: UserFixture
  readonly organization: OrganizationFixture
  readonly membership: MembershipFixture
}

/**
 * Create a complete organization setup with owner user
 */
export const createOrganizationSetup = (testDb: TestDatabase): EffectType.Effect<OrganizationSetup, FixtureError> => {
  return Effect.gen(function* () {
    const user = yield* createUserFixture(testDb.db)
    const organization = yield* createOrganizationFixture(testDb.db)
    const membership = yield* createMembershipFixture(testDb.db, {
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    })

    return {
      user,
      organization,
      membership,
    }
  })
}
