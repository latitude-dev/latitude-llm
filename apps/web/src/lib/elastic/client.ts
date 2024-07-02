import { Client } from '@elastic/elasticsearch'
import env from '$/env'

export default new Client({
  node: process.env.ELASTIC_URL,
  auth: {
    username: env.ELASTIC_USERNAME!,
    password: env.ELASTIC_PASSWORD!,
  },
})
