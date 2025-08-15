import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authHeader.substring(7)
    const { resultId, isPositive } = await request.json()

    if (!resultId || typeof isPositive !== 'boolean') {
      return NextResponse.json({ error: 'Invalid feedback data' }, { status: 400 })
    }

    // Save feedback (you might want to create a separate model for this)
    // For now, we'll just log it and return success
    console.log(`Search feedback from user ${userId}: ${resultId} - ${isPositive ? 'positive' : 'negative'}`)

    // TODO: Implement proper feedback storage in database
    // You could create a SearchFeedback model:
    // await db.searchFeedback.create({
    //   data: {
    //     userId,
    //     resultId,
    //     isPositive,
    //     createdAt: new Date()
    //   }
    // })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save search feedback:', error)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}