---
title: Scores API
description: Submit custom scores and annotations programmatically through the Latitude API
---

# Scores API

You can submit scores and annotations to Latitude programmatically, enabling custom quality signals from your own code, user feedback systems, or external evaluation pipelines.

## Custom Scores

Submit custom scores through the scores endpoint:

```
POST /v1/organizations/:organizationId/projects/:projectId/scores
```

Each score requires:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `traceId` | string | Yes | The trace to attach the score to |
| `value` | number | Yes | Normalized score between 0 and 1 |
| `passed` | boolean | Yes | Pass/fail verdict |
| `feedback` | string | Yes | Human-readable explanation of the verdict |
| `source_id` | string | Yes | Your custom source identifier (e.g., `"user-satisfaction"`, `"task-completion"`) |
| `spanId` | string | No | Attach to a specific span within the trace |
| `sessionId` | string | No | Associate with a session |
| `metadata` | object | No | Arbitrary JSON metadata |

Scores submitted through this endpoint are automatically categorized as custom scores.

### Example

```bash
curl -X POST \
  https://api.latitude.so/v1/organizations/org_123/projects/proj_456/scores \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "abc123def456",
    "value": 0.2,
    "passed": false,
    "feedback": "User reported the answer was incorrect. The recommended product was discontinued",
    "source_id": "user-feedback"
  }'
```

### Use Cases

- **User satisfaction ratings**: Convert thumbs up/down or star ratings into scores
- **Task completion metrics**: Track whether the agent's output led to a successful outcome
- **Business KPIs**: Conversion rates, resolution rates, or other downstream metrics
- **External validation**: Results from your own evaluation pipeline or third-party tools

## Annotations API

Submit human annotations through the dedicated annotations endpoint:

```
POST /v1/organizations/:organizationId/projects/:projectId/annotations
```

Use this endpoint when building your own annotation or feedback UI outside of Latitude's web interface. Annotations submitted through this API appear alongside annotations created in the Latitude UI.

Annotations support the same fields as custom scores, plus optional anchor fields for message-level or text-range annotations:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `traceId` | string | Yes | The trace being annotated |
| `value` | number | Yes | Normalized score between 0 and 1 |
| `passed` | boolean | Yes | Pass/fail verdict |
| `feedback` | string | Yes | The reviewer's feedback text |
| `issueId` | string | No | Link to an existing issue |

## How Scores Feed the System

Once submitted, custom scores and annotations flow through the same reliability pipeline as internally generated scores:

1. **Issue discovery**: Failed scores automatically enter the discovery pipeline, where Latitude clusters similar failures into issues
2. **Analytics**: Finalized scores appear in time-series dashboards
3. **Alignment**: Annotation scores are compared against evaluation scores for the same traces to compute alignment metrics

Custom scores and annotations are first-class citizens. They appear alongside evaluation-generated scores in all dashboards, filters, and analytics views.

## Next Steps

- [Scores Overview](./overview): How the score model works
- [Annotations](../annotations/overview): How the annotation workflow works
- [Issues](../issues/overview): How failed scores become trackable issues
