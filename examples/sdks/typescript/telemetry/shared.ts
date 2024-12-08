import { ContentType, MessageRole } from '@latitude-data/sdk'

// Array of 120 diverse topics for jokes
export const topics = [
  'doctors',
  'programmers',
  'teachers',
  'chefs',
  'musicians',
  'artists',
  'athletes',
  'scientists',
  'lawyers',
  'accountants',
  'architects',
  'pilots',
  'firefighters',
  'police officers',
  'librarians',
  'dentists',
  'veterinarians',
  'photographers',
  'journalists',
  'actors',
  'dancers',
  'comedians',
  'magicians',
  'gardeners',
  'mechanics',
  'plumbers',
  'electricians',
  'carpenters',
  'painters',
  'sculptors',
  'writers',
  'poets',
  'philosophers',
  'psychologists',
  'sociologists',
  'historians',
  'archaeologists',
  'astronomers',
  'physicists',
  'chemists',
  'biologists',
  'mathematicians',
  'engineers',
  'designers',
  'fashion designers',
  'interior designers',
  'web developers',
  'data scientists',
  'AI researchers',
  'cybersecurity experts',
  'system administrators',
  'database administrators',
  'project managers',
  'business analysts',
  'marketing managers',
  'sales representatives',
  'real estate agents',
  'travel agents',
  'tour guides',
  'flight attendants',
  'hotel managers',
  'chefs',
  'bartenders',
  'waiters',
  'baristas',
  'bakers',
  'butchers',
  'farmers',
  'ranchers',
  'fishermen',
  'miners',
  'construction workers',
  'truck drivers',
  'taxi drivers',
  'delivery drivers',
  'postal workers',
  'couriers',
  'warehouse workers',
  'factory workers',
  'assembly line workers',
  'quality control inspectors',
  'safety inspectors',
  'environmental scientists',
  'meteorologists',
  'geologists',
  'oceanographers',
  'zoologists',
  'botanists',
  'marine biologists',
  'paleontologists',
  'anthropologists',
  'economists',
  'financial analysts',
  'investment bankers',
  'stockbrokers',
  'insurance agents',
  'tax advisors',
  'wedding planners',
  'event coordinators',
  'florists',
  'jewelers',
  'watchmakers',
  'opticians',
  'pharmacists',
  'nurses',
  'paramedics',
  'physical therapists',
  'occupational therapists',
  'speech therapists',
  'nutritionists',
  'personal trainers',
  'yoga instructors',
  'dance instructors',
  'music teachers',
  'art teachers',
  'language teachers',
  'driving instructors',
  'sports coaches',
  'fitness trainers',
  'life coaches',
  'career counselors',
  'social workers',
  'clergy',
  'politicians',
  'diplomats',
  'judges',
  'court reporters',
  'translators',
  'interpreters',
  'voice actors',
  'radio hosts',
  'TV presenters',
  'news anchors',
  'YouTubers',
  'influencers',
  'bloggers',
  'podcasters',
]

export interface LLMClient {
  makeCompletion(message: string): Promise<void>
}

export async function makeJokeRequest(topic: string, client: LLMClient) {
  const messages = [
    {
      role: 'user' as MessageRole.user,
      content: [
        {
          type: 'text' as ContentType.text,
          text: `Please tell me a joke about ${topic}`,
        },
      ],
    },
  ]

  try {
    await client.makeCompletion(messages[0].content[0].text)
    console.log(`Made request for joke about ${topic}`)
  } catch (error) {
    console.error(`Error making request for ${topic}:`, error)
  }
}

export async function runSequentialRequests(client: LLMClient) {
  const shuffledTopics = [...topics].sort(() => Math.random() - 0.5)

  for (let i = 0; i < shuffledTopics.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250)) // Wait 250ms
    await makeJokeRequest(shuffledTopics[i], client)
  }

  console.log('All requests completed')
}
