import { defineRelations } from "drizzle-orm"
import * as schema from "./schema/index.ts"

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    memberships: r.many.member({
      from: r.user.id,
      to: r.member.userId,
    }),
    createdOrganizations: r.many.organization({
      from: r.user.id,
      to: r.organization.creatorId,
    }),
  },

  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },

  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },

  organization: {
    creator: r.one.user({
      from: r.organization.creatorId,
      to: r.user.id,
    }),
    members: r.many.member(),
    invitations: r.many.invitation({
      from: r.organization.id,
      to: r.invitation.organizationId,
    }),
    apiKeys: r.many.apiKeys({
      from: r.organization.id,
      to: r.apiKeys.organizationId,
    }),
    projects: r.many.projects({
      from: r.organization.id,
      to: r.projects.organizationId,
    }),
    grants: r.many.grants({
      from: r.organization.id,
      to: r.grants.organizationId,
    }),
  },

  member: {
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.member.userId,
      to: r.user.id,
    }),
  },

  invitation: {
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
    }),
    inviter: r.one.user({
      from: r.invitation.inviterId,
      to: r.user.id,
    }),
  },

  subscription: {
    grants: r.many.grants({
      from: r.subscription.id,
      to: r.grants.subscriptionId,
    }),
  },

  apiKeys: {
    organization: r.one.organization({
      from: r.apiKeys.organizationId,
      to: r.organization.id,
    }),
  },

  projects: {
    organization: r.one.organization({
      from: r.projects.organizationId,
      to: r.organization.id,
    }),
  },

  grants: {
    organization: r.one.organization({
      from: r.grants.organizationId,
      to: r.organization.id,
    }),
    subscription: r.one.subscription({
      from: r.grants.subscriptionId,
      to: r.subscription.id,
    }),
  },
}))
