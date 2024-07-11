import dotenv, { type DotenvPopulateInput } from 'dotenv'

const env = process.env.NODE_ENV || 'development'
const useLocalhost = process.env.USE_LOCALHOST === 'true'

// Don't write production .env files!
if (env !== 'production') {
  const dbHost = useLocalhost ? `localhost` : `db`
  const redisHost = useLocalhost ? `localhost` : `redis`

  dotenv.populate(process.env as DotenvPopulateInput, {
    NODE_ENV: env,
    DATABASE_URL: `postgres://latitude:secret@${dbHost}:5432/latitude_development`,
    ELASTIC_URL: 'https://elastic:9200',
    ELASTIC_USERNAME: 'latitude',
    ELASTIC_PASSWORD: 'secret',
    REDIS_PORT: '6379',
    REDIS_HOST: redisHost,
    REDIS_PASSWORD: 'secret',
  })
}
