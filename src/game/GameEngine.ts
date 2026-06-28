import { Grid } from './Grid';
import { Shooter } from './Shooter';
import { Bubble } from './Bubble';
import { isModifier, getRandomWeightedKey, getCurrentTier, SHORTCUTS } from './ShortcutTable';
import type { Shortcut } from './ShortcutTable';
import { audioFX } from './AudioFX';

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  
  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 500 + 100;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.maxLife = Math.random() * 0.4 + 0.2;
    this.life = this.maxLife;
    this.color = color;
    this.size = Math.random() * 8 + 4;
  }
  
  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  
  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

export type GameState = 'playing' | 'gameover' | 'clear';

export interface GameEventCallbacks {
  onScoreUpdate: (score: number, combo: number, mission: Shortcut) => void;
  onShotFired: (shotsLeftToDrop: number) => void;
  onShortcutMatched: (shortcut: Shortcut, x: number, y: number, isMissionBonus: boolean) => void;
  onGameOver: (score: number) => void;
  onScreenShake: () => void;
  onAttackTriggered?: (type: 'normal' | 'medium' | 'huge') => void;
  speedUpStartTime?: number; // 서든데스 시작 시간 (초)
}

export class GameEngine {
  width: number;
  height: number;
  grid: Grid;
  shooter: Shooter;
  activeBubble: Bubble | null = null;
  fallingBubbles: Bubble[] = [];
  particles: Particle[] = [];
  
  state: GameState = 'playing';
  score: number = 0;
  combo: number = 0;
  matchCount: number = 0; // 총 정답 맞춘 횟수 (티어 결정)
  currentMission!: Shortcut; // 현재 수행해야 할 미션
  shotsUntilDrop: number = 5;
  timeSinceLastDrop: number = 0; // 초 단위 타이머
  dropInterval: number = 10; // 10초마다 하락
  totalGameTime: number = 0; // 게임 총 플레이 시간
  speedUpStartTime: number = 60; // 기본 1분
  
  callbacks: GameEventCallbacks;

  constructor(width: number, height: number, callbacks: GameEventCallbacks) {
    this.width = width;
    this.height = height;
    this.callbacks = callbacks;
    if (callbacks.speedUpStartTime !== undefined) {
      this.speedUpStartTime = callbacks.speedUpStartTime;
    }
    
    const bubbleRadius = 20;
    const cols = Math.floor(width / (bubbleRadius * 2)) - 1;
    this.grid = new Grid(15, cols, bubbleRadius); // Max 15 rows for now
    
    // Fill initial grid
    for(let r=0; r<4; r++) {
      for(let c=0; c<cols; c++) {
        const b = new Bubble(0, 0, bubbleRadius, getRandomWeightedKey(0));
        b.isModifierKey = isModifier(b.key);
        const xy = this.grid.getBubbleXY(r, c);
        b.x = xy.x; b.y = xy.y;
        b.row = r; b.col = c;
        this.grid.bubbles[r][c] = b;
      }
    }
    
    this.currentMission = this.getRandomMission();
    
    // 고양이 얼굴이 바닥에 딱 맞도록 발사대 높이를 조절합니다 (height - 70)
    this.shooter = new Shooter(width / 2, height - 70, bubbleRadius);
    
    // Trigger initial update to show the mission banner immediately
    if (this.callbacks.onScoreUpdate) {
      setTimeout(() => {
        this.callbacks.onScoreUpdate(this.score, this.combo, this.currentMission);
      }, 0);
    }
  }

  getRandomMission(): Shortcut {
    const tier = getCurrentTier(this.matchCount);
    const available = SHORTCUTS.filter((s: Shortcut) => s.tier <= tier);
    return available[Math.floor(Math.random() * available.length)];
  }

  update(dt: number) {
    if (this.state !== 'playing') return;

    // dt를 제한하여 프레임 드랍 시 터널링(관통) 방지
    dt = Math.min(dt, 0.033); // 최대 30fps 기준으로 제한

    this.totalGameTime += dt;
    // 설정된 시간(기본 1분) 경과 후부터 15초마다 1초씩 하락 속도 증가 (최소 3초)
    if (this.totalGameTime > this.speedUpStartTime) {
      const extraTime = this.totalGameTime - this.speedUpStartTime;
      this.dropInterval = Math.max(3, 10 - Math.floor(extraTime / 15));
    }

    // 시간 비례 하락 타이머
    this.timeSinceLastDrop += dt;
    if (this.timeSinceLastDrop >= this.dropInterval) {
      this.dropCeiling();
    }

    // Hinting logic
    const currentKey = this.activeBubble ? this.activeBubble.key : (this.shooter.currentBubble ? this.shooter.currentBubble.key : null);
    for(let r=0; r<this.grid.rows; r++) {
      for(let c=0; c<this.grid.cols; c++) {
        const b = this.grid.bubbles[r][c];
        if (b) {
          if (currentKey) {
             const type = this.grid.getExactHintType(r, c, currentKey);
             b.isHinted = type !== 'none';
             b.hintType = type;
          } else {
             b.isHinted = false;
             b.hintType = 'none';
          }
        }
      }
    }

    // Update active bubble
    if (this.activeBubble) {
      // 서브스텝 방식: 빠른 버블이 다른 버블을 관통하지 않도록
      // 한 프레임을 여러 작은 단위로 쪼개 충돌 검사
      const subSteps = 3;
      const subDt = dt / subSteps;
      
      for (let step = 0; step < subSteps; step++) {
        if (!this.activeBubble) break; // 이미 스냅됨

        this.activeBubble.update(subDt);
        
        // Wall collision (벽 반사)
        if (this.activeBubble.x - this.activeBubble.radius <= 0) {
          this.activeBubble.x = this.activeBubble.radius;
          this.activeBubble.vx *= -1;
          if (step === 0) audioFX.playBounce();
        } else if (this.activeBubble.x + this.activeBubble.radius >= this.width) {
          this.activeBubble.x = this.width - this.activeBubble.radius;
          this.activeBubble.vx *= -1;
          if (step === 0) audioFX.playBounce();
        }

        // 충돌 검사: 천장 또는 기존 버블
        let snapped = false;
        
        // 1. 천장 충돌 (절대적 - 무조건 잡음)
        if (this.activeBubble.y - this.activeBubble.radius <= this.grid.startY) {
          this.activeBubble.y = this.grid.startY + this.activeBubble.radius;
          snapped = true;
        }
        
        // 2. 기존 버블과 충돌
        if (!snapped) {
          for(let r=0; r<this.grid.rows; r++) {
            for(let c=0; c<this.grid.cols; c++) {
              const b = this.grid.bubbles[r][c];
              if (b) {
                const dx = b.x - this.activeBubble.x;
                const dy = b.y - this.activeBubble.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < b.radius * 2 * 0.9) {
                  snapped = true;
                  break;
                }
              }
            }
            if (snapped) break;
          }
        }

        // 3. 안전장치: 화면 밖으로 나간 경우 강제 스냅
        if (!snapped && this.activeBubble.y < -50) {
          this.activeBubble.y = this.grid.startY + this.activeBubble.radius;
          snapped = true;
        }

        if (snapped) {
          this.grid.snapBubble(this.activeBubble);
          this.handleSnap(this.activeBubble);
          this.activeBubble = null;
          break; // 서브스텝 루프 종료
        }
      }
    }

    // Update falling bubbles
    for (let i = this.fallingBubbles.length - 1; i >= 0; i--) {
      const b = this.fallingBubbles[i];
      b.update(dt);
      if (b.y > this.height + 50) {
        this.fallingBubbles.splice(i, 1);
        this.score += 50;
        this.callbacks.onScoreUpdate(this.score, this.combo, this.currentMission);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Check game over
    for(let c=0; c<this.grid.cols; c++) {
      for(let r=this.grid.rows-1; r>=0; r--) {
        const b = this.grid.bubbles[r][c];
        if (b && b.y + b.radius > this.height - 100) {
          this.state = 'gameover';
          this.callbacks.onGameOver(this.score);
          return;
        }
      }
    }
  }

  handleSnap(bubble: Bubble) {
    if (bubble.type === 'bomb') {
      this.explodeBomb(bubble);
      return;
    }

    const matchResult = this.grid.findMatches(bubble.row, bubble.col);
    
    if (matchResult) {
      this.combo++;
      this.matchCount++; // 정답 맞출 때마다 카운트 증가 (티어 시스템)
      const { matchedBubbles, shortcut } = matchResult;
      
      // Calculate center of matched bubbles for popup
      let cx = 0, cy = 0;
      matchedBubbles.forEach(b => {
        cx += b.x; cy += b.y;
        this.grid.bubbles[b.row][b.col] = null; // Remove from grid
      });
      cx /= matchedBubbles.length;
      cy /= matchedBubbles.length;

      // Add score & Mission Check
      const baseScore = shortcut.score || 100;
      let isMissionBonus = false;
      
      if (shortcut.action === this.currentMission.action) {
        // Mission accomplished! 5x multiplier and huge attack!
        this.score += baseScore * this.combo * 5;
        isMissionBonus = true;
        this.currentMission = this.getRandomMission();
        if (this.callbacks.onAttackTriggered) {
          this.callbacks.onAttackTriggered('huge');
        }
      } else if (shortcut.keys.length >= 3) {
        // 3-key shortcuts trigger a medium attack! 6x multiplier!
        this.score += baseScore * this.combo * 6;
        if (this.callbacks.onAttackTriggered) {
          this.callbacks.onAttackTriggered('medium');
        }
      } else {
        this.score += baseScore * this.combo;
        // 3콤보 달성 시 일반 공격 발사!
        if (this.combo > 0 && this.combo % 3 === 0 && this.callbacks.onAttackTriggered) {
          this.callbacks.onAttackTriggered('normal');
        }
      }
      
      this.callbacks.onScoreUpdate(this.score, this.combo, this.currentMission);
      this.callbacks.onShortcutMatched(shortcut, cx, cy, isMissionBonus);
      this.callbacks.onScreenShake();
      audioFX.playMatch();
    } else {
      this.combo = 0;
      this.callbacks.onScoreUpdate(this.score, this.combo, this.currentMission);
    }

    this.processFloatingAndDrop();
  }

  explodeBomb(bomb: Bubble) {
    const toExplode = new Set<Bubble>();
    toExplode.add(bomb);
    
    // BFS to find all bubbles within radius 2
    const queue = [{ b: bomb, dist: 0 }];
    while(queue.length > 0) {
      const { b, dist } = queue.shift()!;
      if (dist >= 2) continue; // 2칸 반경 이내
      const neighbors = this.grid.getNeighbors(b.row, b.col);
      for (const n of neighbors) {
        if (n.bubble && !toExplode.has(n.bubble)) {
          toExplode.add(n.bubble);
          queue.push({ b: n.bubble, dist: dist + 1 });
        }
      }
    }

    let cx = 0, cy = 0;
    toExplode.forEach(b => {
      cx += b.x; cy += b.y;
      this.grid.bubbles[b.row][b.col] = null;
    });
    cx /= toExplode.size;
    cy /= toExplode.size;

    // Add explosion particles
    for (let i = 0; i < 60; i++) {
      const colors = ['#EF4444', '#F59E0B', '#FCD34D', '#FFFFFF', '#DC2626'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push(new Particle(bomb.x, bomb.y, color));
    }

    this.score += toExplode.size * 20;
    this.callbacks.onScoreUpdate(this.score, this.combo, this.currentMission);
    
    this.callbacks.onScreenShake();
    audioFX.playMatch();

    this.processFloatingAndDrop();
  }

  getSnapshot() {
    // Return a lightweight 2D array of strings representing bubble keys or 'empty'
    return this.grid.bubbles.map(row => 
      row.map(b => b ? b.key : null)
    );
  }

  processFloatingAndDrop() {

    // 항상 고립된 버블(공중에 뜬 버블) 검사 및 낙하 처리
    const floating = this.grid.findFloatingBubbles();
    if (floating.length > 0) {
      audioFX.playDrop();
    }
    floating.forEach(b => {
      this.grid.bubbles[b.row][b.col] = null;
      b.isFalling = true;
      this.fallingBubbles.push(b);
    });

    this.shotsUntilDrop--;
    if (this.shotsUntilDrop <= 0) {
      this.dropCeiling();
    } else {
      this.callbacks.onShotFired(this.shotsUntilDrop);
    }

    this.shooter.reload(this.matchCount);
  }

  dropCeiling() {
    // 맨 위에 새로운 버블 줄을 추가합니다.
    this.grid.bubbles.unshift(Array(this.grid.cols).fill(null));
    this.grid.rows++;
    
    // 맨 윗줄에 랜덤 버블 채우기
    for (let c = 0; c < this.grid.cols; c++) {
      const b = new Bubble(0, 0, this.grid.bubbleRadius, getRandomWeightedKey(this.matchCount));
      b.row = 0; b.col = c;
      b.isModifierKey = isModifier(b.key);
      this.grid.bubbles[0][c] = b;
    }
    
    // 모든 버블의 row 인덱스와 화면 좌표 재계산
    this.grid.recalculatePositions();
    
    this.shotsUntilDrop = 5;
    this.timeSinceLastDrop = 0; // 타이머 초기화
    this.callbacks.onShotFired(this.shotsUntilDrop);
  }

  receiveAttack(lines: number) {
    for (let i = 0; i < lines; i++) {
      this.grid.bubbles.unshift(Array(this.grid.cols).fill(null));
      this.grid.rows++;
      
      for (let c = 0; c < this.grid.cols; c++) {
        const b = new Bubble(0, 0, this.grid.bubbleRadius, getRandomWeightedKey(this.matchCount));
        b.row = 0; b.col = c;
        b.isModifierKey = isModifier(b.key);
        this.grid.bubbles[0][c] = b;
      }
    }
    
    this.grid.recalculatePositions();
    this.callbacks.onScreenShake();
  }

  shoot() {
    if (this.state !== 'playing' || this.activeBubble) return;
    this.activeBubble = this.shooter.shoot();
    audioFX.playShoot();
  }

  setAim(x: number, y: number) {
    if (this.state !== 'playing') return;
    this.shooter.setAngle(x, y);
  }

  rotateAim(deltaAngle: number) {
    if (this.state !== 'playing') return;
    this.shooter.rotateAim(deltaAngle);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.width, this.height);
    this.grid.draw(ctx);
    if (this.activeBubble) this.activeBubble.draw(ctx);
    this.fallingBubbles.forEach(b => b.draw(ctx));
    this.particles.forEach(p => p.draw(ctx));
    this.shooter.draw(ctx, this.width);
  }
}
