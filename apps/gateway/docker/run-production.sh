#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Redis
export REDIS_PORT=6379
export REDIS_HOST=redis

# Gateway hostname and port
export GATEWAY_HOSTNAME="0.0.0.0"
export GATEWAY_PORT=8788

docker compose run -it \
  -p 8788:8788 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e REDIS_HOST="$REDIS_HOST" \
  -e REDIS_PORT="$REDIS_PORT" \
  -e GATEWAY_HOSTNAME="$GATEWAY_HOSTNAME" \
  -e GATEWAY_PORT="$GATEWAY_PORT" \
  -e PORT="$GATEWAY_PORT" \
  gateway server.js -p $GATEWAY_PORT
