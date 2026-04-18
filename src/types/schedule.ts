export type EventType =
  | 'new_release'
  | 'collab_launch'
  | 'reservation_start'
  | 'reservation_end'
  | 'futureshop_deadline'
  | 'zozo_deadline'
  | 'banner_change'
  | 'line_blast'
  | 'mailmag'
  | 'sns_post'
  | 'other';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  new_release:          '新商品発売',
  collab_launch:        'コラボ公開',
  reservation_start:    '予約開始',
  reservation_end:      '予約終了',
  futureshop_deadline:  'futureshop期限',
  zozo_deadline:        'ZOZO期限',
  banner_change:        'バナー差替',
  line_blast:           'LINE配信',
  mailmag:              'メルマガ',
  sns_post:             'SNS投稿',
  other:                'その他',
};

export const EVENT_TYPES: EventType[] = Object.keys(EVENT_TYPE_LABELS) as EventType[];

export type ProductSchedule = {
  id: string;
  productId: string | null;
  eventType: EventType;
  scheduledAt: string;    // YYYY-MM-DD
  title: string | null;
  done: boolean;
  notes: string | null;
  createdAt: number;
};

export type ProductScheduleInput = Omit<ProductSchedule, 'id' | 'createdAt'>;

// Unified view type — combines product-derived events and manual schedule entries
export type ScheduleEvent = {
  key: string;
  date: string;
  eventType: EventType;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  title: string;
  done: boolean;
  source: 'product_field' | 'manual';
  scheduleId?: string; // only for manual events
};
