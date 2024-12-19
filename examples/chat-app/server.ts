import './instrumentation'

import path from 'path'

import express from 'express'
import morgan from 'morgan'

import { __dirname, PORT } from './config'
import { handleChat } from './handlers/openai'
import { handleVercelChat } from './handlers/vercel'
import { handleAnthropicChat } from './handlers/anthropic'

const app = express()

// Middleware
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'))
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// OpenAI routes
app.post('/chat', handleChat)

// Vercel AI routes
app.get('/vercel', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vercel.html'))
})
app.post('/vercel/chat', handleVercelChat)

// Anthropic routes
app.post('/anthropic/chat', handleAnthropicChat)

app.get('/anthropic', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'anthropic.html'))
})

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`)
})
