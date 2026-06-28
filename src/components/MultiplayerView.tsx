import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayer } from '../hooks/useMultiplayer';
import { GameCanvas } from './GameCanvas';
import type { GameCanvasRef } from './GameCanvas';
import type { Shortcut } from '../game/ShortcutTable';
import { isModifier } from '../game/ShortcutTable';
import { AIBot } from '../game/AIBot';
import { GameEngine } from '../game/GameEngine';

interface MultiplayerViewProps {
  mode: 'multi' | 'ai';
  onExit: () => void;
}

export const MultiplayerView: React.FC<MultiplayerViewProps> = ({ mode, onExit }) => {
  const { myId, roomState, joinRoom, toggleReady, sendGridUpdate, sendAttack, sendPlayerDied, socket } = useMultiplayer();
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState(`Player_${Math.floor(Math.random() * 1000)}`);
  
  const gameRef = useRef<GameCanvasRef>(null);
  const aiBotRef = useRef<AIBot | null>(null);
  const aiEngineRef = useRef<GameEngine | null>(null);
  const [aiGridState, setAiGridState] = useState<any>(null);
  const [aiScore, setAiScore] = useState(0);

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // For 1P UI
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(5);
  const [currentMission, setCurrentMission] = useState<Shortcut | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isShake, setIsShake] = useState(false);
  const [showExplosion, setShowExplosion] = useState(false);
  const [visualMissiles, setVisualMissiles] = useState<{id: number, type: string, senderName: string, startX: number, startY: number, dx: number, dy: number, isOutgoing?: boolean}[]>([]);
  const [popups, setPopups] = useState<{id: number, shortcut: Shortcut, x: number, y: number, isMissionBonus: boolean}[]>([]);
  const [popupIdCounter, setPopupIdCounter] = useState(0);
  const [roomWinner, setRoomWinner] = useState<string | null>(null);
  const [isTrafficOverload, setIsTrafficOverload] = useState(false);

  useEffect(() => {
    if (socket) {
      const handleTrafficWarning = (isOverloaded: boolean) => {
        setIsTrafficOverload(isOverloaded);
      };
      socket.on('traffic_warning', handleTrafficWarning);
      return () => {
        socket.off('traffic_warning', handleTrafficWarning);
      };
    }
  }, [socket]);

  // Setup AI if mode is 'ai'
  useEffect(() => {
    if (mode === 'ai' && !roomState) {
      // Auto join a local ai room
      joinRoom('ai_room_1', 'Player', true);
    }
  }, [mode, roomState, joinRoom]);

  // Periodic Snapshot sending
  useEffect(() => {
    if (roomState?.status !== 'playing') return;

    const interval = setInterval(() => {
      if (gameRef.current) {
        const snapshot = gameRef.current.getSnapshot();
        sendGridUpdate(snapshot, score);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [roomState?.status, sendGridUpdate, score]);

  // Listen for game over
  useEffect(() => {
    const handleRoomGameOver = (e: any) => {
      setRoomWinner(e.detail.winnerName);
      setIsGameOver(true);
      if (gameRef.current) {
        gameRef.current.stopGame();
      }
    };
    window.addEventListener('room_game_over', handleRoomGameOver);

    return () => {
      window.removeEventListener('room_game_over', handleRoomGameOver);
    };
  }, []);

  const handleShortcutMatched = (shortcut: Shortcut, x: number, y: number, isMissionBonus: boolean) => {
    const id = popupIdCounter;
    setPopupIdCounter(prev => prev + 1);
    
    setPopups(prev => [...prev, { id, shortcut, x, y, isMissionBonus }]);

    if (isMissionBonus) {
      setShowExplosion(true);
      setTimeout(() => setShowExplosion(false), 800);
    }
    
    // Play sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      const freq = 440 + ((combo || 1) * 100);
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime); 
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch(e) {
      console.error(e);
    }

    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id));
    }, 3000);
  };

  // AI bot logic
  useEffect(() => {
    if (mode === 'ai' && roomState?.status === 'playing') {
      aiEngineRef.current = new GameEngine(600, 800, {
        onScoreUpdate: (s) => setAiScore(s),
        onShotFired: () => {},
        onShortcutMatched: () => {},
        onGameOver: () => {
          setRoomWinner(playerName);
          setIsGameOver(true);
          if (aiBotRef.current) aiBotRef.current.stop();
        },
        onScreenShake: () => {},
        onAttackTriggered: (type) => {
          const event = new CustomEvent('receive_attack', { detail: { type, senderName: 'AI Bot' } });
          window.dispatchEvent(event);
        },
        speedUpStartTime: mode === 'ai' ? 60 : 120
      });
      
      let animationId: number;
      let lastTime = performance.now();
      let lastGridUpdate = 0;
      
      const loop = (time: number) => {
        const dt = (time - lastTime) / 1000;
        lastTime = time;
        if (aiEngineRef.current && aiEngineRef.current.state === 'playing') {
           aiEngineRef.current.update(dt);
           if (time - lastGridUpdate > 500) {
             setAiGridState(aiEngineRef.current.getSnapshot());
             lastGridUpdate = time;
           }
        }
        animationId = requestAnimationFrame(loop);
      };
      animationId = requestAnimationFrame(loop);

      aiBotRef.current = new AIBot('medium');
      aiBotRef.current.start(() => {
        if (aiEngineRef.current && aiEngineRef.current.state === 'playing') {
           aiEngineRef.current.setAim(Math.random() * 600, Math.random() * 400 + 100);
           aiEngineRef.current.shoot();
        }
      });

      return () => {
        cancelAnimationFrame(animationId);
        if (aiBotRef.current) aiBotRef.current.stop();
      };
    }
  }, [mode, roomState?.status]);

  useEffect(() => {
    const handleAttack = (e: any) => {
      const { senderId, senderName, type } = e.detail;
      const id = Date.now() + Math.random();
      
      let startX = window.innerWidth / 2;
      let startY = 100;
      
      if (senderId) {
         const el = document.getElementById(senderId === 'ai' ? 'player-ai' : `player-${senderId}`);
         if (el) {
            const rect = el.getBoundingClientRect();
            startX = rect.left + rect.width / 2;
            startY = rect.top + rect.height / 2;
         }
      }

      let targetX = window.innerWidth / 2;
      let targetY = window.innerHeight / 2;
      const myEl = document.getElementById('player-me');
      if (myEl) {
         const rect = myEl.getBoundingClientRect();
         targetX = rect.left + rect.width / 2;
         targetY = rect.top + rect.height / 2;
      }

      setVisualMissiles(prev => [...prev, { 
        id, type, senderName, 
        startX, startY, 
        dx: targetX - startX, dy: targetY - startY 
      }]);

      setTimeout(() => {
         setVisualMissiles(prev => prev.filter(m => m.id !== id));
         
         // Apply penalty and trigger explosion UI when missile lands
         const lines = type === 'huge' ? 3 : type === 'medium' ? 2 : 1;
         if (gameRef.current) {
           gameRef.current.receiveAttack(lines);
         }
         setShowExplosion(true);
         setTimeout(() => setShowExplosion(false), 800);
      }, 1000);
    };

    const handleOutgoingAttack = (e: any) => {
      const { targetId, type } = e.detail;
      const id = Date.now() + Math.random();
      
      let startX = window.innerWidth / 2;
      let startY = window.innerHeight / 2;
      const myEl = document.getElementById('player-me');
      if (myEl) {
         const rect = myEl.getBoundingClientRect();
         startX = rect.left + rect.width / 2;
         // 발사하는 곳 (아래쪽 대포 위치)
         startY = rect.top + rect.height - 50;
      }

      let targetX = window.innerWidth / 2;
      let targetY = 100;
      const targetEl = document.getElementById(targetId === 'ai' ? 'player-ai' : `player-${targetId}`);
      if (targetEl) {
         const rect = targetEl.getBoundingClientRect();
         targetX = rect.left + rect.width / 2;
         targetY = rect.top + rect.height / 2;
      }

      setVisualMissiles(prev => [...prev, { 
        id, type, senderName: '', 
        startX, startY, 
        dx: targetX - startX, dy: targetY - startY,
        isOutgoing: true
      }]);

      setTimeout(() => {
         setVisualMissiles(prev => prev.filter(m => m.id !== id));
      }, 1000);
    };

    window.addEventListener('receive_attack', handleAttack);
    window.addEventListener('outgoing_attack', handleOutgoingAttack);
    return () => {
      window.removeEventListener('receive_attack', handleAttack);
      window.removeEventListener('outgoing_attack', handleOutgoingAttack);
    };
  }, []);

  if (!roomState) {
    if (mode === 'ai') return <div className="text-white text-2xl">AI 대전 준비 중...</div>;
    return (
      <div className="bg-gray-800/90 backdrop-blur-md p-10 md:p-14 2xl:p-20 rounded-3xl border border-gray-600 shadow-2xl flex flex-col gap-6 w-full max-w-sm md:max-w-lg 2xl:max-w-2xl mx-auto mt-32 relative z-50">
        <h2 className="text-4xl md:text-5xl 2xl:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-8 text-center drop-shadow-md">멀티플레이 방 참가</h2>
        <input 
          type="text" 
          value={playerName} 
          onChange={e => setPlayerName(e.target.value)} 
          className="p-5 2xl:p-6 rounded-2xl bg-gray-900/80 text-white border-2 border-gray-600 text-xl md:text-2xl 2xl:text-3xl font-bold focus:border-purple-500 outline-none transition-colors shadow-inner"
          placeholder="내 이름"
        />
        <input 
          type="text" 
          value={roomId} 
          onChange={e => setRoomId(e.target.value)} 
          className="p-5 2xl:p-6 rounded-2xl bg-gray-900/80 text-white border-2 border-gray-600 text-xl md:text-2xl 2xl:text-3xl font-bold focus:border-purple-500 outline-none transition-colors shadow-inner"
          placeholder="방 코드 입력"
        />
        <button 
          onClick={() => joinRoom(roomId, playerName)}
          className="w-full py-5 2xl:py-6 bg-purple-600 hover:bg-purple-500 text-white font-black text-2xl md:text-3xl 2xl:text-4xl rounded-2xl transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(147,51,234,0.5)] mt-4"
        >
          방 들어가기
        </button>
        <button onClick={onExit} className="text-gray-400 mt-4 hover:text-white text-xl 2xl:text-2xl font-bold transition-colors">뒤로가기</button>
      </div>
    );
  }

  if (roomState.status === 'waiting') {
    if (mode === 'ai') {
      const me = roomState.players[myId];
      if (me && !me.isReady) {
        setTimeout(() => toggleReady(), 0);
      }
      return <div className="text-white text-2xl h-full flex items-center justify-center">AI 대전 시작 중...</div>;
    }

    const me = roomState.players[myId];
    return (
      <div className="bg-gray-800/90 backdrop-blur-md p-10 md:p-14 2xl:p-20 rounded-3xl border border-gray-600 shadow-2xl flex flex-col gap-6 w-full max-w-sm md:max-w-xl 2xl:max-w-3xl mx-auto mt-32 relative z-50">
        <h2 className="text-4xl md:text-5xl 2xl:text-6xl font-black text-white mb-8 text-center drop-shadow-md">대기실</h2>
        <ul className="text-gray-300 text-xl md:text-2xl 2xl:text-3xl font-bold mb-8 space-y-4 2xl:space-y-6">
          {Object.values(roomState.players).map(p => (
            <li key={p.id} className="flex justify-between items-center bg-gray-700 p-5 2xl:p-8 rounded-2xl border border-gray-600 shadow-inner">
              <span>{p.name} {p.id === myId ? '(나)' : ''}</span>
              <span className={p.isReady ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'text-gray-400'}>
                {p.isReady ? 'Ready!' : 'Waiting...'}
              </span>
            </li>
          ))}
          {(mode as string) === 'ai' && (
            <li className="flex justify-between items-center bg-gray-700 p-5 2xl:p-8 rounded-2xl border border-gray-600 shadow-inner">
              <span>AI Bot (Medium)</span>
              <span className="text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]">Ready!</span>
            </li>
          )}
        </ul>
        <button 
          onClick={toggleReady}
          className={`w-full py-5 2xl:py-6 font-black text-2xl md:text-3xl 2xl:text-4xl rounded-2xl transition-transform hover:scale-105 active:scale-95 shadow-lg mt-4 ${me?.isReady ? 'bg-gray-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.5)]'}`}
        >
          {me?.isReady ? '준비 취소' : '준비 완료!'}
        </button>
        <button onClick={onExit} className="text-gray-400 mt-4 hover:text-white text-xl 2xl:text-2xl font-bold text-center transition-colors">나가기</button>
      </div>
    );
  }

  // Find opponents
  const opponents = Object.values(roomState.players).filter(p => p.id !== myId);
  const aliveOpponents = opponents.filter(p => !p.isDead);

  return (
    <div className="w-full max-w-full flex flex-row overflow-x-auto gap-4 justify-start 2xl:justify-center items-end relative p-4 h-full">
      <style>{`
        @keyframes flyToMe {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; filter: brightness(1); }
          10% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); filter: brightness(1); }
          85% { transform: translate(calc(-50% + var(--target-x)), calc(-50% + var(--target-y))) scale(2.5); opacity: 1; filter: brightness(1); }
          95% { transform: translate(calc(-50% + var(--target-x)), calc(-50% + var(--target-y))) scale(4); opacity: 1; filter: brightness(2) contrast(1.5); }
          100% { transform: translate(calc(-50% + var(--target-x)), calc(-50% + var(--target-y))) scale(6); opacity: 0; filter: brightness(5) contrast(2); }
        }
      `}</style>

      {/* Missile Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
        {visualMissiles.map(m => (
          <div 
            key={m.id}
            className="absolute flex flex-col items-center justify-center animate-[flyToMe_1s_cubic-bezier(0.4,0,0.2,1)_forwards]"
            style={{ 
              left: `${m.startX}px`, 
              top: `${m.startY}px`,
              '--target-x': `${m.dx}px`,
              '--target-y': `${m.dy}px`
            } as any}
          >
            <div className={`text-6xl ${m.isOutgoing ? 'drop-shadow-[0_0_20px_rgba(59,130,246,1)]' : 'drop-shadow-[0_0_20px_rgba(255,0,0,1)]'}`}>
              {m.type === 'huge' ? '💣' : '🚀'}
            </div>
            {m.isOutgoing ? (
              <div className="bg-blue-600/90 text-white font-bold px-4 py-2 rounded-full border border-blue-400 mt-2 shadow-2xl">
                나의 공격! 🚀
              </div>
            ) : (
              <div className="bg-red-600/90 text-white font-bold px-4 py-2 rounded-full border border-red-400 mt-2 shadow-2xl">
                {m.senderName} 님의 공격!
              </div>
            )}
          </div>
        ))}
      </div>

      {/* My View */}
      <div id="player-me" className="flex-1 min-w-[200px] w-full flex flex-col justify-start shrink-0 h-full relative pt-2" style={{ maxWidth: 'calc((100vh - 145px) * 0.75)' }}>
        {/* 상단 통합 메뉴바 */}
        <div className="flex items-center justify-between bg-gray-900/80 backdrop-blur-md px-2 py-2 md:py-3 rounded-xl border border-gray-700 shadow-xl mb-1 z-10 relative w-full shrink-0 h-fit overflow-hidden">
          {/* 왼쪽: 나의 아이디 */}
          <div className="flex items-center z-10 w-1/4">
            <span className="text-white font-bold text-[10px] md:text-xs bg-blue-600/80 px-1.5 py-0.5 rounded border border-blue-400 truncate max-w-[60px] md:max-w-[100px]">
              {playerName}
            </span>
          </div>

          {/* 중앙: 미션 영역 (절대 위치로 완벽한 중앙 정렬) */}
          {currentMission ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-yellow-500/20 px-2 py-0.5 rounded-lg border border-yellow-500/50 w-max z-20 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
              <span className="text-[10px] md:text-xs font-bold text-yellow-400 mr-1">미션:</span>
              <span className="text-base md:text-xl font-black text-white tracking-tight whitespace-nowrap drop-shadow-lg">
                {currentMission.action}
              </span>
            </div>
          ) : null}

          {/* 오른쪽: 스탯 및 종료 영역 */}
          <div className="flex items-center justify-end gap-1 md:gap-1.5 z-10 w-auto text-[10px] md:text-xs whitespace-nowrap">
            <div className="font-semibold text-blue-300">S:{score}</div>
            <div className="font-semibold text-purple-300 hidden sm:block">C:{combo}</div>
            <div className="font-semibold text-pink-300">X:{shotsLeft}</div>
            <button 
              onClick={onExit}
              className="ml-0.5 px-2 py-0.5 bg-red-600/80 hover:bg-red-500 text-white font-black rounded transition-colors border border-red-400"
            >
              X
            </button>
          </div>
        </div>
        <div className={`relative w-full aspect-[3/4] bg-gray-900/40 rounded-lg shadow-2xl border-4 border-purple-500 overflow-hidden ${isShake ? 'shake-animation' : ''}`}>
          <GameCanvas
            ref={gameRef}
            onScoreUpdate={(s, c, m) => { setScore(s); setCombo(c); setCurrentMission(m); }}
            onShotFired={setShotsLeft}
            onShortcutMatched={handleShortcutMatched}
            onGameOver={() => {
              setIsGameOver(true);
              if (mode === 'multi') {
                sendPlayerDied();
              } else if (mode === 'ai') {
                setRoomWinner('AI Bot');
                if (aiEngineRef.current) aiEngineRef.current.state = 'gameover';
                if (aiBotRef.current) aiBotRef.current.stop();
              }
            }}
            onScreenShake={() => {
              setIsShake(true);
              setTimeout(() => setIsShake(false), 300);
            }}
            speedUpStartTime={mode === 'ai' ? 60 : 120}
            onAttackTriggered={(type) => {
              // Send attack to selected target, random opponent, or AI
              let targetId = '';
              if (mode === 'ai') {
                 if (aiEngineRef.current && aiEngineRef.current.state === 'playing') {
                   const lines = type === 'huge' ? 4 : type === 'medium' ? 2 : 1;
                   aiEngineRef.current.receiveAttack(lines);
                   targetId = 'ai';
                 }
              } else if (aliveOpponents.length > 0) {
                let target = aliveOpponents.find(p => p.id === selectedTargetId);
                if (!target) target = aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
                sendAttack(target.id, type);
                targetId = target.id;
              }
              
              if (targetId) {
                const event = new CustomEvent('outgoing_attack', { detail: { targetId, type } });
                window.dispatchEvent(event);
              }
            }}
          />

          {/* 폭발 애니메이션 */}
          {showExplosion && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
              <div className="w-64 h-64 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-full opacity-60 animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)_1] blur-2xl"></div>
              <div className="absolute w-40 h-40 bg-white rounded-full opacity-80 animate-[ping_0.3s_cubic-bezier(0,0,0.2,1)_1] blur-xl"></div>
            </div>
          )}

          {popups.map(p => {
            const isThreeKey = p.shortcut.keys.length >= 3;
            const bgClass = p.isMissionBonus 
              ? 'bg-yellow-500/90 border-2 border-yellow-300 shadow-[0_15px_35px_rgba(234,179,8,0.6)] transform scale-125'
              : isThreeKey 
                ? 'bg-red-600/95 border-2 border-red-400 shadow-[0_15px_35px_rgba(239,68,68,0.6)] transform scale-110'
                : 'bg-blue-600/95 border border-blue-400 shadow-[0_10px_25px_rgba(37,99,235,0.5)]';
            
            const titleClass = p.isMissionBonus ? 'text-yellow-900' : 'text-white';
            const subClass = p.isMissionBonus ? 'text-yellow-800' : isThreeKey ? 'text-red-100' : 'text-blue-100';

            return (
              <div 
                key={p.id}
                className="absolute pointer-events-none flex flex-col items-center justify-center popup-animation z-50"
                style={{ 
                  left: `${Math.min(Math.max((p.x / 600) * 100, 20), 80)}%`, 
                  top: `${Math.min(Math.max((p.y / 800) * 100, 10), 90)}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div className={`backdrop-blur px-5 py-3 rounded-xl flex flex-col items-center whitespace-nowrap ${bgClass}`}>
                  <span className={`text-3xl font-black tracking-wider ${titleClass}`}>
                    {p.shortcut.keys.join(' + ')}
                  </span>
                  <span className={`text-sm font-bold flex items-center gap-1 mt-1 ${subClass}`}>
                    {p.shortcut.icon} {p.shortcut.action}
                  </span>
                  {p.isMissionBonus && (
                    <span className="mt-1 text-sm font-black text-red-600 animate-bounce bg-yellow-200 px-2 py-0.5 rounded border border-red-400">
                      🎉 미션 성공! 점수 5배 🎉
                    </span>
                  )}
                  {!p.isMissionBonus && isThreeKey && (
                    <span className="mt-1 text-sm font-black text-white animate-pulse bg-red-800 px-2 py-0.5 rounded border border-red-300">
                      🔥 강력한 3키 조합! (점수 6배 & 2줄 공격) 🔥
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {isGameOver && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-start overflow-y-auto rounded-xl backdrop-blur-sm z-50 p-4 md:p-8 custom-scrollbar">
              <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-red-500 mt-4 md:mt-8 mb-6 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] text-center leading-tight shrink-0">GAME<br className="sm:hidden"/> OVER</h2>
              {roomWinner ? (
                (roomWinner === myId || roomWinner === playerName) ? (
                  <div className="bg-yellow-900/50 p-6 md:p-8 rounded-2xl mb-6 text-center border-4 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] w-full max-w-sm shrink-0">
                    <span className="block text-yellow-400 text-xl md:text-2xl font-black mb-3 animate-bounce">👑 WINNER 👑</span>
                    <span className="block text-4xl md:text-5xl font-black text-white">당신 (You)</span>
                  </div>
                ) : (
                  <div className="bg-red-900/50 p-6 md:p-8 rounded-2xl mb-6 text-center border-4 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] w-full max-w-sm shrink-0">
                    <span className="block text-red-400 text-xl md:text-2xl font-black mb-3">💀 LOSER 💀</span>
                    <span className="block text-4xl md:text-5xl font-black text-gray-300">당신 (You)</span>
                    <span className="block text-gray-400 text-base md:text-lg mt-3 font-bold">승리자: {roomWinner}</span>
                  </div>
                )
              ) : (
                <div className="bg-gray-800 p-6 md:p-8 rounded-2xl mb-6 text-center border-2 border-gray-700 shadow-2xl w-full max-w-sm shrink-0">
                  <span className="block text-gray-400 text-lg md:text-xl uppercase font-bold mb-2">Final Score</span>
                  <span className="block text-5xl md:text-6xl font-bold text-blue-400 font-mono">{score}</span>
                </div>
              )}
              <button  
                onClick={onExit}
                className="px-6 md:px-8 py-3 md:py-4 text-xl md:text-2xl bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.5)] transition-transform hover:scale-105 active:scale-95 shrink-0"
              >
                로비로 돌아가기
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Opponents Mini Views */}
      {mode === 'ai' ? (
        <div id="player-ai" className="flex-1 min-w-[200px] w-full flex flex-col justify-start shrink-0 h-full pt-2" style={{ maxWidth: 'calc((100vh - 200px) * 0.75)' }}>
          <div className="bg-gray-800/80 backdrop-blur-md p-4 rounded-xl border-4 border-pink-500/50 relative overflow-hidden flex flex-col h-full justify-end">
            <div className="flex flex-col justify-end mb-4 px-2 min-h-[90px]">
              <h3 className="text-white font-black text-3xl md:text-4xl 2xl:text-5xl break-all leading-tight text-pink-400 drop-shadow-[0_0_10px_rgba(244,114,182,0.8)] mb-1">AI Bot</h3>
              <span className="text-pink-300 font-mono text-xl md:text-2xl font-bold shrink-0">Score: {aiScore}</span>
            </div>
            <div className="w-full aspect-[3/4] bg-gray-900/40 rounded-lg overflow-hidden border-2 border-pink-500/50 p-0 relative">
              {aiGridState ? (
                <div className="absolute inset-0">
                  {aiGridState.map((row: string[], r: number) => {
                    const isEven = r % 2 === 0;
                    return row.map((key, c) => {
                      if (!key) return null;
                      const left = (c + (isEven ? 0 : 0.5)) * (100 / 14);
                      const top = r * 4.5535;
                      return (
                        <div 
                          key={`${r}-${c}`} 
                          className={`absolute rounded-full flex items-center justify-center ${
                            key === 'BOMB' 
                              ? 'bg-red-500 shadow-[0_0_10px_red]' 
                              : isModifier(key) 
                                ? 'bg-yellow-400 shadow-[0_0_5px_yellow]' 
                                : 'bg-blue-400 shadow-[0_0_5px_blue]'
                          }`}
                          style={{ left: `${left}%`, top: `${top}%`, width: `${100 / 14}%`, paddingBottom: `${100 / 14}%` }}
                        />
                      );
                    });
                  })}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-bold text-2xl">
                  [AI 로직 작동 중]
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        opponents.map(p => {
          const isTarget = selectedTargetId === p.id && !p.isDead;
          return (
          <div 
            key={p.id} 
            id={`player-${p.id}`}
            onClick={() => { if (!p.isDead) setSelectedTargetId(isTarget ? null : p.id); }}
            className={`flex-1 min-w-[200px] w-full flex flex-col justify-start shrink-0 h-full pt-2 ${p.isDead ? 'opacity-40 grayscale pointer-events-none' : 'cursor-pointer'} transition-all duration-200 ${isTarget ? 'scale-[1.02]' : ''}`}
            style={{ maxWidth: 'calc((100vh - 145px) * 0.75)' }}
          >
            <div className={`bg-gray-800/80 backdrop-blur-md p-4 rounded-xl border-4 relative overflow-hidden flex flex-col h-full justify-end transition-colors duration-200 ${isTarget ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'border-gray-600'}`}>
              {isTarget && <div className="absolute top-4 right-4 bg-red-600 text-white font-black px-4 py-1.5 rounded-full animate-pulse z-10 text-xl shadow-lg border-2 border-white/50">TARGET 🎯</div>}
              {p.isDead && <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20"><span className="text-red-500 font-black text-6xl rotate-[-15deg] drop-shadow-[0_0_20px_red]">OUT!</span></div>}
              <div className="flex flex-col justify-end mb-4 px-2 min-h-[90px]">
                <h3 className="text-white font-black text-3xl md:text-4xl 2xl:text-5xl break-all leading-tight mb-1 pr-24">{p.name}</h3>
                <span className="text-blue-300 font-mono text-xl md:text-2xl font-bold shrink-0">Score: {p.score}</span>
              </div>
              <div className="w-full aspect-[3/4] bg-gray-900/40 rounded-lg overflow-hidden border-2 border-gray-700 p-0 relative">
                {/* Render Mini Grid */}
                {isTrafficOverload ? (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center z-10">
                    <span className="text-red-500 font-bold text-lg md:text-xl break-keep animate-pulse">⚠️ 트래픽 초과<br/>실시간 모니터링 차단</span>
                  </div>
                ) : p.gridState ? (
                  <div className="absolute inset-0">
                    {p.gridState.map((row: string[], r: number) => {
                      const isEven = r % 2 === 0;
                      return row.map((key, c) => {
                        if (!key) return null;
                        const left = (c + (isEven ? 0 : 0.5)) * (100 / 14);
                        const top = r * 4.5535;
                        return (
                          <div 
                            key={`${r}-${c}`} 
                            className={`absolute rounded-full flex items-center justify-center ${
                              key === 'BOMB' 
                                ? 'bg-red-500 shadow-[0_0_10px_red]' 
                                : isModifier(key) 
                                  ? 'bg-yellow-400 shadow-[0_0_5px_yellow]' 
                                  : 'bg-blue-400 shadow-[0_0_5px_blue]'
                            }`}
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                              width: `${100 / 14}%`,
                              paddingBottom: `${100 / 14}%`
                            }}
                          />
                        );
                      });
                    })}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl">Waiting for grid...</div>
                )}
              </div>
            </div>
          </div>
        )})
      )}
    </div>
  );
}
