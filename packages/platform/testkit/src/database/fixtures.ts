import { generateId, type OrganizationSettings, type ProjectSettings } from "@domain/shared"
import type { PostgresDb } from "@platform/db-postgres"
import { postgresSchema as schema } from "@platform/db-postgres"
import { type CryptoError, encrypt, hashToken } from "@repo/utils"
import type { Effect as EffectType } from "effect"
import { Effect } from "effect"
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
): EffectType.Effect<UserFixture, Error> => {
  const testId = generateTestId()
  const email = input.email ?? `test-${testId}@example.com`
  const name = input.name ?? `Test User ${testId}`

  return Effect.tryPromise({
    try: async () => {
      const userId = generateId()
      const [user] = await db
        .insert(schema.user)
        .values({
          id: userId,
          email,
          name,
          emailVerified: input.emailVerified ?? true,
        })
        .returning({
          id: schema.user.id,
          email: schema.user.email,
          name: schema.user.name,
        })

      return user
    },
    catch: (error) => (error instanceof Error ? error : new Error(`Failed to create user fixture: ${String(error)}`)),
  })
}

/**
 * Organization fixture input
 */
export interface OrganizationFixtureInput {
  readonly name?: string
  readonly slug?: string
  readonly creatorId?: string
}

/**
 * Organization fixture result
 */
export interface OrganizationFixture {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly creatorId: string | null
  readonly settings: OrganizationSettings | null
}

/**
 * Create a test organization
 */
export const createOrganizationFixture = (
  db: PostgresDb,
  input: OrganizationFixtureInput = {},
): EffectType.Effect<OrganizationFixture, Error> => {
  const testId = generateTestId()
  const name = input.name ?? `Test Organization ${testId}`
  const slug = input.slug ?? `test-org-${testId}`

  return Effect.tryPromise({
    try: async () => {
      const orgId = generateId()
      const [org] = await db
        .insert(schema.organization)
        .values({
          id: orgId,
          name,
          slug,
          creatorId: input.creatorId ?? null,
          settings: null,
        })
        .returning({
          id: schema.organization.id,
          name: schema.organization.name,
          slug: schema.organization.slug,
          creatorId: schema.organization.creatorId,
          settings: schema.organization.settings,
        })

      return org
    },
    catch: (error) =>
      error instanceof Error ? error : new Error(`Failed to create organization fixture: ${String(error)}`),
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
): EffectType.Effect<MembershipFixture, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const memberId = generateId()
      const [member] = await db
        .insert(schema.member)
        .values({
          id: memberId,
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.role ?? "member",
        })
        .returning({
          id: schema.member.id,
          organizationId: schema.member.organizationId,
          userId: schema.member.userId,
          role: schema.member.role,
        })

      return member
    },
    catch: (error) =>
      error instanceof Error ? error : new Error(`Failed to create membership fixture: ${String(error)}`),
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
): EffectType.Effect<ProjectFixture, Error> => {
  const testId = generateTestId()
  const name = input.name ?? `Test Project ${testId}`
  const slug = input.slug ?? `test-project-${testId}`

  return Effect.tryPromise({
    try: async () => {
      const projectId = generateId()
      const [project] = await db
        .insert(schema.projects)
        .values({
          id: projectId,
          name,
          slug,
          organizationId: input.organizationId,
          settings: null,
        })
        .returning({
          id: schema.projects.id,
          name: schema.projects.name,
          slug: schema.projects.slug,
          organizationId: schema.projects.organizationId,
          settings: schema.projects.settings,
        })

      return project
    },
    catch: (error) =>
      error instanceof Error ? error : new Error(`Failed to create project fixture: ${String(error)}`),
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
): EffectType.Effect<ApiKeyFixture, Error | CryptoError> => {
  const testId = generateTestId()
  const name = input.name ?? `Test API Key ${testId}`

  return Effect.gen(function* () {
    const apiKeyId = generateId()
    const plaintextToken = `lat_test_${generateId()}`
    const tokenHash = yield* hashToken(plaintextToken)
    const encryptedToken = yield* encrypt(plaintextToken, input.encryptionKey)

    const [apiKey] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(schema.apiKeys)
          .values({
            id: apiKeyId,
            token: encryptedToken,
            tokenHash,
            name,
            organizationId: input.organizationId,
          })
          .returning({
            id: schema.apiKeys.id,
            name: schema.apiKeys.name,
            organizationId: schema.apiKeys.organizationId,
          }),
      catch: (error) =>
        error instanceof Error ? error : new Error(`Failed to create API key fixture: ${String(error)}`),
    })

    return { ...apiKey, token: plaintextToken }
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
export const createOrganizationSetup = (testDb: TestDatabase): EffectType.Effect<OrganizationSetup, Error> => {
  return Effect.gen(function* () {
    const user = yield* createUserFixture(testDb.db)
    const organization = yield* createOrganizationFixture(testDb.db, {
      creatorId: user.id,
    })
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
