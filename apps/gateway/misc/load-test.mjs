import pLimit from 'p-limit';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8787/api/v2/projects/11/versions/92dd6684-26d0-464e-acfd-3297199bd5a0/documents/run';
const AUTH_TOKEN = 'e2c21df6-4e2d-4703-9b65-5f4dee0add23';
const NUM_REQUESTS = 450;

const limit = pLimit(500); // Limit to 500 concurrent requests

let completedRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

const makeRequest = async (index) => {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: 'prompt-syntax/6-logic',
        stream: true,
        parameters: {
          user_message: 'I do not know how to deal with personal frustrations'
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const fullResponse = await response.text();
    completedRequests++;
    successfulRequests++;
    console.log(`Request ${index + 1}/${NUM_REQUESTS} completed successfully. Total completed: ${completedRequests}`);
    return fullResponse;
  } catch (error) {
    console.log('ERROR', error)

    completedRequests++;
    failedRequests++;

    // console.error(`Request ${index + 1}/${NUM_REQUESTS} failed: ${error}. Total completed: ${completedRequests}`);
  }
};

const runLoadTest = async () => {
  console.time('Load Test');
  console.log(`Starting load test with ${NUM_REQUESTS} requests...`);

  const requests = Array(NUM_REQUESTS).fill().map((_, index) => limit(() => makeRequest(index)));

  try {
    await Promise.all(requests);
  } catch (error) {
    // do nothing
  }

  console.log('\nLoad Test Results:');
  console.log(`Total Requests: ${NUM_REQUESTS}`);
  console.log(`Successful Requests: ${successfulRequests}`);
  console.log(`Failed Requests: ${failedRequests}`);
  console.log(`Success Rate: ${((successfulRequests / NUM_REQUESTS) * 100).toFixed(2)}%`);

  console.timeEnd('Load Test');
};

runLoadTest();
