#!/bin/sh
set -e

SKIP_GENERATE_FLAG="--skip-generate"

# Check if migrations directory exists and has content
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Migrations found, running prisma migrate deploy..."
  npx prisma migrate deploy $SKIP_GENERATE_FLAG
else
  echo "No migrations found, running prisma db push..."
  npx prisma db push --accept-data-loss $SKIP_GENERATE_FLAG
fi

echo "Starting application..."
exec node dist/main.js
