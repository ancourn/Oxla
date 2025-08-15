'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { 
  Crown, 
  CreditCard, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Users,
  Zap,
  BarChart3,
  Shield,
  ArrowRight
} from 'lucide-react'

interface SubscriptionData {
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
  plan: 'starter' | 'professional' | 'enterprise'
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

interface Invoice {
  id: string
  amount: number
  status: 'paid' | 'open' | 'void'
  date: string
  downloadUrl: string
}

interface BillingPageProps {
  user: {
    name?: string
    email?: string
    image?: string
  }
  subscription?: SubscriptionData
  invoices?: Invoice[]
}

const plans = {
  starter: {
    name: 'Starter',
    price: '$19',
    period: '/month',
    features: ['Up to 5 users', '1,000 searches/month', 'Basic analytics', 'Email support'],
    icon: <Users className="h-5 w-5" />
  },
  professional: {
    name: 'Professional',
    price: '$49',
    period: '/month',
    features: ['Up to 25 users', '10,000 searches/month', 'Advanced analytics', 'Priority support', 'API access'],
    icon: <BarChart3 className="h-5 w-5" />
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Unlimited users', 'Unlimited searches', 'Custom analytics', '24/7 support', 'Custom integrations'],
    icon: <Shield className="h-5 w-5" />
  }
}

export function BillingPage({ user, subscription, invoices = [] }: BillingPageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false)

  const handleUpgrade = (newPlan: string) => {
    setIsLoading(true)
    // TODO: Implement plan upgrade logic
    setTimeout(() => {
      setIsLoading(false)
    }, 1000)
  }

  const handleCancelSubscription = () => {
    setIsCanceling(true)
    // TODO: Implement subscription cancellation
    setTimeout(() => {
      setIsCanceling(false)
    }, 1000)
  }

  const handleReactivateSubscription = () => {
    setIsLoading(true)
    // TODO: Implement subscription reactivation
    setTimeout(() => {
      setIsLoading(false)
    }, 1000)
  }

  const handleUpdatePaymentMethod = () => {
    setIsUpdatingPayment(true)
    // TODO: Implement payment method update
    setTimeout(() => {
      setIsUpdatingPayment(false)
    }, 1000)
  }

  const getSubscriptionStatus = () => {
    if (!subscription) {
      return { variant: 'secondary' as const, text: 'No Active Plan', icon: <AlertCircle className="h-4 w-4" /> }
    }

    switch (subscription.status) {
      case 'active':
        return { variant: 'default' as const, text: 'Active', icon: <CheckCircle className="h-4 w-4" /> }
      case 'canceled':
        return { variant: 'destructive' as const, text: 'Canceled', icon: <AlertCircle className="h-4 w-4" /> }
      case 'past_due':
        return { variant: 'destructive' as const, text: 'Past Due', icon: <AlertCircle className="h-4 w-4" /> }
      case 'trialing':
        return { variant: 'secondary' as const, text: 'Trial', icon: <Clock className="h-4 w-4" /> }
      default:
        return { variant: 'outline' as const, text: 'Unknown', icon: <AlertCircle className="h-4 w-4" /> }
    }
  }

  const statusInfo = getSubscriptionStatus()
  const currentPlan = subscription ? plans[subscription.plan] : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tighter">Billing & Account</h1>
          <p className="text-muted-foreground mt-2">
            Manage your subscription, payment methods, and account settings
          </p>
        </div>

        <Tabs defaultValue="subscription" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="payment">Payment Methods</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          </TabsList>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="space-y-6">
            {/* Current Plan */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5" />
                  Current Plan
                </CardTitle>
                <CardDescription>
                  Your current subscription details and usage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {subscription ? (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{currentPlan?.name}</h3>
                          <p className="text-2xl font-bold">
                            {currentPlan?.price}
                            <span className="text-sm font-normal text-muted-foreground">
                              {currentPlan?.period}
                            </span>
                          </p>
                        </div>
                        <Badge variant={statusInfo.variant} className="gap-1">
                          {statusInfo.icon}
                          {statusInfo.text}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Features</Label>
                        <ul className="space-y-1">
                          {currentPlan?.features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Billing Period</Label>
                        <p className="text-sm text-muted-foreground">
                          Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                        </p>
                      </div>

                      {subscription.cancelAtPeriodEnd && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Your subscription will be canceled on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. 
                            You can reactivate it before then.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="space-y-2">
                        {subscription.cancelAtPeriodEnd ? (
                          <Button 
                            onClick={handleReactivateSubscription}
                            disabled={isLoading}
                            className="w-full"
                          >
                            {isLoading ? 'Reactivating...' : 'Reactivate Subscription'}
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            onClick={handleCancelSubscription}
                            disabled={isCanceling}
                            className="w-full"
                          >
                            {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      You don't have an active subscription. Choose a plan to get started.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Available Plans */}
            <Card>
              <CardHeader>
                <CardTitle>Available Plans</CardTitle>
                <CardDescription>
                  Upgrade or downgrade your subscription at any time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.entries(plans).map(([key, plan]) => (
                    <Card key={key} className={`relative ${subscription?.plan === key ? 'border-2 border-primary' : ''}`}>
                      {subscription?.plan === key && (
                        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                          <Badge className="bg-primary text-primary-foreground">
                            Current Plan
                          </Badge>
                        </div>
                      )}
                      
                      <CardHeader className="text-center pb-4">
                        <div className="flex justify-center mb-2">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                            {plan.icon}
                          </div>
                        </div>
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        <div className="text-2xl font-bold">
                          {plan.price}
                          <span className="text-sm font-normal text-muted-foreground">
                            {plan.period}
                          </span>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="pt-0">
                        <ul className="space-y-2 mb-4">
                          {plan.features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                        
                        <Button 
                          className="w-full"
                          variant={subscription?.plan === key ? "outline" : "default"}
                          onClick={() => handleUpgrade(key)}
                          disabled={isLoading || subscription?.plan === key}
                        >
                          {subscription?.plan === key ? 'Current Plan' : 'Upgrade'}
                          {subscription?.plan !== key && <ArrowRight className="h-4 w-4 ml-2" />}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Methods Tab */}
          <TabsContent value="payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
                <CardDescription>
                  Manage your payment methods and billing information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 bg-blue-600 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">VISA</span>
                      </div>
                      <div>
                        <p className="font-medium">•••• •••• •••• 4242</p>
                        <p className="text-sm text-muted-foreground">Expires 12/25</p>
                      </div>
                    </div>
                    <Badge variant="secondary">Default</Badge>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  onClick={handleUpdatePaymentMethod}
                  disabled={isUpdatingPayment}
                  className="w-full"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {isUpdatingPayment ? 'Updating...' : 'Update Payment Method'}
                </Button>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Payment method changes will take effect on your next billing cycle.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Billing Information */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Information</CardTitle>
                <CardDescription>
                  Update your billing address and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" defaultValue={user?.name || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" defaultValue={user?.email || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company (Optional)</Label>
                    <Input id="company" placeholder="Your company name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone (Optional)</Label>
                    <Input id="phone" placeholder="+1 (555) 123-4567" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" placeholder="123 Main Street" />
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" placeholder="New York" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" placeholder="NY" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input id="zip" placeholder="10001" />
                  </div>
                </div>

                <Button className="w-full">
                  Save Billing Information
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Invoices & Billing History
                </CardTitle>
                <CardDescription>
                  View and download your past invoices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length > 0 ? (
                  <div className="space-y-4">
                    {invoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-medium">Invoice #{invoice.id}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(invoice.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-medium">${invoice.amount}</p>
                            <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                              {invoice.status}
                            </Badge>
                          </div>
                          
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Download className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No invoices available yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}