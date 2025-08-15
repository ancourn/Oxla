import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const subscriptions = await db.subscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const adminSubscriptions = subscriptions.map(sub => ({
      id: sub.id,
      userId: sub.userId,
      userEmail: sub.user.email,
      userName: sub.user.name || 'Unknown',
      plan: sub.stripePriceId || 'Unknown',
      status: sub.status || 'unknown',
      currentPeriodEnd: sub.stripeCurrentPeriodEnd?.toISOString() || new Date().toISOString(),
      amount: 0, // TODO: Get from Stripe price data
      createdAt: sub.createdAt.toISOString(),
      cancelledAt: sub.status === 'cancelled' ? sub.updatedAt.toISOString() : undefined
    }))

    return NextResponse.json(adminSubscriptions)
  } catch (error) {
    console.error('Failed to fetch admin subscriptions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}