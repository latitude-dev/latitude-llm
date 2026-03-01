import type { DomainEvent } from "@domain/events";
import type { OrganizationId, UserId } from "@domain/shared-kernel";
import type { MembershipRole } from "../entities/membership.js";

/**
 * MemberJoined event - emitted when a user joins an organization.
 */
export type MemberJoinedEvent = DomainEvent<
  "MemberJoined",
  {
    organizationId: OrganizationId;
    userId: UserId;
    role: MembershipRole;
  }
>;

export const createMemberJoinedEvent = (params: {
  organizationId: OrganizationId;
  userId: UserId;
  role: MembershipRole;
}): MemberJoinedEvent => ({
  name: "MemberJoined",
  workspaceId: params.organizationId,
  payload: {
    organizationId: params.organizationId,
    userId: params.userId,
    role: params.role,
  },
});
