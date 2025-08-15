import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

// Security configuration
export const securityConfig = {
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    standardHeaders: true,
    legacyHeaders: false,
  },

  // CORS
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://oxlas.com', 'https://www.oxlas.com'] 
      : ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  },

  // Security headers
  headers: {
    'X-DNS-Prefetch-Control': 'on',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-XSS-Protection': '1; mode=block',
  },

  // Session security
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    rolling: true,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },

  // IP whitelist for admin routes
  adminIPWhitelist: process.env.ADMIN_IP_WHITELIST?.split(',') || [],
}

// In-memory rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export function isRateLimited(ip: string, endpoint: string): boolean {
  const key = `${ip}:${endpoint}`
  const now = Date.now()
  const record = rateLimitStore.get(key)
  
  if (!record) {
    rateLimitStore.set(key, { 
      count: 1, 
      resetTime: now + securityConfig.rateLimit.windowMs 
    })
    return false
  }
  
  if (now > record.resetTime) {
    rateLimitStore.set(key, { 
      count: 1, 
      resetTime: now + securityConfig.rateLimit.windowMs 
    })
    return false
  }
  
  if (record.count >= securityConfig.rateLimit.max) {
    logger.warn('Rate limit exceeded', { ip, endpoint, count: record.count })
    return true
  }
  
  record.count++
  return false
}

export function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityConfig.headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}

export function validateCORS(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  
  if (!origin) return true
  
  return securityConfig.cors.origin.includes(origin)
}

export function isAdminIPAllowed(ip: string): boolean {
  if (securityConfig.adminIPWhitelist.length === 0) return true
  return securityConfig.adminIPWhitelist.includes(ip)
}

export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export function createSecurityMiddleware() {
  return async (request: NextRequest, response: NextResponse) => {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    const url = new URL(request.url)
    const endpoint = `${request.method}:${url.pathname}`
    
    // Apply CORS validation
    if (!validateCORS(request)) {
      logger.warn('CORS validation failed', { ip, origin: request.headers.get('origin') })
      return new NextResponse('CORS policy violation', { status: 403 })
    }
    
    // Apply rate limiting
    if (isRateLimited(ip, endpoint)) {
      return new NextResponse('Too Many Requests', { status: 429 })
    }
    
    // Apply security headers
    response = applySecurityHeaders(response)
    
    // Log security events
    if (url.pathname.startsWith('/api/admin')) {
      if (!isAdminIPAllowed(ip)) {
        logger.warn('Unauthorized admin access attempt', { ip, endpoint })
        return new NextResponse('Forbidden', { status: 403 })
      }
    }
    
    return response
  }
}

// Helper function to check if a request is from a trusted source
export function isTrustedRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || ''
  const forwarded = request.headers.get('x-forwarded-for') || ''
  const realIp = request.headers.get('x-real-ip') || ''
  
  // Check for common bot patterns
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python/i, /go-http/i
  ]
  
  const isBot = botPatterns.some(pattern => pattern.test(userAgent))
  
  // Check for suspicious headers
  const suspiciousHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-forwarded-host',
    'x-forwarded-proto'
  ]
  
  const hasSuspiciousHeaders = suspiciousHeaders.some(header => 
    request.headers.get(header) && forwarded.split(',').length > 3
  )
  
  return !isBot && !hasSuspiciousHeaders
}

// Helper function to validate API tokens
export function validateApiToken(token: string): boolean {
  if (!token) return false
  
  // Check if token matches expected format
  const tokenRegex = /^[a-zA-Z0-9]{32,}$/
  if (!tokenRegex.test(token)) return false
  
  // In production, you would validate against a database or cache
  return true
}

// Helper function to check for SQL injection patterns
export function containsSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)(\s|$)/i,
    /(\s|^)(UNION|JOIN|WHERE|HAVING|GROUP BY)(\s|$)/i,
    /(\s|^)(OR|AND)(\s+\d+\s*=\s*\d+)/i,
    /(\s|^)(--|\/\*|\*\/|;)(\s|$)/,
    /(\s|^)(xp_|sp_)(\s|$)/i,
    /(\s|^)(exec|execute)(\s|$)/i
  ]
  
  return sqlPatterns.some(pattern => pattern.test(input))
}

// Helper function to check for XSS patterns
export function containsXSS(input: string): boolean {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe\b[^<]*>.*?<\/iframe>/gi,
    /<object\b[^<]*>.*?<\/object>/gi,
    /<embed\b[^<]*>.*?<\/embed>/gi,
    /<applet\b[^<]*>.*?<\/applet>/gi,
    /<meta\b[^<]*>/gi,
    /<link\b[^<]*>/gi,
    /<style\b[^<]*>.*?<\/style>/gi
  ]
  
  return xssPatterns.some(pattern => pattern.test(input))
}