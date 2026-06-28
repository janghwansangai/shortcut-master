import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export type PlayerState = {
  id: string;
  name: string;
  isReady: boolean;
  score: number;
  gridState: any;
  isAI: boolean;
  isDead: boolean;
};

export type RoomState = {
  players: Record<string, PlayerState>;
  status: 'waiting' | 'playing';
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useMultiplayer() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [myId, setMyId] = useState<string>('');
  
  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setMyId(newSocket.id || '');
    });

    newSocket.on('room_update', (room: RoomState) => {
      setRoomState(room);
    });

    newSocket.on('game_start', () => {
      setRoomState(prev => prev ? { ...prev, status: 'playing' } : null);
    });

    newSocket.on('player_grid_updated', ({ playerId, gridState, score }) => {
      setRoomState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [playerId]: {
              ...prev.players[playerId],
              gridState,
              score
            }
          }
        };
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    const handleAttack = (data: { senderId: string, senderName: string, type: 'normal' | 'medium' | 'huge' }) => {
      // Use a custom event to notify components
      const event = new CustomEvent('receive_attack', { detail: data });
      window.dispatchEvent(event);
    };

    const handleGameOver = (data: { winnerName: string }) => {
      const event = new CustomEvent('room_game_over', { detail: data });
      window.dispatchEvent(event);
    };

    socket.on('receive_attack', handleAttack);
    socket.on('room_game_over', handleGameOver);

    return () => {
      socket.off('receive_attack', handleAttack);
      socket.off('room_game_over', handleGameOver);
    };
  }, [socket]);

  const joinRoom = useCallback((roomId: string, playerName: string, isAI: boolean = false) => {
    if (socket) {
      socket.emit('join_room', { roomId, playerName, isAI });
    }
  }, [socket]);

  const toggleReady = useCallback(() => {
    if (socket) {
      socket.emit('toggle_ready');
    }
  }, [socket]);

  const sendGridUpdate = useCallback((gridState: any, score: number) => {
    if (socket) {
      socket.emit('grid_update', { gridState, score });
    }
  }, [socket]);

  const sendAttack = useCallback((targetId: string, type: 'normal' | 'medium' | 'huge') => {
    if (socket) {
      socket.emit('send_attack', { targetId, type });
    }
  }, [socket]);

  const sendPlayerDied = useCallback(() => {
    if (socket) {
      socket.emit('player_died');
    }
  }, [socket]);

  return {
    socket,
    myId,
    roomState,
    joinRoom,
    toggleReady,
    sendGridUpdate,
    sendAttack,
    sendPlayerDied,
  };
}
