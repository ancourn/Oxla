'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for trying out the platform',
    features: [
      { name: 'Up to 100 API calls per hour', included: true },
      { name: 'Basic features', included: true },
      { name: 'Community support', included: true },
      { name: '1 project', included: true },
      { name: '1GB storage', included: true },
      { name: 'Advanced analytics', included: false },
      { name: 'Priority support', included: false },
      { name: 'Custom integrations', included: false },
      { name: 'API access', included: false },
      { name: 'White-label options', included: false },
    ],
    cta: 'Current Plan',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9.99',
    period: 'per month',
    description: 'For professionals and small teams',
    features: [
      { name: 'Up to 10,000 API calls per hour', included: true },
      { name: 'All basic features', included: true },
      { name: 'Email support', included: true },
      { name: '10 projects', included: true },
      { name: '10GB storage', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Priority support', included: true },
      { name: 'Custom integrations', included: false },
      { name: 'API access', included: true },
      { name: 'White-label options', included: false },
    ],
    cta: 'Upgrade to Pro',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$99.99',
    period: 'per month',
    description: 'For large organizations with custom needs',
    features: [
      { name: 'Unlimited API calls', included: true },
      { name: 'All features included', included: true },
      { name: '24/7 phone support', included: true },
      { name: 'Unlimited projects', included: true },
      { name: 'Unlimited storage', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Priority support', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'API access', included: true },
      { name: 'White-label options', included: true },
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

export default function Pricing() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    if (planId === 'enterprise') {
      // Handle enterprise contact
      router.push('/contact');
      return;
    }

    setIsLoading(planId);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.url) {
          // Redirect to Stripe checkout
          window.location.href = data.url;
        } else if (data.success) {
          // For free plan downgrades
          alert(data.message);
          router.push('/auth/account');
        }
      } else {
        alert(data.error || 'Failed to process upgrade');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('An error occurred while processing your upgrade');
    } finally {
      setIsLoading(null);
    }
  };

  const getUserPlan = () => {
    return session?.user?.plan || 'free';
  };

  const isCurrentPlan = (planId: string) => {
    return getUserPlan() === planId;
  };

  const getCTAText = (planId: string) => {
    if (!session) return 'Get Started';
    if (isCurrentPlan(planId)) return 'Current Plan';
    if (planId === 'enterprise') return 'Contact Sales';
    return 'Upgrade';
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
              Simple, Transparent Pricing
            </h1>
            <p className="mt-5 max-w-xl mx-auto text-xl text-gray-500">
              Choose the perfect plan for your needs. Always know what you'll pay.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl bg-white shadow-xl ${
                plan.popular ? 'ring-2 ring-indigo-600' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <Badge className="bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <Card className="h-full border-0 shadow-none">
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl font-bold text-gray-900">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-6">
                    <span className="text-4xl font-extrabold text-gray-900">
                      {plan.price}
                    </span>
                    <span className="text-base font-medium text-gray-500">
                      /{plan.period}
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  <ul className="space-y-4">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`ml-3 text-sm ${
                            feature.included ? 'text-gray-700' : 'text-gray-400'
                          }`}
                        >
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button
                    className={`w-full mt-8 ${
                      isCurrentPlan(plan.id)
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : plan.popular
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : 'bg-gray-900 hover:bg-gray-800'
                    }`}
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={isLoading === plan.id || isCurrentPlan(plan.id)}
                  >
                    {isLoading === plan.id ? 'Processing...' : getCTAText(plan.id)}
                  </Button>
                  
                  {isCurrentPlan(plan.id) && (
                    <p className="text-center text-sm text-gray-600 mt-2">
                      You're currently on this plan
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Frequently Asked Questions
            </h2>
          </div>
          
          <div className="mt-12 max-w-3xl mx-auto">
            <dl className="space-y-10">
              <div>
                <dt className="text-lg font-medium text-gray-900">
                  Can I change my plan later?
                </dt>
                <dd className="mt-2 text-base text-gray-500">
                  Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
                </dd>
              </div>
              
              <div>
                <dt className="text-lg font-medium text-gray-900">
                  What payment methods do you accept?
                </dt>
                <dd className="mt-2 text-base text-gray-500">
                  We accept all major credit cards including Visa, MasterCard, American Express, and Discover.
                </dd>
              </div>
              
              <div>
                <dt className="text-lg font-medium text-gray-900">
                  Is there a free trial?
                </dt>
                <dd className="mt-2 text-base text-gray-500">
                  Yes, our Free plan is perfect for trying out the platform with no time limit.
                </dd>
              </div>
              
              <div>
                <dt className="text-lg font-medium text-gray-900">
                  Can I cancel my subscription?
                </dt>
                <dd className="mt-2 text-base text-gray-500">
                  Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}