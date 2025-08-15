import { db } from '@/lib/db'

// Clean up expired password reset tokens
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

// Clean up expired sessions
export async function cleanupExpiredSessions() {
  try {
    const result = await db.session.deleteMany({
      where: {
        expires: {
          lt: new Date()
        }
      }
    })

    console.log(`Cleaned up ${result.count} expired sessions`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error)
    throw error
  }
}

// Clean up expired verification tokens
export async function cleanupExpiredVerificationTokens() {
  try {
    const result = await db.verificationToken.deleteMany({
      where: {
        expires: {
          lt: new Date()
        }
      }
    })

    console.log(`Cleaned up ${result.count} expired verification tokens`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up expired verification tokens:', error)
    throw error
  }
}

// Run all cleanup jobs
export async function runAllCleanupJobs() {
  try {
    const [expiredTokens, expiredSessions, expiredVerificationTokens] = await Promise.all([
      cleanupExpiredTokens(),
      cleanupExpiredSessions(),
      cleanupExpiredVerificationTokens()
    ])

    console.log(`Cleanup completed: ${expiredTokens} tokens, ${expiredSessions} sessions, ${expiredVerificationTokens} verification tokens`)
    return {
      expiredTokens,
      expiredSessions,
      expiredVerificationTokens
    }
  } catch (error) {
    console.error('Error running cleanup jobs:', error)
    throw error
  }
}