import env from '$/env'
import { Client } from '@elastic/elasticsearch'

export default new Client({
  node: process.env.ELASTIC_URL,
  auth: {
    username: env.ELASTIC_USERNAME!,
    password: env.ELASTIC_PASSWORD!,
  },
})
