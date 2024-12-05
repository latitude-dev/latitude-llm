# Simple Chat Application with GPT-4

This is a simple web application that allows users to chat with OpenAI's GPT-4 model through a clean and intuitive interface.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory and add your configuration:

```
# Required
OPENAI_API_KEY=your_api_key_here

# Optional (defaults to 3000)
PORT=3000
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:3000 (or your configured PORT)

## Features

- Clean and responsive chat interface
- Real-time communication with GPT-4
- Simple error handling
- Support for Enter key to send messages
- Configurable server port

## Technologies Used

- Express.js
- TypeScript
- OpenAI API
- HTML/CSS
- Fetch API for frontend communication
