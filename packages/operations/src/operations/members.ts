import {
  getMemberUseCase,
  type Invitation,
  inviteMemberUseCase,
  listMembersUseCase,
  type MembershipRole,
  type MemberWithUser,
  removeMemberUseCase,
  updateMemberRoleUseCase,
} from "@domain/organizations"
import { MembershipId, UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { createRoute, z } from "@hono/zod-openapi"
import {
  InvitationRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { jsonBody, openApiNoContentResponses, PROTECTED_SECURITY, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"
import { requireOAuthUserId } from "../utils/require-oauth.ts"

const membersPath = "/members"

// ───────────────────────────────────────────────────────────── schemas ────

const RoleSchema = z.enum(["owner", "admin", "member"])

const ActiveMemberSchema = z
  .object({
    status: z
      .literal("active")
      .describe("Discriminator for confirmed members — the user has accepted their invitation and joined the org."),
    id: z.string().describe("Stable membership identifier. Use this to address the row in update/remove endpoints."),
    organizationId: z.string().describe("Organization this membership belongs to."),
    userId: z.string().describe("Identifier of the user the membership represents."),
    role: RoleSchema.describe("Member's role within the organization."),
    name: z.string().nullable().describe("Display name of the user. `null` if the user hasn't completed onboarding."),
    email: z.string().describe("User's email address, verified at signup."),
    image: z.string().nullable().describe("User's profile image URL, when set."),
    joinedAt: z.string().describe("ISO-8601 timestamp at which the user joined the organization."),
  })
  .openapi("ActiveMember")

const InvitedMemberSchema = z
  .object({
    status: z
      .literal("invited")
      .describe("Discriminator for pending invitations — the invitee hasn't accepted yet, so no user record exists."),
    id: z.string().describe("Stable invitation identifier. Distinct from membership ids."),
    organizationId: z.string().describe("Organization the invitation grants access to."),
    userId: z.null().describe("Always `null` — no user record exists until the invitation is accepted."),
    role: RoleSchema.nullable().describe(
      "Role the invitee will get once they accept. `null` means the default (`member`).",
    ),
    name: z.null().describe("Always `null` — no user record exists yet."),
    email: z.string().describe("Email address the invitation was sent to."),
    image: z.null().describe("Always `null` — no user record exists yet."),
    invitedAt: z.string().describe("ISO-8601 timestamp at which the invitation was created."),
    expiresAt: z.string().describe("ISO-8601 timestamp at which the invitation expires."),
    inviterId: z.string().describe("User id of the member who issued the invitation."),
  })
  .openapi("InvitedMember")

const MemberSchema = z.discriminatedUnion("status", [ActiveMemberSchema, InvitedMemberSchema]).openapi("Member")

const ListResponseSchema = z.object({ members: z.array(MemberSchema) }).openapi("MemberList")

const InviteRequestSchema = z
  .object({
    email: z.string().email().describe("Email address to invite. The invitee receives an accept link by email."),
    role: RoleSchema.optional().describe("Role to grant on acceptance. Defaults to `member` when omitted."),
  })
  .openapi("InviteMemberBody")

const UpdateRoleRequestSchema = z
  .object({
    role: z
      .enum(["admin", "member"])
      .describe("New role. Owners cannot be changed via this endpoint — owner-transfer happens on the web."),
  })
  .openapi("UpdateMemberRoleBody")

const MemberIdParamsSchema = z.object({
  memberId: z.string().min(1).describe("Membership identifier."),
})

// ────────────────────────────────────────────────────────────── helpers ───

const toActiveMember = (member: MemberWithUser) => ({
  status: "active" as const,
  id: member.id as string,
  organizationId: member.organizationId as string,
  userId: member.userId as string,
  role: member.role as MembershipRole,
  name: member.name,
  email: member.email,
  image: member.image,
  joinedAt: member.createdAt.toISOString(),
})

const toInvitedMember = (invitation: Invitation) => ({
  status: "invited" as const,
  id: invitation.id as string,
  organizationId: invitation.organizationId as string,
  userId: null as null,
  role: invitation.role,
  name: null as null,
  email: invitation.email,
  image: null as null,
  invitedAt: invitation.createdAt.toISOString(),
  expiresAt: invitation.expiresAt.toISOString(),
  inviterId: invitation.inviterId as string,
})

// ─────────────────────────────────────────────────────────────── routes ───

const memberEndpoint = defineOperation<OrganizationScopedEnv>(membersPath)

const listMembers = memberEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listMembers",
    tags: ["Members"],
    group: "members",
    sdkMethod: "list",
    summary: "List members",
    description: "Returns every active member of the caller's organization with their role and user details.",
    security: PROTECTED_SECURITY,
    responses: typedResponses({ status: 200, schema: ListResponseSchema, description: "List of members" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (_input, ctx) =>
    Effect.gen(function* () {
      const { members, invitations } = yield* listMembersUseCase({ organizationId: ctx.organization.id })
      const memberList = [...members.map(toActiveMember), ...invitations.map(toInvitedMember)]
      return { status: 200, body: { members: memberList } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(MembershipRepositoryLive, InvitationRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const getMember = memberEndpoint({
  route: createRoute({
    method: "get",
    path: "/{memberId}",
    name: "getMember",
    tags: ["Members"],
    group: "members",
    sdkMethod: "get",
    summary: "Get member",
    description: "Returns a single member of the caller's organization, including their role and user details.",
    security: PROTECTED_SECURITY,
    request: { params: MemberIdParamsSchema },
    responses: typedResponses({ status: 200, schema: ActiveMemberSchema, description: "Member" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const member = yield* getMemberUseCase({ membershipId: MembershipId(input.params.memberId) })
      return { status: 200, body: toActiveMember(member) } as const
    }).pipe(withPostgres(MembershipRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const inviteMember = memberEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "inviteMember",
    tags: ["Members"],
    group: "members",
    sdkMethod: "invite",
    summary: "Invite a member",
    description:
      "Signals an invitation to join the caller's organization. The invitee receives an accept link by email and becomes a member once they accept. The response is the pending invitation record. Requires OAuth authentication (API-key callers can't act on behalf of a specific user).",
    security: PROTECTED_SECURITY,
    request: { body: jsonBody(InviteRequestSchema) },
    responses: typedResponses({ status: 201, schema: InvitedMemberSchema, description: "Invitation created" }),
  }),
  access: "write",
  rateLimitTier: "high",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const inviterUserId = yield* requireOAuthUserId(ctx.auth)
      const { email, role } = input.body

      const webUrl = yield* parseEnv("LAT_WEB_URL", "string")

      const userRepo = yield* UserRepository
      const inviter = yield* userRepo.findById(inviterUserId)
      const inviterName =
        typeof inviter.name === "string" && inviter.name.trim().length > 0 ? inviter.name.trim() : "A teammate"

      const invitation = yield* inviteMemberUseCase({
        organizationId: ctx.organization.id,
        email,
        ...(role ? { role } : {}),
        inviterUserId,
        inviterName,
        webUrl,
      })
      return { status: 201, body: toInvitedMember(invitation) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          MembershipRepositoryLive,
          OrganizationRepositoryLive,
          InvitationRepositoryLive,
          UserRepositoryLive,
          OutboxEventWriterLive,
        ),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const updateMemberRole = memberEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{memberId}",
    name: "updateMember",
    tags: ["Members"],
    group: "members",
    sdkMethod: "update",
    summary: "Update a member",
    description:
      "Updates a member of the caller's organization. Today only the role is mutable. The caller must be an admin or owner; owners cannot be demoted via this endpoint. Requires OAuth authentication.",
    security: PROTECTED_SECURITY,
    request: { params: MemberIdParamsSchema, body: jsonBody(UpdateRoleRequestSchema) },
    responses: typedResponses({
      status: 200,
      schema: ActiveMemberSchema,
      description: "Member with the updated role",
    }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const requestingUserId = yield* requireOAuthUserId(ctx.auth)
      const { memberId } = input.params
      const { role } = input.body

      // Resolve the target user's id from the membership id. The existing
      // `updateMemberRoleUseCase` takes `targetUserId` (legacy from the web
      // path where roles are addressed by user); the API addresses members
      // by membership id, so we translate here.
      const target = yield* getMemberUseCase({ membershipId: MembershipId(memberId) })
      yield* updateMemberRoleUseCase({
        organizationId: ctx.organization.id,
        requestingUserId,
        targetUserId: UserId(target.userId),
        newRole: role,
      })
      const member = yield* getMemberUseCase({ membershipId: MembershipId(memberId) })
      return { status: 200, body: toActiveMember(member) } as const
    }).pipe(withPostgres(MembershipRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

const removeMember = memberEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{memberId}",
    name: "removeMember",
    tags: ["Members"],
    group: "members",
    sdkMethod: "remove",
    summary: "Remove a member",
    description:
      "Removes a member from the caller's organization. Self-removal and removing the organization owner are rejected — transfer ownership first. Requires OAuth authentication.",
    security: PROTECTED_SECURITY,
    request: { params: MemberIdParamsSchema },
    responses: openApiNoContentResponses({ description: "Member removed" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const requestingUserId = yield* requireOAuthUserId(ctx.auth)
      yield* removeMemberUseCase({ membershipId: MembershipId(input.params.memberId), requestingUserId })
      return { status: 204 } as const
    }).pipe(withPostgres(MembershipRepositoryLive, ctx.postgresClient, ctx.organization.id), withTracing),
})

export const membersModule: OperationModule = {
  path: membersPath,
  operations: [listMembers, inviteMember, getMember, updateMemberRole, removeMember],
}
