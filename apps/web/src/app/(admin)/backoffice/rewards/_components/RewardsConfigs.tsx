import { z, ZodType } from 'zod'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { RewardType } from '@latitude-data/core/constants'
import { ReactNode } from 'react'

export type RewardConfig = {
  type: RewardType
  title: string
  referenceSchema: ZodType
  placeholder: string
  steps: Array<{
    title: ReactNode
    content?: ReactNode
    links?: Array<{ href: string; text: string }>
    input?: boolean
  }>
  buttonConfig?: {
    allowMultiple?: boolean
    claimLabel?: string
    alreadyClamedLabel?: string
  }
}

export const REWARD_CONFIGS: Record<RewardType, RewardConfig> = {
  [RewardType.XFollow]: {
    type: RewardType.XFollow,
    title: 'Follow us on X',
    referenceSchema: z.string({
      error: (issue) =>
        issue.input === undefined ? 'Handle is required' : 'Not a string',
    }),
    placeholder: '@trylatitude',
    steps: [
      {
        title: <Text.H5>Follow us on X</Text.H5>,
        links: [{ href: 'https://x.com/trylatitude', text: 'Link to X page' }],
      },
      {
        title: <Text.H5>Tell us your handle on X</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.LinkedInFollow]: {
    type: RewardType.LinkedInFollow,
    title: 'Follow us on LinkedIn',
    referenceSchema: z.string({
      error: (issue) =>
        issue.input === undefined ? 'Handle is required' : 'Not a string',
    }),
    placeholder: '@trylatitude',
    steps: [
      {
        title: <Text.H5>Follow us on LinkedIn</Text.H5>,
        links: [
          {
            href: 'https://www.linkedin.com/company/trylatitude',
            text: 'Link to LinkedIn page',
          },
        ],
      },
      {
        title: <Text.H5>Tell us your handle on LinkedIn</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.GithubStar]: {
    type: RewardType.GithubStar,
    title: 'Give us a Star on GitHub',
    referenceSchema: z.string({
      error: (issue) =>
        issue.input === undefined ? 'Handle is required' : 'Not a string',
    }),
    placeholder: '@latitude-dev',
    steps: [
      {
        title: <Text.H5>Give us a Star on GitHub</Text.H5>,
        links: [
          {
            href: 'https://github.com/latitude-dev/latitude-llm',
            text: 'Link to GitHub repository',
          },
        ],
      },
      {
        title: <Text.H5>Tell us your Github handle</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.XPost]: {
    type: RewardType.XPost,
    title: 'Share Latitude on X',
    referenceSchema: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Link is required' : 'Not a string',
      })
      .pipe(z.url()),
    placeholder: 'https://x.com/post/...',
    steps: [
      {
        title: <Text.H5>Share Latitude on X (@trylatitude)</Text.H5>,
      },
      {
        title: <Text.H5>Tell us the link to your post</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.LinkedInPost]: {
    type: RewardType.LinkedInPost,
    title: 'Share Latitude on LinkedIn',
    referenceSchema: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Link is required' : 'Not a string',
      })
      .pipe(z.url()),
    placeholder: 'https://linkedin.com/post/...',
    steps: [
      {
        title: <Text.H5>Share Latitude on LinkedIn (@trylatitude)</Text.H5>,
      },
      {
        title: <Text.H5>Tell us the link to your post</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.AgentShare]: {
    type: RewardType.AgentShare,
    title: 'Share your Agent to the World',
    referenceSchema: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Link is required' : 'Not a string',
      })
      .pipe(z.url()),
    placeholder: 'https://x.com/post/...',
    steps: [
      {
        title: <Text.H5>Share your Agent on Social Media</Text.H5>,
      },
      {
        title: <Text.H5>Tell us the link to your post</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.ProductHuntUpvote]: {
    type: RewardType.ProductHuntUpvote,
    title: 'Upvote us on Product Hunt',
    referenceSchema: z.string({
      error: (issue) =>
        issue.input === undefined ? 'Handle is required' : 'Not a string',
    }),
    placeholder: '@trylatitude',
    steps: [
      {
        title: <Text.H5>Upvote us on Product Hunt</Text.H5>,
        links: [
          {
            href: 'https://www.producthunt.com/products/latitude-4',
            text: 'Link to Product Hunt launch',
          },
        ],
      },
      {
        title: <Text.H5>Tell us your handle on Product Hunt</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.Referral]: {
    type: RewardType.Referral,
    title: 'Refer Latitude to a friend',
    referenceSchema: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Email is required' : 'Not a string',
      })
      .pipe(z.email()),
    placeholder: 'name@email.com',
    steps: [
      {
        title: (
          <Text.H5>
            Send an invitation to a friend to join Latitude. They have to accept
            the invitation.
          </Text.H5>
        ),
        input: true,
      },
    ],
    buttonConfig: {
      allowMultiple: true,
      claimLabel: 'Send invitation',
      alreadyClamedLabel: 'Invitation sent',
    },
  },
}
