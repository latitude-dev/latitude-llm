import { MagicLinkToken, Membership, User } from '../../browser'
import { sendInvitationToUserJob } from './sendInvitationToUser'
import { sendMagicLinkJob } from './sendMagicLinkHandler'

type LatitudeEventGeneric<
  U extends keyof typeof EventHandlers,
  T extends Record<string, unknown>,
> = {
  type: U
  data: T
}

export type EventHandler<E extends LatitudeEvent> = ({
  data,
}: {
  data: E
}) => void

export type MagicLinkTokenCreated = LatitudeEventGeneric<
  'magicLinkTokenCreated',
  MagicLinkToken
>
export type UserCreatedEvent = LatitudeEventGeneric<'userCreated', User>
export type MembershipCreatedEvent = LatitudeEventGeneric<
  'membershipCreated',
  Membership & { authorId?: string }
>

export type LatitudeEvent =
  | MembershipCreatedEvent
  | UserCreatedEvent
  | MagicLinkTokenCreated

export interface IEventsHandlers {
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
}

export const EventHandlers: IEventsHandlers = {
  magicLinkTokenCreated: [sendMagicLinkJob],
  membershipCreated: [sendInvitationToUserJob],
  userCreated: [],
} as const
