import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId } = await request.json();

    if (!planId) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    // Get user from database
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { subscriptions: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Define plan details
    const plans = {
      free: {
        price: 0,
        name: 'Free',
        stripePriceId: null,
      },
      pro: {
        price: 9.99,
        name: 'Pro',
        stripePriceId: 'price_pro_monthly', // Replace with actual Stripe price ID
      },
      enterprise: {
        price: 99.99,
        name: 'Enterprise',
        stripePriceId: 'price_enterprise_monthly', // Replace with actual Stripe price ID
      },
    };

    const plan = plans[planId as keyof typeof plans];

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // For free plan, just update the user's plan directly
    if (planId === 'free') {
      await db.user.update({
        where: { id: user.id },
        data: { plan: 'free' }
      });

      // Cancel any active subscriptions
      if (user.subscriptions.length > 0) {
        const activeSubscription = user.subscriptions.find(sub => sub.status === 'active');
        if (activeSubscription) {
          await stripe.subscriptions.update(activeSubscription.id, {
            cancel_at_period_end: true,
          });
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Downgraded to free plan successfully' 
      });
    }

    // For paid plans, create Stripe checkout session
    if (!plan.stripePriceId) {
      return NextResponse.json({ error: 'Stripe price ID not configured' }, { status: 400 });
    }

    // Check if user already has an active subscription for this plan
    const existingSubscription = user.subscriptions.find(
      sub => sub.status === 'active' && sub.planId === planId
    );

    if (existingSubscription) {
      return NextResponse.json({ 
        error: 'You already have an active subscription for this plan' 
      }, { status: 400 });
    }

    // Create or get Stripe customer
    let stripeCustomer;
    const existingStripeCustomers = await stripe.customers.list({
      email: session.user.email,
      limit: 1,
    });

    if (existingStripeCustomers.data.length > 0) {
      stripeCustomer = existingStripeCustomers.data[0];
    } else {
      stripeCustomer = await stripe.customers.create({
        email: session.user.email,
        name: session.user.name || undefined,
        metadata: {
          userId: user.id,
        },
      });
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomer.id,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXTAUTH_URL}/auth/account?success=true`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        planId: planId,
      },
    });

    return NextResponse.json({ 
      sessionId: checkoutSession.id,
      url: checkoutSession.url 
    });

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}