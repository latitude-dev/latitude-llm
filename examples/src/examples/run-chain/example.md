---
provider: Latitude
model: gpt-4o-mini
temperature: 0.7
---

<step>
  You're a helpful assistant. Think about user question and provide the best answer.
  This is the question:
  {{ question }}
</step>

<step>
  Now that you have the best answer, please provide a detailed explanation of how you arrived at this answer.
</step>
