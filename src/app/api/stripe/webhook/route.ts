import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = headers().get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    
    if (!customer || customer.deleted) {
      console.error('Customer not found for subscription:', subscription.id);
      return;
    }

    const userId = customer.metadata?.userId;
    const planId = subscription.metadata?.planId || 'pro';

    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Create subscription record
    await db.subscription.create({
      data: {
        userId,
        planId,
        status: subscription.status,
        startedAt: new Date(subscription.created * 1000),
        endedAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      }
    });

    // Update user plan
    await db.user.update({
      where: { id: userId },
      data: { plan: planId }
    });

    // Update or create user plan record
    await db.userPlan.upsert({
      where: { userId },
      update: {
        planId,
        usage: JSON.stringify({
          apiCalls: 0,
          storageUsed: 0,
          projects: 0,
        }),
      },
      create: {
        userId,
        planId,
        usage: JSON.stringify({
          apiCalls: 0,
          storageUsed: 0,
          projects: 0,
        }),
      }
    });

    console.log('Subscription created successfully:', subscription.id);
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    
    if (!customer || customer.deleted) {
      console.error('Customer not found for subscription:', subscription.id);
      return;
    }

    const userId = customer.metadata?.userId;
    const planId = subscription.metadata?.planId || 'pro';

    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Update subscription record
    await db.subscription.updateMany({
      where: { userId },
      data: {
        status: subscription.status,
        endedAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      }
    });

    // Update user plan if subscription is active
    if (subscription.status === 'active') {
      await db.user.update({
        where: { id: userId },
        data: { plan: planId }
      });
    }

    console.log('Subscription updated successfully:', subscription.id);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    
    if (!customer || customer.deleted) {
      console.error('Customer not found for subscription:', subscription.id);
      return;
    }

    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Update subscription record
    await db.subscription.updateMany({
      where: { userId },
      data: {
        status: 'cancelled',
        endedAt: new Date(),
      }
    });

    // Downgrade user to free plan
    await db.user.update({
      where: { id: userId },
      data: { plan: 'free' }
    });

    console.log('Subscription deleted successfully:', subscription.id);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;

    if (!subscriptionId || !customerId) {
      console.error('Missing subscription or customer ID in invoice:', invoice.id);
      return;
    }

    const customer = await stripe.customers.retrieve(customerId as string);
    
    if (!customer || customer.deleted) {
      console.error('Customer not found for invoice:', invoice.id);
      return;
    }

    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Create payment record
    await db.payment.create({
      data: {
        userId,
        subscriptionId: subscriptionId as string,
        amount: invoice.amount_paid / 100, // Convert from cents to dollars
        currency: invoice.currency.toUpperCase(),
        status: 'completed',
        gateway: 'stripe',
        transactionId: invoice.payment_intent as string,
      }
    });

    console.log('Payment succeeded for invoice:', invoice.id);
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const subscriptionId = invoice.subscription;
    const customerId = invoice.customer;

    if (!subscriptionId || !customerId) {
      console.error('Missing subscription or customer ID in invoice:', invoice.id);
      return;
    }

    const customer = await stripe.customers.retrieve(customerId as string);
    
    if (!customer || customer.deleted) {
      console.error('Customer not found for invoice:', invoice.id);
      return;
    }

    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Create failed payment record
    await db.payment.create({
      data: {
        userId,
        subscriptionId: subscriptionId as string,
        amount: invoice.amount_due / 100, // Convert from cents to dollars
        currency: invoice.currency.toUpperCase(),
        status: 'failed',
        gateway: 'stripe',
        transactionId: invoice.payment_intent as string,
      }
    });

    console.log('Payment failed for invoice:', invoice.id);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  try {
    const customerId = session.customer;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;

    if (!customerId || !userId || !planId) {
      console.error('Missing required metadata in checkout session:', session.id);
      return;
    }

    console.log('Checkout session completed:', session.id);
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
}