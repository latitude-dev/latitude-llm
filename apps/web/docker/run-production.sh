#!/bin/bash
export DATABASE_URL="postgres://latitude:secret@db:5432/latitude_development"

docker compose up web
