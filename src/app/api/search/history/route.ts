import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/search/history - Get user's search history
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authHeader.substring(7)

    const history = await db.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return NextResponse.json(history)
  } catch (error) {
    console.error('Failed to fetch search history:', error)
    return NextResponse.json({ error: 'Failed to fetch search history' }, { status: 500 })
  }
}

// POST /api/search/history - Save search to history
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authHeader.substring(7)
    const { query, results } = await request.json()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Save search history
    const searchHistory = await db.searchHistory.create({
      data: {
        userId,
        query,
        results: JSON.stringify(results || [])
      }
    })

    return NextResponse.json(searchHistory)
  } catch (error) {
    console.error('Failed to save search history:', error)
    return NextResponse.json({ error: 'Failed to save search history' }, { status: 500 })
  }
}

// DELETE /api/search/history - Clear user's search history
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authHeader.substring(7)

    // Delete all search history for this user
    await db.searchHistory.deleteMany({
      where: { userId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear search history:', error)
    return NextResponse.json({ error: 'Failed to clear search history' }, { status: 500 })
  }
}