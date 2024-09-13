#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Redis
export QUEUE_HOST=redis

docker compose run -it \
  -e DATABASE_URL="$DATABASE_URL" \
  -e QUEUE_HOST="$QUEUE_HOST" \
  workers dist/server.js
