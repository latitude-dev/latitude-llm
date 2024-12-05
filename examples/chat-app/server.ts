import path from 'path'

import express from 'express'
import morgan from 'morgan'

import { __dirname, PORT } from './config'
import { handleChat, handleClearChat } from './handlers/openai'
import { handleVercelChat, handleVercelClearChat } from './handlers/vercel'

const app = express()

// Middleware
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'))
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// OpenAI routes
app.post('/chat', handleChat)
app.post('/clear-chat', handleClearChat)

// Vercel AI routes
app.get('/vercel', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vercel.html'))
})
app.post('/vercel/chat', handleVercelChat)
app.post('/vercel/clear-chat', handleVercelClearChat)

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`)
})
