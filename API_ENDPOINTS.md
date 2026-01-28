# REST API Endpoints Documentation

This document describes the REST API endpoints for managing datasets, dataset rows, and provider API keys (models).

## Authentication

All endpoints require authentication via the workspace API key or user session. Include the appropriate authentication headers in your requests.

## Datasets

### List Datasets
```
GET /api/datasets
```

Query Parameters:
- `page` (optional): Page number for pagination (default: 1)
- `pageSize` (optional): Number of items per page (default: 20)

Response: Array of dataset objects

### Get Dataset by ID
```
GET /api/datasets/:id
```

Response: Dataset object

### Create Dataset
```
POST /api/datasets
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
PUT /api/datasets/:id
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
DELETE /api/datasets/:id
```

Response: Deleted dataset object (soft delete)

## Dataset Rows

### List Dataset Rows
```
GET /api/dataset-rows
```

Query Parameters:
- `datasetId` (required): ID of the dataset
- `page` (optional): Page number for pagination (default: 1)
- `pageSize` (optional): Number of items per page (default: 20)

Response: Array of dataset row objects

### Get Dataset Row by ID
```
GET /api/dataset-rows/:id
```

Response: Dataset row object

### Create Dataset Row
```
POST /api/dataset-rows
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
PUT /api/dataset-rows/:id
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
DELETE /api/dataset-rows/:id
```

Response: Deleted dataset row object

## Provider API Keys (Models)

### List Provider API Keys
```
GET /api/providerApiKeys
```

Response: Array of provider API key objects (tokens are masked)

### Get Provider API Key by ID
```
GET /api/providerApiKeys/:id
```

Response: Provider API key object (token is masked)

### Create Provider API Key
```
POST /api/providerApiKeys
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
PUT /api/providerApiKeys/:id
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
DELETE /api/providerApiKeys/:id
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
