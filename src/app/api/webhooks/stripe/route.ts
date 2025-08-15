import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { 
  sendSubscriptionEmail, 
  sendPaymentSuccessEmail, 
  sendPaymentFailedEmail, 
  sendTrialEndingEmail,
  sendSubscriptionRenewalEmail
} from '@/lib/email'
import Stripe from 'stripe'
import { logger } from '@/lib/logger'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Rate limiting configuration
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
}

// Simple in-memory rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(ip)
  
  if (!record) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + rateLimit.windowMs })
    return false
  }
  
  if (now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + rateLimit.windowMs })
    return false
  }
  
  if (record.count >= rateLimit.max) {
    return true
  }
  
  record.count++
  return false
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    
    // Apply rate limiting
    if (isRateLimited(ip)) {
      logger.warn('Rate limit exceeded for webhook endpoint', { ip })
      return new NextResponse('Too Many Requests', { status: 429 })
    }

    const body = await request.text()
    const signature = request.headers.get('stripe-signature')!

    // Validate webhook signature
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      logger.error('Webhook signature verification failed', { error: err, ip })
      return new NextResponse('Invalid signature', { status: 400 })
    }

    // Log webhook event
    logger.info('Received Stripe webhook event', { 
      type: event.type, 
      id: event.id,
      ip 
    })

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer)
        break
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription)
        break
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod)
        break
      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod)
        break
      default:
        logger.debug('Unhandled webhook event type', { type: event.type })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Webhook processing error', { error, ip: request.ip })
    return new NextResponse('Webhook error', { status: 500 })
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string
    const priceId = subscription.items.data[0]?.price?.id
    const status = subscription.status
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000)

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Determine plan type based on price ID
    const planType = getPlanTypeFromPriceId(priceId)
    const planName = getPlanNameFromType(planType)

    // Create or update subscription
    await db.subscription.upsert({
      where: {
        userId: user.id
      },
      create: {
        userId: user.id,
        stripeCustomerId: customerId,
        stripePriceId: priceId,
        stripeSubscriptionId: subscription.id,
        status: status,
        stripeCurrentPeriodEnd: currentPeriodEnd,
      },
      update: {
        stripePriceId: priceId,
        stripeSubscriptionId: subscription.id,
        status: status,
        stripeCurrentPeriodEnd: currentPeriodEnd,
      }
    })

    // Send subscription created email
    await sendSubscriptionEmail(user.email, 'created', planName)

    // Broadcast to admin dashboard
    if (io) {
      const subscriptionData = {
        id: subscription.id,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || 'Unknown',
        plan: planName,
        status: status,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        createdAt: new Date().toISOString()
      }
      broadcastNewSubscription(io, subscriptionData)
    }

    console.log('Subscription created successfully for user:', user.id)
  } catch (error) {
    console.error('Error handling subscription created:', error)
    throw error
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string
    const priceId = subscription.items.data[0]?.price?.id
    const status = subscription.status
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000)
    const cancelAtPeriodEnd = subscription.cancel_at_period_end

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Determine plan type based on price ID
    const planType = getPlanTypeFromPriceId(priceId)
    const planName = getPlanNameFromType(planType)

    // Update subscription
    await db.subscription.update({
      where: {
        userId: user.id
      },
      data: {
        stripePriceId: priceId,
        status: status,
        stripeCurrentPeriodEnd: currentPeriodEnd,
      }
    })

    // Send subscription updated email if plan changed
    if (status === 'active' && !cancelAtPeriodEnd) {
      await sendSubscriptionEmail(user.email, 'updated', planName)
    }

    // Broadcast to admin dashboard
    if (io) {
      const subscriptionData = {
        id: subscription.id,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || 'Unknown',
        plan: planName,
        status: status,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        updatedAt: new Date().toISOString()
      }
      broadcastSubscriptionUpdate(io, subscriptionData)
    }

    console.log('Subscription updated successfully for user:', user.id)
  } catch (error) {
    console.error('Error handling subscription updated:', error)
    throw error
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Get current subscription to determine plan name
    const currentSubscription = await db.subscription.findUnique({
      where: { userId: user.id }
    })

    const planName = currentSubscription?.stripePriceId 
      ? getPlanNameFromType(getPlanTypeFromPriceId(currentSubscription.stripePriceId))
      : 'Subscription'

    // Update subscription status to canceled
    await db.subscription.update({
      where: {
        userId: user.id
      },
      data: {
        status: 'canceled',
      }
    })

    // Send subscription cancelled email
    await sendSubscriptionEmail(user.email, 'cancelled', planName)

    // Broadcast to admin dashboard
    if (io) {
      const subscriptionData = {
        id: subscription.id,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || 'Unknown',
        plan: planName,
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      }
      broadcastCancelledSubscription(io, subscriptionData)
    }

    console.log('Subscription canceled for user:', user.id)
  } catch (error) {
    console.error('Error handling subscription deleted:', error)
    throw error
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    const customerId = invoice.customer as string
    const subscriptionId = invoice.subscription as string
    const amount = invoice.amount_paid / 100 // Convert from cents to dollars

    if (!subscriptionId) return

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Get subscription details
    const subscription = await db.subscription.findUnique({
      where: { userId: user.id }
    })

    if (!subscription) {
      console.error('Subscription not found for user:', user.id)
      return
    }

    const planName = getPlanNameFromType(getPlanTypeFromPriceId(subscription.stripePriceId || ''))
    const renewalDate = new Date(subscription.stripeCurrentPeriodEnd).toLocaleDateString()

    // Update subscription status to active if payment succeeded
    await db.subscription.update({
      where: {
        userId: user.id
      },
      data: {
        status: 'active',
      }
    })

    // Send payment success email
    await sendPaymentSuccessEmail(user.email, amount, planName)

    // Send subscription renewal email if this is a renewal
    if (invoice.billing_reason === 'subscription_cycle') {
      await sendSubscriptionRenewalEmail(user.email, amount, planName, renewalDate)
    }

    console.log('Invoice payment succeeded for user:', user.id)
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error)
    throw error
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const customerId = invoice.customer as string
    const subscriptionId = invoice.subscription as string

    if (!subscriptionId) return

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Get subscription details
    const subscription = await db.subscription.findUnique({
      where: { userId: user.id }
    })

    if (!subscription) {
      console.error('Subscription not found for user:', user.id)
      return
    }

    const planName = getPlanNameFromType(getPlanTypeFromPriceId(subscription.stripePriceId || ''))

    // Update subscription status to past_due
    await db.subscription.update({
      where: {
        userId: user.id
      },
      data: {
        status: 'past_due',
      }
    })

    // Send payment failed email
    await sendPaymentFailedEmail(user.email, planName)

    console.log('Invoice payment failed for user:', user.id)
  } catch (error) {
    console.error('Error handling invoice payment failed:', error)
    throw error
  }
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  try {
    const customerId = customer.id

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Update customer email if changed
    if (customer.email && customer.email !== user.email) {
      await db.user.update({
        where: {
          id: user.id
        },
        data: {
          email: customer.email,
        }
      })
    }

    console.log('Customer updated for user:', user.id)
  } catch (error) {
    console.error('Error handling customer updated:', error)
    throw error
  }
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string
    const trialEnd = new Date(subscription.trial_end! * 1000)
    const now = new Date()
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    // Get current subscription to determine plan name
    const currentSubscription = await db.subscription.findUnique({
      where: { userId: user.id }
    })

    const planName = currentSubscription?.stripePriceId 
      ? getPlanNameFromType(getPlanTypeFromPriceId(currentSubscription.stripePriceId))
      : 'Subscription'

    // Send trial ending notification email
    await sendTrialEndingEmail(user.email, daysLeft, planName)

    console.log('Trial will end notification sent for user:', user.id)
  } catch (error) {
    console.error('Error handling trial will end:', error)
    throw error
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  try {
    const customerId = paymentMethod.customer as string

    if (!customerId) return

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    console.log('Payment method attached for user:', user.id)
  } catch (error) {
    console.error('Error handling payment method attached:', error)
    throw error
  }
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  try {
    const customerId = paymentMethod.customer as string

    if (!customerId) return

    // Find user by Stripe customer ID
    const user = await db.user.findFirst({
      where: {
        subscriptions: {
          some: {
            stripeCustomerId: customerId
          }
        }
      }
    })

    if (!user) {
      console.error('User not found for customer:', customerId)
      return
    }

    console.log('Payment method detached for user:', user.id)
  } catch (error) {
    console.error('Error handling payment method detached:', error)
    throw error
  }
}

function getPlanTypeFromPriceId(priceId: string): 'starter' | 'professional' | 'enterprise' {
  // In a real implementation, you would map Stripe price IDs to your plan types
  // This is a simplified example
  if (priceId.includes('starter')) return 'starter'
  if (priceId.includes('professional')) return 'professional'
  if (priceId.includes('enterprise')) return 'enterprise'
  
  // Default to starter if no match
  return 'starter'
}

function getPlanNameFromType(planType: 'starter' | 'professional' | 'enterprise'): string {
  switch (planType) {
    case 'starter':
      return 'Starter Plan'
    case 'professional':
      return 'Professional Plan'
    case 'enterprise':
      return 'Enterprise Plan'
    default:
      return 'Subscription Plan'
  }
}