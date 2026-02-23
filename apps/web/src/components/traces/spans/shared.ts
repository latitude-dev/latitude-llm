import { BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  BackgroundColor,
  BorderColor,
  TextColor,
} from '@latitude-data/web-ui/tokens'
import React from 'react'
import {
  SpanKind,
  SpanSpecification,
  SpanStatus,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'

export type DetailsPanelProps<T extends SpanType = SpanType> = {
  span: SpanWithDetails<T> & {
    conversationId?: string
  }
}

export type SpanFrontendSpecification<T extends SpanType = SpanType> =
  SpanSpecification<T> & {
    icon: IconName
    color: SpanColor
    DetailsPanel?: (props: DetailsPanelProps<T>) => React.ReactNode
  }

export type SpanColor = {
  text: TextColor
  background: BackgroundColor
  border: BorderColor
  badge: {
    outline: BadgeProps['variant']
    filled: BadgeProps['variant']
  }
}

export const SPAN_COLORS = {
  green: {
    text: 'successMutedForeground',
    background: 'successMuted',
    border: 'successMutedForeground',
    badge: {
      outline: 'outlineSuccessMuted',
      filled: 'successMuted',
    },
  },
  blue: {
    text: 'accentForeground',
    background: 'accent',
    border: 'accentForeground',
    badge: {
      outline: 'outlineAccent',
      filled: 'accent',
    },
  },
  yellow: {
    text: 'warningMutedForeground',
    background: 'warningMuted',
    border: 'warningMutedForeground',
    badge: {
      outline: 'outlineWarningMuted',
      filled: 'warningMuted',
    },
  },
  red: {
    text: 'destructiveMutedForeground',
    background: 'destructiveMuted',
    border: 'destructiveMutedForeground',
    badge: {
      outline: 'outlineDestructiveMuted',
      filled: 'destructiveMuted',
    },
  },
  purple: {
    text: 'purpleForeground',
    background: 'purple',
    border: 'purpleForeground',
    badge: {
      outline: 'outlinePurple',
      filled: 'purple',
    },
  },
  gray: {
    text: 'foregroundMuted',
    background: 'muted',
    border: 'foregroundMuted',
    badge: {
      outline: 'outlineMuted',
      filled: 'muted',
    },
  },
} as const satisfies Record<string, SpanColor>

export const SPAN_KIND_DETAILS = {
  [SpanKind.Internal]: {
    name: 'Internal',
    description: 'Purely in-process work',
  },
  [SpanKind.Server]: {
    name: 'Server',
    description: 'Handles an inbound remote call',
  },
  [SpanKind.Client]: {
    name: 'Client',
    description: 'Wraps an outbound remote call',
  },
  [SpanKind.Producer]: {
    name: 'Producer',
    description: 'Publishes a message to a broker/queue',
  },
  [SpanKind.Consumer]: {
    name: 'Consumer',
    description: 'Processes a broker/queue message',
  },
} as const satisfies {
  [K in SpanKind]: {
    name: string
    description: string
  }
}

export const SPAN_STATUS_DETAILS = {
  [SpanStatus.Unset]: {
    name: 'Unset',
    description: 'Ended but its status is unknown',
    color: SPAN_COLORS.gray,
  },
  [SpanStatus.Ok]: {
    name: 'Succeeded',
    description: 'Ended successfully',
    color: SPAN_COLORS.green,
  },
  [SpanStatus.Error]: {
    name: 'Failed',
    description: 'Ended with an error',
    color: SPAN_COLORS.red,
  },
} as const satisfies {
  [S in SpanStatus]: {
    name: string
    description: string
    color: SpanColor
  }
}
