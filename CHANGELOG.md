# Changelog

## 2025-04-07

### Summary of Changes

This update introduces significant improvements and new features, including enhanced document processing, a new schema for experiments, and expanded provider support.

### Highlights

- **Documents Queue/Worker**: Implemented a queue and worker with higher concurrency to optimize document processing, primarily for I/O bound tasks. This enhancement significantly speeds up document handling. [#1100](https://github.com/latitude-dev/latitude-llm/pull/1100)

- **Experiments Schema**: A new schema for experiments has been introduced, improving the structure and organization of experimental data. This change facilitates better management and analysis of experiments. [#1095](https://github.com/latitude-dev/latitude-llm/pull/1095)

- **Stream Error Handling in SDK**: Enhanced error handling in the SDK to address silent failures, improving reliability and debugging capabilities. [#1090](https://github.com/latitude-dev/latitude-llm/pull/1090)

- **New Providers Added**: Integrated new providers including xai, Amazon Bedrock, Perplexity, and Deepseek, expanding the range of available services and enhancing flexibility for users. [#1075](https://github.com/latitude-dev/latitude-llm/pull/1075)

- **Package Management and Docker Image Optimization**: Improved package management and significantly reduced Docker image sizes, leading to more efficient builds and deployments. [#1068](https://github.com/latitude-dev/latitude-llm/pull/1068)

### Other Updates

- **Provider Options Adjustment**: Adjusted provider options to be camelCase as expected by Vercel SDK, ensuring compatibility and smooth integration. [#1099](https://github.com/latitude-dev/latitude-llm/pull/1099)

- **Jobs Refactoring**: Refactored jobs to remove meta programming, enabling server minification and potentially fixing memory leaks, contributing to overall system stability.

This changelog entry provides a comprehensive overview of the latest updates, ensuring users are informed of the new capabilities and improvements in the system.
