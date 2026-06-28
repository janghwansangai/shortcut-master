import { isModifier } from './ShortcutTable';

export class Bubble {
  x: number;
  y: number;
  radius: number;
  key: string;
  isModifierKey: boolean;
  type: 'normal' | 'bomb' = 'normal';
  
  // For grid position
  row: number = -1;
  col: number = -1;

  // Velocity for moving bubbles
  vx: number = 0;
  vy: number = 0;
  
  // Physics for falling bubbles
  isFalling: boolean = false;
  
  // Hinting
  isHinted: boolean = false;
  hintType: 'none' | '2key' | '3key' = 'none';

  constructor(x: number, y: number, radius: number, key: string) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.key = key;
    this.isModifierKey = isModifier(key);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    
    // Draw bubble base
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    
    if (this.type === 'bomb') {
      // 폭탄 블럭 (검은색 바디, 붉은색 글로우)
      ctx.fillStyle = '#1F2937'; // gray-800
      ctx.strokeStyle = '#EF4444'; // red-500
      ctx.shadowColor = '#DC2626';
      ctx.shadowBlur = 10;
    } else if (this.hintType === '3key') {
      // 3키 조합 힌트: 강력한 핑크/자주색으로 완전히 다르게 표시
      ctx.fillStyle = '#EC4899'; // pink-500
      ctx.strokeStyle = '#BE185D'; // pink-700
      ctx.shadowColor = '#F472B6'; // pink-400
      ctx.shadowBlur = 25;
    } else if (this.isModifierKey) {
      // 보조키: 노란색
      ctx.fillStyle = '#FCD34D'; // amber-300
      ctx.strokeStyle = '#F59E0B'; // amber-500
      ctx.shadowColor = '#FBBF24';
      ctx.shadowBlur = this.hintType === '2key' || this.isHinted ? 15 : 0;
    } else {
      // 일반키: 파란색
      ctx.fillStyle = '#60A5FA'; // blue-400
      ctx.strokeStyle = '#3B82F6'; // blue-500
      ctx.shadowColor = '#93C5FD';
      ctx.shadowBlur = this.hintType === '2key' || this.isHinted ? 15 : 0;
    }
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.shadowBlur = 0; // 초기화
    ctx.stroke();

    // Highlight reflection
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    // Text or Icon
    if (this.type === 'bomb') {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold 20px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', this.x, this.y);
    } else {
      if (this.isModifierKey) {
        ctx.fillStyle = '#111827'; // Dark gray/black for yellow modifier bubbles
      } else {
        ctx.fillStyle = this.isHinted ? '#78350F' : '#ffffff'; // Amber-900 or White
      }
      ctx.font = `bold ${this.isModifierKey ? 12 : 16}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.key, this.x, this.y);
    }

    ctx.restore();
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    if (this.isFalling) {
      this.vy += 1000 * dt; // Gravity
    }
  }
}
