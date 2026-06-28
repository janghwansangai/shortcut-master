const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// State
const rooms = {}; // { roomId: { players: { socketId: { name, isReady, score, gridState } }, status: 'waiting' | 'playing' } }

const TRAFFIC_OVERLOAD_THRESHOLD = 50;

function checkTrafficAndEmit() {
  const isOverloaded = io.engine.clientsCount > TRAFFIC_OVERLOAD_THRESHOLD;
  io.emit('traffic_warning', isOverloaded);
  return isOverloaded;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  checkTrafficAndEmit();

  // Create or Join Room
  socket.on('join_room', ({ roomId, playerName, isAI }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { players: {}, status: 'waiting', isAI: !!isAI };
    }
    
    // Join socket to room
    socket.join(roomId);
    
    // Add player to room state
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: playerName,
      isReady: false,
      score: 0,
      gridState: null,
      isAI: false,
      isDead: false
    };

    socket.roomId = roomId;

    // Broadcast updated room state
    io.to(roomId).emit('room_update', rooms[roomId]);
    console.log(`${playerName} joined room ${roomId}`);
  });

  // Ready / Start game
  socket.on('toggle_ready', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const p = rooms[roomId].players[socket.id];
      p.isReady = !p.isReady;
      
      const allReady = Object.values(rooms[roomId].players).every(p => p.isReady);
      const numPlayers = Object.keys(rooms[roomId].players).length;
      if (allReady && numPlayers > 0) {
        rooms[roomId].status = 'playing';
        Object.values(rooms[roomId].players).forEach(p => { p.isDead = false; p.score = 0; });
        io.to(roomId).emit('game_start');
      }
      
      io.to(roomId).emit('room_update', rooms[roomId]);
    }
  });

  // Receive Grid Snapshot
  socket.on('grid_update', (snapshot) => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].status === 'playing') {
      if (rooms[roomId].players[socket.id]) {
        rooms[roomId].players[socket.id].gridState = snapshot.gridState;
        rooms[roomId].players[socket.id].score = snapshot.score;
        // Broadcast to others (for mini maps) ONLY IF not overloaded
        const isOverloaded = io.engine.clientsCount > TRAFFIC_OVERLOAD_THRESHOLD;
        if (!isOverloaded) {
          socket.to(roomId).emit('player_grid_updated', {
            playerId: socket.id,
            gridState: snapshot.gridState,
            score: snapshot.score
          });
        }
      }
    }
  });

  // Attack triggered by a player
  socket.on('send_attack', ({ targetId, type }) => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].status === 'playing') {
      const sender = rooms[roomId].players[socket.id];
      if (sender) {
        // Forward attack to the target player
        io.to(targetId).emit('receive_attack', {
          senderId: socket.id,
          senderName: sender.name,
          type: type // 'normal' | 'huge'
        });
      }
    }
  });

  // Player Died
  socket.on('player_died', () => {
    const roomId = socket.roomId;
    console.log(`Player died: ${socket.id} in room: ${roomId}`);
    if (roomId && rooms[roomId] && rooms[roomId].status === 'playing') {
      const p = rooms[roomId].players[socket.id];
      if (p) {
        p.isDead = true;
        console.log(`Player ${p.name} marked as dead.`);
        io.to(roomId).emit('room_update', rooms[roomId]);
        
        // Check if only one player is alive
        const alivePlayers = Object.values(rooms[roomId].players).filter(player => !player.isDead);
        
        // In AI mode, if the player dies, they lose (AI wins). 
        // In multiplayer, if 1 or 0 players remain, game over.
        if (rooms[roomId].isAI) {
          rooms[roomId].status = 'finished';
          io.to(roomId).emit('room_game_over', { winnerName: 'AI Bot' });
          console.log(`AI room game over.`);
        } else if (alivePlayers.length <= 1) {
          rooms[roomId].status = 'finished';
          const winnerName = alivePlayers.length === 1 ? alivePlayers[0].name : '무승부';
          io.to(roomId).emit('room_game_over', { winnerName });
          console.log(`Room ${roomId} game over. Winner: ${winnerName}`);
        }
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].players[socket.id];
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId]; // Clean up empty room
      } else {
        io.to(roomId).emit('room_update', rooms[roomId]);
      }
    }
    console.log(`User disconnected: ${socket.id}`);
    checkTrafficAndEmit();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Multiplayer Server running on port ${PORT}`);
});
