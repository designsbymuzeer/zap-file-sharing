// backend/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// --- Server Setup ---
const app = express();
app.use(cors()); // Enable CORS for all routes

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity. For production, restrict this to your frontend's URL.
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8, // 100 MB
});

// --- In-Memory State Management ---
// In a real-world app, you might use a database like Redis for this.
let users = {}; // Store { socketId: { nickname: '...' } }

// --- Socket.io Connection Handling ---
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Event: When a user joins with a nickname
  socket.on('user-joined', (nickname) => {
    users[socket.id] = { nickname };
    console.log(`👋 ${nickname} (${socket.id}) joined the room.`);
    // Broadcast the updated user list to all clients
    io.emit('update-user-list', Object.keys(users).map(id => ({ id, ...users[id] })));
  });

  // Event: When a user updates their nickname
  socket.on('update-nickname', (newNickname) => {
    if (users[socket.id]) {
      const oldNickname = users[socket.id].nickname;
      users[socket.id].nickname = newNickname;
      console.log(`✏️ ${oldNickname} changed nickname to ${newNickname}`);
      io.emit('update-user-list', Object.keys(users).map(id => ({ id, ...users[id] })));
    }
  });

  // --- WebRTC Signaling Events ---

  // Event: A user initiates a file transfer request
  socket.on('file-request', (data) => {
    const { to, from, file } = data;
    const senderNickname = users[from]?.nickname || 'A user';
    console.log(`📩 File request from ${senderNickname} to ${users[to]?.nickname}`);
    // Forward the request to the target user
    io.to(to).emit('file-request', { from, senderNickname, file });
  });

  // Event: The receiver accepts the file transfer
  socket.on('file-accept', (data) => {
    const { to } = data;
    console.log(`✅ File accepted by ${users[socket.id]?.nickname}`);
    // Notify the original sender that the request was accepted
    io.to(to).emit('file-accept', { from: socket.id });
  });

  // Event: The receiver rejects the file transfer
  socket.on('file-reject', (data) => {
    const { to } = data;
    console.log(`❌ File rejected by ${users[socket.id]?.nickname}`);
    // Notify the original sender that the request was rejected
    io.to(to).emit('file-reject', { from: socket.id });
  });

  // Event: Forward WebRTC offer
  socket.on('webrtc-offer', (data) => {
    const { to, offer } = data;
    console.log(`Offer from ${users[socket.id]?.nickname} to ${users[to]?.nickname}`);
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  // Event: Forward WebRTC answer
  socket.on('webrtc-answer', (data) => {
    const { to, answer } = data;
    console.log(`Answer from ${users[socket.id]?.nickname} to ${users[to]?.nickname}`);
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  // Event: Forward ICE candidates
  socket.on('webrtc-ice-candidate', (data) => {
    const { to, candidate } = data;
    // console.log(`ICE candidate from ${socket.id} to ${to}`); // Can be very noisy
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // --- Disconnection Handling ---
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    if (users[socket.id]) {
      console.log(`👋 ${users[socket.id].nickname} left the room.`);
      delete users[socket.id];
      // Broadcast the updated user list to all remaining clients
      io.emit('update-user-list', Object.keys(users).map(id => ({ id, ...users[id] })));
    }
  });
});

// --- Start the Server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

// --- Backend package.json ---
/*
{
  "name": "zap-backend",
  "version": "1.0.0",
  "description": "Backend for Zap file sharing app",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  }
}
*/
