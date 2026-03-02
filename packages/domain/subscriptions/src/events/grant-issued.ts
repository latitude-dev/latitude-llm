import type { DomainEvent } from "@domain/events";
import type { GrantId, OrganizationId, SubscriptionId } from "@domain/shared-kernel";
import type { GrantType } from "../entities/grant.ts";

/**
 * GrantIssued event - emitted when a new grant is issued to an organization.
 */
export interface GrantIssuedEvent
  extends DomainEvent<
    "GrantIssued",
    {
      grantId: GrantId;
      subscriptionId: SubscriptionId;
      organizationId: OrganizationId;
      type: GrantType;
      amount: number;
      expiresAt: string | null;
    }
  > {
  readonly name: "GrantIssued";
}

export const createGrantIssuedEvent = (params: {
  grantId: GrantId;
  subscriptionId: SubscriptionId;
  organizationId: OrganizationId;
  type: GrantType;
  amount: number;
  expiresAt: Date | null;
}): GrantIssuedEvent => ({
  name: "GrantIssued",
  workspaceId: params.organizationId,
  payload: {
    grantId: params.grantId,
    subscriptionId: params.subscriptionId,
    organizationId: params.organizationId,
    type: params.type,
    amount: params.amount,
    expiresAt: params.expiresAt ? params.expiresAt.toISOString() : null,
  },
});
