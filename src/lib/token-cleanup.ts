import { db } from '@/lib/db'

export async function cleanupExpiredTokens() {
  try {
    const result = await db.user.updateMany({
      where: {
        resetTokenExpiry: {
          lt: new Date()
        },
        resetToken: {
          not: null
        }
      },
      data: {
        resetToken: null,
        resetTokenExpiry: null
      }
    })

    console.log(`Cleaned up ${result.count} expired password reset tokens`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error)
    throw error
  }
}

// Run cleanup every hour
export async function startTokenCleanup() {
  // Run immediately on startup
  await cleanupExpiredTokens()
  
  // Then run every hour
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000)
  
  console.log('Token cleanup job started')
}