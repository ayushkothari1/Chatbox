# ChatBox

ChatBox is a real-time group messaging web application built with React, Vite, Node.js, Express, and Socket.IO. Create a room, share its invitation link, and start a live conversation with up to 10 participants—no page refresh required.

The project brings together a responsive chat interface and a room-aware real-time server. Building it involved connecting a React client to Socket.IO events, managing room membership and message delivery on the server, and serving the production frontend from the same Express application.

## Features

- Create rooms and invite others with a shareable room link.
- Chat with up to 10 participants in each room.
- Send and receive messages in real time through Socket.IO.
- Choose a display name before joining.
- View the room's current participant list.
- See when another participant is typing.
- Keep conversations isolated by room.
- Use the responsive interface on narrow and wide screens.
- View up to 100 recent messages in an active room; the server keeps them in memory.

## Tech Stack

| Technology | Role |
| --- | --- |
| React | Builds the home, join, and chat screens and manages interface state. |
| Vite | Runs the frontend development server and creates the production build. |
| Node.js | Runs the server-side JavaScript application. |
| Express | Provides the room creation and health endpoints and serves the production frontend. |
| Socket.IO | Handles live connections, room membership, participant updates, typing events, and message delivery. |
| React Router | Routes users between the home, room invitation, and chat screens. |
| CSS | Styles the responsive chat interface. |

## How It Works

1. A visitor selects **Create Chat**. The client calls `POST /api/rooms`, and the server creates a room with a unique ID.
2. The creator is taken to the room invitation page. They choose a display name and enter the chat.
3. The room URL can be copied and shared. Invitees open it, choose a display name, and join the same room.
4. The browser connects to the Socket.IO server and joins the room. The server checks that the room exists and has capacity, then returns its current participants and recent messages.
5. When a participant sends a message, the server validates it and broadcasts it only to sockets in that room. The other participants see it immediately.

## Project Structure

```text
.
├── index.html          # Vite HTML entry point and page metadata
├── package.json        # Dependencies and npm scripts
├── package-lock.json   # Locked dependency versions
├── vite.config.js      # React plugin, build output, and development proxies
├── server/
│   └── index.js        # Express API, Socket.IO events, and static frontend serving
└── src/
    ├── App.jsx         # Routes, room creation/joining, and chat interface
    ├── main.jsx        # React entry point and BrowserRouter setup
    └── style.css       # Responsive interface styles
```

Vite writes the production frontend to `dist/`. The Express server serves those built files in production.

## Getting Started

### Prerequisites

- Node.js **20.19+** or **22.12+**, as required by the installed Vite toolchain.
- npm.

### Install and run locally

Clone the repository, then run these commands from the project directory:

```bash
npm install
npm run dev
```

The development command starts the Vite client and the Express/Socket.IO server together. Open <http://localhost:5173>. The backend listens on port `8787` by default, and Vite proxies API and Socket.IO requests to it.

## Production Build

Build the frontend with the project’s production script:

```bash
npm run build
```

This writes the static frontend to `dist/`. To run the production application locally, start the Express server after building:

```bash
npm start
```

The server serves both the built frontend and Socket.IO. It uses the `PORT` environment variable when set and defaults to `8787` otherwise. `npm run preview` starts Vite’s frontend preview server; it does not start the chat backend.

## Live Demo

The previous README listed [https://chatbox-1-rx9b.onrender.com/](https://chatbox-1-rx9b.onrender.com/) as the deployment URL. I could not verify that it is currently reachable, so treat the link as unconfirmed.

## Deployment

ChatBox is structured for a single Render web service: Express serves the Vite build and hosts Socket.IO on the same HTTP server. Connect the GitHub repository to Render and configure the service to build and start with the project’s npm commands:

| Render setting | Command |
| --- | --- |
| Build command | `npm run build` |
| Start command | `npm start` |

Render supplies the `PORT` value used by the server. There is no Render configuration file in the repository; these commands reflect the checked-in npm scripts and server implementation.

## Future Enhancements

- Add optional accounts and room access controls.
- Persist conversations across server restarts.
- Add message reactions or read receipts.
