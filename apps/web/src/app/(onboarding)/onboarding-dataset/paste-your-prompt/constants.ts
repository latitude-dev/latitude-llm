import { nanoidHashAlgorithm } from '@latitude-data/core/services/datasets/utils'
import { Column } from '@latitude-data/core/schema/models/datasets'
import { DATASET_COLUMN_ROLES } from '@latitude-data/core/constants'
import { envClient } from '$/envClient'

export type SamplePromptDocumentParameterKeys = 'score' | 'message'

export type SamplePromptParameters = Record<
  SamplePromptDocumentParameterKeys,
  string | number
>

const DEFAULT_PROMPT_CONFIGURATION = `
---
provider: ${envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME}
model: gpt-4o-mini
---

`
const SAMPLE_PROMPT = `
This is a response from an NPS survey:

Score: {{score}} 
Message: {{message}} 

Analyze the sentiment based on both the score and message. Prioritize identifying the primary concern in the feedback, 
focusing on the core issue mentioned by the user. Categorize the sentiment into one of the following categories:

- Product Features and Functionality
- User Interface (UI) and User Experience (UX)
- Performance and Reliability
- Customer Support and Service
- Onboarding and Learning Curve
- Pricing and Value Perception
- Integrations and Compatibility
- Scalability and Customization
- Feature Requests and Product Roadmap
- Competitor Comparison
- General Feedback (Neutral/Non-specific)

Return only one of the categories.
`

const SAMPLE_PROMPT_DATASET_COLUMNS: Column[] = [
  {
    identifier: nanoidHashAlgorithm({ columnName: 'score' }),
    name: 'score',
    role: DATASET_COLUMN_ROLES.parameter,
  },
  {
    identifier: nanoidHashAlgorithm({ columnName: 'message' }),
    name: 'message',
    role: DATASET_COLUMN_ROLES.parameter,
  },
]

const SAMPLE_PROMPT_DATASET: SamplePromptParameters[] = [
  {
    score: 5,
    message: 'The experience is neutral, with no standout problems.',
  },
  {
    score: 7,
    message:
      'Overall, pretty satisfied, though some competition offers more features.',
  },
  {
    score: 2,
    message: 'Really hard to use; the learning curve is tough.',
  },
  {
    score: 10,
    message: 'Great service and seamless integration with other tools.',
  },
  {
    score: 4,
    message: 'The product is great, but the pricing is a bit high.',
  },
  {
    score: 6,
    message: 'The product is good, but the pricing is a bit high.',
  },
  {
    score: 8,
    message: 'Performance is generally good, though it can be slow at times.',
  },
  {
    score: 6,
    message: 'Navigation is okay, but onboarding materials are lacking.',
  },
  {
    score: 3,
    message: 'The app crashes frequently, making it unreliable.',
  },
  {
    score: 5,
    message: 'The experience is neutral, with no standout problems.',
  },
]

export {
  SAMPLE_PROMPT_DATASET_COLUMNS,
  SAMPLE_PROMPT_DATASET,
  SAMPLE_PROMPT,
  DEFAULT_PROMPT_CONFIGURATION,
}
