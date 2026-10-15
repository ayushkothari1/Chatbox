import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useNavigate, useParams } from "react-router-dom";
import { Routes, Route } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:8787" : window.location.origin);

function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createRoom() {
    setCreating(true);
    setError("");

    try {
      const response = await fetch(`${SERVER_URL}/api/rooms`, {
        method: "POST",
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error("Could not create room.");
      }

      navigate(`/room/${data.roomId}`);
    } catch {
      setError("Could not reach the ChatBox server. Is it running?");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="home-page">
      <section className="hero">
        <div className="logo">💬</div>
        <p className="eyebrow">PRIVATE • REAL-TIME • SIMPLE</p>
        <h1>ChatBox</h1>
        <p className="subtitle">
          Create a room, send the link to friends, and start talking instantly.
        </p>

        <button className="primary-button" onClick={createRoom} disabled={creating}>
          {creating ? "Creating room..." : "Create Chat"}
        </button>

        {error && <p className="error">{error}</p>}

        <div className="feature-row">
          <span>⚡ Live messages</span>
          <span>🔗 Shareable link</span>
          <span>👥 up to 10 people</span>
        </div>
      </section>
    </main>
  );
}

function JoinRoom() {
  const { roomId } = useParams();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function join(event) {
    event.preventDefault();

    const clean = name.trim() || "Friend";
    navigate(`/room/${roomId}/chat?name=${encodeURIComponent(clean)}`);
  }

  return (
    <main className="join-page">
      <section className="join-card">
        <div className="mini-logo">💬</div>
        <p className="eyebrow">YOU'VE BEEN INVITED</p>
        <h1>Join the chat</h1>
        <p className="muted">Choose the name your friend will see.</p>

        <form onSubmit={join}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            autoFocus
            maxLength={24}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Friend"
          />

          <button className="primary-button" type="submit">
            Join Chat →
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

function getClientId() {
  const storageKey = "chatbox-client-id";
  let clientId = localStorage.getItem(storageKey);

  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(storageKey, clientId);
  }

  return clientId;
}

function mergeMessages(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message);
    }
  }

  return [...byId.values()].sort(
    (left, right) => new Date(left.createdAt) - new Date(right.createdAt),
  );
}

function Chat() {
  const { roomId } = useParams();
  const query = new URLSearchParams(window.location.search);
  const name = query.get("name")?.trim() || "Friend";
  // Read localStorage synchronously once, before the effect creates a socket.
  // Keep the identity fixed for this mounted chat session.
  const [clientId] = useState(getClientId);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingName, setTypingName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      autoConnect: false,
    });

    socketRef.current = socket;

    let connectionGeneration = 0;

    function handleConnect() {
      const generation = ++connectionGeneration;
      setConnected(false);
      setError("");

      socket.emit("join-room", { roomId, name, clientId }, (result) => {
        if (!socket.connected || generation !== connectionGeneration) return;

        if (!result?.success) {
          setError(result?.error || "Could not join this room.");
          return;
        }

        // Merge the server snapshot with live messages that may have arrived
        // while the join acknowledgement was in flight.
        setMessages((current) => mergeMessages(result.messages || [], current));

        setParticipants(result.users || []);
        setConnected(true);
      });
    }

    function handleNewMessage(message) {
      setMessages((current) => mergeMessages(current, [message]));
    }

    function handleUserJoined(user) {
      if (user.users) setParticipants(user.users);
      else setParticipants((current) => [...current.filter((item) => item.clientId !== user.clientId), user]);
    }

    function handleUserLeft(user) {
      if (user.users) setParticipants(user.users);
      else setParticipants((current) => current.filter((item) => item.clientId !== user.clientId));
      setTypingName("");
    }

    function handleParticipantsUpdated(users) {
      setParticipants(users || []);
    }

    function handleTyping({ name: typingUser, isTyping } = {}) {
      setTypingName(isTyping ? typingUser : "");
    }

    function handleDisconnect() {
      connectionGeneration += 1;
      setConnected(false);
    }

    socket.on("connect", handleConnect);
    socket.on("new-message", handleNewMessage);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("participants-updated", handleParticipantsUpdated);
    socket.on("typing", handleTyping);
    socket.on("disconnect", handleDisconnect);
    socket.connect();

    return () => {
      clearTimeout(typingTimerRef.current);
      socket.off("connect", handleConnect);
      socket.off("new-message", handleNewMessage);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("participants-updated", handleParticipantsUpdated);
      socket.off("typing", handleTyping);
      socket.off("disconnect", handleDisconnect);
      if (socketRef.current === socket) socketRef.current = null;
      socket.disconnect();
    };
  }, [roomId, name, clientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingName]);

  const roomLink = useMemo(() => {
    return `${window.location.origin}/room/${roomId}`;
  }, [roomId]);

  function sendMessage(event) {
    event.preventDefault();

    const message = text.trim();
    if (!message || !socketRef.current?.connected) return;

    socketRef.current.emit("send-message", { text: message }, (result) => {
      if (!result?.success) {
        setError(result?.error || "Message failed.");
      }
    });

    setText("");
    socketRef.current.emit("typing", { isTyping: false });
  }

  function handleTyping(event) {
    const value = event.target.value;
    setText(value);

    const socket = socketRef.current;
    if (!socket?.connected) return;

    socket.emit("typing", { isTyping: value.trim().length > 0 });

    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit("typing", { isTyping: false });
    }, 1200);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. You can copy the link from your browser.");
    }
  }

  if (!clientId) return null;

  if (error) {
    return (
      <main className="center-page">
        <section className="error-card">
          <div className="mini-logo">💬</div>
          <h1>Can't join this room</h1>
          <p>{error}</p>
          <a href="/" className="secondary-button">Back to ChatBox</a>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-page">
      <section className="chat-shell">
        <header className="chat-header">
          <div className="avatar">💬</div>
          <div className="header-info">
            <h1>ChatBox</h1>
            <p>
              <span className={`status-dot ${connected ? "online" : ""}`} />
              {connected ? `${participants.length} of 10 participants` : "Connecting..."}
            </p>
          </div>
          <button className="share-button" onClick={copyLink}>
            {copied ? "Copied ✓" : "Share link"}
          </button>
        </header>

        <div className="room-banner">
          <span>🔗 Share this room link</span>
          <button onClick={copyLink}>{copied ? "Copied" : "Copy"}</button>
        </div>

        <aside className="participants" aria-label="Participants in this room">
          <strong>Participants</strong>
          <div className="participant-list">
            {participants.map((participant) => (
              <span key={participant.clientId} className="participant-chip">
                {participant.name}{participant.clientId === clientId ? " (you)" : ""}
              </span>
            ))}
          </div>
        </aside>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-chat">
              <div>👋</div>
              <strong>You're in!</strong>
              <p>Share the room link and start the conversation.</p>
            </div>
          )}

          {messages.map((message) => {
            const mine = message.senderId === clientId;

            return (
              <div key={message.id} className={`message-row ${mine ? "mine" : "theirs"}`}>
                <div className="message">
                  <span className="sender">{message.senderName}</span>
                  <span>{message.text}</span>
                  <time>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            );
          })}

          {typingName && (
            <div className="typing">{typingName} is typing...</div>
          )}

          <div ref={messagesEndRef} />
        </section>

        <form className="composer" onSubmit={sendMessage}>
          <input
            value={text}
            onChange={handleTyping}
            placeholder="Write a message..."
            maxLength={1000}
            disabled={!connected}
          />
          <button type="submit" disabled={!connected || !text.trim()}>
            Send
          </button>
        </form>

        <footer className="chat-footer">
          You're <strong>{name}</strong> · Room {roomId}
        </footer>
      </section>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<JoinRoom />} />
      <Route path="/room/:roomId/chat" element={<Chat />} />
    </Routes>
  );
}

export default App;
