#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Redis
export REDIS_PORT=6379
export REDIS_HOST=redis

# Gateway hostname and port
export GATEWAY_HOSTNAME="0.0.0.0"
export GATEWAY_PORT='8080'

docker compose run -it \
  -p $GATEWAY_PORT:$GATEWAY_PORT \
  -e DATABASE_URL="$DATABASE_URL" \
  -e REDIS_HOST="$REDIS_HOST" \
  -e GATEWAY_HOSTNAME="$GATEWAY_HOSTNAME" \
  -e GATEWAY_PORT="$GATEWAY_PORT" \
  gateway dist/server.js -p $GATEWAY_PORT
