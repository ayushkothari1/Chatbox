import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const httpServer = createServer(app);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(projectRoot, "..", "dist");

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Active rooms live in memory for now.
// Restarting the server clears them.
const rooms = new Map();

function makeRoomId() {
  return crypto.randomBytes(16).toString("hex");
}

function validName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 24 && !/[\u0000-\u001f\u007f]/.test(name)
    ? name
    : null;
}

function publicUsers(room) {
  return [...room.users.values()].map(({ clientId, name }) => ({ clientId, name }));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ChatBox server" });
});

app.post("/api/rooms", (_req, res) => {
  let roomId = makeRoomId();

  while (rooms.has(roomId)) {
    roomId = makeRoomId();
  }

  rooms.set(roomId, {
    users: new Map(),
    messages: [],
  });

  res.json({
    success: true,
    roomId,
  });
});

// Serve the Vite build from this service. Resolve the path from this file so
// the server works regardless of its current working directory. API routes
// stay above the SPA fallback, and Socket.IO remains attached to httpServer.
app.use(express.static(clientDist));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

io.on("connection", (socket) => {
  socket.on("join-room", (payload, callback) => {
    const { roomId, name, clientId } = payload || {};
    const room = rooms.get(roomId);

    if (typeof roomId !== "string" || !/^[a-f0-9]{32}$/.test(roomId) || !room) {
      callback?.({ success: false, error: "Room not found." });
      return;
    }

    const stableClientId = typeof clientId === "string" ? clientId.trim() : "";
    if (!/^[a-f0-9-]{36}$/i.test(stableClientId)) {
      callback?.({ success: false, error: "A valid client identity is required." });
      return;
    }

    const cleanDisplayName = validName(name);
    if (!cleanDisplayName) {
      callback?.({ success: false, error: "Enter a name between 1 and 24 characters." });
      return;
    }

    const existing = room.users.get(stableClientId);
    if (!existing && room.users.size >= 10) {
      callback?.({ success: false, error: "This room is full (10 participants maximum)." });
      return;
    }

    const previousRoomId = socket.data.roomId;
    if (previousRoomId && previousRoomId !== roomId) {
      const previousRoom = rooms.get(previousRoomId);
      const previousUser = previousRoom?.users.get(socket.data.clientId);
      if (previousUser?.socketId === socket.id) {
        previousRoom.users.delete(socket.data.clientId);
        socket.leave(previousRoomId);
        socket.to(previousRoomId).emit("user-left", {
          clientId: previousUser.clientId,
          name: previousUser.name,
          users: publicUsers(previousRoom),
        });
        if (previousRoom.users.size === 0) rooms.delete(previousRoomId);
      }
    }

    const user = {
      socketId: socket.id,
      clientId: stableClientId,
      name: cleanDisplayName,
    };

    // A reconnect or duplicate tab for the same stable browser identity replaces
    // its prior connection without consuming another participant slot.
    if (existing && existing.socketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existing.socketId);
      if (oldSocket) {
        oldSocket.leave(roomId);
        oldSocket.data.roomId = null;
        oldSocket.data.clientId = null;
      }
    }
    room.users.set(stableClientId, user);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.clientId = stableClientId;

    callback?.({
      success: true,
      roomId,
      messages: room.messages,
      users: publicUsers(room),
    });

    if (!existing) socket.to(roomId).emit("user-joined", { clientId: user.clientId, name: user.name, users: publicUsers(room) });
    else io.to(roomId).emit("participants-updated", publicUsers(room));
  });

  socket.on("send-message", (payload, callback) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) {
      callback?.({ success: false, error: "Room no longer exists." });
      return;
    }

    const user = room.users.get(socket.data.clientId);
    const messageText = typeof payload?.text === "string" ? payload.text.trim() : "";

    if (!user || user.socketId !== socket.id) {
      callback?.({ success: false, error: "Join this room before sending messages." });
      return;
    }
    if (!messageText || messageText.length > 1000) {
      callback?.({ success: false, error: "Messages must be between 1 and 1,000 characters." });
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      text: messageText,
      senderId: user.clientId,
      senderName: user.name,
      createdAt: new Date().toISOString(),
    };

    // Keep only the latest 100 messages in memory.
    room.messages.push(message);
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    io.to(roomId).emit("new-message", message);
    callback?.({ success: true });
  });

  socket.on("typing", (payload = {}) => {
    const { isTyping } = payload;
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.data.clientId);

    if (room && user?.socketId === socket.id) {
      socket.to(roomId).emit("typing", {
        name: user.name,
        isTyping: Boolean(isTyping),
      });
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const clientId = socket.data.clientId;
    const user = room.users.get(clientId);
    if (!user || user.socketId !== socket.id) return;
    room.users.delete(clientId);

    if (user) {
      socket.to(roomId).emit("user-left", { clientId, name: user.name, users: publicUsers(room) });
    }

    // Remove empty rooms so memory stays tiny.
    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const PORT = process.env.PORT || 8787;

httpServer.listen(PORT, () => {
  console.log(`ChatBox server listening on port ${PORT}`);
});
