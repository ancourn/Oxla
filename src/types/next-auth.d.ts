import { DefaultSession } from 'next-auth'
import { JWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      accessToken?: string
      subscription?: {
        id: string
        stripeCustomerId?: string
        stripePriceId?: string
        stripeSubscriptionId?: string
        stripeCurrentPeriodEnd?: Date
        status?: string
      }
      role?: string
    } & DefaultSession['user']
  }

  interface User {
    id: string
    email: string
    name?: string
    image?: string
    emailVerified?: Date
    role?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    accessToken?: string
    subscription?: {
      id: string
      stripeCustomerId?: string
      stripePriceId?: string
      stripeSubscriptionId?: string
      stripeCurrentPeriodEnd?: Date
      status?: string
    }
    role?: string
  }
}