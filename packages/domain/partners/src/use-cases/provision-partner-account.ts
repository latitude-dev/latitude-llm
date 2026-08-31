import { OutboxEventWriter } from "@domain/events"
import { OAuthGrantRepository } from "@domain/oauth-keys"
import {
  createMembership,
  createOrganization,
  generateUniqueOrganizationSlugUseCase,
  MembershipRepository,
  OrganizationRepository,
} from "@domain/organizations"
import {
  ConflictError,
  causesIncludePostgresUniqueViolation,
  generateId,
  type OrganizationId,
  SqlClient,
  toRepositoryError,
  type UserId,
} from "@domain/shared"
import { deriveDisplayNameFromEmail, deriveOrganizationNameFromDisplayName, UserRepository } from "@domain/users"
import { Effect } from "effect"
import {
  PARTNER_ACCESS_TOKEN_TTL_SECONDS,
  PARTNER_GRANT_SCOPES,
  PARTNER_REFRESH_TOKEN_TTL_SECONDS,
} from "../constants.ts"
import type { Partner } from "../entities/partner.ts"
import { generateOAuthClientString } from "../helpers.ts"

export interface ProvisionPartnerAccountInput {
  readonly partner: Partner
  // Caller-generated so the admin `SqlClient` is already scoped to it when this runs — the
  // `oauth_applications` insert lands under that RLS context (the bootstrap precedent).
  readonly organizationId: OrganizationId
  readonly user: {
    readonly email: string
    /** Falls back to a name derived from the email. */
    readonly name?: string | undefined
    readonly image?: string | undefined
    readonly phoneNumber?: string | undefined
    readonly jobTitle?: string | undefined
  }
  readonly organization?:
    | {
        /** Falls back to a name derived from the user's. */
        readonly name?: string | undefined
      }
    | undefined
}

export interface ProvisionPartnerAccountResult {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
  readonly scope: string
  readonly clientId: string
  readonly organizationId: string
  readonly organizationSlug: string
  readonly userId: string
}

const emailConflict = (email: string) => new ConflictError({ entity: "User", field: "email", value: email })

/**
 * Creates, in one transaction on the admin client, everything the interactive
 * OAuth consent flow would have produced for a brand-new account: the user,
 * their organization, their owner membership, and the partner's OAuth grant.
 * Returns the token pair.
 *
 * The admin client is required because `oauth_applications` is RLS-guarded on
 * the very organization id being created — the same reason the consent server
 * fn and the bootstrap endpoint use it.
 *
 * Never touches an existing account: a taken email fails with `ConflictError`
 * and the partner has to route the user through the interactive flow instead.
 */
export const provisionPartnerAccountUseCase = Effect.fn("partners.provisionPartnerAccount")(function* (
  input: ProvisionPartnerAccountInput,
) {
  const sqlClient = yield* SqlClient
  yield* Effect.annotateCurrentSpan("partner.id", input.partner.id)
  yield* Effect.annotateCurrentSpan("organization.id", input.organizationId)

  // BA lowercases every email it writes; the domain repositories don't, so normalize here.
  const email = input.user.email.trim().toLowerCase()
  // A provisioned user never sees the onboarding form, so anything it would have collected has to
  // come from the partner or be derived now — there is no later prompt to fall back on.
  const userName = input.user.name?.trim() || deriveDisplayNameFromEmail(email)
  const organizationName = input.organization?.name?.trim() || deriveOrganizationNameFromDisplayName(userName)

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const users = yield* UserRepository
      const organizations = yield* OrganizationRepository
      const memberships = yield* MembershipRepository
      const grants = yield* OAuthGrantRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const existing = yield* users.findOptionalByEmail(email)
      if (existing) return yield* emailConflict(email)

      const user = yield* users
        .create({
          id: generateId<"UserId">(),
          name: userName,
          email,
          emailVerified: false,
          image: input.user.image?.trim() || null,
          phoneNumber: input.user.phoneNumber?.trim() || null,
          jobTitle: input.user.jobTitle?.trim() || null,
          // The partner is the acquisition source, and onboarding will never ask.
          heardAboutUs: input.partner.name,
        })
        // Two concurrent provisions for the same email both pass the read above; the unique
        // index is what actually decides, so its violation is the same 409, not a 500.
        .pipe(
          Effect.catchTag("RepositoryError", (error) =>
            Effect.fail(causesIncludePostgresUniqueViolation(error.cause) ? emailConflict(email) : error),
          ),
        )
      const userId = user.id as UserId

      const slug = yield* generateUniqueOrganizationSlugUseCase({ name: organizationName })
      const organization = createOrganization({
        id: input.organizationId,
        name: organizationName,
        slug,
        expiresAt: null,
      })
      yield* organizations.save(organization)

      yield* memberships.save(createMembership({ organizationId: organization.id, userId, role: "owner" }))

      const now = new Date()
      const clientId = generateOAuthClientString()
      const applicationId = generateId()
      const accessToken = generateOAuthClientString()
      const refreshToken = generateOAuthClientString()

      yield* grants.createGrant({
        application: {
          id: applicationId,
          name: input.partner.name,
          icon: input.partner.iconUrl,
          metadata: JSON.stringify({ partnerId: input.partner.id, provisioned: true }),
          clientId,
          // A public client refreshes with just `client_id` + `refresh_token`, so the partner
          // needs no second credential
          clientSecret: "",
          // The partner's callbacks, so an interactive re-authorize against this client_id
          // works later — the consent row below makes that re-authorize silent.
          redirectUrls: input.partner.redirectUrls.join(","),
          type: "public",
          userId,
          organizationId: organization.id,
        },
        token: {
          id: generateId(),
          accessToken,
          refreshToken,
          accessTokenExpiresAt: new Date(now.getTime() + PARTNER_ACCESS_TOKEN_TTL_SECONDS * 1000),
          refreshTokenExpiresAt: new Date(now.getTime() + PARTNER_REFRESH_TOKEN_TTL_SECONDS * 1000),
          clientId,
          userId,
          scopes: PARTNER_GRANT_SCOPES,
        },
        consent: { id: generateId(), clientId, userId, scopes: PARTNER_GRANT_SCOPES },
      })

      const writeEvent = (event: Parameters<typeof outboxEventWriter.write>[0]) =>
        outboxEventWriter.write(event).pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      // Parity with the Better Auth `onUserCreated` hook, which this flow bypasses.
      yield* writeEvent({
        eventName: "UserSignedUp",
        aggregateType: "user",
        aggregateId: userId,
        organizationId: "system",
        payload: { userId, email, partnerId: input.partner.id, partnerName: input.partner.name },
      })
      yield* writeEvent({
        eventName: "OrganizationCreated",
        aggregateType: "organization",
        aggregateId: organization.id,
        organizationId: organization.id,
        payload: {
          organizationId: organization.id,
          actorUserId: userId,
          name: organization.name,
          slug: organization.slug,
        },
      })
      // Parity with the consent flow's accept branch, so the Keys UI story is identical.
      yield* writeEvent({
        eventName: "OAuthKeyCreated",
        aggregateType: "oauth_key",
        aggregateId: applicationId,
        organizationId: organization.id,
        payload: {
          organizationId: organization.id,
          actorUserId: userId,
          clientId,
          clientName: input.partner.name,
        },
      })
      yield* writeEvent({
        eventName: "PartnerAccountProvisioned",
        aggregateType: "partner",
        aggregateId: input.partner.id,
        organizationId: organization.id,
        payload: {
          partnerId: input.partner.id,
          partnerName: input.partner.name,
          organizationId: organization.id,
          userId,
          userEmail: email,
          clientId,
        },
      })

      return {
        accessToken,
        refreshToken,
        expiresIn: PARTNER_ACCESS_TOKEN_TTL_SECONDS,
        scope: PARTNER_GRANT_SCOPES,
        clientId,
        organizationId: organization.id as string,
        organizationSlug: organization.slug,
        userId: userId as string,
      } satisfies ProvisionPartnerAccountResult
    }),
  )
})
