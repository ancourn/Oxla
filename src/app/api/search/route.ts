import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Initialize ZAI SDK
    const zai = await ZAI.create()

    // Perform web search
    const searchResult = await zai.functions.invoke("web_search", {
      query: query,
      num: 10
    })

    return NextResponse.json({ 
      results: searchResult,
      query: query 
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to perform search' }, { status: 500 })
  }
}