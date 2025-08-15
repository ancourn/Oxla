import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const users = await db.user.findMany({
      include: {
        subscriptions: true,
        searchHistory: true,
        chatMessages: true,
        _count: {
          select: {
            searchHistory: true,
            chatMessages: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const adminUsers = users.map(user => ({
      id: user.id,
      name: user.name || 'Unknown',
      email: user.email,
      role: user.role,
      subscriptionPlan: user.subscriptions[0]?.stripePriceId || 'Free',
      subscriptionStatus: user.subscriptions[0]?.status || 'none',
      createdAt: user.createdAt.toISOString(),
      lastActive: user.updatedAt.toISOString(),
      emailVerified: !!user.emailVerified,
      searches: user._count.searchHistory,
      messages: user._count.chatMessages,
      revenue: 0, // TODO: Calculate from payment history
      status: 'active' // TODO: Add user status field
    }))

    return NextResponse.json(adminUsers)
  } catch (error) {
    console.error('Failed to fetch admin users:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}