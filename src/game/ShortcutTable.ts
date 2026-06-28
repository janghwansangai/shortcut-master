export type Shortcut = {
  keys: string[];
  action: string;
  description: string;
  icon: string;
  score: number;
  tier: number; // 난이도 티어 (1=초급, 2=중급, 3=고급)
};

// 티어 1: 초급 - Ctrl 기반 기본 단축키
const TIER1: Shortcut[] = [
  { keys: ['Ctrl', 'C'], action: '복사', description: '선택한 항목을 클립보드에 복사', icon: '📋', score: 100, tier: 1 },
  { keys: ['Ctrl', 'V'], action: '붙여넣기', description: '클립보드 내용 붙여넣기', icon: '📥', score: 100, tier: 1 },
  { keys: ['Ctrl', 'X'], action: '잘라내기', description: '선택한 항목 잘라내기', icon: '✂️', score: 100, tier: 1 },
  { keys: ['Ctrl', 'Z'], action: '실행 취소', description: '이전 작업 취소', icon: '↩️', score: 100, tier: 1 },
  { keys: ['Ctrl', 'S'], action: '저장', description: '현재 작업 저장', icon: '💾', score: 100, tier: 1 },
  { keys: ['Ctrl', 'A'], action: '전체 선택', description: '모든 항목 선택', icon: '✅', score: 100, tier: 1 },
];

// 티어 2: 중급 - Alt/Win 기반, 덜 쓰이는 Ctrl 단축키
const TIER2: Shortcut[] = [
  { keys: ['Ctrl', 'F'], action: '찾기', description: '텍스트 검색', icon: '🔍', score: 150, tier: 2 },
  { keys: ['Ctrl', 'N'], action: '새 창', description: '새 창/문서 열기', icon: '🆕', score: 150, tier: 2 },
  { keys: ['Ctrl', 'W'], action: '탭 닫기', description: '현재 탭/창 닫기', icon: '❌', score: 150, tier: 2 },
  { keys: ['Ctrl', 'T'], action: '새 탭', description: '브라우저 새 탭 열기', icon: '🌍', score: 150, tier: 2 },
  { keys: ['Alt', 'Tab'], action: '창 전환', description: '열린 창 빠르게 전환', icon: '🔄', score: 150, tier: 2 },
  { keys: ['Alt', 'F4'], action: '창 닫기', description: '현재 프로그램 닫기', icon: '💥', score: 150, tier: 2 },
  { keys: ['Win', 'D'], action: '바탕화면', description: '바탕화면 표시/숨김', icon: '🖥️', score: 150, tier: 2 },
  { keys: ['Win', 'L'], action: '화면 잠금', description: '컴퓨터 화면 잠금', icon: '🔒', score: 150, tier: 2 },
  { keys: ['Win', 'E'], action: '탐색기', description: '파일 탐색기 열기', icon: '📁', score: 150, tier: 2 },
  { keys: ['Win', 'V'], action: '클립보드 이력', description: '이전 복사 항목 보기', icon: '📜', score: 150, tier: 2 },
];

// 티어 3: 고급 - 3키 조합, 잘 모르는 단축키
const TIER3: Shortcut[] = [
  { keys: ['Win', 'Shift', 'S'], action: '화면 캡처', description: '화면 일부 캡처', icon: '📸', score: 300, tier: 3 },
  { keys: ['Ctrl', 'Shift', 'S'], action: '다른 이름 저장', description: '새 이름으로 저장', icon: '💾', score: 300, tier: 3 },
  { keys: ['Ctrl', 'Shift', 'Esc'], action: '작업 관리자', description: '작업 관리자 실행', icon: '⚙️', score: 300, tier: 3 },
  { keys: ['Ctrl', 'Shift', 'T'], action: '탭 복구', description: '닫은 탭 다시 열기', icon: '♻️', score: 300, tier: 3 },
  { keys: ['Ctrl', 'Shift', 'V'], action: '서식없이 붙여넣기', description: '텍스트만 붙여넣기', icon: '📝', score: 300, tier: 3 },
];

export const SHORTCUTS: Shortcut[] = [...TIER1, ...TIER2, ...TIER3];

export const MODIFIER_KEYS = ['Ctrl', 'Shift', 'Alt', 'Win'];

export const ALL_KEYS = Array.from(new Set(SHORTCUTS.flatMap(s => s.keys)));
export const NORMAL_KEYS = ALL_KEYS.filter(k => !MODIFIER_KEYS.includes(k));

export function isModifier(key: string): boolean {
  return MODIFIER_KEYS.includes(key);
}

export function findMatchingShortcut(keys: string[]): Shortcut | null {
  for (const shortcut of SHORTCUTS) {
    if (shortcut.keys.length === keys.length) {
      const isMatch = shortcut.keys.every(k => keys.includes(k));
      if (isMatch) return shortcut;
    }
  }
  return null;
}

export function hasCombination(key1: string, key2: string): boolean {
  if (key1 === key2) return false;
  return SHORTCUTS.some(sc => sc.keys.includes(key1) && sc.keys.includes(key2));
}

export function getCombinationType(key1: string, key2: string): 'none' | '2key' | '3key' {
  if (key1 === key2) return 'none';
  const matchingShortcuts = SHORTCUTS.filter(sc => sc.keys.includes(key1) && sc.keys.includes(key2));
  if (matchingShortcuts.length === 0) return 'none';
  if (matchingShortcuts.some(sc => sc.keys.length >= 3)) return '3key';
  return '2key';
}

// ─── 티어 기반 난이도 시스템 ────────────────────────────────────────────────
// currentLevel: 정답 맞춘 총 횟수. 10번마다 티어가 올라감.
// 티어1(0~9번): Ctrl + 기본키만
// 티어2(10~19번): Ctrl + Alt + Win 기반
// 티어3(20번~): 3키 조합 포함

export function getCurrentTier(matchCount: number): number {
  if (matchCount < 10) return 1;
  if (matchCount < 20) return 2;
  return 3;
}

// 현재 티어에 맞는 단축키 목록에서 키를 뽑음
export function getRandomWeightedKey(matchCount: number = 0): string {
  const tier = getCurrentTier(matchCount);

  // 사용 가능한 단축키 (현재 티어 이하만)
  const activeSC = SHORTCUTS.filter(sc => sc.tier <= tier);
  const activeKeys = Array.from(new Set(activeSC.flatMap(s => s.keys)));

  // 가중치: 해당 단축키에 여러 번 등장하는 키일수록 더 자주 나옴
  const weights: Record<string, number> = {};
  activeKeys.forEach(k => (weights[k] = 0));
  activeSC.forEach(sc => {
    sc.keys.forEach(k => {
      weights[k] = (weights[k] || 0) + 3;
    });
  });

  let total = 0;
  for (const w of Object.values(weights)) total += w;

  let rand = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) {
    rand -= w;
    if (rand <= 0) return k;
  }
  return activeKeys[0] || 'Ctrl';
}
