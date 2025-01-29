import { Latitude } from '@latitude-data/sdk'
// In case you want to dump in a file the events from the server
/* import fs from 'node:fs' */

const { apiKey, projectId, commitUuid, documentPath } = {
  apiKey: process.env.LATITUDE_API_KEY,
  projectId: +process.env.PROJECT_ID,
  documentPath: process.env.DOCUMENT_PATH,
  commitUuid: process.env.COMMIT_UUID,
}

type Tools = {
  get_coordinates: { location: string }
  get_weather: { latitude: string; longitude: string }
}

const LOCATIONS = [
  {
    name: 'Barcelona',
    latitude: '41.3851',
    longitude: '2.1734',
    temperature: 24,
  },
  {
    name: 'Miami',
    latitude: '25.7617',
    longitude: '-80.1918',
    temperature: 30,
  },
  {
    name: 'Boston',
    latitude: '42.3601',
    longitude: '-71.0589',
    temperature: 10,
  },
]
const LOCATIONS_BY_LAT_LONG = {
  '41.3851:2.1734': 'Barcelona',
  '25.7617:-80.1918': 'Miami',
  '42.3601:-71.0589': 'Boston',
}

async function runDocumentRequestWithToolCalls() {
  const sdk = new Latitude(apiKey, {
    __internal: {
      gateway: {
        host: 'localhost',
        port: 8787,
        ssl: false,
      },
    },
  })
  try {
    const response = await sdk.prompts.run<Tools>(documentPath, {
      projectId,
      parameters: {
        my_location: 'Barcelona and Miami',
        other_location: 'Boston',
      },
      versionUuid: commitUuid,
      stream: true,
      /* onEvent: (event) => { */
      /*   const eventType = event.event */
      /*   if (eventType === 'provider-event') return */
      /**/
      /*   const data = event.data */
      /*   const dataType = data.type */
      /*   if (dataType.includes('delta')) return */
      /**/
      /*   if ('response' in data && 'providerLog' in data.response) { */
      /*     delete data.response.providerLog */
      /*   } */
      /*   // @ts-expect-error - Some don't have provider log */
      /*   delete data.isLastStep */
      /*   // @ts-expect-error - Some don't have provider log */
      /*   delete data.config */
      /**/
      /*   const strippedData = JSON.stringify( */
      /*     { */
      /*       event: eventType, */
      /*       data, */
      /*     }, */
      /*     null, */
      /*     2, */
      /*   ) */
      /*   fs.appendFile('events.json', `${strippedData},\n`, (err) => { */
      /*     if (err) { */
      /*       console.error('Error appending to file:', err) */
      /*     } */
      /*   }) */
      /* }, */
      tools: {
        get_coordinates: async ({ id, arguments: { location } }) => {
          const { latitude, longitude } = LOCATIONS.find(
            (loc) => loc.name === location,
          )
          return {
            id,
            name: 'get_coordinates',
            result: { latitude, longitude },
          }
        },
        get_weather: async (
          { id, arguments: { latitude, longitude } },
          { pauseExecution },
        ) => {
          const callPauseExecution = process.env.PAUSE_EXECUTION

          if (callPauseExecution) {
            // Example of pausing execution
            return pauseExecution()
          }

          const latlong = `${latitude}:${longitude}`
          const name = LOCATIONS_BY_LAT_LONG[latlong]
          const { temperature } = LOCATIONS.find((loc) => loc.name === name)
          return {
            id,
            name: 'get_the_weather',
            result: { temperature },
          }
        },
      },
    })

    console.log('SDK RESPONSE', JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('SDK ERROR', error)
  }
}

runDocumentRequestWithToolCalls()
