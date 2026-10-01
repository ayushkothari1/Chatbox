# ChatBox

A one-to-one real-time chat app built with React, Vite, Node.js, Express, and Socket.IO.

## Run locally

From the project folder, install dependencies and start both services:

```bash
npm install
npm run dev
```

Open the frontend at <http://localhost:5173>. The Express and Socket.IO server runs at <http://localhost:8787>.

To run the services separately, use two terminals:

```bash
npm run server
```

```bash
npm run client
```

## Try a two-person chat

1. In the first browser window, open <http://localhost:5173> and select **Create Chat**.
2. Choose your display name. The room link is in the address bar; use **Share link** or **Copy** to copy it.
3. Open that room link in a second browser window (a private window works too) and choose the second display name.
4. Send messages in either window. Messages, typing status, and the other person's online status update over Socket.IO.

Each room allows up to two connected people. Rooms and the latest 100 messages are held in server memory and are cleared when the server restarts. The local link works for browser windows on the same computer; to invite someone on another device, run the app on a network-accessible host.

## Deploy on Render as one web service

Create a Render **Web Service** for this repository with:

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Environment Variable:** `NODE_ENV=production`

Render supplies `PORT` automatically. The Express server serves the built frontend and API from the same origin, and Socket.IO uses that origin as well. Vite's development proxy keeps `/api` and Socket.IO working locally while the frontend runs on port 5173.

## Project structure

```text
server/index.js   Express API and Socket.IO room handling
src/App.jsx       Home, room joining, and chat screens
src/style.css     Responsive UI styles
src/main.jsx      React entry point
vite.config.js    Vite configuration
```
