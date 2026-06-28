import { Bubble } from './Bubble';
import { getRandomWeightedKey } from './ShortcutTable';
import catImageSrc1 from '../assets/cat_face_1.png';
import catImageSrc2 from '../assets/cat_face_2.png';
import catImageSrc3 from '../assets/cat_face_3.png';
import catImageSrc4 from '../assets/cat_face_4.png';

const catImages = [catImageSrc1, catImageSrc2, catImageSrc3, catImageSrc4].map(src => {
  const img = new Image();
  img.src = src;
  return img;
});

export class Shooter {
  x: number;
  y: number;
  angle: number;
  nextBubble: Bubble | null = null;
  currentBubble: Bubble | null = null;
  bubbleRadius: number;
  catImageIndex: number;

  constructor(x: number, y: number, bubbleRadius: number) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2; // Pointing up
    this.bubbleRadius = bubbleRadius;
    // 0~3 사이의 랜덤 인덱스를 부여하여 생성될 때마다 다른 고양이 얼굴이 나오도록 함
    this.catImageIndex = Math.floor(Math.random() * catImages.length);
    this.reload();
  }

  getRandomKey(matchCount: number = 0) {
    return getRandomWeightedKey(matchCount);
  }

  createRandomBubble(x: number, y: number, matchCount: number): Bubble {
    const isBomb = Math.random() < 0.10; // 10% chance
    if (isBomb) {
      const b = new Bubble(x, y, this.bubbleRadius, 'BOMB');
      b.type = 'bomb';
      b.isModifierKey = false;
      return b;
    } else {
      return new Bubble(x, y, this.bubbleRadius, this.getRandomKey(matchCount));
    }
  }

  reload(matchCount: number = 0) {
    if (!this.nextBubble) {
      this.nextBubble = this.createRandomBubble(this.x + 80, this.y, matchCount);
    }
    
    this.currentBubble = this.nextBubble;
    this.currentBubble.x = this.x;
    this.currentBubble.y = this.y;
    
    this.nextBubble = this.createRandomBubble(this.x + 80, this.y, matchCount);
  }

  setAngle(targetX: number, targetY: number) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.angle = Math.atan2(dy, dx);
    // Limit angle to avoid shooting straight left/right or downwards
    if (this.angle > -0.1) this.angle = -0.1;
    if (this.angle < -Math.PI + 0.1) this.angle = -Math.PI + 0.1;
  }

  rotateAim(deltaAngle: number) {
    this.angle += deltaAngle;
    if (this.angle > -0.1) this.angle = -0.1;
    if (this.angle < -Math.PI + 0.1) this.angle = -Math.PI + 0.1;
  }

  shoot(): Bubble | null {
    if (!this.currentBubble) return null;
    
    const b = this.currentBubble;
    const speed = 1000; // pixels per second
    b.vx = Math.cos(this.angle) * speed;
    b.vy = Math.sin(this.angle) * speed;
    
    this.currentBubble = null;
    return b;
  }

  draw(ctx: CanvasRenderingContext2D, width: number) {
    // Draw shooter base
    ctx.save();
    
    // Aim line with bounce
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const maxDist = 800; // 충분히 긴 가이드선

    let hitX = this.x;
    let hitY = this.y;
    let distToWall = Infinity;

    // 왼쪽 또는 오른쪽 벽면에 부딪히는지 계산
    if (cos < 0) { // 왼쪽 벽
      distToWall = (this.bubbleRadius - this.x) / cos;
    } else if (cos > 0) { // 오른쪽 벽
      distToWall = (width - this.bubbleRadius - this.x) / cos;
    }

    if (distToWall < maxDist && distToWall > 0) {
      // 벽에 닿는 점
      hitX = this.x + cos * distToWall;
      hitY = this.y + sin * distToWall;
      ctx.lineTo(hitX, hitY);

      // 반사된 궤적 그리기 (한 번 꺾임)
      const remainingDist = maxDist - distToWall;
      const reflectCos = -cos; // x축 속도 반전
      const reflectSin = sin;  // y축 속도 유지
      
      ctx.lineTo(hitX + reflectCos * remainingDist, hitY + reflectSin * remainingDist);
    } else {
      // 벽에 닿지 않는 경우 일직선
      ctx.lineTo(this.x + cos * maxDist, this.y + sin * maxDist);
    }

    ctx.stroke();
    ctx.setLineDash([]);

    ctx.translate(this.x, this.y);

    // 1. 귀여운 고양이 얼굴 이미지 (발사대 왼쪽 옆에 고정, 랜덤 배정)
    ctx.save();
    // 바닥에 잘리지 않으면서 빈틈없이 딱 붙게 높이를 조절합니다 (y: 20)
    ctx.translate(-70, 20); 
    
    // 원형으로 클리핑해서 배경 깔끔하게 처리
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.clip();
    
    const currentCatImage = catImages[this.catImageIndex];
    if (currentCatImage.complete) {
      ctx.drawImage(currentCatImage, -45, -45, 90, 90);
    }
    
    // 귀여운 노란색 테두리 추가
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.strokeStyle = '#FDE047'; // yellow-300
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // 2. 발자국 이모지 (🐾) - 조준 방향에 따라 버블 주위를 회전
    // 🐾 이모지 방향 보정을 위해 Math.PI / 4 더해줌
    ctx.rotate(this.angle + Math.PI / 4);

    // 형광 핑크색으로 변경! 
    // 하얗게 만든 뒤 핑크색 섀도우를 강하게 주면 네온 핑크 느낌이 완성됩니다.
    ctx.filter = 'brightness(0) invert(1)';
    ctx.shadowColor = '#FF1493'; // 핫핑크(DeepPink)
    ctx.shadowBlur = 15;

    // 발자국 크기를 130%로 조정 (약 72px)
    ctx.font = '72px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    
    // 발바닥 이모지가 버블과 겹치지 않으면서도 바닥에 닿도록 오프셋(y축)을 세밀하게 조절합니다 (35).
    ctx.fillText('🐾', -15, 35); 

    // 필터와 그림자 효과 원상복구
    ctx.filter = 'none';
    ctx.shadowBlur = 0;

    ctx.restore();

    // Draw bubbles
    if (this.currentBubble) this.currentBubble.draw(ctx);
    if (this.nextBubble) {
      // Draw a label for 'Next'
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT', this.nextBubble.x, this.nextBubble.y - 25);
      this.nextBubble.draw(ctx);
    }
  }
}
