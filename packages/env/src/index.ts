import dotenv, { type DotenvPopulateInput } from 'dotenv'

const env = process.env.NODE_ENV || 'development'

// Don't write production .env files!
if (env !== 'production') {
  dotenv.populate(process.env as DotenvPopulateInput, {
    NODE_ENV: env,
    DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${env}`,
    REDIS_PORT: '6379',
    REDIS_HOST: '0.0.0.0',
    GATEWAY_HOSTNAME: 'localhost',
    GATEWAY_PORT: '8787', // 8788 for pro Docker image
    GATEWAY_SSL: 'false',
  })
}
