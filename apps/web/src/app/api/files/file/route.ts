import { NextRequest, NextResponse } from 'next/server'

import { errorHandler } from '$/middlewares/errorHandler'
import { downloadWithCache } from '@latitude-data/core/lib/downloadWithCache'

export const GET = errorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 },
    )
  }

  try {
    // Validate URL to prevent security issues
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: 'Only HTTP and HTTPS protocols are allowed' },
        { status: 400 },
      )
    }

    const result = await downloadWithCache(parsedUrl)

    // Create response with proper headers
    const response = new NextResponse(Buffer.from(result.data), {
      status: 200,
      headers: {
        'Content-Type': result.mediaType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })

    return response
  } catch (error) {
    console.error('Error downloading file:', error)

    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 },
    )
  }
})
