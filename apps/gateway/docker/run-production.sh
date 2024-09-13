#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Gateway hostname and port
export HOST="0.0.0.0"
export PORT

docker compose run -it \
  -p $PORT:$PORT \
  -e DATABASE_URL="$DATABASE_URL" \
  -e HOST="$HOST" \
  -e PORT="$PORT" \
  gateway dist/server.js -p $PORT
