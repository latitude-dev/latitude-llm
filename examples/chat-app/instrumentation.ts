import dotenv from 'dotenv'
import { Latitude } from '@latitude-data/sdk'
import { VercelSpanProcessor } from '@latitude-data/telemetry'

// Load environment variables first
dotenv.config()

export const latitude = new Latitude('9d5a427b-f4db-42c4-ac03-41e30675bac2', {
  projectId: 21,
  telemetry: {
    disableBatch: true,
    processors: [VercelSpanProcessor],
  },
})
