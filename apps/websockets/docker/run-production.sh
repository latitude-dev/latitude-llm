#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Redis
export QUEUE_HOST=redis

docker compose run -it \
  -e DATABASE_URL="$DATABASE_URL" \
  -e QUEUE_HOST="$QUEUE_HOST" \
  -e LATITUDE_URL="http://localhost:3000" \
  -e LATITUDE_DOMAIN="localhost" \
  -e FROM_MAILER_EMAIL="hello@latitude.so" \
  workers dist/server.js
