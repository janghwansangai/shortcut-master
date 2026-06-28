import { useState, useCallback, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import type { Shortcut } from './game/ShortcutTable';
import { MultiplayerView } from './components/MultiplayerView';

export default function App() {
  const [appMode, setAppMode] = useState<'lobby' | 'single' | 'multi' | 'ai'>('lobby');

  // Single player state
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(5);
  const [popups, setPopups] = useState<Array<{id: number, shortcut: Shortcut, x: number, y: number, isMissionBonus: boolean}>>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isShake, setIsShake] = useState(false);
  const [popupIdCounter, setPopupIdCounter] = useState(0);

  const [currentMission, setCurrentMission] = useState<Shortcut | null>(null);
  const [showExplosion, setShowExplosion] = useState(false);

  const [playerNameInput, setPlayerNameInput] = useState('');
  const [rankings, setRankings] = useState<{name: string, score: number, date: number}[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('shortcut-rankings');
    if (saved) setRankings(JSON.parse(saved));
  }, []);

  const saveRanking = useCallback(() => {
    const name = playerNameInput.trim() || '아무개';
    const newRankings = [...rankings, { name, score, date: Date.now() }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    setRankings(newRankings);
    localStorage.setItem('shortcut-rankings', JSON.stringify(newRankings));
    
    setIsGameOver(false);
    setScore(0);
    setCombo(0);
    setPlayerNameInput('');
    setAppMode('lobby');
  }, [playerNameInput, score, rankings]);

  const handleScoreUpdate = useCallback((newScore: number, newCombo: number, mission: Shortcut) => {
    setScore(newScore);
    setCombo(newCombo);
    if (mission) {
      setCurrentMission(mission);
    }
  }, []);

  const handleGameOver = useCallback(() => {
    setIsGameOver(true);
  }, []);

  const handleScreenShake = useCallback(() => {
    setIsShake(true);
    setTimeout(() => setIsShake(false), 300);
  }, []);

  const handleShortcutMatched = useCallback((shortcut: Shortcut, x: number, y: number, isMissionBonus: boolean) => {
    const id = popupIdCounter;
    setPopupIdCounter(prev => prev + 1);
    
    setPopups(prev => [...prev, { id, shortcut, x, y, isMissionBonus }]);

    if (isMissionBonus) {
      setShowExplosion(true);
      setTimeout(() => setShowExplosion(false), 800);
    }
    
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
  }, [popupIdCounter, combo]);

  const renderSinglePlayer = () => (
    <>
      <div className="absolute bottom-[-20px] left-[-20px] md:left-10 w-64 md:w-96 opacity-90 z-10 pointer-events-none drop-shadow-2xl">
        <img src="/cat.png" alt="Hacker Cat" className="w-full h-auto object-contain" />
      </div>

      <div 
        className="flex flex-col items-center w-full z-20 px-2 h-full justify-center"
        style={{ maxWidth: 'calc((100vh - 145px) * 0.75)' }}
      >
        <div className="w-full text-center mb-0.5">
          <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-0.5 drop-shadow-lg">
            Shortcut Master
          </h1>
          
          {/* 상단 통합 메뉴바 */}
          <div className="flex items-center justify-center bg-gray-900/80 backdrop-blur-md px-2 md:px-5 py-2 md:py-3 rounded-xl border border-gray-700 shadow-xl mb-2 w-full gap-2 md:gap-4 flex-wrap">
            {/* 미션 영역 */}
            {currentMission ? (
              <div className="flex items-center flex-shrink-0 bg-yellow-500/20 px-2 md:px-4 py-1 md:py-2 rounded-lg border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                <span className="text-lg md:text-xl font-black text-yellow-400 mr-1 md:mr-2 animate-pulse">🔥 <span className="hidden sm:inline">미션:</span></span>
                <span className="text-lg md:text-2xl font-bold text-white tracking-widest bg-gray-900/50 px-2 md:px-4 py-1 rounded-md border border-gray-700">
                  {currentMission.action}
                </span>
              </div>
            ) : (
              <div className="flex-shrink-0 w-10"></div>
            )}

            {/* 스탯 및 종료 영역 */}
            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0 text-sm md:text-lg whitespace-nowrap">
              <div className="font-semibold text-blue-300">S:{score}</div>
              <div className="font-semibold text-purple-300">C:{combo}</div>
              <div className="font-semibold text-pink-300">X:{shotsLeft}</div>
              <button 
                onClick={() => {
                  setIsGameOver(true);
                }} 
                className="ml-1 md:ml-2 px-2 md:px-4 py-1 md:py-2 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-lg transition-colors border border-red-400 shadow-[0_0_10px_rgba(220,38,38,0.5)]"
              >
                종료
              </button>
            </div>
          </div>
        </div>

        <div className={`relative w-full aspect-[3/4] rounded-lg shadow-2xl border-4 border-gray-700 bg-gray-900/40 backdrop-blur-sm z-20 ${isShake ? 'shake-animation' : ''}`}>
          <GameCanvas 
            onScoreUpdate={handleScoreUpdate}
            onShotFired={setShotsLeft}
            onShortcutMatched={handleShortcutMatched}
            onGameOver={handleGameOver}
            onScreenShake={handleScreenShake}
            speedUpStartTime={60}
          />
          
          {/* 폭발 애니메이션 */}
        {showExplosion && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
            <div className="w-64 h-64 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-full opacity-60 animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)_1] blur-2xl"></div>
            <div className="absolute w-40 h-40 bg-white rounded-full opacity-80 animate-[ping_0.3s_cubic-bezier(0,0,0.2,1)_1] blur-xl"></div>
          </div>
        )}

        {popups.map(p => (
          <div 
            key={p.id}
            className="absolute pointer-events-none flex flex-col items-center justify-center popup-animation z-50"
            style={{ 
              left: `${Math.min(Math.max((p.x / 600) * 100, 20), 80)}%`, 
              top: `${Math.min(Math.max((p.y / 800) * 100, 10), 90)}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className={`backdrop-blur px-5 py-3 rounded-xl flex flex-col items-center whitespace-nowrap ${
              p.isMissionBonus 
                ? 'bg-yellow-500/90 border-2 border-yellow-300 shadow-[0_15px_35px_rgba(234,179,8,0.6)] transform scale-125'
                : 'bg-blue-600/95 border border-blue-400 shadow-[0_10px_25px_rgba(37,99,235,0.5)]'
            }`}>
              <span className={`text-3xl font-black tracking-wider ${p.isMissionBonus ? 'text-yellow-900' : 'text-white'}`}>
                {p.shortcut.keys.join(' + ')}
              </span>
              <span className={`text-sm font-bold flex items-center gap-1 mt-1 ${p.isMissionBonus ? 'text-yellow-800' : 'text-blue-100'}`}>
                {p.shortcut.icon} {p.shortcut.action}
              </span>
              {p.isMissionBonus && (
                <span className="mt-1 text-sm font-black text-red-600 animate-bounce bg-yellow-200 px-2 py-0.5 rounded border border-red-400">
                  🎉 미션 성공! 점수 5배 🎉
                </span>
              )}
              {!p.isMissionBonus && p.shortcut.keys.length >= 3 && (
                <span className="mt-1 text-sm font-black text-white animate-pulse bg-red-800 px-2 py-0.5 rounded border border-red-300">
                  🔥 강력한 3키 조합! (점수 6배) 🔥
                </span>
              )}
            </div>
          </div>
        ))}

        {isGameOver && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-start overflow-y-auto rounded-xl backdrop-blur-sm z-50 p-4 md:p-8 custom-scrollbar">
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-red-500 mt-4 md:mt-8 mb-4 tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] text-center leading-tight shrink-0">GAME<br className="sm:hidden"/> OVER</h2>
            <p className="text-gray-300 text-xl md:text-2xl lg:text-3xl mb-6 md:mb-8 font-medium text-center shrink-0">단축키를 너무 많이 쌓았어요!</p>
            
            <div className="bg-gray-800 p-6 md:p-8 rounded-2xl mb-6 md:mb-8 border border-gray-700 text-center shadow-2xl w-full max-w-sm md:max-w-md shrink-0">
              <span className="block text-gray-400 text-base md:text-lg uppercase font-bold mb-2">Final Score</span>
              <span className="block text-5xl md:text-6xl lg:text-7xl font-mono text-blue-400 font-black">{score}</span>
            </div>

            <div className="flex flex-col items-center mb-6 bg-gray-900/80 p-6 md:p-8 rounded-2xl border border-gray-600 w-full max-w-sm md:max-w-md shadow-xl shrink-0">
              <h3 className="text-white text-lg md:text-xl lg:text-2xl font-bold mb-4 flex items-center gap-2">
                🏆 명예의 전당 등록
              </h3>
              <input 
                type="text" 
                value={playerNameInput}
                onChange={e => setPlayerNameInput(e.target.value)}
                placeholder="이름 (미입력시 아무개)"
                className="w-full p-3 md:p-4 rounded-xl bg-gray-800 text-white border-2 border-gray-600 mb-6 text-center text-lg md:text-xl focus:border-blue-500 outline-none transition-colors"
                maxLength={10}
              />
              <button 
                onClick={saveRanking}
                className="w-full px-6 py-4 md:py-5 bg-blue-600 hover:bg-blue-500 text-white font-black text-lg md:text-xl rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.5)] transition-all transform hover:scale-105 active:scale-95"
              >
                기록 저장 및 로비로
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );

  return (
    <div className="w-full min-h-screen flex flex-col items-center bg-gray-950 p-4 font-sans relative overflow-y-auto"
         style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      
      <div className="absolute inset-0 bg-black/60 z-0 pointer-events-none"></div>

      {appMode === 'lobby' && (
        <div className="relative z-20 flex flex-col lg:flex-row items-stretch justify-center gap-8 lg:gap-12 2xl:gap-20 w-full max-w-[95vw] 2xl:max-w-[1600px] my-auto py-8">
          <div className="flex flex-col items-center justify-between bg-gray-900/80 p-6 md:p-10 lg:p-12 rounded-3xl border border-gray-700 shadow-2xl backdrop-blur-md flex-1">
            <h1 className="text-5xl md:text-6xl lg:text-7xl 2xl:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-6 md:mb-8 drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)] text-center leading-tight tracking-tight break-keep">
              단축키 마스터
            </h1>
            <div className="flex flex-col gap-4 md:gap-6 w-full max-w-sm">
              <button onClick={() => setAppMode('single')} className="w-full py-4 md:py-6 bg-blue-600 hover:bg-blue-500 text-white font-black text-2xl md:text-3xl rounded-2xl transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.5)]">
                혼자 하기
              </button>
              <button onClick={() => setAppMode('multi')} className="w-full py-4 md:py-6 bg-purple-600 hover:bg-purple-500 text-white font-black text-2xl md:text-3xl rounded-2xl transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(147,51,234,0.5)]">
                멀티플레이 대전
              </button>
              <button onClick={() => setAppMode('ai')} className="w-full py-4 md:py-6 bg-pink-600 hover:bg-pink-500 text-white font-black text-2xl md:text-3xl rounded-2xl transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(219,39,119,0.5)]">
                VS 인공지능
              </button>
            </div>

            <div className="mt-6 md:mt-8 text-center bg-gray-800/80 p-4 md:p-6 rounded-2xl border border-gray-600 w-full max-w-sm shadow-xl">
              <div className="text-left text-gray-200 text-base md:text-xl font-bold leading-relaxed space-y-3 break-keep">
                <p>🔥 <span className="text-pink-400">상단 미션과 같은 단축키</span>를 터뜨리면 <span className="text-yellow-400 text-xl md:text-2xl">점수 5배!</span></p>
                <p>⚡ 연속으로 터뜨리면 <span className="text-blue-400">콤보(Combo) 배수</span>가 곱해집니다!</p>
              </div>
              <h3 className="text-red-500 font-black text-lg md:text-xl mt-4 flex items-center justify-center gap-2 animate-pulse bg-red-900/40 py-2 rounded-xl border border-red-500/50">
                ⌨️ PC 전용 (키보드 필수)
              </h3>
            </div>
          </div>
          
          <div className="flex flex-col items-center bg-gray-900/80 p-6 md:p-10 lg:p-12 rounded-3xl border border-gray-700 shadow-2xl backdrop-blur-md flex-1 min-w-[300px] md:min-w-[400px] lg:min-w-[500px]">
             <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-yellow-400 mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
               🏆 1인 모드 랭킹 🏆
             </h2>
             <div className="w-full flex-1 min-h-0 flex flex-col gap-3 md:gap-4 overflow-y-auto pr-2 custom-scrollbar">
               {rankings.length === 0 ? (
                 <div className="text-gray-500 text-center py-10 md:py-20 font-bold text-xl md:text-2xl">아직 기록이 없습니다.</div>
               ) : (
                 rankings.map((r, i) => (
                   <div key={i} className="flex justify-between items-center bg-gray-800/80 p-4 md:p-6 rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors">
                     <div className="flex items-center gap-4 md:gap-6">
                       <span className={`font-black text-2xl md:text-4xl w-8 md:w-10 text-center ${i===0?'text-yellow-400 drop-shadow-[0_0_8px_yellow]':i===1?'text-gray-300 drop-shadow-[0_0_8px_white]':i===2?'text-orange-400 drop-shadow-[0_0_8px_orange]':'text-gray-500'}`}>{i+1}</span>
                       <span className="text-white font-bold text-xl md:text-3xl truncate max-w-[150px] md:max-w-[250px]">{r.name}</span>
                     </div>
                     <span className="text-blue-300 font-mono font-black text-2xl md:text-4xl">{r.score}</span>
                   </div>
                 ))
               )}
             </div>
          </div>
        </div>
      )}

      {appMode === 'single' && (
        <div className="relative z-20 w-full flex flex-col items-center">
          {renderSinglePlayer()}
        </div>
      )}

      {(appMode === 'multi' || appMode === 'ai') && (
        <div className="relative z-20 w-full flex flex-col items-center">
          <MultiplayerView 
            mode={appMode} 
            onExit={() => setAppMode('lobby')} 
          />
        </div>
      )}
    </div>
  );
}
