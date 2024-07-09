#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Redis
export REDIS_PORT=6379
export REDIS_HOST=redis
export REDIS_PASSWORD=secret

# Elastic Search
export ELASTIC_URL=elastic
export ELASTIC_USERNAME=latitude
export ELASTIC_PASSWORD=secret

docker compose run -it \
  -p 3006:3006 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e REDIS_HOST="$REDIS_HOST" \
  -e REDIS_PORT="$REDIS_PORT" \
  -e ELASTIC_URL="$ELASTIC_URL" \
  -e ELASTIC_USERNAME="$ELASTIC_USERNAME" \
  -e ELASTIC_PASSWORD="$ELASTIC_PASSWORD" \
  -e PORT="3006" \
  web apps/web/server.js -p 3006
