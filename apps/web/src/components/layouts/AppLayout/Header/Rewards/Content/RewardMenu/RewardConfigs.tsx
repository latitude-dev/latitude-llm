import { RewardType } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { z } from 'zod'

import { RewardConfig } from './RewardMenuBase'

export const REWARD_CONFIGS: Partial<{ [key in RewardType]: RewardConfig }> = {
  [RewardType.Follow]: {
    type: RewardType.Follow,
    referenceSchema: z.string({ required_error: 'Name is required' }),
    placeholder: '@latitude',
    steps: [
      {
        title: <Text.H5>Follow us on X or LinkedIn</Text.H5>,
        links: [
          { href: 'https://x.com/trylatitude', text: 'Link to X page' },
          {
            href: 'https://www.linkedin.com/company/trylatitude',
            text: 'Link to LinkedIn page',
          },
        ],
      },
      {
        title: <Text.H5>Tell us your name on X or LinkedIn</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.Post]: {
    type: RewardType.Post,
    referenceSchema: z.string({ required_error: 'Link is required' }).url(),
    placeholder: 'https://linkedin.com/post/...',
    steps: [
      {
        title: (
          <Text.H5>
            Post mentioning Latitude on X (@trylatitude) or LinkedIn
          </Text.H5>
        ),
      },
      {
        title: <Text.H5>Add here the link to the post</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.GithubStar]: {
    type: RewardType.GithubStar,
    referenceSchema: z.string({ required_error: 'Name is required' }),
    placeholder: '@latitude',
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
        title: <Text.H5>Tell us your Github username</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.GithubIssue]: {
    type: RewardType.GithubIssue,
    referenceSchema: z.string({ required_error: 'Link is required' }).url(),
    placeholder: 'https://github.com/latitude-dev/latitude-llm/pull/123',
    steps: [
      {
        title: (
          <Text.H5>
            Create a Pull Request on GitHub resolving a listed issue.
          </Text.H5>
        ),
        links: [
          {
            href: 'https://github.com/latitude-dev/latitude-llm/issues',
            text: 'Link to Issues dashboard',
          },
        ],
      },
      {
        title: <Text.H5>Add here the link to the Pull Request</Text.H5>,
        input: true,
      },
    ],
  },
  [RewardType.Referral]: {
    type: RewardType.Referral,
    referenceSchema: z.string({ required_error: 'Email is required' }).email(),
    placeholder: 'name@email.com',
    steps: [
      {
        title: (
          <Text.H5>
            Refer Latitude to a friend by sending them an email. They have to
            accept the invitation.
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
