#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

# Redis
export REDIS_PORT=6379
export REDIS_HOST=redis

docker compose up web
