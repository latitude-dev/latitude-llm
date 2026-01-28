# REST API Endpoints Documentation

This document describes the REST API endpoints for managing datasets, dataset rows, and provider API keys (models).

## Base URL

All endpoints are available through the Gateway API at `/api/v3/`.

## Authentication

All endpoints require authentication via Bearer token (API key). Include the authentication header in your requests:

```
Authorization: Bearer YOUR_API_KEY
```

## Datasets

### List Datasets
```
GET /api/v3/datasets
```

Query Parameters:
- `page` (optional): Page number for pagination (default: 1)
- `pageSize` (optional): Number of items per page (default: 20)

Response: Array of dataset objects

### Get Dataset by ID
```
GET /api/v3/datasets/:datasetId
```

Response: Dataset object

### Create Dataset
```
POST /api/v3/datasets
```

Request Body:
```json
{
  "name": "string",
  "columns": [
    {
      "identifier": "string",
      "name": "string",
      "role": "string"
    }
  ]
}
```

Response: Created dataset object (201)

### Update Dataset
```
PUT /api/v3/datasets/:datasetId
```

Request Body:
```json
{
  "columns": [
    {
      "identifier": "string",
      "name": "string",
      "role": "string"
    }
  ]
}
```

Response: Updated dataset object

### Delete Dataset
```
DELETE /api/v3/datasets/:datasetId
```

Response: Deleted dataset object (soft delete)

## Dataset Rows

### List Dataset Rows
```
GET /api/v3/dataset-rows
```

Query Parameters:
- `datasetId` (required): ID of the dataset
- `page` (optional): Page number for pagination (default: 1)
- `pageSize` (optional): Number of items per page (default: 20)

Response: Array of dataset row objects

### Get Dataset Row by ID
```
GET /api/v3/dataset-rows/:rowId
```

Response: Dataset row object

### Create Dataset Row
```
POST /api/v3/dataset-rows
```

Request Body:
```json
{
  "datasetId": "number",
  "rowData": {
    "column1": "value1",
    "column2": "value2"
  }
}
```

Response: Created dataset row object (201)

### Update Dataset Row
```
PUT /api/v3/dataset-rows/:rowId
```

Request Body:
```json
{
  "datasetId": "number",
  "rowData": {
    "column1": "updated_value1",
    "column2": "updated_value2"
  }
}
```

Response: Updated dataset row object

### Delete Dataset Row
```
DELETE /api/v3/dataset-rows/:rowId
```

Response: Deleted dataset row object

## Provider API Keys (Models)

### List Provider API Keys
```
GET /api/v3/provider-api-keys
```

Response: Array of provider API key objects (tokens are masked)

### Get Provider API Key by ID
```
GET /api/v3/provider-api-keys/:providerApiKeyId
```

Response: Provider API key object (token is masked)

### Create Provider API Key
```
POST /api/v3/provider-api-keys
```

Request Body:
```json
{
  "name": "string",
  "provider": "string",
  "token": "string",
  "url": "string (optional)",
  "defaultModel": "string (optional)",
  "configuration": "object (optional)"
}
```

Valid providers: `OpenAI`, `Anthropic`, `Groq`, `Mistral`, `Azure`, `Google`, `GoogleVertex`, `AnthropicVertex`, `XAI`, `DeepSeek`, `Perplexity`, `Custom`, `AmazonBedrock`

Response: Created provider API key object (201)

### Update Provider API Key
```
PUT /api/v3/provider-api-keys/:providerApiKeyId
```

Request Body:
```json
{
  "name": "string"
}
```

Note: Currently only the name can be updated.

Response: Updated provider API key object

### Delete Provider API Key
```
DELETE /api/v3/provider-api-keys/:providerApiKeyId
```

Response: Deleted provider API key object (soft delete)

## Error Responses

All endpoints return standard HTTP error codes:
- `400 Bad Request`: Invalid request data
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error response format:
```json
{
  "message": "Error description"
}
```
