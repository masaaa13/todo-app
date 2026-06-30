export type CandidateRuleSettings = {
  hotMinStock: number;
  hotMinSalesQty: number;
  deadMinStock: number;
  deadMaxSalesQty: number;
};

export const DEFAULT_CANDIDATE_RULE_SETTINGS: CandidateRuleSettings = {
  hotMinStock: 1,
  hotMinSalesQty: 3,
  deadMinStock: 1,
  deadMaxSalesQty: 0,
};

const CANDIDATE_RULE_SETTINGS_KEY = 'ecTodo.candidateRuleSettings';

function safeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function normalizeCandidateRuleSettings(value: unknown): CandidateRuleSettings {
  const raw =
    value != null && typeof value === 'object'
      ? value as Partial<Record<keyof CandidateRuleSettings, unknown>>
      : {};

  return {
    hotMinStock: safeNumber(raw.hotMinStock, DEFAULT_CANDIDATE_RULE_SETTINGS.hotMinStock),
    hotMinSalesQty: safeNumber(raw.hotMinSalesQty, DEFAULT_CANDIDATE_RULE_SETTINGS.hotMinSalesQty),
    deadMinStock: safeNumber(raw.deadMinStock, DEFAULT_CANDIDATE_RULE_SETTINGS.deadMinStock),
    deadMaxSalesQty: safeNumber(raw.deadMaxSalesQty, DEFAULT_CANDIDATE_RULE_SETTINGS.deadMaxSalesQty),
  };
}

export function loadCandidateRuleSettings(): CandidateRuleSettings {
  try {
    const raw = window.localStorage.getItem(CANDIDATE_RULE_SETTINGS_KEY);
    if (!raw) return DEFAULT_CANDIDATE_RULE_SETTINGS;
    return normalizeCandidateRuleSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_CANDIDATE_RULE_SETTINGS;
  }
}

export function saveCandidateRuleSettings(settings: CandidateRuleSettings): CandidateRuleSettings {
  const normalized = normalizeCandidateRuleSettings(settings);

  try {
    window.localStorage.setItem(CANDIDATE_RULE_SETTINGS_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('candidate rule settings save failed', error);
  }

  return normalized;
}
