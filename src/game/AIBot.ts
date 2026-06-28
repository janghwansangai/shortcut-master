export class AIBot {
  private intervalId: any = null;
  public difficulty: 'easy' | 'medium' | 'hard';
  
  constructor(difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
    this.difficulty = difficulty;
  }

  start(onAction: () => void) {
    if (this.intervalId) return;

    // easy: 4s, medium: 2.5s, hard: 1.5s
    const delays = { easy: 4000, medium: 2500, hard: 1500 };
    const delay = delays[this.difficulty];

    this.intervalId = setInterval(() => {
      onAction();
    }, delay);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
