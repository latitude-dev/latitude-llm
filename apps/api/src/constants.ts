import type { Implementation as McpInfo } from "@modelcontextprotocol/sdk/types"

export const API_VERSION = "v1"

export const API_INFO = {
  title: "Latitude API",
  version: API_VERSION,
  description:
    "Open-source AI agent monitoring platform. Full observability into what's failing in production. Discover underlying issues, get alerts when something breaks and verify your fix worked.",
}

export const MCP_INFO = {
  name: "Latitude MCP",
  title: "Latitude MCP",
  description:
    "Open-source AI agent monitoring platform. Full observability into what's failing in production. Discover underlying issues, get alerts when something breaks and verify your fix worked.",
  version: API_VERSION,
  websiteUrl: "https://latitude.so",
  icons: [
    { src: "https://framerusercontent.com/images/fPQsqC1Gx3CiQElnbBSmbQVYcA.png", theme: "light" },
    { src: "https://framerusercontent.com/images/l5c1DNVxQ3iAvTDihvg9pFw2l2k.png", theme: "dark" },
  ],
  instructions:
    "All Latitude MCP methods have descriptions and input/output schemas. For any doubt visit the Latitude documentation: https://docs.latitude.so/llms.txt",
} as McpInfo & {
  instructions: string
}
