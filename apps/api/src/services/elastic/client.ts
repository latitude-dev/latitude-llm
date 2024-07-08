import { Client } from '@elastic/elasticsearch'
import EnvVars from '@src/common/EnvVars'

export default new Client({
  node: EnvVars.ELASTIC_URL,
  auth: {
    username: EnvVars.ELASTIC_USERNAME,
    password: EnvVars.ELASTIC_PASSWORD,
  },
})
