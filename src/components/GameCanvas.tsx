import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { GameEngine } from '../game/GameEngine';
import type { Shortcut } from '../game/ShortcutTable';

export interface GameCanvasProps {
  onScoreUpdate: (score: number, combo: number, mission: Shortcut) => void;
  onShotFired: (shotsLeft: number) => void;
  onShortcutMatched: (shortcut: Shortcut, x: number, y: number, isMissionBonus: boolean) => void;
  onGameOver: (score: number) => void;
  onScreenShake: () => void;
  onAttackTriggered?: (type: 'normal' | 'huge' | 'medium') => void;
  speedUpStartTime?: number;
}

export interface GameCanvasRef {
  receiveAttack: (lines: number) => void;
  getSnapshot: () => (string | null)[][];
  triggerBotAction: () => void;
  stopGame: () => void;
}

export const GameCanvas = forwardRef<GameCanvasRef, GameCanvasProps>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useImperativeHandle(ref, () => ({
    receiveAttack: (lines: number) => {
      if (engineRef.current) engineRef.current.receiveAttack(lines);
    },
    getSnapshot: () => {
      return engineRef.current ? engineRef.current.getSnapshot() : [];
    },
    triggerBotAction: () => {
      if (engineRef.current && engineRef.current.state === 'playing') {
        engineRef.current.shoot();
      }
    },
    stopGame: () => {
      if (engineRef.current) {
        engineRef.current.state = 'gameover';
      }
    }
  }));

  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (engineRef.current) engineRef.current.shoot();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use fixed logical size
    canvas.width = 600;
    canvas.height = 800;

    engineRef.current = new GameEngine(canvas.width, canvas.height, {
      onScoreUpdate: (s, c, m) => propsRef.current.onScoreUpdate(s, c, m),
      onShotFired: (s) => propsRef.current.onShotFired(s),
      onShortcutMatched: (sc, x, y, isBonus) => propsRef.current.onShortcutMatched(sc, x, y, isBonus),
      onGameOver: (s) => propsRef.current.onGameOver(s),
      onScreenShake: () => propsRef.current.onScreenShake(),
      onAttackTriggered: (type) => propsRef.current.onAttackTriggered?.(type),
      speedUpStartTime: propsRef.current.speedUpStartTime
    });

    let animationId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (engineRef.current) {
        // Handle keyboard aiming
        if (keys.current['a'] || keys.current['arrowleft']) {
          engineRef.current.rotateAim(-0.6 * dt); // 조준 좌회전 (정밀)
        }
        if (keys.current['d'] || keys.current['arrowright']) {
          engineRef.current.rotateAim(0.6 * dt); // 조준 우회전 (정밀)
        }

        engineRef.current.update(dt);
        engineRef.current.draw(ctx);
      }
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationId);
  }, []); // Only run once on mount

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engineRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    engineRef.current.setAim(x, y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    handlePointerMove(e); // Ensure aim is updated before shooting
    engineRef.current.shoot();
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      className="w-full h-full block touch-none cursor-crosshair z-10 relative"
    />
  );
});
