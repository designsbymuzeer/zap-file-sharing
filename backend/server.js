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
let users = {}; // Store { socketId: { nickname: { name: 'Lion', emoji: '🦁' } } }

// --- Socket.io Connection Handling ---
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Event: When a user joins with a nickname object
  socket.on('user-joined', (nickname) => {
    // *** FIX: Ensure nickname is an object with a name property ***
    if (nickname && typeof nickname === 'object' && nickname.name) {
      users[socket.id] = { nickname };
      console.log(`👋 ${nickname.name} (${socket.id}) joined the room.`);
      // Broadcast the updated user list to all clients
      io.emit('update-user-list', Object.keys(users).map(id => ({ id, ...users[id] })));
    } else {
      console.log(`Invalid nickname received from ${socket.id}`);
    }
  });

  // Event: When a user updates their nickname object
  socket.on('update-nickname', (newNickname) => {
    if (users[socket.id] && newNickname && typeof newNickname === 'object' && newNickname.name) {
      const oldNickname = users[socket.id].nickname;
      users[socket.id].nickname = newNickname;
      // *** FIX: Log the name property of the nickname object ***
      console.log(`✏️ ${oldNickname.name} changed nickname to ${newNickname.name}`);
      io.emit('update-user-list', Object.keys(users).map(id => ({ id, ...users[id] })));
    }
  });

  // --- WebRTC Signaling Events ---

  // Event: A user initiates a file transfer request
  socket.on('file-request', (data) => {
    const { to, from, file } = data;
    // *** FIX: Access the name property for logging ***
    const senderNickname = users[from]?.nickname?.name || 'A user';
    const receiverNickname = users[to]?.nickname?.name || 'another user';
    console.log(`📩 File request from ${senderNickname} to ${receiverNickname}`);
    // Forward the request to the target user, sending the full nickname object
    io.to(to).emit('file-request', { from, senderNickname: users[from]?.nickname, file });
  });

  // Event: The receiver accepts the file transfer
  socket.on('file-accept', (data) => {
    const { to } = data;
    // *** FIX: Access the name property for logging ***
    console.log(`✅ File accepted by ${users[socket.id]?.nickname?.name}`);
    // Notify the original sender that the request was accepted
    io.to(to).emit('file-accept', { from: socket.id });
  });

  // Event: The receiver rejects the file transfer
  socket.on('file-reject', (data) => {
    const { to } = data;
     // *** FIX: Access the name property for logging ***
    console.log(`❌ File rejected by ${users[socket.id]?.nickname?.name}`);
    // Notify the original sender that the request was rejected
    io.to(to).emit('file-reject', { from: socket.id });
  });

  // Event: Forward WebRTC offer
  socket.on('webrtc-offer', (data) => {
    const { to, offer } = data;
    // *** FIX: Access the name property for logging ***
    console.log(`Offer from ${users[socket.id]?.nickname?.name} to ${users[to]?.nickname?.name}`);
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  // Event: Forward WebRTC answer
  socket.on('webrtc-answer', (data) => {
    const { to, answer } = data;
    // *** FIX: Access the name property for logging ***
    console.log(`Answer from ${users[socket.id]?.nickname?.name} to ${users[to]?.nickname?.name}`);
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  // Event: Forward ICE candidates
  socket.on('webrtc-ice-candidate', (data) => {
    const { to, candidate } = data;
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // --- Disconnection Handling ---
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    if (users[socket.id] && users[socket.id].nickname) {
       // *** FIX: Access the name property for logging ***
      console.log(`👋 ${users[socket.id].nickname.name} left the room.`);
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
