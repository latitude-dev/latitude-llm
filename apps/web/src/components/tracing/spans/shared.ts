import {
  SpanKind,
  SpanSpecification,
  SpanStatus,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/browser'
import { BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { BackgroundColor, TextColor } from '@latitude-data/web-ui/tokens'
import React from 'react'

export type DetailsPanelProps<T extends SpanType = SpanType> = {
  span: SpanWithDetails<T> & {
    conversationId: string
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
  badge: {
    outline: BadgeProps['variant']
    filled: BadgeProps['variant']
  }
}

export const SPAN_COLORS = {
  green: {
    text: 'successMutedForeground',
    background: 'successMuted',
    badge: {
      outline: 'outlineSuccessMuted',
      filled: 'successMuted',
    },
  },
  blue: {
    text: 'accentForeground',
    background: 'accent',
    badge: {
      outline: 'outlineAccent',
      filled: 'accent',
    },
  },
  yellow: {
    text: 'warningMutedForeground',
    background: 'warningMuted',
    badge: {
      outline: 'outlineWarningMuted',
      filled: 'warningMuted',
    },
  },
  red: {
    text: 'destructiveMutedForeground',
    background: 'destructiveMuted',
    badge: {
      outline: 'outlineDestructiveMuted',
      filled: 'destructiveMuted',
    },
  },
  purple: {
    text: 'purpleForeground',
    background: 'purple',
    badge: {
      outline: 'outlinePurple',
      filled: 'purple',
    },
  },
  gray: {
    text: 'foreground',
    background: 'background',
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
    description: 'The status is unknown',
    color: SPAN_COLORS.gray,
  },
  [SpanStatus.Ok]: {
    name: 'Succeeded',
    description: 'The span succeeded',
    color: SPAN_COLORS.green,
  },
  [SpanStatus.Error]: {
    name: 'Failed',
    description: 'The span failed',
    color: SPAN_COLORS.red,
  },
} as const satisfies {
  [S in SpanStatus]: {
    name: string
    description: string
    color: SpanColor
  }
}
