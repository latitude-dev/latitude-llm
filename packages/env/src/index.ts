import dotenv, { type DotenvPopulateInput } from 'dotenv'

const env = process.env.NODE_ENV || 'development'

// Don't write production .env files!
if (env !== 'production') {
  dotenv.populate(process.env as DotenvPopulateInput, {
    NODE_ENV: env,
    DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${env}`,
    ELASTIC_URL: 'https://elastic:9200',
    ELASTIC_USERNAME: 'latitude',
    ELASTIC_PASSWORD: 'secret',
    REDIS_PORT: '6379',
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: 'secret',
  })
}
