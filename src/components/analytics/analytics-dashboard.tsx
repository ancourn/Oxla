'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Search, 
  MessageCircle, 
  Activity,
  Clock,
  Target,
  Zap,
  Calendar,
  Download,
  Filter,
  User,
  Mail,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  FileText,
  Settings
} from 'lucide-react'

interface AnalyticsData {
  searchActivity: {
    totalSearches: number
    searchesThisMonth: number
    searchesThisWeek: number
    averageSearchesPerDay: number
    topQueries: Array<{ query: string; count: number }>
    searchTrend: Array<{ date: string; count: number }>
  }
  userActivity: {
    totalUsers: number
    activeUsers: number
    newUsersThisMonth: number
    userGrowth: Array<{ date: string; count: number }>
    topActiveUsers: Array<{ 
      id: string
      name: string 
      email: string
      searches: number 
      messages: number
      lastActive: string
      subscriptionPlan?: string
      usagePercentage: number
    }>
    userUsageDistribution: Array<{
      range: string
      count: number
      percentage: number
    }>
  }
  chatActivity: {
    totalMessages: number
    messagesThisMonth: number
    activeRooms: number
    messageTrend: Array<{ date: string; count: number }>
    topRooms: Array<{ name: string; messages: number; users: number }>
  }
  subscriptionMetrics: {
    totalSubscribers: number
    activeSubscribers: number
    newSubscriptionsThisMonth: number
    churnRate: number
    revenue: number
    mrr: number
    planDistribution: Array<{ plan: string; count: number; percentage: number }>
    upcomingRenewals: Array<{
      userId: string
      userEmail: string
      plan: string
      renewalDate: string
      amount: number
    }>
    failedPayments: Array<{
      userId: string
      userEmail: string
      amount: number
      failedAt: string
      reason: string
    }>
  }
  systemMetrics: {
    uptime: number
    responseTime: number
    errorRate: number
    activeConnections: number
    alerts: Array<{
      type: 'warning' | 'error' | 'info'
      message: string
      timestamp: string
    }>
  }
  perUserMetrics?: Array<{
    userId: string
    userName: string
    userEmail: string
    searches: number
    messages: number
    lastActive: string
    subscriptionPlan: string
    usageLimits: {
      searches: { used: number; limit: number }
      messages: { used: number; limit: number }
    }
    revenue: number
  }>
}

interface ReportFilters {
  dateRange: '7d' | '30d' | '90d' | '1y' | 'custom'
  startDate?: string
  endDate?: string
  users: string[]
  plans: string[]
  metrics: string[]
  exportFormat: 'pdf' | 'csv' | 'json'
}

interface AnalyticsDashboardProps {
  user: {
    id: string
    name?: string
    subscription?: {
      status: string
      plan: string
    }
  }
}

export function AnalyticsDashboard({ user }: AnalyticsDashboardProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d')
  const [showFilters, setShowFilters] = useState(false)
  const [showReportBuilder, setShowReportBuilder] = useState(false)
  const [reportFilters, setReportFilters] = useState<ReportFilters>({
    dateRange: '30d',
    users: [],
    plans: [],
    metrics: ['searches', 'messages', 'revenue'],
    exportFormat: 'pdf'
  })
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'overview' | 'detailed' | 'users'>('overview')

  useEffect(() => {
    loadAnalyticsData()
  }, [selectedTimeRange])

  const loadAnalyticsData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/analytics?range=${selectedTimeRange}`, {
        headers: {
          'Authorization': `Bearer ${user.id}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAnalyticsData(data)
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPerUserMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/per-user', {
        headers: {
          'Authorization': `Bearer ${user.id}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAnalyticsData(prev => prev ? { ...prev, perUserMetrics: data } : null)
      }
    } catch (error) {
      console.error('Failed to load per-user metrics:', error)
    }
  }

  const generateCustomReport = async () => {
    try {
      const response = await fetch('/api/analytics/custom-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify(reportFilters)
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `custom-report-${Date.now()}.${reportFilters.exportFormat}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to generate report:', error)
    }
  }

  const exportAnalytics = async (format: 'csv' | 'json' | 'pdf') => {
    try {
      const response = await fetch(`/api/analytics/export?format=${format}&range=${selectedTimeRange}`, {
        headers: {
          'Authorization': `Bearer ${user.id}`
        }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `analytics-${selectedTimeRange}-${Date.now()}.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to export analytics:', error)
    }
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  const getPlanColor = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'enterprise': return 'bg-purple-500'
      case 'professional': return 'bg-blue-500'
      case 'starter': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600'
    if (percentage >= 70) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getAlertIcon = (type: 'warning' | 'error' | 'info') => {
    switch (type) {
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'info': return <CheckCircle className="h-4 w-4 text-blue-500" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!analyticsData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <BarChart3 className="h-8 w-8 mx-auto mb-4" />
          <p>Failed to load analytics data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tighter">Analytics Dashboard</h1>
              <p className="text-muted-foreground mt-2">
                Comprehensive insights into your platform's performance and user activity
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedTimeRange}
                onChange={(e) => setSelectedTimeRange(e.target.value)}
                className="px-3 py-2 border border-input bg-background rounded-md text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
              </select>
              
              <Popover open={showReportBuilder} onOpenChange={setShowReportBuilder}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Custom Report
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Date Range</Label>
                      <Select 
                        value={reportFilters.dateRange} 
                        onValueChange={(value: any) => setReportFilters({...reportFilters, dateRange: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7d">Last 7 days</SelectItem>
                          <SelectItem value="30d">Last 30 days</SelectItem>
                          <SelectItem value="90d">Last 90 days</SelectItem>
                          <SelectItem value="1y">Last year</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium">Metrics</Label>
                      <div className="space-y-2 mt-2">
                        {['searches', 'messages', 'revenue', 'users', 'subscriptions'].map(metric => (
                          <div key={metric} className="flex items-center space-x-2">
                            <Checkbox 
                              id={metric}
                              checked={reportFilters.metrics.includes(metric)}
                              onCheckedChange={(checked) => {
                                const newMetrics = checked 
                                  ? [...reportFilters.metrics, metric]
                                  : reportFilters.metrics.filter(m => m !== metric)
                                setReportFilters({...reportFilters, metrics: newMetrics})
                              }}
                            />
                            <Label htmlFor={metric} className="text-sm capitalize">{metric}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium">Export Format</Label>
                      <Select 
                        value={reportFilters.exportFormat} 
                        onValueChange={(value: any) => setReportFilters({...reportFilters, exportFormat: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button onClick={generateCustomReport} className="w-full">
                      Generate Report
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => exportAnalytics('csv')}>
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportAnalytics('json')}>
                  <Download className="h-4 w-4 mr-1" />
                  JSON
                </Button>
              </div>
            </div>
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mt-4">
            <Button
              variant={viewMode === 'overview' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('overview')}
            >
              Overview
            </Button>
            <Button
              variant={viewMode === 'detailed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('detailed')}
            >
              Detailed Analytics
            </Button>
            <Button
              variant={viewMode === 'users' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setViewMode('users')
                loadPerUserMetrics()
              }}
            >
              Per-User Metrics
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(analyticsData.searchActivity.totalSearches)}</div>
              <p className="text-xs text-muted-foreground">
                +{formatNumber(analyticsData.searchActivity.searchesThisMonth)} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(analyticsData.userActivity.activeUsers)}</div>
              <p className="text-xs text-muted-foreground">
                +{formatNumber(analyticsData.userActivity.newUsersThisMonth)} new this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(analyticsData.chatActivity.totalMessages)}</div>
              <p className="text-xs text-muted-foreground">
                +{formatNumber(analyticsData.chatActivity.messagesThisMonth)} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analyticsData.subscriptionMetrics.mrr)}</div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(analyticsData.subscriptionMetrics.totalSubscribers)} subscribers
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Analytics */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Search Activity Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Search Activity Trend
                  </CardTitle>
                  <CardDescription>
                    Daily search volume over the selected time period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center border rounded-lg">
                    <div className="text-center text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2" />
                      <p>Search trend chart would be rendered here</p>
                      <p className="text-xs">Using Recharts or similar charting library</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* User Growth Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Growth
                  </CardTitle>
                  <CardDescription>
                    Daily active users and new user acquisition
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center border rounded-lg">
                    <div className="text-center text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2" />
                      <p>User growth chart would be rendered here</p>
                      <p className="text-xs">Using Recharts or similar charting library</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    System Health
                  </CardTitle>
                  <CardDescription>
                    Current system performance metrics
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Uptime</span>
                    <Badge variant="default">{formatPercentage(analyticsData.systemMetrics.uptime)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Response Time</span>
                    <span className="text-sm font-medium">{analyticsData.systemMetrics.responseTime}ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Error Rate</span>
                    <Badge variant={analyticsData.systemMetrics.errorRate > 0.01 ? 'destructive' : 'default'}>
                      {formatPercentage(analyticsData.systemMetrics.errorRate)}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Active Connections</span>
                    <span className="text-sm font-medium">{analyticsData.systemMetrics.activeConnections}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Top Queries */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Top Search Queries
                  </CardTitle>
                  <CardDescription>
                    Most popular search terms this month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {analyticsData.searchActivity.topQueries.slice(0, 5).map((query, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                          <span className="text-sm truncate flex-1">{query.query}</span>
                          <Badge variant="secondary" className="ml-2">
                            {formatNumber(query.count)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="search" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Search Activity Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{formatNumber(analyticsData.searchActivity.totalSearches)}</div>
                      <div className="text-sm text-muted-foreground">Total Searches</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{formatNumber(analyticsData.searchActivity.averageSearchesPerDay)}</div>
                      <div className="text-sm text-muted-foreground">Daily Average</div>
                    </div>
                  </div>
                  <div className="h-64 flex items-center justify-center border rounded-lg">
                    <div className="text-center text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2" />
                      <p>Detailed search analytics chart</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Search Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">This Month</span>
                      <span className="font-medium">{formatNumber(analyticsData.searchActivity.searchesThisMonth)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">This Week</span>
                      <span className="font-medium">{formatNumber(analyticsData.searchActivity.searchesThisWeek)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Daily Average</span>
                      <span className="font-medium">{formatNumber(analyticsData.searchActivity.averageSearchesPerDay)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>User Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center border rounded-lg mb-4">
                    <div className="text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2" />
                      <p>User activity and engagement chart</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Active Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {analyticsData.userActivity.topActiveUsers.map((user, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium text-sm">{user.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(user.searches)} searches • {formatNumber(user.messages)} messages
                            </div>
                          </div>
                          <Badge variant="outline">#{index + 1}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="chat" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Chat Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center border rounded-lg mb-4">
                    <div className="text-center text-muted-foreground">
                      <MessageCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>Chat message trends and activity</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Active Rooms</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {analyticsData.chatActivity.topRooms.map((room, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium text-sm">{room.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(room.messages)} messages • {formatNumber(room.users)} users
                            </div>
                          </div>
                          <Badge variant="outline">#{index + 1}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Revenue Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{formatCurrency(analyticsData.subscriptionMetrics.mrr)}</div>
                      <div className="text-sm text-muted-foreground">Monthly Recurring Revenue</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{formatCurrency(analyticsData.subscriptionMetrics.revenue)}</div>
                      <div className="text-sm text-muted-foreground">Total Revenue</div>
                    </div>
                  </div>
                  <div className="h-64 flex items-center justify-center border rounded-lg">
                    <div className="text-center text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2" />
                      <p>Revenue trends and projections</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subscription Plans</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analyticsData.subscriptionMetrics.planDistribution.map((plan, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{plan.plan}</span>
                        <span className="text-sm">{formatPercentage(plan.percentage)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${getPlanColor(plan.plan)}`}
                          style={{ width: `${plan.percentage * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(plan.count)} subscribers
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Per-User Metrics Section */}
        {viewMode === 'users' && analyticsData?.perUserMetrics && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Per-User Usage Analytics</h2>
              <Button variant="outline" onClick={() => exportAnalytics('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export User Data
              </Button>
            </div>

            {/* User Usage Distribution */}
            {analyticsData.userActivity.userUsageDistribution && (
              <Card>
                <CardHeader>
                  <CardTitle>Usage Distribution</CardTitle>
                  <CardDescription>How users are distributed across usage levels</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {analyticsData.userActivity.userUsageDistribution.map((range, index) => (
                      <div key={index} className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold">{formatNumber(range.count)}</div>
                        <div className="text-sm text-muted-foreground">{range.range}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatPercentage(range.percentage)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detailed User Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Detailed User Metrics</CardTitle>
                <CardDescription>Individual user usage and performance data</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {analyticsData.perUserMetrics.map((user, index) => (
                      <div key={user.userId} className="border rounded-lg p-4 hover:bg-muted/50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span className="font-medium">{user.userName}</span>
                              </div>
                              <Badge variant="outline">{user.subscriptionPlan}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mb-3">
                              <Mail className="h-3 w-3 inline mr-1" />
                              {user.userEmail}
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-muted-foreground">Searches</div>
                                <div className="font-medium">{formatNumber(user.searches)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatPercentage(user.usageLimits.searches.used / user.usageLimits.searches.limit * 100)} of limit
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Messages</div>
                                <div className="font-medium">{formatNumber(user.messages)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatPercentage(user.usageLimits.messages.used / user.usageLimits.messages.limit * 100)} of limit
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Revenue</div>
                                <div className="font-medium">{formatCurrency(user.revenue)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Last Active</div>
                                <div className="font-medium">{formatDate(user.lastActive)}</div>
                              </div>
                            </div>

                            {/* Usage Progress Bars */}
                            <div className="mt-3 space-y-2">
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Search Usage</span>
                                  <span className={getUsageColor(user.usageLimits.searches.used / user.usageLimits.searches.limit * 100)}>
                                    {user.usageLimits.searches.used} / {user.usageLimits.searches.limit}
                                  </span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${getUsageColor(user.usageLimits.searches.used / user.usageLimits.searches.limit * 100).replace('text-', 'bg-')}`}
                                    style={{ width: `${(user.usageLimits.searches.used / user.usageLimits.searches.limit * 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Message Usage</span>
                                  <span className={getUsageColor(user.usageLimits.messages.used / user.usageLimits.messages.limit * 100)}>
                                    {user.usageLimits.messages.used} / {user.usageLimits.messages.limit}
                                  </span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${getUsageColor(user.usageLimits.messages.used / user.usageLimits.messages.limit * 100).replace('text-', 'bg-')}`}
                                    style={{ width: `${(user.usageLimits.messages.used / user.usageLimits.messages.limit * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 ml-4">
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}

        {/* System Alerts */}
        {analyticsData?.systemMetrics.alerts && analyticsData.systemMetrics.alerts.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-800">
                <AlertTriangle className="h-5 w-5" />
                System Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analyticsData.systemMetrics.alerts.map((alert, index) => (
                  <div key={index} className="flex items-start gap-2 p-2 bg-white rounded border">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{alert.message}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(alert.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}