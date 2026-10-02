---
title: Scores API
description: Submit custom scores and human feedback through the Latitude API
---

# Scores API

Use custom scores for measurements produced by your application or evaluation pipeline. Use annotations for human feedback such as thumbs up and thumbs down.

All endpoints use the project slug in the URL. The API key or OAuth token supplies the organization scope.

## Custom scores

Create a custom score with:

```text
POST /v1/projects/{projectSlug}/scores
```

```bash
curl -X POST \
  "https://api.latitude.so/v1/projects/my-project/scores" \
  -H "Authorization: Bearer $LATITUDE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "trace": { "by": "id", "id": "0123456789abcdef0123456789abcdef" },
    "sourceId": "user-satisfaction",
    "value": 0,
    "passed": false,
    "feedback": "The recommended product was discontinued",
    "metadata": { "surface": "support-chat" }
  }'
```

Custom score creation is append-only. Reusing `sourceId` creates another score; it does not replace an earlier score or act as an idempotency key.

## Human feedback

Create a human annotation with:

```text
POST /v1/projects/{projectSlug}/annotations
```

The response contains a Latitude-generated `id`. Store that identifier with the message or vote in your application, then use it to read, update, or delete the annotation:

```text
GET    /v1/projects/{projectSlug}/annotations/{annotationId}
PATCH  /v1/projects/{projectSlug}/annotations/{annotationId}
DELETE /v1/projects/{projectSlug}/annotations/{annotationId}
```

### Create a thumbs-up annotation

```bash
curl -X POST \
  "https://api.latitude.so/v1/projects/my-project/annotations" \
  -H "Authorization: Bearer $LATITUDE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "trace": { "by": "id", "id": "0123456789abcdef0123456789abcdef" },
    "value": 1,
    "passed": true,
    "feedback": "User marked this response helpful"
  }'
```

### Change it to thumbs down

```bash
curl -X PATCH \
  "https://api.latitude.so/v1/projects/my-project/annotations/ANNOTATION_ID" \
  -H "Authorization: Bearer $LATITUDE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "value": 0,
    "passed": false,
    "feedback": "User marked this response unhelpful"
  }'
```

PATCH retains the annotation ID. You may send any combination of `value`, `passed`, and `feedback`; omitted fields keep their current values.

To undo the vote, send `DELETE` using the same annotation ID.

To restore all annotations for a trace, use the paginated trace endpoint:

```text
GET /v1/projects/{projectSlug}/traces/{traceId}/annotations
```

The trace list includes each annotation ID, so a client can restore its message-to-annotation mapping after a reload. The annotation response also includes `traceId`, `spanId`, and `sessionId`; Latitude derives the session and default span from the target trace.

## Message and text anchors

Annotations accept an optional `anchor` object. Use `messageIndex` to attach feedback to a message, then optionally add `partIndex`, `startOffset`, and `endOffset` for a text selection.

## Trace ingestion timing

The target trace must be queryable before Latitude can attach a score or annotation. A request sent immediately after exporting telemetry can temporarily return `404 Trace not found`.

Retry that response with bounded exponential backoff and jitter. A trace-not-found response does not create an annotation, so retrying after that response is safe. Once POST succeeds, retain the returned annotation ID for later reads and mutations.

Filter-based trace selection does not bypass ingestion. It must match exactly one existing trace and is useful when you have a unique trace attribute but not its trace ID.

## How feedback feeds the system

Published custom scores and annotations participate in analytics. Failed scores and annotations can enter signal discovery, and annotations can be compared with evaluation scores for alignment analysis.
