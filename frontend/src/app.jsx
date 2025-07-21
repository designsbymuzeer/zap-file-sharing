// frontend/src/App.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { User, File, Send, X, Settings, ChevronRight, HardDrive, AlertCircle, CheckCircle, ArrowUp, ArrowDown, Wifi, Loader } from 'lucide-react';

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

// --- Constants ---
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const CHUNK_SIZE = 64 * 1024; // 64KB

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
  const [nickname, setNickname] = useState(() => getRandomAnimal()); // Use function form to run only once
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  
  // Transfer-related state
  const [transferState, setTransferState] = useState({
    status: 'idle', // 'requesting', 'accepted', 'rejected', 'sending', 'receiving', 'connecting', 'completed', 'error'
    progress: 0,
    from: null,
    to: null,
    file: null,
    senderNickname: { name: '', emoji: '' },
  });

  // --- Refs ---
  const peerConnection = useRef(null);
  const fileReader = useRef(null);
  const receivedData = useRef([]);
  const receivedSize = useRef(0);

  // --- Utility Functions ---
  const addLog = useCallback((message, type = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    setLogs(prev => [{ message, type, time: new Date().toLocaleTimeString() }, ...prev]);
  }, []);
  
  // --- Socket.io Connection ---
  useEffect(() => {
    const newSocket = io(SERVER_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // --- WebRTC Peer Connection Management ---
  const createPeerConnection = useCallback((targetSocketId) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('webrtc-ice-candidate', { to: targetSocketId, candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        addLog(`ICE connection state: ${pc.iceConnectionState}`);
        if(pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
            addLog('WebRTC connection failed.', 'error');
            resetTransferState();
        }
      };

      peerConnection.current = pc;
      return pc;
    } catch (error) {
      addLog(`Failed to create PeerConnection: ${error.message}`, 'error');
      setTransferState(prev => ({ ...prev, status: 'error', file: null }));
      return null;
    }
  }, [socket, addLog]);

  // --- File Transfer Logic ---
  const sendFile = useCallback((file, targetUser) => {
    if (!socket || !file || !targetUser) return;
    setTransferState({ status: 'requesting', progress: 0, to: targetUser.id, from: socket.id, file, senderNickname: nickname });
    socket.emit('file-request', {
      to: targetUser.id,
      from: socket.id,
      file: { name: file.name, size: file.size, type: file.type }
    });
    addLog(`Sent file request for ${file.name} to ${targetUser.nickname.name}`, 'info');
  }, [socket, nickname]);

  const handleFileChunk = useCallback((pc, file) => {
    if (!file) return;
    const dataChannel = pc.createDataChannel('file-transfer');
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
      addLog('Data channel opened. Starting file transfer.', 'success');
      setTransferState(prev => ({...prev, status: 'sending'}));
      fileReader.current = new FileReader();
      let offset = 0;

      fileReader.current.onload = (e) => {
        if (!e.target.result) return;
        try {
          dataChannel.send(e.target.result);
          offset += e.target.result.byteLength;
          const progress = Math.round((offset / file.size) * 100);
          setTransferState(prev => ({ ...prev, progress }));

          if (offset < file.size) {
            readSlice(offset);
          } else {
            addLog('File sent successfully!', 'success');
            setTransferState(prev => ({ ...prev, status: 'completed' }));
            setTimeout(() => resetTransferState(), 3000);
          }
        } catch(error) {
          addLog(`Send error: ${error}`, 'error');
          setTransferState({ status: 'error', file: null });
        }
      };
      
      const readSlice = (o) => {
        const slice = file.slice(o, o + CHUNK_SIZE);
        fileReader.current.readAsArrayBuffer(slice);
      };
      readSlice(0);
    };

    dataChannel.onclose = () => { addLog('Data channel closed.', 'info'); };
    dataChannel.onerror = (error) => {
      addLog(`Data channel error: ${error}`, 'error');
      setTransferState({ status: 'error', file: null });
    };

  }, [addLog]);

  const resetTransferState = () => {
    setTransferState({ status: 'idle', progress: 0, from: null, to: null, file: null, senderNickname: { name: '', emoji: '' } });
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

    const onConnect = () => {
      addLog(`Connected to server with ID: ${socket.id}`, 'success');
      socket.emit('user-joined', nickname);
    };

    const onDisconnect = () => {
      addLog('Disconnected from server', 'error');
    };

    const onUpdateUserList = (userList) => {
      setUsers(userList);
      addLog('User list updated.');
    };

    const onFileRequest = ({ from, senderNickname, file }) => {
      if (senderNickname && senderNickname.name) {
          setTransferState({ status: 'receiving', progress: 0, from, to: socket.id, file, senderNickname });
          addLog(`Incoming file request from ${senderNickname.name} for ${file.name}`, 'info');
      } else {
          addLog(`Invalid file request received from ${from}`, 'error');
      }
    };

    const onFileAccept = async ({ from }) => {
      const fromUser = users.find(u => u.id === from);
      if (!fromUser) return;
      
      // *** FIX: This check ensures the sender has a file selected before proceeding. ***
      if (!selectedFile) {
        addLog('Error: No file selected to send.', 'error');
        // Optionally, notify the other user that the transfer was cancelled.
        return;
      }

      addLog(`${fromUser.nickname.name} accepted the file.`, 'success');
      setTransferState(prev => ({ ...prev, status: 'accepted', to: from }));
      const pc = createPeerConnection(from);
      if (pc) {
        handleFileChunk(pc, selectedFile);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { to: from, offer });
      }
    };
    
    const onFileReject = ({ from }) => {
      const fromUser = users.find(u => u.id === from);
      if (!fromUser) return;
      addLog(`${fromUser.nickname.name} rejected the file.`, 'error');
      resetTransferState();
    };

    const onWebRTCOffer = async ({ from, offer }) => {
      const fromUser = users.find(u => u.id === from);
      if (!fromUser) return;
      addLog(`Received WebRTC offer from ${fromUser.nickname.name}`, 'info');
      const pc = createPeerConnection(from);
      if (pc) {
        pc.ondatachannel = (event) => {
          const receiveChannel = event.channel;
          receiveChannel.binaryType = 'arraybuffer';
          receiveChannel.onmessage = (e) => {
            receivedData.current.push(e.data);
            receivedSize.current += e.data.byteLength;
            const progress = Math.round((receivedSize.current / transferState.file.size) * 100);
            setTransferState(prev => ({...prev, progress, status: 'sending'})); // Show progress on receiver

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
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { to: from, answer });
      }
    };
    
    const onWebRTCAnswer = async ({ answer }) => {
      addLog('Received WebRTC answer.', 'info');
      if (peerConnection.current && peerConnection.current.signalingState !== 'closed') {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const onWebRTCIceCandidate = async ({ candidate }) => {
      if (peerConnection.current && peerConnection.current.signalingState !== 'closed') {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          addLog(`Error adding received ICE candidate: ${e}`, 'error');
        }
      }
    };

    // Register listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('update-user-list', onUpdateUserList);
    socket.on('file-request', onFileRequest);
    socket.on('file-accept', onFileAccept);
    socket.on('file-reject', onFileReject);
    socket.on('webrtc-offer', onWebRTCOffer);
    socket.on('webrtc-answer', onWebRTCAnswer);
    socket.on('webrtc-ice-candidate', onWebRTCIceCandidate);

    // Cleanup listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('update-user-list', onUpdateUserList);
      socket.off('file-request', onFileRequest);
      socket.off('file-accept', onFileAccept);
      socket.off('file-reject', onFileReject);
      socket.off('webrtc-offer', onWebRTCOffer);
      socket.off('webrtc-answer', onWebRTCAnswer);
      socket.off('webrtc-ice-candidate', onWebRTCIceCandidate);
    };
  }, [socket, nickname, addLog, users, createPeerConnection, handleFileChunk, selectedFile, transferState.file]);

  // --- UI Event Handlers ---
  const handleNicknameChange = (e) => {
    if (e.key === 'Enter' && socket) {
      socket.emit('update-nickname', nickname);
      setIsEditingNickname(false);
    }
  };

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
    if(!socket || !transferState.from) return;
    setTransferState(prev => ({ ...prev, status: 'connecting' }));
    socket.emit('file-accept', { to: transferState.from });
    addLog('Accepted file transfer. Waiting for sender...', 'success');
  };

  const handleRejectFile = () => {
    if(!socket || !transferState.from) return;
    socket.emit('file-reject', { to: transferState.from });
    addLog('Rejected file transfer.', 'error');
    resetTransferState();
  };

  // --- Render ---
  const otherUsers = users.filter(user => user.id !== socket?.id);

  return (
    <div className="bg-slate-900 text-slate-300 min-h-screen font-sans flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-600 rounded-full mix-blend-screen filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-600 rounded-full mix-blend-screen filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-600 rounded-full mix-blend-screen filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>

      <main className="w-full max-w-4xl mx-auto bg-slate-800/40 backdrop-blur-lg rounded-2xl shadow-2xl z-10 border border-slate-700/50 overflow-hidden">
        {/* Header */}
        <header className="p-4 sm:p-5 border-b border-slate-700/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <motion.div 
              initial={{ scale: 0, rotate: -45 }} 
              animate={{ scale: 1, rotate: 0 }} 
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
              className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"
            >
              <Send className="text-white w-6 h-6" />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Zap</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-700/50 pl-2 pr-3 py-1.5 rounded-lg text-sm">
              <span className="text-lg">{nickname.emoji}</span>
              {isEditingNickname ? (
                <input
                  type="text"
                  value={nickname.name}
                  onChange={(e) => setNickname({ ...nickname, name: e.target.value })}
                  onKeyDown={handleNicknameChange}
                  onBlur={() => {
                    if (socket) socket.emit('update-nickname', nickname);
                    setIsEditingNickname(false);
                  }}
                  className="bg-transparent focus:outline-none w-24 text-slate-200"
                  autoFocus
                />
              ) : (
                <span onClick={() => setIsEditingNickname(true)} className="cursor-pointer font-medium text-slate-200">{nickname.name}</span>
              )}
            </div>
            <button onClick={() => setShowDebug(!showDebug)} className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-slate-200">
              <Settings className={`w-5 h-5 transition-transform duration-300 ${showDebug ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="grid md:grid-cols-[1fr,1.5fr]">
          {/* Left Panel: Users */}
          <div className="p-4 sm:p-5 border-b md:border-b-0 md:border-r border-slate-700/50 bg-slate-800/20">
            <h2 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2"><Wifi size={20}/> Devices on Network</h2>
            <div className="space-y-2 h-72 overflow-y-auto pr-2">
              <AnimatePresence>
              {otherUsers.length > 0 ? (
                otherUsers.map(user => (
                  <motion.div
                    key={user.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onClick={() => setSelectedUser(user)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 group ${selectedUser?.id === user.id ? 'bg-blue-500/20 ring-2 ring-blue-500' : 'bg-slate-700/40 hover:bg-slate-700/80'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="text-2xl">{user.nickname.emoji}</span>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-800"></div>
                      </div>
                      <span className="font-medium text-slate-300">{user.nickname.name}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:translate-x-1 transition-transform" />
                  </motion.div>
                ))
              ) : (
                <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="text-center text-slate-500 pt-16 flex flex-col items-center">
                  <Wifi size={32} className="mb-2"/>
                  <p className="font-medium">Searching for devices...</p>
                  <p className="text-xs">Open Zap on another device on the same Wi-Fi.</p>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Panel: File Upload */}
          <div className="p-4 sm:p-5 flex flex-col">
            <h2 className="text-lg font-semibold mb-4 text-slate-200">Share a File</h2>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="flex-grow border-2 border-dashed border-slate-600 rounded-lg text-center cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 transition-all flex flex-col justify-center items-center"
            >
              <input type="file" onChange={(e) => handleFileSelect(e.target.files)} className="hidden" id="file-input" />
              {selectedFile ? (
                <div className="p-4">
                  <File className="w-16 h-16 mx-auto text-blue-400 mb-3" />
                  <p className="font-semibold text-slate-200 break-all">{selectedFile.name}</p>
                  <p className="text-sm text-slate-400">{formatBytes(selectedFile.size)}</p>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="mt-3 text-xs text-red-400 hover:underline">
                    Clear file
                  </button>
                </div>
              ) : (
                <label htmlFor="file-input" className="p-4 cursor-pointer">
                  <HardDrive className="w-12 h-12 mx-auto text-slate-500 mb-4" />
                  <p className="text-slate-400 font-semibold">Drag & drop a file here</p>
                  <p className="text-slate-500 text-sm">or click to select</p>
                </label>
              )}
            </div>
            <button
              onClick={() => sendFile(selectedFile, selectedUser)}
              disabled={!selectedFile || !selectedUser || transferState.status !== 'idle'}
              className="w-full mt-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:from-blue-500 hover:to-purple-500 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg hover:shadow-blue-500/30"
            >
              <Send className="w-5 h-5" />
              Send to {selectedUser?.nickname?.name || '...'}
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
              <div className="p-4 border-t border-slate-700/50 bg-slate-900/30">
                <h3 className="font-semibold mb-2 text-slate-300">Debug Log</h3>
                <div className="h-32 bg-black/30 rounded-md p-2 overflow-y-auto text-xs font-mono">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-sky-400'}`}>
                      <span className="text-slate-500">{log.time}</span>
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-slate-700"
            >
              <File className="w-16 h-16 mx-auto text-blue-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-slate-100">Incoming File</h2>
              <p className="text-slate-300 mb-4">
                <span className="font-bold text-white">{transferState.senderNickname?.name}</span> wants to send you a file.
              </p>
              <div className="bg-slate-900/50 rounded-lg p-4 mb-6 text-left space-y-1 text-sm">
                <p><strong>File:</strong> {transferState.file.name}</p>
                <p><strong>Size:</strong> {formatBytes(transferState.file.size)}</p>
                <p><strong>Type:</strong> {transferState.file.type}</p>
              </div>
              <div className="flex gap-4">
                <button onClick={handleRejectFile} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <X /> Reject
                </button>
                <button onClick={handleAcceptFile} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <CheckCircle /> Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {transferState.status === 'connecting' && (
             <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
           >
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-slate-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-slate-700"
             >
               <Loader className="w-16 h-16 mx-auto text-blue-400 mb-4 animate-spin" />
               <h2 className="text-2xl font-bold mb-2 text-slate-100">Connecting...</h2>
               <p className="text-slate-300 mb-4">
                Establishing a secure connection with {transferState.senderNickname?.name}.
               </p>
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-slate-700"
            >
              <ArrowUp className="w-16 h-16 mx-auto text-blue-400 mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold mb-2 text-slate-100">
                {transferState.status === 'sending' ? 'Sending File...' : 'Requesting Transfer...'}
              </h2>
              <p className="text-slate-300 mb-4">
                {transferState.status === 'requesting' && `Waiting for ${users.find(u => u.id === transferState.to)?.nickname?.name} to accept...`}
                {transferState.status === 'accepted' && `Connection established. Preparing to send...`}
                {transferState.status === 'sending' && `Sending ${transferState.file?.name}`}
              </p>
              <div className="w-full bg-slate-700 rounded-full h-2.5">
                <motion.div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2.5 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${transferState.progress}%` }}
                  transition={{ duration: 0.2, ease: 'linear' }}
                />
              </div>
              <p className="text-sm mt-2 text-slate-400">{transferState.progress}%</p>
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-slate-700"
            >
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-slate-100">Transfer Complete!</h2>
            </motion.div>
          </motion.div>
        )}
        {transferState.status === 'rejected' || transferState.status === 'error' && (
           <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-8 shadow-2xl w-full max-w-md text-center border border-slate-700"
            >
              <AlertCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-slate-100">Transfer Failed</h2>
              <p className="text-slate-400">{transferState.status === 'rejected' ? 'The user rejected the file.' : 'An error occurred.'}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
