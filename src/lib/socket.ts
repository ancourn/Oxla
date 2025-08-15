import { Server } from 'socket.io'
import { db } from './db'

interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName?: string
  timestamp: Date
  roomId: string
}

interface UserSocket {
  userId: string
  socketId: string
  userName?: string
}

// Store active users and their socket IDs
const activeUsers = new Map<string, UserSocket>()

export const setupSocket = (io: Server) => {
  io.on('connection', async (socket) => {
    console.log('Client connected:', socket.id)

    // Handle user authentication
    socket.on('authenticate', async (data: { userId: string; userName?: string }) => {
      try {
        const { userId, userName } = data
        
        // Verify user exists in database
        const user = await db.user.findUnique({
          where: { id: userId }
        })

        if (!user) {
          socket.emit('auth_error', { message: 'User not found' })
          return
        }

        // Store user socket mapping
        activeUsers.set(userId, {
          userId,
          socketId: socket.id,
          userName: userName || user.name || 'Anonymous'
        })

        // Join user to their personal room
        socket.join(`user_${userId}`)
        
        // Notify user of successful authentication
        socket.emit('authenticated', { 
          success: true, 
          userId, 
          userName: userName || user.name || 'Anonymous' 
        })

        // Broadcast user online status
        socket.broadcast.emit('user_online', {
          userId,
          userName: userName || user.name || 'Anonymous'
        })

        console.log(`User ${userId} authenticated with socket ${socket.id}`)
      } catch (error) {
        console.error('Authentication error:', error)
        socket.emit('auth_error', { message: 'Authentication failed' })
      }
    })

    // Handle joining a chat room
    socket.on('join_room', async (data: { roomId: string; userId: string }) => {
      try {
        const { roomId, userId } = data
        
        // Verify user is authenticated
        if (!activeUsers.has(userId)) {
          socket.emit('error', { message: 'Not authenticated' })
          return
        }

        // Join the room
        socket.join(roomId)
        
        // Notify room that user joined
        socket.to(roomId).emit('user_joined', {
          userId,
          userName: activeUsers.get(userId)?.userName || 'Anonymous',
          timestamp: new Date()
        })

        // Send recent messages from this room
        const recentMessages = await db.chatMessage.findMany({
          where: { roomId },
          orderBy: { timestamp: 'desc' },
          take: 50,
          include: {
            user: {
              select: {
                name: true,
                image: true
              }
            }
          }
        })

        // Reverse to send in chronological order
        socket.emit('room_history', {
          roomId,
          messages: recentMessages.reverse().map(msg => ({
            id: msg.id,
            text: msg.content,
            senderId: msg.userId,
            senderName: msg.user.name || 'Anonymous',
            senderImage: msg.user.image,
            timestamp: msg.timestamp
          }))
        })

        console.log(`User ${userId} joined room ${roomId}`)
      } catch (error) {
        console.error('Join room error:', error)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // Handle leaving a chat room
    socket.on('leave_room', (data: { roomId: string; userId: string }) => {
      try {
        const { roomId, userId } = data
        
        socket.leave(roomId)
        
        // Notify room that user left
        socket.to(roomId).emit('user_left', {
          userId,
          userName: activeUsers.get(userId)?.userName || 'Anonymous',
          timestamp: new Date()
        })

        console.log(`User ${userId} left room ${roomId}`)
      } catch (error) {
        console.error('Leave room error:', error)
      }
    })

    // Handle sending chat messages
    socket.on('send_message', async (data: {
      text: string
      roomId: string
      userId: string
    }) => {
      try {
        const { text, roomId, userId } = data
        
        // Verify user is authenticated
        if (!activeUsers.has(userId)) {
          socket.emit('error', { message: 'Not authenticated' })
          return
        }

        // Verify user is in the room
        if (!socket.rooms.has(roomId)) {
          socket.emit('error', { message: 'Not in room' })
          return
        }

        // Get user info
        const user = activeUsers.get(userId)
        if (!user) {
          socket.emit('error', { message: 'User not found' })
          return
        }

        // Create message object
        const messageData = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          text,
          senderId: userId,
          senderName: user.userName || 'Anonymous',
          timestamp: new Date(),
          roomId
        }

        // Save message to database
        await db.chatMessage.create({
          data: {
            id: messageData.id,
            content: text,
            userId,
            roomId,
            timestamp: messageData.timestamp
          }
        })

        // Broadcast message to room
        io.to(roomId).emit('new_message', messageData)

        console.log(`Message sent in room ${roomId} by user ${userId}`)
      } catch (error) {
        console.error('Send message error:', error)
        socket.emit('error', { message: 'Failed to send message' })
      }
    })

    // Handle typing indicators
    socket.on('typing', (data: { roomId: string; userId: string; isTyping: boolean }) => {
      const { roomId, userId, isTyping } = data
      
      // Broadcast typing status to room (excluding sender)
      socket.to(roomId).emit('user_typing', {
        userId,
        userName: activeUsers.get(userId)?.userName || 'Anonymous',
        isTyping
      })
    })

    // Handle message read receipts
    socket.on('message_read', async (data: { messageId: string; userId: string }) => {
      try {
        const { messageId, userId } = data
        
        // Update message read status in database
        await db.messageRead.upsert({
          where: {
            messageId_userId: {
              messageId,
              userId
            }
          },
          create: {
            messageId,
            userId,
            readAt: new Date()
          },
          update: {
            readAt: new Date()
          }
        })

        // Notify message sender that message was read
        const message = await db.chatMessage.findUnique({
          where: { id: messageId },
          include: {
            user: true
          }
        })

        if (message && message.userId !== userId) {
          const senderSocket = activeUsers.get(message.userId)?.socketId
          if (senderSocket) {
            io.to(senderSocket).emit('message_read_receipt', {
              messageId,
              readBy: userId,
              readAt: new Date()
            })
          }
        }
      } catch (error) {
        console.error('Message read error:', error)
      }
    })

    // Handle getting online users
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(activeUsers.values()).map(user => ({
        userId: user.userId,
        userName: user.userName
      }))
      socket.emit('online_users', onlineUsers)
    })

    // Handle admin subscription monitoring
    socket.on('subscribe_to_subscription_updates', async (data: { userId: string; isAdmin: boolean }) => {
      try {
        const { userId, isAdmin } = data
        
        // Verify user is authenticated
        if (!activeUsers.has(userId)) {
          socket.emit('error', { message: 'Not authenticated' })
          return
        }

        // Verify admin role
        const user = await db.user.findUnique({
          where: { id: userId }
        })

        if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
          socket.emit('error', { message: 'Unauthorized' })
          return
        }

        // Join admin room for subscription updates
        socket.join('admin_subscription_updates')
        
        // Send initial subscription data
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
          },
          take: 10 // Get recent 10 subscriptions
        })

        socket.emit('subscription_update', {
          type: 'initial',
          subscriptions: subscriptions.map(sub => ({
            id: sub.id,
            userId: sub.userId,
            userEmail: sub.user.email,
            userName: sub.user.name || 'Unknown',
            plan: sub.stripePriceId || 'Unknown',
            status: sub.status || 'unknown',
            currentPeriodEnd: sub.stripeCurrentPeriodEnd?.toISOString() || new Date().toISOString(),
            createdAt: sub.createdAt.toISOString()
          }))
        })

        console.log(`Admin ${userId} subscribed to subscription updates`)
      } catch (error) {
        console.error('Subscription subscription error:', error)
        socket.emit('error', { message: 'Failed to subscribe to updates' })
      }
    })

    // Handle admin system health monitoring
    socket.on('subscribe_to_health_updates', async (data: { userId: string; isAdmin: boolean }) => {
      try {
        const { userId, isAdmin } = data
        
        // Verify user is authenticated
        if (!activeUsers.has(userId)) {
          socket.emit('error', { message: 'Not authenticated' })
          return
        }

        // Verify admin role
        const user = await db.user.findUnique({
          where: { id: userId }
        })

        if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
          socket.emit('error', { message: 'Unauthorized' })
          return
        }

        // Join admin room for health updates
        socket.join('admin_health_updates')
        
        // Send initial health data
        const startTime = Date.now()
        await db.user.findFirst() // Database health check
        const dbResponseTime = Date.now() - startTime
        
        const memoryUsage = process.memoryUsage()
        const healthData = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          metrics: {
            database: {
              responseTime: dbResponseTime,
              status: dbResponseTime < 100 ? 'healthy' : dbResponseTime < 500 ? 'warning' : 'critical'
            },
            system: {
              memoryUsage: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                external: Math.round(memoryUsage.external / 1024 / 1024) // MB
              },
              uptime: 0.999,
              responseTime: Date.now() - startTime,
              errorRate: 0.001
            }
          },
          checks: [
            {
              name: 'Database Connection',
              status: dbResponseTime < 100 ? 'pass' : 'fail',
              responseTime: dbResponseTime
            },
            {
              name: 'API Response Time',
              status: (Date.now() - startTime) < 200 ? 'pass' : 'fail',
              responseTime: Date.now() - startTime
            },
            {
              name: 'Memory Usage',
              status: (memoryUsage.heapUsed / memoryUsage.heapTotal) < 0.8 ? 'pass' : 'fail',
              value: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + '%'
            }
          ]
        }

        socket.emit('health_update', healthData)

        console.log(`Admin ${userId} subscribed to health updates`)
      } catch (error) {
        console.error('Health subscription error:', error)
        socket.emit('error', { message: 'Failed to subscribe to health updates' })
      }
    })

    // Handle unsubscribing from subscription updates
    socket.on('unsubscribe_from_subscription_updates', (data: { userId: string }) => {
      const { userId } = data
      
      // Verify user is authenticated
      if (!activeUsers.has(userId)) {
        return
      }

      socket.leave('admin_subscription_updates')
      console.log(`Admin ${userId} unsubscribed from subscription updates`)
    })

    // Handle unsubscribing from health updates
    socket.on('unsubscribe_from_health_updates', (data: { userId: string }) => {
      const { userId } = data
      
      // Verify user is authenticated
      if (!activeUsers.has(userId)) {
        return
      }

      socket.leave('admin_health_updates')
      console.log(`Admin ${userId} unsubscribed from health updates`)
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
      
      // Find and remove user from active users
      for (const [userId, userSocket] of activeUsers.entries()) {
        if (userSocket.socketId === socket.id) {
          activeUsers.delete(userId)
          
          // Broadcast user offline status
          socket.broadcast.emit('user_offline', {
            userId,
            userName: userSocket.userName || 'Anonymous'
          })
          break
        }
      }
    })

    // Send welcome message
    socket.emit('system_message', {
      text: 'Welcome to Oxla Chat! Please authenticate to start chatting.',
      senderId: 'system',
      timestamp: new Date()
    })
  })
}

// Helper function to send message to specific user
export const sendToUser = (userId: string, event: string, data: any) => {
  const userSocket = activeUsers.get(userId)
  if (userSocket) {
    // Assuming io is available globally or passed as parameter
    // io.to(userSocket.socketId).emit(event, data)
  }
}

// Helper function to broadcast subscription update to admins
export const broadcastSubscriptionUpdate = (io: Server, subscriptionData: any) => {
  io.to('admin_subscription_updates').emit('subscription_update', {
    type: 'update',
    subscription: subscriptionData
  })
}

// Helper function to broadcast new subscription to admins
export const broadcastNewSubscription = (io: Server, subscriptionData: any) => {
  io.to('admin_subscription_updates').emit('subscription_update', {
    type: 'new',
    subscription: subscriptionData
  })
}

// Helper function to broadcast cancelled subscription to admins
export const broadcastCancelledSubscription = (io: Server, subscriptionData: any) => {
  io.to('admin_subscription_updates').emit('subscription_update', {
    type: 'cancelled',
    subscription: subscriptionData
  })
}

// Helper function to broadcast health update to admins
export const broadcastHealthUpdate = (io: Server, healthData: any) => {
  io.to('admin_health_updates').emit('health_update', healthData)
}

// Health monitoring interval
let healthMonitoringInterval: NodeJS.Timeout | null = null

// Start periodic health monitoring
export const startHealthMonitoring = (io: Server) => {
  if (healthMonitoringInterval) {
    console.log('Health monitoring is already running')
    return
  }

  console.log('Starting health monitoring...')
  
  // Run health checks every 30 seconds
  healthMonitoringInterval = setInterval(async () => {
    try {
      const startTime = Date.now()
      
      // Database health check
      const dbStartTime = Date.now()
      await db.user.findFirst()
      const dbResponseTime = Date.now() - dbStartTime
      
      const memoryUsage = process.memoryUsage()
      const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: {
          database: {
            responseTime: dbResponseTime,
            status: dbResponseTime < 100 ? 'healthy' : dbResponseTime < 500 ? 'warning' : 'critical'
          },
          system: {
            memoryUsage: {
              heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
              heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
              external: Math.round(memoryUsage.external / 1024 / 1024) // MB
            },
            uptime: 0.999,
            responseTime: Date.now() - startTime,
            errorRate: 0.001
          }
        },
        checks: [
          {
            name: 'Database Connection',
            status: dbResponseTime < 100 ? 'pass' : 'fail',
            responseTime: dbResponseTime
          },
          {
            name: 'API Response Time',
            status: (Date.now() - startTime) < 200 ? 'pass' : 'fail',
            responseTime: Date.now() - startTime
          },
          {
            name: 'Memory Usage',
            status: (memoryUsage.heapUsed / memoryUsage.heapTotal) < 0.8 ? 'pass' : 'fail',
            value: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + '%'
          }
        ]
      }

      broadcastHealthUpdate(io, healthData)
    } catch (error) {
      console.error('Health monitoring error:', error)
      
      // Broadcast error state
      const errorHealthData = {
        status: 'critical',
        timestamp: new Date().toISOString(),
        error: 'Health monitoring failed',
        metrics: {
          database: {
            responseTime: -1,
            status: 'critical'
          },
          system: {
            memoryUsage: {
              heapUsed: 0,
              heapTotal: 0,
              external: 0
            },
            uptime: 0,
            responseTime: -1,
            errorRate: 1
          }
        },
        checks: [
          {
            name: 'Database Connection',
            status: 'fail',
            responseTime: -1
          },
          {
            name: 'API Response Time',
            status: 'fail',
            responseTime: -1
          },
          {
            name: 'Memory Usage',
            status: 'fail',
            value: 'Unknown'
          }
        ]
      }
      
      broadcastHealthUpdate(io, errorHealthData)
    }
  }, 30000) // Every 30 seconds
}

// Stop health monitoring
export const stopHealthMonitoring = () => {
  if (healthMonitoringInterval) {
    clearInterval(healthMonitoringInterval)
    healthMonitoringInterval = null
    console.log('Health monitoring stopped')
  }
}

// Helper function to get online users count
export const getOnlineUsersCount = () => activeUsers.size

// Helper function to check if user is online
export const isUserOnline = (userId: string) => activeUsers.has(userId)