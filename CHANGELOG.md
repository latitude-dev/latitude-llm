## 2025-04-07

### New Features and Improvements

- **Documents Queue/Worker**: Introduced a queue and worker with higher concurrency for faster document processing, optimizing I/O bound tasks. [#1100](https://github.com/latitude-dev/latitude-llm/pull/1100)
  
- **Experiments Schema**: Implemented a new schema for experiments, enhancing the structure and organization of experimental data. [#1095](https://github.com/latitude-dev/latitude-llm/pull/1095)

- **Stream Error Handling in SDK**: Improved error handling in the SDK to address silent failures, enhancing reliability and debugging. [#1090](https://github.com/latitude-dev/latitude-llm/pull/1090)

- **New Providers Added**: Integrated new providers including xai, Amazon Bedrock, Perplexity, and Deepseek, expanding the range of available services. [#1075](https://github.com/latitude-dev/latitude-llm/pull/1075)

- **Package Management and Docker Image Optimization**: Enhanced package management and significantly reduced Docker image sizes, improving build efficiency. [#1068](https://github.com/latitude-dev/latitude-llm/pull/1068)

### Other Updates

- **Provider Options Adjustment**: Adjusted provider options to be camelCase as expected by Vercel SDK, ensuring compatibility. [#1099](https://github.com/latitude-dev/latitude-llm/pull/1099)

- **Jobs Refactoring**: Refactored jobs to remove meta programming, enabling server minification and potentially fixing memory leaks.
