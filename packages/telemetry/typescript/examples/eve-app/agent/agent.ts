import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

// Direct provider (no Vercel AI Gateway): reads OPENAI_API_KEY from the env.
export default defineAgent({
  model: openai("gpt-4o-mini"),
});
