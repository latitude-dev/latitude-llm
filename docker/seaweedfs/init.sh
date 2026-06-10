#!/bin/sh
set -e

# Create the storage bucket once the S3 gateway is up (idempotent), then hand
# off to the stock SeaweedFS entrypoint so the server keeps PID 1.
bucket="${LAT_STORAGE_S3_BUCKET:-latitude}"
(
  until echo "s3.bucket.list" | weed shell >/dev/null 2>&1; do sleep 1; done
  if echo "s3.bucket.list" | weed shell | awk '{print $1}' | grep -qx "$bucket"; then
    echo "Bucket '$bucket' already exists."
  else
    echo "s3.bucket.create -name $bucket" | weed shell
  fi
) &

exec /entrypoint.sh "$@"
