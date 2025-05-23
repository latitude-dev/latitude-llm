---
provider: Latitude
model: gpt-4o-mini
tools:
  - get_weather:
      description: Gets the weather temperature from a given location.
      parameters:
        type: object
        additionalProperties: false
        required: ['location']
        properties:
          location:
            type: string
            description: Name of the location
---

What should I wear for the weather in {{ location }}?
