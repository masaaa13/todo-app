export type CandidateStatus = 'A' | 'B' | 'C' | 'considering' | 'approved' | 'rejected';
export type CandidatePriority = 'high' | 'medium' | 'low';

export const CANDIDATE_STATUSES: CandidateStatus[] = ['A', 'B', 'C', 'considering', 'approved', 'rejected'];

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  A:           'A（強推し）',
  B:           'B（検討中）',
  C:           'C（保留）',
  considering: '検討中',
  approved:    '承認',
  rejected:    '却下',
};

export const CANDIDATE_PRIORITIES: CandidatePriority[] = ['high', 'medium', 'low'];

export const CANDIDATE_PRIORITY_LABELS: Record<CandidatePriority, string> = {
  high:   '高',
  medium: '中',
  low:    '低',
};

export type InventoryCandidate = {
  id: string;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  priority: CandidatePriority;
  reason: string | null;
  status: CandidateStatus;
  comment: string | null;
  createdAt: number;
  updatedAt: number;
};

export type InventoryCandidateInput = Omit<InventoryCandidate, 'id' | 'createdAt' | 'updatedAt'>;
