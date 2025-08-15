import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authHeader.substring(7)
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '30d'

    // Calculate date range
    const now = new Date()
    let startDate: Date
    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    // Fetch search analytics
    const searchHistory = await db.searchHistory.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    })

    const totalSearches = await db.searchHistory.count()
    const searchesThisMonth = await db.searchHistory.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1)
        }
      }
    })

    const searchesThisWeek = await db.searchHistory.count({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })

    // Calculate top queries
    const queryCounts = new Map<string, number>()
    searchHistory.forEach(item => {
      const count = queryCounts.get(item.query) || 0
      queryCounts.set(item.query, count + 1)
    })

    const topQueries = Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Generate search trend data
    const searchTrend = []
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      
      const count = await db.searchHistory.count({
        where: {
          createdAt: {
            gte: dayStart,
            lt: dayEnd
          }
        }
      })
      
      searchTrend.unshift({
        date: dayStart.toISOString().split('T')[0],
        count
      })
    }

    // Fetch user analytics
    const totalUsers = await db.user.count()
    const newUsersThisMonth = await db.user.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1)
        }
      }
    })

    // Estimate active users (users with activity in the last 30 days)
    const activeUsers = await db.user.count({
      where: {
        OR: [
          {
            searchHistory: {
              some: {
                createdAt: {
                  gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                }
              }
            }
          },
          {
            chatMessages: {
              some: {
                timestamp: {
                  gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                }
              }
            }
          }
        ]
      }
    })

    // Get top active users
    const userActivity = await db.user.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            searchHistory: true,
            chatMessages: true
          }
        }
      },
      orderBy: [
        {
          searchHistory: {
            _count: 'desc'
          }
        },
        {
          chatMessages: {
            _count: 'desc'
          }
        }
      ],
      take: 10
    })

    const topActiveUsers = userActivity.map(user => ({
      name: user.name || 'Anonymous',
      searches: user._count.searchHistory,
      messages: user._count.chatMessages
    }))

    // Generate user growth trend
    const userGrowth = []
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      
      const count = await db.user.count({
        where: {
          createdAt: {
            gte: dayStart,
            lt: dayEnd
          }
        }
      })
      
      userGrowth.unshift({
        date: dayStart.toISOString().split('T')[0],
        count
      })
    }

    // Fetch chat analytics
    const totalMessages = await db.chatMessage.count()
    const messagesThisMonth = await db.chatMessage.count({
      where: {
        timestamp: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1)
        }
      }
    })

    // Get active rooms (unique roomIds with recent activity)
    const activeRoomsData = await db.chatMessage.groupBy({
      by: ['roomId'],
      where: {
        timestamp: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      _count: {
        roomId: true
      },
      orderBy: {
        _count: {
          roomId: 'desc'
        }
      },
      take: 10
    })

    const activeRooms = activeRoomsData.length

    // Get top rooms with user counts
    const topRooms = await Promise.all(
      activeRoomsData.map(async (room) => {
        const uniqueUsers = await db.chatMessage.findMany({
          where: {
            roomId: room.roomId,
            timestamp: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          select: {
            userId: true
          },
          distinct: ['userId']
        })

        return {
          name: room.roomId,
          messages: room._count.roomId,
          users: uniqueUsers.length
        }
      })
    )

    // Generate message trend
    const messageTrend = []
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      
      const count = await db.chatMessage.count({
        where: {
          timestamp: {
            gte: dayStart,
            lt: dayEnd
          }
        }
      })
      
      messageTrend.unshift({
        date: dayStart.toISOString().split('T')[0],
        count
      })
    }

    // Fetch subscription analytics
    const subscriptions = await db.subscription.findMany()
    const totalSubscribers = subscriptions.length
    const activeSubscribers = subscriptions.filter(s => s.status === 'active').length
    const newSubscriptionsThisMonth = subscriptions.filter(s => 
      s.createdAt >= new Date(now.getFullYear(), now.getMonth(), 1)
    ).length

    // Calculate churn rate (simplified)
    const canceledSubscriptions = subscriptions.filter(s => s.status === 'canceled').length
    const churnRate = totalSubscribers > 0 ? canceledSubscriptions / totalSubscribers : 0

    // Calculate revenue (mock data for now)
    const planPrices = {
      starter: 19,
      professional: 49,
      enterprise: 199
    }

    const revenue = subscriptions.reduce((total, sub) => {
      if (sub.status === 'active') {
        const plan = sub.stripePriceId?.toLowerCase().includes('starter') ? 'starter' :
                   sub.stripePriceId?.toLowerCase().includes('professional') ? 'professional' :
                   sub.stripePriceId?.toLowerCase().includes('enterprise') ? 'enterprise' : 'starter'
        return total + (planPrices[plan as keyof typeof planPrices] || 19)
      }
      return total
    }, 0)

    const mrr = revenue // Monthly Recurring Revenue

    // Calculate plan distribution
    const planCounts = subscriptions.reduce((acc, sub) => {
      const plan = sub.stripePriceId?.toLowerCase().includes('starter') ? 'starter' :
                 sub.stripePriceId?.toLowerCase().includes('professional') ? 'professional' :
                 sub.stripePriceId?.toLowerCase().includes('enterprise') ? 'enterprise' : 'starter'
      acc[plan] = (acc[plan] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const planDistribution = Object.entries(planCounts).map(([plan, count]) => ({
      plan: plan.charAt(0).toUpperCase() + plan.slice(1),
      count,
      percentage: totalSubscribers > 0 ? count / totalSubscribers : 0
    }))

    // System metrics (mock data)
    const systemMetrics = {
      uptime: 0.999, // 99.9% uptime
      responseTime: 150, // 150ms average response time
      errorRate: 0.002, // 0.2% error rate
      activeConnections: 42 // Mock active connections
    }

    const analyticsData = {
      searchActivity: {
        totalSearches,
        searchesThisMonth,
        searchesThisWeek,
        averageSearchesPerDay: Math.round(searchesThisMonth / 30),
        topQueries,
        searchTrend
      },
      userActivity: {
        totalUsers,
        activeUsers,
        newUsersThisMonth,
        userGrowth,
        topActiveUsers
      },
      chatActivity: {
        totalMessages,
        messagesThisMonth,
        activeRooms,
        messageTrend,
        topRooms
      },
      subscriptionMetrics: {
        totalSubscribers,
        activeSubscribers,
        newSubscriptionsThisMonth,
        churnRate,
        revenue,
        mrr,
        planDistribution
      },
      systemMetrics
    }

    return NextResponse.json(analyticsData)
  } catch (error) {
    console.error('Failed to fetch analytics data:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 })
  }
}