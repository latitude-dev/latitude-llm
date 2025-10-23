# Latitude Load Test Scripts

Load testing scripts for Latitude SDK that target 60 requests per second for 2 minutes.

## Installation

```bash
npm install @latitude-data/sdk
```

## Scripts

### 1. Standard Load Test (`load-test.js`)

Standard prompt execution load test.

```bash
LATITUDE_API_KEY=your-api-key \
PROJECT_ID=123 \
PROMPT_PATH=your-prompt-path \
node load-test.js
```

### 2. Background Mode Load Test (`load-test-background.js`)

Tests background prompt execution with immediate attach pattern. This is useful for testing long-running prompts like Agent systems.

```bash
LATITUDE_API_KEY=your-api-key \
PROJECT_ID=123 \
PROMPT_PATH=your-prompt-path \
node load-test-background.js
```

## Environment Variables

- `LATITUDE_API_KEY` - Your Latitude API key (required)
- `PROJECT_ID` - Your project ID (required)
- `VERSION_UUID` - Version UUID (default: 'live')
- `PROMPT_PATH` - Path to your prompt (required)

## Example

```bash
LATITUDE_API_KEY=sk_live_abc123 \
PROJECT_ID=456 \
VERSION_UUID=live \
PROMPT_PATH=my-test-prompt \
node load-test.js
```

## Configuration

Edit the `CONFIG` object in `load-test.js` to customize:

- `targetRPS`: Requests per second (default: 60)
- `durationSeconds`: Test duration in seconds (default: 120)
- `parameters`: Prompt parameters to send with each request

## Output

Both scripts provide:

1. **Live stats** (updated every second):
   - Elapsed time
   - Target vs actual RPS
   - Success/failure counts
   - Latency metrics

2. **Final report** with:
   - Total duration
   - Request statistics
   - Success rate
   - Latency breakdown
   - Error summary

### Standard Mode Output

```
============================================================
LATITUDE LOAD TEST - LIVE STATS
============================================================
Elapsed Time:        45.2s / 120s
Target RPS:          60
Actual RPS:          59.8
Total Requests:      2706
Successful:          2698
Failed:              8
Success Rate:        99.70%
------------------------------------------------------------
Avg Latency:         234.56ms
Min Latency:         89ms
Max Latency:         1234ms
============================================================
```

### Background Mode Output

The background mode script tracks both background job starts and attachment success separately:

```
============================================================
LATITUDE LOAD TEST - BACKGROUND MODE - LIVE STATS
============================================================
Elapsed Time:        45.2s / 120s
Target RPS:          60
Actual RPS:          59.8
Total Requests:      2706
------------------------------------------------------------
BACKGROUND STARTS:
  Successful:        2706
  Failed:            0
  Success Rate:      100.00%
------------------------------------------------------------
ATTACHES:
  Successful:        2698
  Failed:            8
  Success Rate:      99.70%
------------------------------------------------------------
Avg Latency:         234.56ms
Min Latency:         89ms
Max Latency:         1234ms
============================================================
```

## Features

- **Randomized company names**: Each request uses a random company name from a pool of 30 companies
- **Real-time statistics**: Live updates every second during test execution
- **Graceful shutdown**: Waits for all in-flight requests before finishing
- **Comprehensive error tracking**: Captures and reports all errors with counts
- **Configurable parameters**: Easily adjust RPS, duration, and other settings

## Notes

- Both scripts wait for all active requests to complete before finishing
- Streaming is disabled for more accurate load testing
- Errors are tracked and displayed in the final report
- The background mode script tests the pattern of starting a job with `background: true` and immediately attaching to it
