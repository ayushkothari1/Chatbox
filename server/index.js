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
  return crypto.randomBytes(4).toString("hex");
}

function cleanName(name) {
  return String(name || "Friend").trim().slice(0, 24) || "Friend";
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
  socket.on("join-room", ({ roomId, name, clientId }, callback) => {
    const room = rooms.get(roomId);

    if (!room) {
      callback?.({ success: false, error: "Room not found." });
      return;
    }

    const stableClientId = String(clientId || "").trim();
    if (!stableClientId || stableClientId.length > 100) {
      callback?.({ success: false, error: "A valid client identity is required." });
      return;
    }

    if (room.users.size >= 2) {
      callback?.({ success: false, error: "This chat already has two people." });
      return;
    }

    const user = {
      socketId: socket.id,
      clientId: stableClientId,
      name: cleanName(name),
    };

    room.users.set(socket.id, user);
    socket.join(roomId);
    socket.data.roomId = roomId;

    callback?.({
      success: true,
      roomId,
      messages: room.messages,
      users: [...room.users.values()].map(({ socketId, name }) => ({
        socketId,
        name,
      })),
    });

    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      name: user.name,
    });
  });

  socket.on("send-message", ({ text }, callback) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) {
      callback?.({ success: false, error: "Room no longer exists." });
      return;
    }

    const user = room.users.get(socket.id);
    const messageText = String(text || "").trim().slice(0, 1000);

    if (!user || !messageText) {
      callback?.({ success: false, error: "Message cannot be empty." });
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

  socket.on("typing", ({ isTyping }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.id);

    if (room && user) {
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

    const user = room.users.get(socket.id);
    room.users.delete(socket.id);

    if (user) {
      socket.to(roomId).emit("user-left", {
        socketId: socket.id,
        name: user.name,
      });
    }

    // Remove empty rooms so memory stays tiny.
    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const PORT = process.env.PORT || 8787;

httpServer.listen(PORT, () => {
  console.log(`ChatBox server running on http://localhost:${PORT}`);
});
