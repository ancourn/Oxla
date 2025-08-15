import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

export interface StripePrice {
  id: string
  productId: string
  amount: number
  currency: string
  interval: 'month' | 'year'
  intervalCount?: number
  trialPeriodDays?: number
}

export interface StripeProduct {
  id: string
  name: string
  description?: string
  active: boolean
  metadata?: Record<string, string>
}

// Price IDs for different plans (these would be your actual Stripe price IDs)
export const PRICE_IDS = {
  starter: {
    monthly: 'price_starter_monthly',
    yearly: 'price_starter_yearly',
  },
  professional: {
    monthly: 'price_professional_monthly',
    yearly: 'price_professional_yearly',
  },
  enterprise: {
    monthly: 'price_enterprise_monthly',
    yearly: 'price_enterprise_yearly',
  },
} as const

export async function createStripeCustomer(email: string, name?: string): Promise<Stripe.Customer> {
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        source: 'oxla_webapp',
      },
    })
    return customer
  } catch (error) {
    console.error('Error creating Stripe customer:', error)
    throw new Error('Failed to create Stripe customer')
  }
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: 'oxla_webapp',
      },
    })
    return session
  } catch (error) {
    console.error('Error creating checkout session:', error)
    throw new Error('Failed to create checkout session')
  }
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return session
  } catch (error) {
    console.error('Error creating billing portal session:', error)
    throw new Error('Failed to create billing portal session')
  }
}

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    return subscription
  } catch (error) {
    console.error('Error retrieving subscription:', error)
    return null
  }
}

export async function cancelSubscription(
  subscriptionId: string,
  immediately = false
): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !immediately,
    })
    return subscription
  } catch (error) {
    console.error('Error canceling subscription:', error)
    throw new Error('Failed to cancel subscription')
  }
}

export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    })
    return subscription
  } catch (error) {
    console.error('Error reactivating subscription:', error)
    throw new Error('Failed to reactivate subscription')
  }
}

export async function updateSubscription(
  subscriptionId: string,
  priceId: string
): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const subscriptionItemId = subscription.items.data[0]?.id

    if (!subscriptionItemId) {
      throw new Error('No subscription item found')
    }

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscriptionItemId,
          price: priceId,
        },
      ],
      proration_behavior: 'create_prorations',
    })
    return updatedSubscription
  } catch (error) {
    console.error('Error updating subscription:', error)
    throw new Error('Failed to update subscription')
  }
}

export async function getCustomer(customerId: string): Promise<Stripe.Customer | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    return customer as Stripe.Customer
  } catch (error) {
    console.error('Error retrieving customer:', error)
    return null
  }
}

export async function getInvoices(customerId: string): Promise<Stripe.Invoice[]> {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 100,
    })
    return invoices.data
  } catch (error) {
    console.error('Error retrieving invoices:', error)
    return []
  }
}

export async function getUpcomingInvoice(customerId: string, subscriptionId?: string): Promise<Stripe.Invoice | null> {
  try {
    const invoice = await stripe.invoices.retrieveUpcoming({
      customer: customerId,
      subscription: subscriptionId,
    })
    return invoice
  } catch (error) {
    console.error('Error retrieving upcoming invoice:', error)
    return null
  }
}

export async function getProducts(): Promise<StripeProduct[]> {
  try {
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    })
    return products.data.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      metadata: product.metadata,
    }))
  } catch (error) {
    console.error('Error retrieving products:', error)
    return []
  }
}

export async function getPrices(): Promise<StripePrice[]> {
  try {
    const prices = await stripe.prices.list({
      active: true,
      limit: 100,
    })
    return prices.data.map(price => ({
      id: price.id,
      productId: price.product as string,
      amount: price.unit_amount || 0,
      currency: price.currency,
      interval: price.recurring?.interval as 'month' | 'year' || 'month',
      intervalCount: price.recurring?.interval_count,
      trialPeriodDays: price.recurring?.trial_period_days,
    }))
  } catch (error) {
    console.error('Error retrieving prices:', error)
    return []
  }
}

// Utility function to handle Stripe errors with retries
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      // Don't retry on certain errors
      if (error instanceof Stripe.errors.StripeError) {
        if (error.type === 'StripeInvalidRequestError' || 
            error.type === 'StripeAuthenticationError') {
          throw error
        }
      }
      
      // Wait before retrying
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
      }
    }
  }
  
  throw lastError!
}

// Webhook signature verification
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret)
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    throw new Error('Invalid webhook signature')
  }
}

export default stripe