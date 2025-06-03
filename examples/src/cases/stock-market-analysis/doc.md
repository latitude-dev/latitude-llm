---
title: Stock Market Analysis Agent
description: Build a multi-agent system for live financial insights combining web search, technical indicators, and actionable recommendations.
---

<Card
title="Live example"
href="https://app.latitude.so/share/d/555513fc-4999-4abd-9a4e-43cdf238ff8c"
arrow="true"
cta="Copy to your Latitude">
Try out this agent setup in the Latitude Playground.
</Card>

## Overview

This example demonstrates how to build an **intelligent market analysis agent** using Latitude’s multi-agent architecture. The agent can analyze requested stocks or sectors, gather current prices and breaking news, compute technical indicators, and provide actionable, well-structured investment insights. The system orchestrates research and analysis across specialized subagents for maximum efficiency and depth.

## Multi-Agent Architecture

The architecture is divided into purpose-driven subagents, each responsible for a core part of the workflow:

- **main**: Coordinates the entire process and synthesizes final recommendations
- **market_researcher**: Gathers live news, sentiment, and trends via web search
- **price_analyzer**: Fetches live prices, historical data, and computes technical indicators with code execution

## The Prompts

Here you can see the three prompts—`main`, `market_researcher`, and `price_analyzer`—that make up the agent system. Each prompt is designed to handle a specific part of the analysis workflow.
[PROMPTS]

## Parameters Explained

<Card title="Latitude Playground parameters" img="/assets/cases/stock-market-parameters.png">
  In the main prompt, we set these three parameters to control the analysis. Here you
can see an example for Tesla Stock Analysis. Below is an explanation of each parameter.
</Card>

<Expandable title="stock_symbols">
    This parameter accepts a list of stock ticker symbols to analyze. Examples:

    - `AAPL, MSFT, GOOGL` for individual stocks
    - `SPY, QQQ, IWM` for ETFs
    - `TSLA, NVDA, AMD` for sector-specific analysis

</Expandable>

<Expandable title="market_focus">
    This parameter defines the analytical perspective or theme for the analysis. Examples:

    - `earnings season impact`
    - `pre-market analysis`
    - `sector rotation trends`
    - `daily wrap-up`
    - `volatility assessment`

    This guides both the market researcher and price analyzer agents on which aspects to emphasize in their analysis.

</Expandable>

<Expandable title="analysis_depth">
    This parameter controls the comprehensiveness of the analysis. Options include:

    - `summary` - Quick overview with key points
    - `comprehensive` - Detailed analysis with full technical indicators
    - `deep-dive` - Extensive research with multiple data sources
    - `real-time` - Focus on immediate market conditions

</Expandable>

## Breakdown

Let’s break down the case step-by-step to highlight each agent’s contribution.

### 1. Requirements Analysis

The **main agent** begins by clarifying the user’s goals—what stocks/sectors to analyze, market focus, and depth of analysis. This ensures downstream agents are properly scoped and that their findings are relevant.

### 2. Market Research

The **market_researcher** agent leverages real-time web search to find:

- Breaking news and analyst reports from trusted sources (Bloomberg, Reuters, MarketWatch, Yahoo Finance)
- Economic indicators and investor sentiment
- Regulatory changes or company events
- Sector and macro trends

It uses content extraction and trend identification tools to deliver structured, concise findings on factors affecting the requested stocks.

### 3. Price & Technical Analysis

The **price_analyzer** agent:

- Retrieves current and historical stock price data from Yahoo Finance
- Analyzes price movements, volatility, and volume
- Calculates technical indicators such as:
  - Simple/Exponential Moving Averages (SMA, EMA)
  - Relative Strength Index (RSI)
  - MACD
  - Bollinger Bands
- Identifies trading signals and price-based insights through code execution

### 4. Synthesis & Recommendation

The **main agent** compiles all findings into a unified report, identifying:

- Key market trends
- Individual stock summaries
- Sentiment and notable news
- Actionable investment recommendations

The output is structured using a [JSON schema](/guides/prompt-manager/json-output) for consistency and ease of integration.

---

## Why This Multi-Agent Approach Works

Splitting responsibilities keeps each agent focused and efficient:

- **market_researcher**: Excels at broad, qualitative intelligence gathering using web tools
- **price_analyzer**: Specializes in quantitative and computational tasks with live data
- **main**: Maintains context, makes decisions, and produces high-level summaries

**Benefits:**

- No single agent is overloaded
- Context windows stay small for better LLM performance
- The system is modular and maintainable
- Easily swap or upgrade subagents/providers as requirements evolve

## Strategic Benefits

This multi-agent, multi-provider setup is optimized for:

- **Performance**: Each agent uses the most suitable model for its task
- **Cost Efficiency**: Main tasks run on higher-end models, while research and analysis run on faster, lower-cost models
- **Reliability**: Modular—swap out underperforming agents/providers as needed
- **Scalability**: Add new specialized agents (e.g., risk assessor, macro strategist) with minimal friction

<Warning>
Model and provider capabilities evolve. Routinely review provider performance, costs, and integration to ensure continued fit.
</Warning>

<Info>
Latitude makes it easy to switch providers or models at any stage. Just update the provider configuration in your prompt manager—no need to rearchitect your agent logic.
For custom providers or advanced tuning, see the [provider documentation](/guides/getting-started/providers).
</Info>

---

## Resources

- [Latitude Tools](/guides/prompt-manager/latitude-tools)
- [JSON Schema Output](/guides/prompt-manager/json-output)
- [Provider Configuration](/guides/getting-started/providers)
- [Prompt Triggers](/guides/prompt-manager/triggers)
- [MCP Integration](/guides/integration/mcp-integrations)
