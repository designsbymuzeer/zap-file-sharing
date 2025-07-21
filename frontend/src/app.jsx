// frontend/src/App.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { User, File, Send, X, Settings, ChevronRight, HardDrive, AlertCircle, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react';

// --- Constants ---
// This line is crucial for deployment. Vercel will inject the VITE_SERVER_URL environment variable during the build process.
// For local development, it falls back to 'http://localhost:5000'.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const CHUNK_SIZE = 64 * 1024; // 64KB

// --- Animal Nicknames Data ---
const animals = [
  { name: 'Lion', emoji: '🦁' },
  { name: 'Tiger', emoji: '🐯' },
  { name: 'Bear', emoji: '🐻' },
  { name: 'Panda', emoji: '🐼' },
  { name: 'Fox', emoji: '🦊' },
  { name: 'Wolf', emoji: '🐺' },
  { name: 'Cat', emoji: '🐱' },
  { name: 'Dog', emoji: '🐶' },
  { name: 'Dolphin', emoji: '🐬' },
  { name: 'Whale', emoji: '🐳' },
  { name: 'Octopus', emoji: '🐙' },
  { name: 'Squid', emoji: '🦑' },
  { name: 'Eagle', emoji: '🦅' },
  { name: 'Owl', emoji: '🦉' },
  { name: 'Unicorn', emoji: '🦄' },
  { name: 'Dragon', emoji: '🐲' },
];

// --- Helper function to get a random animal ---
const getRandomAnimal = () => {
  return animals[Math.floor(Math.random() * animals.length)];
};

// --- Helper Functions ---
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// --- Main App Component ---
export default function App() {
  // --- State Management ---
  const [socket, setSocket] = useState(null);
  const [nickname, setNickname] = useState(getRandomAnimal());
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  
  // Transfer-related state
  const [transferState, setTransferState] = useState({
    status: 'idle', // 'requesting', 'accepted', 'rejected', 'sending', 'receiving', 'completed', 'error'
    progress: 0,
    from: null,
    to: null,
    file: null,
    senderNickname: '',
  });

  // --- Refs ---
  const peerConnection = useRef(null);
  const fileReader = useRef(null);
  const receivedData = useRef([]);
  const receivedSize = useRef(0);
  const fileInputRef = useRef(null);

  // --- Utility Functions ---
  const addLog = useCallback((message, type = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
  }, []);

  // --- Socket.io Connection ---
  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      addLog(`Connected to server with ID: ${newSocket.id}`, 'success');
      newSocket.emit('user-joined', nickname);
    });

    newSocket.on('disconnect', () => {
      addLog('Disconnected from server', 'error');
    });

    return () => newSocket.disconnect();
  }, [addLog, nickname]);

  // --- WebRTC Peer Connection Management ---
  const createPeerConnection = useCallback(() => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && transferState.to) {
          socket.emit('webrtc-ice-candidate', { to: transferState.to, candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        addLog(`ICE connection state: ${pc.iceConnectionState}`);
      };

      peerConnection.current = pc;
      return pc;
    } catch (error) {
      addLog(`Failed to create PeerConnection: ${error.message}`, 'error');
      setTransferState(prev => ({ ...prev, status: 'error', file: null }));
      return null;
    }
  }, [socket, transferState.to, addLog]);

  // --- File Transfer Logic ---
  const sendFile = useCallback((file, targetSocketId) => {
    if (!socket) return;
    setTransferState({ status: 'requesting', progress: 0, to: targetSocketId, from: socket.id, file });
    socket.emit('file-request', {
      to: targetSocketId,
      from: socket.id,
      file: { name: file.name, size: file.size, type: file.type }
    });
    addLog(`Sent file request for ${file.name} to ${users.find(u => u.id === targetSocketId)?.nickname}`, 'info');
  }, [socket, users, addLog]);

  const handleFileChunk = useCallback((pc) => {
    const dataChannel = pc.createDataChannel('file-transfer');
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
      addLog('Data channel opened. Starting file transfer.', 'success');
      setTransferState(prev => ({...prev, status: 'sending'}));
      fileReader.current = new FileReader();
      let offset = 0;

      fileReader.current.onload = (e) => {
        if (!e.target.result) return;
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        const progress = Math.round((offset / selectedFile.size) * 100);
        setTransferState(prev => ({ ...prev, progress }));

        if (offset < selectedFile.size) {
          readSlice(offset);
        } else {
          addLog('File sent successfully!', 'success');
          setTransferState(prev => ({ ...prev, status: 'completed' }));
          setTimeout(() => resetTransferState(), 3000);
        }
      };
      
      const readSlice = (o) => {
        const slice = selectedFile.slice(o, o + CHUNK_SIZE);
        fileReader.current.readAsArrayBuffer(slice);
      };
      readSlice(0);
    };

    dataChannel.onclose = () => {
      addLog('Data channel closed.', 'info');
    };
    
    dataChannel.onerror = (error) => {
      addLog(`Data channel error: ${error}`, 'error');
      setTransferState({ status: 'error', file: null });
    };

  }, [selectedFile, addLog]);

  const resetTransferState = () => {
    setTransferState({ status: 'idle', progress: 0, from: null, to: null, file: null, senderNickname: '' });
    setSelectedFile(null);
    setSelectedUser(null);
    receivedData.current = [];
    receivedSize.current = 0;
    if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
    }
  };

  // --- Socket Event Handlers ---
  useEffect(() => {
    if (!socket) return;

    const handleUpdateUserList = (userList) => {
      setUsers(userList);
      addLog('User list updated.');
    };

    const handleFileRequest = ({ from, senderNickname, file }) => {
      setTransferState({ status: 'receiving', progress: 0, from, to: socket.id, file, senderNickname });
      addLog(`Incoming file request from ${senderNickname} for ${file.name}`, 'info');
    };

    const handleFileAccept = async ({ from }) => {
      addLog(`${users.find(u => u.id === from)?.nickname} accepted the file.`, 'success');
      setTransferState(prev => ({ ...prev, status: 'accepted', to: from }));
      const pc = createPeerConnection();
      if (pc) {
        handleFileChunk(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { to: from, offer });
      }
    };
    
    const handleFileReject = ({ from }) => {
      addLog(`${users.find(u => u.id === from)?.nickname} rejected the file.`, 'error');
      resetTransferState();
    };

    const handleWebRTCOffer = async ({ from, offer }) => {
      addLog(`Received WebRTC offer from ${users.find(u => u.id === from)?.nickname}`, 'info');
      const pc = createPeerConnection();
      if (pc) {
        pc.ondatachannel = (event) => {
          const receiveChannel = event.channel;
          receiveChannel.binaryType = 'arraybuffer';
          receiveChannel.onmessage = (e) => {
            receivedData.current.push(e.data);
            receivedSize.current += e.data.byteLength;
            const progress = Math.round((receivedSize.current / transferState.file.size) * 100);
            setTransferState(prev => ({...prev, progress}));

            if (receivedSize.current === transferState.file.size) {
              const blob = new Blob(receivedData.current, { type: transferState.file.type });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = transferState.file.name;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              a.remove();
              addLog('File received successfully!', 'success');
              setTransferState(prev => ({ ...prev, status: 'completed' }));
              setTimeout(() => resetTransferState(), 3000);
            }
          };
        };
        setTransferState(prev => ({...prev, to: from}));
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { to: from, answer });
      }
    };
    
    const handleWebRTCAnswer = async ({ answer }) => {
      addLog('Received WebRTC answer.', 'info');
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleWebRTCIceCandidate = async ({ candidate }) => {
      if (peerConnection.current) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          addLog(`Error adding received ICE candidate: ${e}`, 'error');
        }
      }
    };

    socket.on('update-user-list', handleUpdateUserList);
    socket.on('file-request', handleFileRequest);
    socket.on('file-accept', handleFileAccept);
    socket.on('file-reject', handleFileReject);
    socket.on('webrtc-offer', handleWebRTCOffer);
    socket.on('webrtc-answer', handleWebRTCAnswer);
    socket.on('webrtc-ice-candidate', handleWebRTCIceCandidate);

    return () => {
      socket.off('update-user-list', handleUpdateUserList);
      socket.off('file-request', handleFileRequest);
      socket.off('file-accept', handleFileAccept);
      socket.off('file-reject', handleFileReject);
      socket.off('webrtc-offer', handleWebRTCOffer);
      socket.off('webrtc-answer', handleWebRTCAnswer);
      socket.off('webrtc-ice-candidate', handleWebRTCIceCandidate);
    };
  }, [socket, addLog, createPeerConnection, handleFileChunk, transferState.file, users]);

  // --- UI Event Handlers ---
  /*const handleNicknameChange = (e) => {
    if (e.key === 'Enter') {
      socket.emit('update-nickname', nickname);
      setIsEditingNickname(false);
      addLog(`Nickname changed to ${nickname}`, 'success');
    }
  };*/

  const handleFileSelect = (files) => {
    if (files && files[0]) {
      const file = files[0];
      setSelectedFile(file);
      addLog(`Selected file: ${file.name} (${formatBytes(file.size)})`);
    }
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleAcceptFile = () => {
    socket.emit('file-accept', { to: transferState.from });
    addLog('Accepted file transfer.', 'success');
  };

  const handleRejectFile = () => {
    socket.emit('file-reject', { to: transferState.from });
    addLog('Rejected file transfer.', 'error');
    resetTransferState();
  };

  // --- Render ---
  const otherUsers = users.filter(user => user.id !== socket?.id);

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-72 h-72 bg-blue-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-pink-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <main className="w-full max-w-4xl mx-auto bg-gray-900/50 backdrop-blur-xl rounded-2xl shadow-2xl z-10 border border-gray-700/50">
        {/* Header */}
        <header className="p-4 sm:p-6 border-b border-gray-700/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
              <Send className="text-blue-400 w-8 h-8" />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tighter text-gray-100">Zap</h1>
          </div>
          <div className="flex items-center gap-4">
            
          <div className="flex items-center gap-2 bg-slate-700/50 pl-2 pr-3 py-1.5 rounded-lg text-sm">
  <span className="text-lg">{nickname.emoji}</span>
  {isEditingNickname ? (
    <input
      type="text"
      value={nickname.name}
      onChange={(e) => setNickname({ ...nickname, name: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          socket.emit('update-nickname', nickname);
          setIsEditingNickname(false);
        }
      }}
      onBlur={() => {
        socket.emit('update-nickname', nickname);
        setIsEditingNickname(false);
      }}
      className="bg-transparent focus:outline-none w-24 text-slate-200"
      autoFocus
    />
  ) : (
    <span onClick={() => setIsEditingNickname(true)} className="cursor-pointer font-medium text-slate-200">{nickname.name}</span>
  )}
</div>


            <button onClick={() => setShowDebug(!showDebug)} className="p-2 rounded-lg hover:bg-gray-700/50 transition-colors">
              <Settings className={`w-5 h-5 transition-transform duration-300 ${showDebug ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="grid md:grid-cols-2">
          {/* Left Panel: Users */}
          <div className="p-4 sm:p-6 border-b md:border-b-0 md:border-r border-gray-700/50">
            <h2 className="text-lg font-semibold mb-4 text-gray-300">Connected Devices</h2>
            <div className="space-y-3 h-64 overflow-y-auto pr-2">
              {otherUsers.length > 0 ? (
                otherUsers.map(user => (
                  <motion.div
                    key={user.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    onClick={() => setSelectedUser(user)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 ${selectedUser?.id === user.id ? 'bg-blue-500/20 ring-2 ring-blue-500' : 'bg-gray-800/60 hover:bg-gray-700/80'}`}
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <span className="font-medium">{user.nickname}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  </motion.div>
                ))
              ) : (
                <div className="text-center text-gray-500 pt-10">No other devices found.</div>
              )}
            </div>
          </div>

          {/* Right Panel: File Upload */}
          <div className="p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-300">Share a File</h2>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-800/50 transition-all"
            >
              <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e.target.files)} className="hidden" />
              <HardDrive className="w-12 h-12 mx-auto text-gray-500 mb-4" />
              {selectedFile ? (
                <div>
                  <p className="font-semibold text-gray-200">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400">{formatBytes(selectedFile.size)}</p>
                </div>
              ) : (
                <p className="text-gray-400">Drag & drop a file here, or click to select</p>
              )}
            </div>
            <button
              onClick={() => sendFile(selectedFile, selectedUser.id)}
              disabled={!selectedFile || !selectedUser || transferState.status !== 'idle'}
              className="w-full mt-4 bg-blue-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-500 transition-all disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
              Send to {selectedUser?.nickname || '...'}
            </button>
          </div>
        </div>

        {/* Debug Console */}
        <AnimatePresence>
          {showDebug && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 border-t border-gray-700/50 bg-gray-900/30">
                <h3 className="font-semibold mb-2">Debug Log</h3>
                <div className="h-32 bg-black/30 rounded-md p-2 overflow-y-auto text-xs font-mono">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                      <span>{log.time}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals and Overlays */}
      <AnimatePresence>
        {transferState.status === 'receiving' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-gray-700"
            >
              <File className="w-16 h-16 mx-auto text-blue-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Incoming File</h2>
              <p className="text-gray-300 mb-4">
                <span className="font-bold text-white">{transferState.senderNickname}</span> wants to send you a file.
              </p>
              <div className="bg-gray-900/50 rounded-lg p-4 mb-6 text-left">
                <p><strong>File:</strong> {transferState.file.name}</p>
                <p><strong>Size:</strong> {formatBytes(transferState.file.size)}</p>
                <p><strong>Type:</strong> {transferState.file.type}</p>
              </div>
              <div className="flex gap-4">
                <button onClick={handleRejectFile} className="flex-1 bg-red-600/80 hover:bg-red-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <X /> Reject
                </button>
                <button onClick={handleAcceptFile} className="flex-1 bg-green-600/80 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <CheckCircle /> Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(transferState.status === 'sending' || transferState.status === 'requesting' || transferState.status === 'accepted') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-gray-700"
            >
              <ArrowUp className="w-16 h-16 mx-auto text-blue-400 mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold mb-2">
                {transferState.status === 'sending' ? 'Sending File...' : 'Requesting Transfer...'}
              </h2>
              <p className="text-gray-300 mb-4">
                {transferState.status === 'requesting' && `Waiting for ${users.find(u => u.id === transferState.to)?.nickname} to accept...`}
                {transferState.status === 'accepted' && `Connecting...`}
                {transferState.status === 'sending' && `Sending ${transferState.file.name}`}
              </p>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <motion.div
                  className="bg-blue-500 h-2.5 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${transferState.progress}%` }}
                  transition={{ duration: 0.2, ease: 'linear' }}
                />
              </div>
              <p className="text-sm mt-2 text-gray-400">{transferState.progress}%</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {transferState.status === 'completed' && (
           <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-gray-700"
            >
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Transfer Complete!</h2>
            </motion.div>
          </motion.div>
        )}
        {transferState.status === 'rejected' || transferState.status === 'error' && (
           <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-gray-700"
            >
              <AlertCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Transfer Failed</h2>
              <p className="text-gray-400">{transferState.status === 'rejected' ? 'The user rejected the file.' : 'An error occurred.'}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// --- Frontend package.json ---
/*
{
  "name": "zap-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "framer-motion": "^10.16.4",
    "lucide-react": "^0.292.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "socket.io-client": "^4.7.2"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.53.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.4",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "vite": "^5.0.0"
  }
}
*/

// --- index.css for Tailwind ---
/*
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.animation-delay-2000 {
  animation-delay: 2s;
}
.animation-delay-4000 {
  animation-delay: 4s;
}

@keyframes blob {
  0% {
    transform: translate(0px, 0px) scale(1);
  }
  33% {
    transform: translate(30px, -50px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
  100% {
    transform: translate(0px, 0px) scale(1);
  }
}
*/
