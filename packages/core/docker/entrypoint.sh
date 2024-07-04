#!/bin/sh
set -e

# Run database migrations
pnpm db:migrate

cleanup() {
  echo "Core container stopped"
}

# Check if NODE_ENV is set to development.
if [ "$NODE_ENV" = "development" ]; then
  # Register the cleanup function for execution on receiving the SIGTERM or SIGINT signals.
  trap 'cleanup; exit 0' TERM INT

  # In development environment, keep the container running indefinitely.
  echo ""
  echo "♻️  Core container running in development mode"
  sleep infinity &

  # Wait for the background process (sleep infinity) to exit,
  # which will only happen when a signal is received and handled.
  wait $!
fi

