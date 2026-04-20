export type ImportJobStatus = 'reviewing' | 'done' | 'cancelled';
export type ImportRowStatus = 'new' | 'duplicate' | 'has_diff';

export const IMPORT_ROW_STATUS_LABELS: Record<ImportRowStatus, string> = {
  new:       '新規',
  duplicate: '重複',
  has_diff:  '差分あり',
};

export type ImportJob = {
  id: string;
  userId: string;
  filename: string;
  status: ImportJobStatus;
  sheetName: string | null;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  diffCount: number;
  importedCount: number;
  createdAt: number;
  updatedAt: number;
};

export type ImportRow = {
  id: string;
  jobId: string;
  userId: string;
  sheetName: string;
  rowIndex: number;
  productNo: string | null;
  skuNo: string | null;
  productUrlCode: string | null;
  rawData: Record<string, string>;
  diffData: Record<string, { old: string; new: string }> | null;
  rowStatus: ImportRowStatus;
  selected: boolean;
  errorMessage: string | null;
  createdAt: number;
};
