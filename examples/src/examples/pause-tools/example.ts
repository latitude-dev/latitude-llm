import { Latitude } from '@latitude-data/sdk'
import { Message, MessageRole } from 'promptl-ai'

// You can type the tools you are using
type Tools = {
  generate_travel_itinerary: {
    location: string
    start_date: string
    end_date: string
    preferences: string
  }
}

type ItineraryRequested = {
  data: {
    location: string
    start_date: string
    end_date: string
    preferences: string
  }
  toolId: string
  toolName: string
  conversationUuid: string
  previousMessages: Message[]
}

let toolRequested: ItineraryRequested | undefined

function enqueueJobToProcessItinerary(itinerary: ItineraryRequested) {
  toolRequested = itinerary
}

function computeTravelItinerary(itinerary: ItineraryRequested) {
  return {
    location: itinerary.data.location,
    start_date: itinerary.data.start_date,
    end_date: itinerary.data.end_date,
    preferences: itinerary.data.preferences,
    recomendations: [
      'Visit the Sagrada Familia',
      'Explore Park Güell',
      'Take a stroll down La Rambla',
      'Relax at Barceloneta Beach',
      'Enjoy tapas at a local restaurant',
      'Visit the Picasso Museum',
    ],
  }
}

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  await sdk.prompts.run<Tools>('pause-tools/example', {
    parameters: {
      destination: 'Barcelona',
      start_date: '2025-06-02',
      end_date: '2025-06-10',
      preferences: 'museums, parks, and local cuisine',
    },
    tools: {
      generate_travel_itinerary: async (
        data,
        { messages, conversationUuid, toolId, toolName, pauseExecution },
      ) => {
        enqueueJobToProcessItinerary({
          data,
          toolId,
          toolName,
          conversationUuid,
          previousMessages: messages,
        })

        // You are not returning the result now because the computation
        // is heavy and you want to pause the execution
        return pauseExecution()
      },
    },
  })

  // Imagine this is your backend processing the job
  if (toolRequested) {
    const result = await sdk.prompts.chat(toolRequested.conversationUuid, [
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolName: toolRequested.toolName,
            toolCallId: toolRequested.toolId,
            result: computeTravelItinerary(toolRequested),
          },
        ],
      },
    ])

    console.log('Recomendation', result.response.text)
  }
}

run()
