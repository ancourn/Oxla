'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Send, 
  Users, 
  MessageCircle, 
  MoreVertical, 
  Phone, 
  Video,
  Paperclip,
  Smile,
  ThumbsUp
} from 'lucide-react'
import { io, Socket } from 'socket.io-client'

interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName?: string
  senderImage?: string
  timestamp: Date
  roomId: string
}

interface User {
  userId: string
  userName: string
}

interface ChatComponentProps {
  user: {
    id: string
    name?: string
    image?: string
  }
  roomId: string
  roomName?: string
}

export function ChatComponent({ user, roomId, roomName = 'General Chat' }: ChatComponentProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize socket connection
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
      transports: ['websocket', 'polling']
    })

    setSocket(socketInstance)

    // Connection events
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to socket server')
      
      // Authenticate user
      socketInstance.emit('authenticate', {
        userId: user.id,
        userName: user.name
      })
    })

    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      console.log('Disconnected from socket server')
    })

    // Authentication response
    socketInstance.on('authenticated', (data) => {
      if (data.success) {
        // Join the room
        socketInstance.emit('join_room', {
          roomId,
          userId: user.id
        })
      }
    })

    // Room events
    socketInstance.on('room_history', (data) => {
      setMessages(data.messages || [])
    })

    socketInstance.on('new_message', (message: ChatMessage) => {
      setMessages(prev => [...prev, message])
    })

    socketInstance.on('user_joined', (data) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        text: `${data.userName} joined the chat`,
        senderId: 'system',
        timestamp: new Date(data.timestamp),
        roomId
      }])
    })

    socketInstance.on('user_left', (data) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        text: `${data.userName} left the chat`,
        senderId: 'system',
        timestamp: new Date(data.timestamp),
        roomId
      }])
    })

    // Typing indicators
    socketInstance.on('user_typing', (data) => {
      setTypingUsers(prev => {
        if (data.isTyping) {
          return [...prev.filter(u => u !== data.userId), data.userId]
        } else {
          return prev.filter(u => u !== data.userId)
        }
      })
    })

    // Online users
    socketInstance.on('online_users', (users: User[]) => {
      setOnlineUsers(users)
    })

    // System messages
    socketInstance.on('system_message', (message: ChatMessage) => {
      setMessages(prev => [...prev, message])
    })

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect()
    }
  }, [user.id, user.name, roomId])

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    // Handle typing indicator timeout
    let typingTimeout: NodeJS.Timeout
    if (isTyping) {
      typingTimeout = setTimeout(() => {
        setIsTyping(false)
        socket?.emit('typing', {
          roomId,
          userId: user.id,
          isTyping: false
        })
      }, 1000)
    }
    return () => clearTimeout(typingTimeout)
  }, [isTyping, socket, user.id, roomId])

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socket) return

    const messageData = {
      text: newMessage.trim(),
      roomId,
      userId: user.id
    }

    socket.emit('send_message', messageData)
    setNewMessage('')
    setIsTyping(false)
    
    // Clear typing indicator
    socket.emit('typing', {
      roomId,
      userId: user.id,
      isTyping: false
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNewMessage(value)
    
    if (value.trim() && !isTyping) {
      setIsTyping(true)
      socket?.emit('typing', {
        roomId,
        userId: user.id,
        isTyping: true
      })
    }
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const getInitials = (name?: string) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-80 border-r bg-card">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{roomName}</h2>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? 'Online' : 'Offline'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {onlineUsers.length} users
            </span>
          </div>
        </div>

        {/* Online Users */}
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Online Users
          </h3>
          <div className="space-y-2">
            {onlineUsers.map((onlineUser) => (
              <div key={onlineUser.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={onlineUser.userId === user.id ? user.image : undefined} />
                    <AvatarFallback>
                      {getInitials(onlineUser.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {onlineUser.userName}
                    {onlineUser.userId === user.id && ' (You)'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5" />
            <div>
              <h1 className="font-semibold">{roomName}</h1>
              <p className="text-sm text-muted-foreground">
                {onlineUsers.length} participants
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Video className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.senderId === user.id ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.senderId !== user.id && message.senderId !== 'system' && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={message.senderImage} />
                      <AvatarFallback>
                        {getInitials(message.senderName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  
                  <div className={`max-w-xs lg:max-w-md ${
                    message.senderId === user.id ? 'order-1' : ''
                  }`}>
                    {message.senderId !== 'system' && message.senderId !== user.id && (
                      <p className="text-xs text-muted-foreground mb-1">
                        {message.senderName}
                      </p>
                    )}
                    
                    <div
                      className={`rounded-lg px-3 py-2 ${
                        message.senderId === 'system'
                          ? 'bg-muted text-muted-foreground text-sm'
                          : message.senderId === user.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                  
                  {message.senderId === user.id && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={user.image} />
                      <AvatarFallback>
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              
              {/* Typing indicators */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>
                    {typingUsers.length === 1
                      ? `${onlineUsers.find(u => u.userId === typingUsers[0])?.userName || 'Someone'} is typing`
                      : `${typingUsers.length} people are typing`
                    }
                  </span>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm">
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="flex-1 relative">
              <textarea
                value={newMessage}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] max-h-32"
                rows={1}
              />
              <Button variant="ghost" size="sm" className="absolute right-2 bottom-2">
                <Smile className="h-4 w-4" />
              </Button>
            </div>
            <Button 
              onClick={handleSendMessage} 
              disabled={!newMessage.trim() || !isConnected}
              size="sm"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <Button variant="ghost" size="sm" className="text-xs">
              <ThumbsUp className="h-3 w-3 mr-1" />
              React
            </Button>
            <span className="text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}