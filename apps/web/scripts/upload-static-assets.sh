#!/bin/bash

# Script to upload Next.js static assets to S3
# This ensures persistent availability of chunks across deployments

set -e

# Environment variables required:
# AWS_ACCESS_KEY_ID - AWS access key
# AWS_SECRET_ACCESS_KEY - AWS secret key
# AWS_REGION - AWS region
# S3_BUCKET - S3 bucket name for static assets
# BUILD_ID - Unique build identifier (e.g., git commit SHA)

if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_REGION" ] || [ -z "$S3_BUCKET" ] || [ -z "$BUILD_ID" ]; then
  echo "Error: Missing required environment variables"
  echo "Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET, BUILD_ID"
  exit 1
fi

STATIC_DIR="./.next/static"
S3_PREFIX="static-assets/$BUILD_ID/_next/static"

echo "Uploading static assets to S3..."
echo "Bucket: $S3_BUCKET"
echo "Prefix: $S3_PREFIX"
echo "Source: $STATIC_DIR"

if [ ! -d "$STATIC_DIR" ]; then
  echo "Error: Static directory $STATIC_DIR does not exist"
  exit 1
fi

# Upload static assets with appropriate cache control headers
# JS/CSS chunks: cache for 1 year (immutable)
# Other assets: cache for 1 hour
aws s3 cp "$STATIC_DIR" "s3://$S3_BUCKET/$S3_PREFIX/" \
  --recursive \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*" \
  --include "*.js" \
  --include "*.css"

# Upload other static assets (images, fonts, etc.) with shorter cache
aws s3 cp "$STATIC_DIR" "s3://$S3_BUCKET/$S3_PREFIX/" \
  --recursive \
  --cache-control "public, max-age=3600" \
  --exclude "*.js" \
  --exclude "*.css"

echo "Static assets uploaded successfully to s3://$S3_BUCKET/$S3_PREFIX/"

# Output the S3 URL for use in Next.js configuration
S3_URL="https://$S3_BUCKET.s3.$AWS_REGION.amazonaws.com/$S3_PREFIX"
echo "Static assets URL: $S3_URL"
echo "Note: NEXT_PUBLIC_STATIC_ASSETS_URL is set in the Docker container at runtime"

