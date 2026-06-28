import { Bubble } from './Bubble';
import { findMatchingShortcut, SHORTCUTS } from './ShortcutTable';
import type { Shortcut } from './ShortcutTable';

export class Grid {
  rows: number;
  cols: number;
  bubbleRadius: number;
  bubbles: (Bubble | null)[][];
  startY: number; // The Y offset for when grid drops
  offsetX: number; // For horizontal centering

  constructor(rows: number, cols: number, bubbleRadius: number) {
    this.rows = rows;
    this.cols = cols;
    this.bubbleRadius = bubbleRadius;
    this.startY = 0;
    this.offsetX = (600 - (cols * bubbleRadius * 2)) / 2; // Assuming 600 width for now
    this.bubbles = Array(rows).fill(null).map(() => Array(cols).fill(null));
  }

  getBubbleXY(row: number, col: number) {
    const xOffset = (row % 2 === 0) ? this.bubbleRadius : this.bubbleRadius * 2;
    const x = col * this.bubbleRadius * 2 + xOffset + this.offsetX;
    const y = row * this.bubbleRadius * Math.sqrt(3) + this.bubbleRadius + this.startY;
    return { x, y };
  }

  getGridPosition(x: number, y: number) {
    const row = Math.round((y - this.startY - this.bubbleRadius) / (this.bubbleRadius * Math.sqrt(3)));
    const xOffset = (row % 2 === 0) ? this.bubbleRadius : this.bubbleRadius * 2;
    const col = Math.round((x - this.offsetX - xOffset) / (this.bubbleRadius * 2));
    return { row, col };
  }

  getNeighbors(row: number, col: number) {
    const isEven = row % 2 === 0;
    const directions = isEven
      ? [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
      : [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];
    
    return directions.map(d => ({ r: row + d[0], c: col + d[1] }))
                     .filter(p => p.r >= 0 && p.r < this.rows && p.c >= 0 && p.c < this.cols)
                     .map(p => ({ r: p.r, c: p.c, bubble: this.bubbles[p.r][p.c] }));
  }

  // 빈칸이 기존 버블 또는 천장(row 0)에 인접한지 검사
  private hasAdjacentBubbleOrCeiling(row: number, col: number): boolean {
    if (row === 0) return true; // 천장에 직접 닿으면 항상 OK
    const neighbors = this.getNeighbors(row, col);
    return neighbors.some(n => n.bubble !== null);
  }

  snapBubble(bubble: Bubble): boolean {
    const initialPos = this.getGridPosition(bubble.x, bubble.y);
    let pos = { row: initialPos.row, col: initialPos.col };
    if (pos.row < 0) pos.row = 0;
    if (pos.col < 0) pos.col = 0;
    if (pos.col >= this.cols) pos.col = this.cols - 1;

    // Check if the mapped cell is occupied (due to grid discreteness, it often is)
    const isOccupied = pos.row < this.rows && this.bubbles[pos.row][pos.col] !== null;

    if (isOccupied) {
      // Find empty neighboring cell candidates
      type Candidate = { r: number; c: number; dist: number };
      const candidates: Candidate[] = [];
      
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = pos.row + dr;
          const nc = pos.col + dc;
          // Allow nr to go beyond this.rows to snap to the bottom of the grid
          if (nr >= 0 && nc >= 0 && nc < this.cols) {
            const isCandOccupied = nr < this.rows && this.bubbles[nr][nc] !== null;
            if (!isCandOccupied) {
              const xy = this.getBubbleXY(nr, nc);
              const dx = xy.x - bubble.x;
              const dy = xy.y - bubble.y;
              candidates.push({ r: nr, c: nc, dist: dx * dx + dy * dy });
            }
          }
        }
      }
      
      // Sort candidates by physical distance to the bubble's center
      candidates.sort((a, b) => a.dist - b.dist);
      let foundEmpty = false;
      for (const cand of candidates) {
        if (this.hasAdjacentBubbleOrCeiling(cand.r, cand.c)) {
          pos.row = cand.r;
          pos.col = cand.c;
          foundEmpty = true;
          break;
        }
      }
      
      // Fallback
      if (!foundEmpty) {
        pos.row = this.rows;
        pos.col = Math.min(initialPos.col, this.cols - 1);
      }
    }

    // Expand rows if needed
    while (pos.row >= this.rows) {
      this.bubbles.push(Array(this.cols).fill(null));
      this.rows++;
    }

    this.bubbles[pos.row][pos.col] = bubble;
    bubble.row = pos.row;
    bubble.col = pos.col;
    const exactXY = this.getBubbleXY(pos.row, pos.col);
    bubble.x = exactXY.x;
    bubble.y = exactXY.y;
    bubble.vx = 0;
    bubble.vy = 0;
    return true;
  }

  // 모든 버블의 화면 좌표를 row/col 기반으로 재계산
  recalculatePositions() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.bubbles[r]?.[c];
        if (b) {
          b.row = r;
          b.col = c;
          const xy = this.getBubbleXY(r, c);
          b.x = xy.x;
          b.y = xy.y;
        }
      }
    }
  }

  findMatches(startRow: number, startCol: number): { matchedBubbles: Bubble[], shortcut: Shortcut } | null {
    const startBubble = this.bubbles[startRow][startCol];
    if (!startBubble) return null;

    let bestMatch: { matchedBubbles: Bubble[], shortcut: Shortcut } | null = null;
    let maxKeys = 0;

    // Helper to traverse and collect paths up to length 3
    const traverse = (currentR: number, currentC: number, path: Bubble[], visited: Set<Bubble>) => {
      if (path.length > 3) return; // Max shortcut length is 3 currently

      const keys = path.map(b => b.key);
      const match = findMatchingShortcut(keys);
      if (match && keys.length > maxKeys) {
        maxKeys = keys.length;
        bestMatch = { matchedBubbles: [...path], shortcut: match };
      }

      const neighbors = this.getNeighbors(currentR, currentC);
      for (const n of neighbors) {
        if (n.bubble && !visited.has(n.bubble)) {
          visited.add(n.bubble);
          path.push(n.bubble);
          traverse(n.r, n.c, path, visited);
          path.pop();
          visited.delete(n.bubble);
        }
      }
    };

    const initialVisited = new Set<Bubble>([startBubble]);
    traverse(startRow, startCol, [startBubble], initialVisited);

    if (bestMatch) {
      // Chain reaction: Expand matched bubbles to all connected bubbles with the same keys
      bestMatch.matchedBubbles = this.getConnectedSameKeys(bestMatch.matchedBubbles);
    }

    return bestMatch;
  }

  // Find all connected bubbles that share the same key as any of the initial bubbles
  getConnectedSameKeys(initialBubbles: Bubble[]): Bubble[] {
    const toDestroy = new Set<Bubble>(initialBubbles);
    const stack = [...initialBubbles];

    while (stack.length > 0) {
      const b = stack.pop()!;
      const neighbors = this.getNeighbors(b.row, b.col);
      for (const n of neighbors) {
        if (n.bubble && n.bubble.key === b.key && !toDestroy.has(n.bubble)) {
          toDestroy.add(n.bubble);
          stack.push(n.bubble);
        }
      }
    }

    return Array.from(toDestroy);
  }

  // Find bubbles that are disconnected from the top
  findFloatingBubbles(): Bubble[] {
    const connected = new Set<Bubble>();
    const stack: Bubble[] = [];

    // Start with all bubbles in the top row
    for (let c = 0; c < this.cols; c++) {
      const b = this.bubbles[0]?.[c];
      if (b) {
        connected.add(b);
        stack.push(b);
      }
    }

    // Flood fill
    while (stack.length > 0) {
      const b = stack.pop()!;
      const neighbors = this.getNeighbors(b.row, b.col);
      for (const n of neighbors) {
        if (n.bubble && !connected.has(n.bubble)) {
          connected.add(n.bubble);
          stack.push(n.bubble);
        }
      }
    }

    const floating: Bubble[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.bubbles[r]?.[c];
        if (b && !connected.has(b)) {
          floating.push(b);
        }
      }
    }

    return floating;
  }

  getExactHintType(startRow: number, startCol: number, activeKey: string): 'none' | '2key' | '3key' {
    const startBubble = this.bubbles[startRow][startCol];
    if (!startBubble || startBubble.key === activeKey) return 'none';

    let canComplete3Key = false;
    let formsShortcut = false;

    // Check if they are part of any shortcut together
    const matchingShortcuts = SHORTCUTS.filter(sc => sc.keys.includes(activeKey) && sc.keys.includes(startBubble.key));
    if (matchingShortcuts.length === 0) return 'none';

    // Helper to traverse and collect paths up to length 2 (since activeKey is the 3rd)
    const traverse = (currentR: number, currentC: number, path: Bubble[], visited: Set<Bubble>) => {
      if (path.length > 2) return;

      const keys = [activeKey, ...path.map(b => b.key)];
      const match = findMatchingShortcut(keys);
      if (match) {
        formsShortcut = true;
        if (keys.length === 3) canComplete3Key = true;
      }

      const neighbors = this.getNeighbors(currentR, currentC);
      for (const n of neighbors) {
        if (n.bubble && !visited.has(n.bubble)) {
          visited.add(n.bubble);
          path.push(n.bubble);
          traverse(n.r, n.c, path, visited);
          path.pop();
          visited.delete(n.bubble);
        }
      }
    };

    const initialVisited = new Set<Bubble>([startBubble]);
    traverse(startRow, startCol, [startBubble], initialVisited);

    if (canComplete3Key) return '3key';
    return '2key';
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.bubbles[r]?.[c];
        if (b) {
          b.draw(ctx);
        }
      }
    }
  }
}
