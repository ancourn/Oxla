import { Server } from 'socket.io';

export const setupSocket = (io: Server) => {
  // Chat rooms management
  const chatRooms = new Map<string, Set<string>>();
  
  // Online users management
  const onlineUsers = new Map<string, { username: string; avatar?: string; lastSeen: number }>();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle joining a chat room
    socket.on('join_room', (data: { room: string; username: string; avatar?: string }) => {
      const { room, username, avatar } = data;
      
      // Join the room
      socket.join(room);
      
      // Initialize room if not exists
      if (!chatRooms.has(room)) {
        chatRooms.set(room, new Set());
      }
      
      // Add user to room
      chatRooms.get(room)?.add(socket.id);
      
      // Track online user
      onlineUsers.set(socket.id, { username, avatar, lastSeen: Date.now() });
      
      // Notify room that user joined
      socket.to(room).emit('user_joined', {
        userId: socket.id,
        username,
        avatar,
        timestamp: new Date().toISOString(),
      });
      
      // Send current room users list
      const roomUsers = Array.from(chatRooms.get(room) || []).map(socketId => ({
        userId: socketId,
        ...onlineUsers.get(socketId),
      }));
      
      socket.emit('room_users', { room, users: roomUsers });
    });

    // Handle leaving a chat room
    socket.on('leave_room', (data: { room: string }) => {
      const { room } = data;
      
      // Leave the room
      socket.leave(room);
      
      // Remove user from room
      chatRooms.get(room)?.delete(socket.id);
      
      // Notify room that user left
      socket.to(room).emit('user_left', {
        userId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle chat messages
    socket.on('chat_message', (data: { room: string; message: string; username: string; avatar?: string }) => {
      const { room, message, username, avatar } = data;
      
      // Broadcast message to room
      io.to(room).emit('chat_message', {
        userId: socket.id,
        username,
        avatar,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle typing indicators
    socket.on('typing_start', (data: { room: string; username: string }) => {
      const { room, username } = data;
      
      // Broadcast typing indicator to room
      socket.to(room).emit('typing_start', {
        userId: socket.id,
        username,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('typing_stop', (data: { room: string; username: string }) => {
      const { room, username } = data;
      
      // Broadcast typing stop indicator to room
      socket.to(room).emit('typing_stop', {
        userId: socket.id,
        username,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle private messages
    socket.on('private_message', (data: { targetUserId: string; message: string; username: string; avatar?: string }) => {
      const { targetUserId, message, username, avatar } = data;
      
      // Send private message to target user
      io.to(targetUserId).emit('private_message', {
        userId: socket.id,
        username,
        avatar,
        message,
        timestamp: new Date().toISOString(),
      });
      
      // Send copy to sender
      socket.emit('private_message', {
        userId: targetUserId,
        username: 'System',
        message: `Private message sent to ${targetUserId}`,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle room list request
    socket.on('get_rooms', () => {
      const roomsList = Array.from(chatRooms.keys()).map(room => ({
        room,
        usersCount: chatRooms.get(room)?.size || 0,
      }));
      
      socket.emit('rooms_list', { rooms: roomsList });
    });

    // Handle online users request
    socket.on('get_online_users', () => {
      const onlineUsersList = Array.from(onlineUsers.entries()).map(([userId, userData]) => ({
        userId,
        ...userData,
      }));
      
      socket.emit('online_users', { users: onlineUsersList });
    });

    // Handle generic messages (backward compatibility)
    socket.on('message', (msg: { text: string; senderId: string }) => {
      // Echo: broadcast message only to the client who send the message
      socket.emit('message', {
        text: `Echo: ${msg.text}`,
        senderId: 'system',
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      // Remove from all rooms
      for (const [room, users] of chatRooms.entries()) {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          socket.to(room).emit('user_left', {
            userId: socket.id,
            timestamp: new Date().toISOString(),
          });
        }
      }
      
      // Remove from online users
      onlineUsers.delete(socket.id);
    });

    // Send welcome message
    socket.emit('message', {
      text: 'Welcome to WebSocket Real-time Server!',
      senderId: 'system',
      timestamp: new Date().toISOString(),
    });
  });
};