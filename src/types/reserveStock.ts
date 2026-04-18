export type StockType = 'initial' | 'additional';

export const STOCK_TYPE_LABELS: Record<StockType, string> = {
  initial:    '初回予約分',
  additional: '追加在庫分',
};

export type ReserveStock = {
  id: string;
  productId: string;
  stockType: StockType;
  quantity: number | null;
  deliveryDate: string | null;            // 納期
  futureshopRequired: boolean;            // futureshop反映必要
  futureshopPlannedDate: string | null;   // futureshop反映予定日
  futureshopCompletedDate: string | null; // futureshop反映完了日
  switchPending: boolean;                 // 切替待ちフラグ
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ReserveStockInput = Omit<ReserveStock, 'id' | 'createdAt' | 'updatedAt'>;
