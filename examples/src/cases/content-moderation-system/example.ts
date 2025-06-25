import { Latitude } from '@latitude-data/sdk'

function printStatus(message: string) {
  process.stdout.write('\r' + message + ' '.repeat(30)) // Pad to overwrite old text
}

const MODEREATION_TYPES = {
  allGood: 'allGood',
  spam: 'spam',
  toxicity: 'toxicity',
  badWords: 'badWords',
} as const

type Content = {
  content: string
  content_type: string // post, comment, message, etc.
  platform_context: string // e.g., 'social_media', 'email', 'forum'
}
const CONTENT_BY_MODERATION_TYPE: Record<
  keyof typeof MODEREATION_TYPES,
  Content
> = {
  [MODEREATION_TYPES.allGood]: {
    content: 'The world is a beautiful place and I love it.',
    platform_context: 'Twitter',
    content_type: 'post',
  },
  [MODEREATION_TYPES.spam]: {
    content: 'Nigerian Prince wants to transfer money to you.',
    platform_context: 'email',
    content_type: 'Email message',
  },
  [MODEREATION_TYPES.toxicity]: {
    content: 'You are an idiot and nobody likes you.',
    platform_context: 'Reddit',
    content_type: 'comment',
  },
  [MODEREATION_TYPES.badWords]: {
    content: 'I hate Tomatoes because they could kill me',
    platform_context: 'Instagram',
    content_type: 'post',
  },
}

type Tools = {
  check_profanity_filter: { content: string; content_type: string }
  validate_content_lenght: { content: string; content_type: string }
  scan_for_patterns: {
    content: string
    content_type: 'spam' | 'phishing' | 'repititive'
  }
}

async function run({
  moderationType,
}: {
  moderationType: keyof typeof MODEREATION_TYPES
}) {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  try {
    const result = await sdk.prompts.run<Tools>(
      'content-moderation-system/main',
      {
        parameters: CONTENT_BY_MODERATION_TYPE[moderationType],
        stream: true,
        onEvent: (event) => {
          printStatus(`Generating response... ${event.data.type}`)
        },
        tools: {
          check_profanity_filter: async ({ content }) => {
            if (content.includes('Tomatoes')) {
              return {
                content_type: 'badWords',
                description: 'Content contains prohibited words.',
              }
            }

            return {
              content_type: 'ok',
              description:
                'Content is clean and does not contain prohibited words.',
            }
          },
          validate_content_lenght: async ({ content: _c }) => {
            return 'ok' // Assuming content length is valid for this example
          },
          scan_for_patterns: async ({ content }) => {
            if (moderationType === 'spam') {
              if (content.includes('Nigerian Prince')) {
                return {
                  content_type: 'spam',
                  description:
                    'This content appears to be spam, possibly a scam involving a Nigerian Prince.',
                }
              }
            }

            return {
              content_type: 'ok',
              description:
                'Content is clean and does not match any known patterns.',
            }
          },
        },
      },
    )

    const response = result.response
    console.log('Agent Response: \n', JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('Error: ', error.message, '\nStack:', error.stack)
  }
}

const [, , ...args] = process.argv

const moderationType = MODEREATION_TYPES[args[1]]

if (!moderationType) {
  console.error('Invalid moderation type. Please use one of the following: \n')
  Object.keys(MODEREATION_TYPES).forEach((type) => {
    console.error(`pnpm run ts:cases:content_moderation --type ${type} \n`)
  })
  process.exit(1)
}

run({ moderationType })
