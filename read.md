Zap ⚡ - Instant File Sharing
Zap is a full-stack web application that allows users on the same local network to share files with each other instantly. It uses a React frontend, a Node.js/Express backend, and WebSockets for real-time communication, with WebRTC for direct peer-to-peer file transfers.

Features
Nickname Identification: Users can set a custom nickname.

Real-time User List: See who is currently connected to the network.

Drag & Drop File Upload: Easily select files for sharing.

Secure Transfer Requests: Receivers must accept or reject incoming file transfers.

Peer-to-Peer Transfer: Files are sent directly between users using WebRTC for speed and privacy.

Transfer Progress: Real-time progress bars for uploads and downloads.

Responsive Design: Works on both desktop and mobile browsers.

Tech Stack
Frontend: React, Vite, TailwindCSS, Socket.io-client

Backend: Node.js, Express, Socket.io

Real-time Communication: WebSockets (Socket.io)

File Transfer: WebRTC

Project Structure
/zap-file-sharing
├── /backend
│   ├── node_modules/
│   ├── package.json
│   └── server.js
├── /frontend
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── ... (React project files)
└── README.md

Setup and Installation
Prerequisites
Node.js (v18.x or later)

npm (or yarn/pnpm)

1. Clone the Repository
Clone this repository to your local machine.

2. Backend Setup
Navigate to the backend directory and install the dependencies.

cd backend
npm install

3. Frontend Setup
In a separate terminal, navigate to the frontend directory and install the dependencies.

cd frontend
npm install

Running the Application
1. Start the Backend Server
From the /backend directory, run the following command to start the Node.js server. It will run on http://localhost:5000.

npm start

You should see a log in the console: ✅ Server is running on port 5000.

2. Start the Frontend Development Server
From the /frontend directory, run the following command to start the React application. It will run on http://localhost:5173 (or another available port).

npm run dev

Your browser will automatically open to the application. To test the file-sharing functionality, open the application in two different browser tabs or on two different devices connected to the same Wi-Fi network.