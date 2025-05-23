---
provider: Latitude
model: gpt-4o-mini
temperature: 0.7
tools:
  - get_answer:
      description: Ask this tool for the answer when user do a question.
      parameters:
        type: object
        additionalProperties: false
        required: ['question']
        properties:
          question:
            type: string
            description: Question to ask
---

Give user's question {{ question }} a concise answer.
