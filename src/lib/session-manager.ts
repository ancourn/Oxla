import { logger } from './logger'
import { securityConfig } from './security'

export interface SessionData {
  userId: string
  email: string
  role: string
  subscription?: {
    status: string
    plan: string
  }
  createdAt: number
  lastAccessed: number
  expiresAt: number
  ipAddress: string
  userAgent: string
}

class SessionManager {
  private static instance: SessionManager
  private sessions: Map<string, SessionData> = new Map()
  private readonly cleanupInterval = 5 * 60 * 1000 // 5 minutes

  private constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanupExpiredSessions(), this.cleanupInterval)
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  public createSession(
    userId: string,
    email: string,
    role: string,
    ipAddress: string,
    userAgent: string,
    subscription?: SessionData['subscription']
  ): string {
    const sessionId = this.generateSessionId()
    const now = Date.now()
    
    const sessionData: SessionData = {
      userId,
      email,
      role,
      subscription,
      createdAt: now,
      lastAccessed: now,
      expiresAt: now + securityConfig.session.maxAge,
      ipAddress,
      userAgent,
    }

    this.sessions.set(sessionId, sessionData)
    
    logger.info('Session created', { 
      sessionId, 
      userId, 
      email, 
      ipAddress,
      userAgent: userAgent.substring(0, 100) // Truncate for logging
    })

    return sessionId
  }

  public getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      return null
    }

    // Check if session is expired
    if (Date.now() > session.expiresAt) {
      this.destroySession(sessionId)
      return null
    }

    // Update last accessed time (with rolling sessions)
    if (securityConfig.session.rolling) {
      session.lastAccessed = Date.now()
      this.sessions.set(sessionId, session)
    }

    return session
  }

  public updateSession(sessionId: string, updates: Partial<SessionData>): boolean {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      return false
    }

    const updatedSession = { ...session, ...updates }
    this.sessions.set(sessionId, updatedSession)
    
    logger.debug('Session updated', { sessionId, updates })
    
    return true
  }

  public destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      return false
    }

    this.sessions.delete(sessionId)
    
    logger.info('Session destroyed', { sessionId, userId: session.userId })
    
    return true
  }

  public destroyUserSessions(userId: string): number {
    let count = 0
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId)
        count++
      }
    }
    
    if (count > 0) {
      logger.info('All user sessions destroyed', { userId, count })
    }
    
    return count
  }

  public cleanupExpiredSessions(): number {
    const now = Date.now()
    let count = 0
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId)
        count++
      }
    }
    
    if (count > 0) {
      logger.debug('Expired sessions cleaned up', { count })
    }
    
    return count
  }

  public getActiveSessions(): SessionData[] {
    const now = Date.now()
    return Array.from(this.sessions.values()).filter(session => now <= session.expiresAt)
  }

  public getUserSessions(userId: string): SessionData[] {
    const now = Date.now()
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId && now <= session.expiresAt)
  }

  public getSessionCount(): number {
    return this.sessions.size
  }

  public getActiveSessionCount(): number {
    const now = Date.now()
    return Array.from(this.sessions.values()).filter(session => now <= session.expiresAt).length
  }

  public validateSession(sessionId: string, ipAddress: string, userAgent: string): {
    isValid: boolean
    session?: SessionData
    error?: string
  } {
    const session = this.getSession(sessionId)
    
    if (!session) {
      return { isValid: false, error: 'Session not found or expired' }
    }

    // Validate IP address (optional, for high-security applications)
    if (session.ipAddress !== ipAddress) {
      logger.warn('Session IP address mismatch', {
        sessionId,
        expectedIp: session.ipAddress,
        actualIp: ipAddress
      })
      
      // You might want to destroy the session here for security
      // this.destroySession(sessionId)
      // return { isValid: false, error: 'IP address mismatch' }
    }

    // Validate user agent (optional, for high-security applications)
    if (session.userAgent !== userAgent) {
      logger.warn('Session user agent mismatch', {
        sessionId,
        expectedUserAgent: session.userAgent.substring(0, 100),
        actualUserAgent: userAgent.substring(0, 100)
      })
      
      // You might want to destroy the session here for security
      // this.destroySession(sessionId)
      // return { isValid: false, error: 'User agent mismatch' }
    }

    // Check if session is about to expire (within 5 minutes)
    const timeUntilExpiry = session.expiresAt - Date.now()
    if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
      logger.info('Session about to expire', {
        sessionId,
        userId: session.userId,
        timeUntilExpiry
      })
    }

    return { isValid: true, session }
  }

  public refreshSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      return false
    }

    session.expiresAt = Date.now() + securityConfig.session.maxAge
    session.lastAccessed = Date.now()
    this.sessions.set(sessionId, session)
    
    logger.debug('Session refreshed', { sessionId })
    
    return true
  }

  private generateSessionId(): string {
    // Generate a cryptographically secure random session ID
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  public exportSessions(): string {
    const sessions = Array.from(this.sessions.entries()).map(([id, data]) => ({
      id,
      ...data
    }))
    
    return JSON.stringify(sessions, null, 2)
  }

  public importSessions(sessionsJson: string): void {
    try {
      const sessions = JSON.parse(sessionsJson)
      
      sessions.forEach((session: any) => {
        if (session.id && session.userId) {
          this.sessions.set(session.id, {
            userId: session.userId,
            email: session.email,
            role: session.role,
            subscription: session.subscription,
            createdAt: session.createdAt,
            lastAccessed: session.lastAccessed,
            expiresAt: session.expiresAt,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          })
        }
      })
      
      logger.info('Sessions imported', { count: sessions.length })
    } catch (error) {
      logger.error('Failed to import sessions', { error })
    }
  }
}

// Export singleton instance
export const sessionManager = SessionManager.getInstance()

// Export convenience functions
export const createSession = (
  userId: string,
  email: string,
  role: string,
  ipAddress: string,
  userAgent: string,
  subscription?: SessionData['subscription']
) => sessionManager.createSession(userId, email, role, ipAddress, userAgent, subscription)

export const getSession = (sessionId: string) => sessionManager.getSession(sessionId)

export const destroySession = (sessionId: string) => sessionManager.destroySession(sessionId)

export const validateSession = (sessionId: string, ipAddress: string, userAgent: string) =>
  sessionManager.validateSession(sessionId, ipAddress, userAgent)

export const refreshSession = (sessionId: string) => sessionManager.refreshSession(sessionId)