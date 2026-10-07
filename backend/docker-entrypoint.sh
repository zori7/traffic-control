#!/bin/sh
# Apply database migrations, then hand off to the container command.
set -e

attempts=0
until alembic upgrade head; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 10 ]; then
    echo "alembic upgrade head failed after $attempts attempts" >&2
    exit 1
  fi
  echo "database not ready, retrying ($attempts)..." >&2
  sleep 3
done

exec "$@"
