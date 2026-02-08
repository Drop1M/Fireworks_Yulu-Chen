// app.js (SERVER)
// ------------------------------------------------------
// Serves /public as a static website
// Creates a Socket.IO server for real-time fireworks events
// Maintains a short "history" of fireworks so late-joiners see recent bursts

import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3500;

// Serve files
app.use(express.static("public"));

// ---- Week 4 style memory (recent history) ----
const fireworksHistory = [];
const MAX_HISTORY = 120; // keep the last N fireworks (keeps it light)

// Start server
server.listen(port, () => {
  console.log("listening on: " + port);
});

// Socket.IO
io.on("connection", (socket) => {
  console.log("a user connected:", socket.id);

  // Send recent history to the newly connected user
  socket.emit("history", fireworksHistory);

  // When a client launches a firework
  socket.on("launch", (fw) => {
    // Basic validation (avoid broken packets)
    if (!fw || typeof fw !== "object") return;

    // Store in history (server memory)
    fireworksHistory.push(fw);
    if (fireworksHistory.length > MAX_HISTORY) fireworksHistory.shift();

    // Send to everyone (including sender) so the system feels consistent
    io.emit("launch", fw);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id);
  });
});
