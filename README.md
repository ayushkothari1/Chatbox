# ChatBox — Real-Time 1-to-1 Chat Application

ChatBox is a lightweight browser chat for two people. One person creates a room and shares its link; the other opens that link and chooses a display name. Messages are relayed in real time through a Node.js and Socket.IO server, so neither person needs to refresh the page.

ChatBox is designed for a short, direct conversation rather than an account-based messaging service. Rooms and their recent messages exist in server memory only; there is no database or user authentication.

## Live Demo

[Open ChatBox](https://chatbox-1-rx9b.onrender.com/)

To try it with someone else, select **Create Chat**, then share the room URL using **Share link** or **Copy**. The other person opens the link, enters a display name, and joins. A room accepts up to two connected participants. The supplied URL is documented here as the project demo; I could not independently verify its availability while preparing this README.

## Features

- Create a room and invite someone with a shareable URL.
- Join with a display name (up to 24 characters; blank names become “Friend”).
- Send and receive messages in real time without refreshing.
- Show each message on the sender's or other participant's side, based on a browser client ID.
- Display the sender's name and a locally formatted time for each message.
- Show when the other participant is typing and whether someone is in the room.
- Copy the room link from the chat screen.
- Responsive layout for narrow and wide screens.
- Limit each room to two connected people and each message to 1,000 characters.
- Keep up to 100 recent messages in memory for an active room.

## Tech Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, React DOM, React Router, Vite |
| Backend | Node.js, Express 5 |
| Real-time communication | Socket.IO 4 server and client |
| Styling | CSS, DM Sans and Space Grotesk web fonts |
| Development tools | Vite React plugin, concurrently, npm |
| Deployment model | Express serves the Vite production build; the existing README describes a single Render web service |

## How ChatBox Works

1. A visitor selects **Create Chat**. The frontend sends `POST /api/rooms` to the server, which creates a short random room ID and initializes in-memory room state.
2. The browser navigates to `/room/:roomId`. The user chooses a display name and continues to `/room/:roomId/chat?name=...`.
3. The chat page reads or creates a browser client ID in `localStorage`, then opens a Socket.IO connection to the server.
4. On connection, the frontend emits `join-room` with the room ID, name, and client ID. The server checks that the room exists and has fewer than two connected users, adds the socket to the Socket.IO room, and acknowledges with the current message snapshot and connected users.
5. The sender emits `send-message`. The server validates the connected user and non-empty text, attaches the sender's client ID and name plus a timestamp, retains the message in the room's memory list, then emits `new-message` to everyone in that room.
6. Each frontend adds the message to its list. It compares `senderId` with its own client ID to render the message on the correct side.

The server does not provide private accounts or durable conversation history. The room URL is the means of invitation, and the server relays data to sockets joined to that room.

## Application Architecture

- **React** renders the home, join, and chat screens and manages their interface state.
- **React Router** maps `/`, `/room/:roomId`, and `/room/:roomId/chat` to those screens.
- **Express** creates rooms through its HTTP API, provides a health endpoint, and serves the built frontend in production.
- **Node.js** runs Express and the HTTP server to which Socket.IO is attached.
- **Socket.IO** manages live connections, room membership, participant presence, typing updates, and message delivery. It provides event-based two-way communication and can reconnect a client automatically; the client attempts to join the room again on each connection.

In development, Vite serves the frontend and proxies `/api` and `/socket.io` to the backend at `localhost:8787`. In production, the client defaults to the current page's origin and Express serves both the built frontend and Socket.IO from the same service. The client also supports the `VITE_SERVER_URL` build-time setting; it is not required for the documented same-origin setup.

## Message Flow

```mermaid
sequenceDiagram
    participant A as User A
    participant FA as User A frontend
    participant S as Express / Socket.IO server
    participant FB as User B frontend
    participant B as User B
    A->>FA: Type and send a message
    FA->>S: send-message { text }
    S->>S: Validate sender and text; add sender ID and timestamp
    S-->>FA: new-message (room broadcast)
    S-->>FB: new-message (room broadcast)
    FA-->>A: Render as own message
    FB-->>B: Render as other participant's message
```

## Real-Time Communication

The Socket.IO server accepts connections and the client registers these events:

| Event | Direction | Purpose and data |
| --- | --- | --- |
| `join-room` | Client → server | `{ roomId, name, clientId }`; acknowledgement is `{ success, roomId, messages, users }`, or `{ success: false, error }`. |
| `user-joined` | Server → other room members | `{ socketId, name }` when a participant joins. |
| `send-message` | Client → server | `{ text }`; acknowledgement reports success or an error. The sender is taken from the joined socket's server-side room membership. |
| `new-message` | Server → all room members | `{ id, text, senderId, senderName, createdAt }`. `createdAt` is an ISO timestamp. |
| `typing` | Client ↔ server | Client sends `{ isTyping }`; server forwards `{ name, isTyping }` to the other room member. The frontend clears typing after about 1.2 seconds without input. |
| `user-left` | Server → other room members | `{ socketId, name }` when a joined socket disconnects. |
| `disconnect` | Socket.IO lifecycle | The server removes the socket from its room's participant map and deletes the room if it becomes empty. The client marks itself disconnected. |

The server assigns a random UUID to each message. It trims message text and limits it to 1,000 characters. User names are trimmed and limited to 24 characters. The browser's `chatbox-client-id` value is created with `crypto.randomUUID()` and saved in `localStorage`; the server uses this client ID to label the sender, while the socket ID tracks the current connection.

## Backend and API

Express exposes two HTTP routes:

- `GET /api/health` returns `{ "ok": true, "service": "ChatBox server" }`.
- `POST /api/rooms` creates a room and returns `{ "success": true, "roomId": "..." }`.

There is no HTTP message endpoint: chat messages and typing updates use Socket.IO. The server uses CORS middleware and configures Socket.IO CORS for any origin. Invalid room joins, full rooms, missing client identities, empty messages, and missing rooms are reported through the relevant Socket.IO acknowledgement. A failed room creation request is shown by the frontend as a server connection error.

## Project Structure

```text
.
├── index.html          # Vite HTML entry point and page metadata
├── package.json        # Dependencies and npm scripts
├── package-lock.json   # Locked npm dependency versions
├── vite.config.js      # React plugin, build output, and development proxies
├── server/
│   └── index.js        # Express routes, Socket.IO events, and static serving
└── src/
    ├── App.jsx         # Routes, room creation/joining, and chat interface
    ├── main.jsx        # React entry point and BrowserRouter setup
    └── style.css       # Responsive interface styles
```

The production frontend build is written to `dist/` by Vite. It is generated output and is served by Express when running the production server.

## Getting Started

### Prerequisites

- Node.js and npm (use a Node.js release compatible with the installed Vite version).
- Git, to clone the repository.

### Install and run

From a terminal in the cloned project directory (PowerShell, Command Prompt, macOS, and Linux shells all work):

```bash
git clone <repository-url>
cd <repository-directory>
npm install
npm run dev
```

`npm run dev` starts the Express/Socket.IO server and Vite client together. Open <http://localhost:5173>. The backend listens on port `8787` by default. Keep the terminal running while using the app.

To run the two processes separately, open two terminals in the project directory:

```bash
npm run server
```

```bash
npm run client
```

The Vite proxy forwards API and Socket.IO traffic to the local backend. To try a two-person conversation locally, create a room in one browser and open its copied link in another browser window or profile on the same computer.

## Available Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts `server` and `client` together using `concurrently`. |
| `npm run client` | Starts the Vite development server. |
| `npm run server` | Runs `node server/index.js`. |
| `npm run build` | Builds the frontend into `dist/`. |
| `npm start` | Runs the Express/Socket.IO server; build first so the frontend exists in `dist/`. |
| `npm run preview` | Starts Vite's local preview server for a production build. It does not start the Express/Socket.IO backend. |

## Data Storage and Privacy

Room membership and messages are stored in a JavaScript `Map` on the server. Each active room retains at most its latest 100 messages. The room is removed when its last connected participant disconnects, and a server restart clears every room and its messages. There is no database, account system, or browser-stored message history. Only the generated client ID is persisted in browser `localStorage` to identify the sender across that browser's chat sessions.

The room ID is a random value used in a shareable URL, but the application does not implement authentication or a separate access-control check for invitees. Anyone with the room link can attempt to join while a place is available. The code does not implement end-to-end encryption; use it with that limitation in mind.

## Deployment

The checked-in server code serves the Vite output from `dist/` and serves Socket.IO on the same HTTP server. The existing README describes deploying that architecture as one Render web service with:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Render-provided `PORT` (the server falls back to `8787` locally)

There is no Render configuration file in the repository, so these are documented commands rather than independently verified service settings. The frontend uses the deployed page's origin by default, so the single-service setup does not require a separate public frontend and backend URL.

## Known Limitations

- Rooms and messages are temporary in-memory state, cleared when the room empties or the server restarts.
- A room only allows two connected sockets. A third connection is rejected while both places are occupied.
- The room link is the only invitation mechanism; there is no login or private-room authorization.
- A browser-generated client ID is used to distinguish a user's messages, but it is not authenticated. It identifies a browser profile, not a verified person.
- There is no durable message archive, end-to-end encryption, or offline message delivery.
- `npm run preview` previews only the frontend build; chat functionality requires the Express/Socket.IO server as well.

## Future Improvements

Possible future work includes database-backed message history, authentication and stronger room access controls, a more robust typing indicator lifecycle, read receipts, and more explicit reconnection and connection-error recovery. These are ideas for later development and are not current features unless described above.

## Contributing

Contributions are welcome. Open an issue to discuss a substantial change, or submit a pull request with a clear description of the change and how it was checked. Keep changes focused and update this README when user-visible behavior or setup instructions change.

## License

No license file or license declaration is present in the repository, so it does not specify reuse terms.
