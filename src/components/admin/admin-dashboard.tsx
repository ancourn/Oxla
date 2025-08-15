'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Users, 
  CreditCard, 
  Settings, 
  AlertTriangle, 
  CheckCircle, 
  Search, 
  Filter,
  Download,
  Mail,
  Phone,
  MapPin,
  Calendar,
  TrendingUp,
  Activity,
  Ban,
  UserCheck,
  DollarSign,
  BarChart3,
  Database,
  Shield,
  Zap,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  RefreshCw
} from 'lucide-react'

interface AdminUser {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  subscriptionPlan?: string
  subscriptionStatus?: 'active' | 'cancelled' | 'past_due' | 'incomplete'
  createdAt: string
  lastActive: string
  emailVerified: boolean
  searches: number
  messages: number
  revenue: number
  status: 'active' | 'suspended' | 'banned'
}

interface AdminSubscription {
  id: string
  userId: string
  userEmail: string
  userName: string
  plan: string
  status: 'active' | 'cancelled' | 'past_due' | 'incomplete'
  currentPeriodEnd: string
  amount: number
  createdAt: string
  cancelledAt?: string
}

interface SystemMetrics {
  totalUsers: number
  activeUsers: number
  totalSubscriptions: number
  activeSubscriptions: number
  monthlyRevenue: number
  totalRevenue: number
  uptime: number
  responseTime: number
  errorRate: number
  activeConnections: number
  recentAlerts: Array<{
    id: string
    type: 'error' | 'warning' | 'info'
    message: string
    timestamp: string
    resolved: boolean
  }>
}

interface AdminDashboardProps {
  user: {
    id: string
    role: string
  }
}

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([])
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)

  useEffect(() => {
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return
    }
    loadAdminData()
  }, [])

  const loadAdminData = async () => {
    setIsLoading(true)
    try {
      const [usersRes, subscriptionsRes, metricsRes] = await Promise.all([
        fetch('/api/admin/users', {
          headers: { 'Authorization': `Bearer ${user.id}` }
        }),
        fetch('/api/admin/subscriptions', {
          headers: { 'Authorization': `Bearer ${user.id}` }
        }),
        fetch('/api/admin/metrics', {
          headers: { 'Authorization': `Bearer ${user.id}` }
        })
      ])

      if (usersRes.ok) {
        const usersData = await usersRes.json()
        setUsers(usersData)
      }

      if (subscriptionsRes.ok) {
        const subscriptionsData = await subscriptionsRes.json()
        setSubscriptions(subscriptionsData)
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        setSystemMetrics(metricsData)
      }
    } catch (error) {
      console.error('Failed to load admin data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter
    
    return matchesSearch && matchesRole && matchesStatus
  })

  const handleUserAction = async (userId: string, action: 'suspend' | 'ban' | 'activate' | 'delete') => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify({ action })
      })

      if (response.ok) {
        await loadAdminData()
      }
    } catch (error) {
      console.error('Failed to perform user action:', error)
    }
  }

  const handleBulkAction = async (action: 'suspend' | 'ban' | 'activate' | 'delete') => {
    try {
      const response = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`
        },
        body: JSON.stringify({
          userIds: Array.from(selectedUsers),
          action
        })
      })

      if (response.ok) {
        setSelectedUsers(new Set())
        await loadAdminData()
      }
    } catch (error) {
      console.error('Failed to perform bulk action:', error)
    }
  }

  const exportData = async (type: 'users' | 'subscriptions' | 'metrics') => {
    try {
      const response = await fetch(`/api/admin/export/${type}`, {
        headers: { 'Authorization': `Bearer ${user.id}` }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${type}-export-${Date.now()}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to export data:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'suspended': return 'bg-yellow-500'
      case 'banned': return 'bg-red-500'
      case 'past_due': return 'bg-orange-500'
      case 'cancelled': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-purple-500'
      case 'ADMIN': return 'bg-blue-500'
      case 'USER': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-12">
            <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You don't have permission to access the admin dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading admin dashboard...</p>
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
              <h1 className="text-3xl font-bold tracking-tighter">Admin Dashboard</h1>
              <p className="text-muted-foreground mt-2">
                Manage users, subscriptions, and system settings
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadAdminData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => exportData('users')}>
                <Download className="h-4 w-4 mr-2" />
                Export Users
              </Button>
            </div>
          </div>
        </div>

        {/* System Overview */}
        {systemMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.totalUsers}</div>
                <p className="text-xs text-muted-foreground">
                  {systemMetrics.activeUsers} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.activeSubscriptions}</div>
                <p className="text-xs text-muted-foreground">
                  of {systemMetrics.totalSubscriptions} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(systemMetrics.monthlyRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(systemMetrics.totalRevenue)} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Health</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(systemMetrics.uptime * 100).toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {systemMetrics.responseTime}ms response time
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            {/* User Controls */}
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage user accounts, roles, and permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="USER">Users</SelectItem>
                      <SelectItem value="ADMIN">Admins</SelectItem>
                      <SelectItem value="SUPER_ADMIN">Super Admins</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="banned">Banned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedUsers.size > 0 && (
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <span className="text-sm font-medium">
                      {selectedUsers.size} user{selectedUsers.size > 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkAction('activate')}
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Activate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkAction('suspend')}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Suspend
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleBulkAction('delete')}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Users List */}
            <Card>
              <CardHeader>
                <CardTitle>Users ({filteredUsers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {filteredUsers.map((user) => (
                      <div key={user.id} className="border rounded-lg p-4 hover:bg-muted/50">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <Checkbox
                              checked={selectedUsers.has(user.id)}
                              onCheckedChange={(checked) => {
                                const newSelection = new Set(selectedUsers)
                                if (checked) {
                                  newSelection.add(user.id)
                                } else {
                                  newSelection.delete(user.id)
                                }
                                setSelectedUsers(newSelection)
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{user.name}</span>
                                <Badge variant="outline" className={`text-white ${getRoleColor(user.role)}`}>
                                  {user.role}
                                </Badge>
                                <Badge variant="outline" className={`text-white ${getStatusColor(user.status)}`}>
                                  {user.status}
                                </Badge>
                                {user.subscriptionPlan && (
                                  <Badge variant="secondary">
                                    {user.subscriptionPlan}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mb-2">
                                <Mail className="h-3 w-3 inline mr-1" />
                                {user.email}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground">
                                <div>
                                  <div className="font-medium text-foreground">{user.searches}</div>
                                  <div>Searches</div>
                                </div>
                                <div>
                                  <div className="font-medium text-foreground">{user.messages}</div>
                                  <div>Messages</div>
                                </div>
                                <div>
                                  <div className="font-medium text-foreground">{formatCurrency(user.revenue)}</div>
                                  <div>Revenue</div>
                                </div>
                                <div>
                                  <div className="font-medium text-foreground">{formatDate(user.lastActive)}</div>
                                  <div>Last Active</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {user.status === 'active' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUserAction(user.id, 'suspend')}
                                className="text-yellow-600"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUserAction(user.id, 'activate')}
                                className="text-green-600"
                              >
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUserAction(user.id, 'delete')}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Management</CardTitle>
                <CardDescription>
                  Monitor and manage user subscriptions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {subscriptions.map((sub) => (
                      <div key={sub.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{sub.userName}</span>
                              <Badge variant="outline" className={`text-white ${getStatusColor(sub.status)}`}>
                                {sub.status}
                              </Badge>
                              <Badge variant="secondary">{sub.plan}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mb-2">
                              <Mail className="h-3 w-3 inline mr-1" />
                              {sub.userEmail}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
                              <div>
                                <div className="font-medium text-foreground">{formatCurrency(sub.amount)}</div>
                                <div>Amount</div>
                              </div>
                              <div>
                                <div className="font-medium text-foreground">{formatDate(sub.currentPeriodEnd)}</div>
                                <div>Next Billing</div>
                              </div>
                              <div>
                                <div className="font-medium text-foreground">{formatDate(sub.createdAt)}</div>
                                <div>Started</div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            {systemMetrics && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>System Health</CardTitle>
                    <CardDescription>
                      Current system performance and metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{(systemMetrics.uptime * 100).toFixed(1)}%</div>
                        <div className="text-sm text-muted-foreground">Uptime</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold">{systemMetrics.responseTime}ms</div>
                        <div className="text-sm text-muted-foreground">Response Time</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold">{(systemMetrics.errorRate * 100).toFixed(2)}%</div>
                        <div className="text-sm text-muted-foreground">Error Rate</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold">{systemMetrics.activeConnections}</div>
                        <div className="text-sm text-muted-foreground">Active Connections</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {systemMetrics.recentAlerts.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {systemMetrics.recentAlerts.map((alert) => (
                          <Alert key={alert.id} className={alert.resolved ? 'border-green-200' : ''}>
                            <AlertTriangle className={`h-4 w-4 ${alert.type === 'error' ? 'text-red-500' : alert.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`} />
                            <AlertDescription>
                              <div className="flex items-center justify-between">
                                <span>{alert.message}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(alert.timestamp).toLocaleString()}
                                  </span>
                                  {alert.resolved && (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  )}
                                </div>
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Admin Settings</CardTitle>
                <CardDescription>
                  Configure system-wide settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="text-center text-muted-foreground">
                    <Settings className="h-12 w-12 mx-auto mb-2" />
                    <p>Admin settings panel would be implemented here</p>
                    <p className="text-sm">Include system configuration, API keys, email settings, etc.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}