export type ProductCategory = 'normal' | 'reservation' | 'collab';
export type RegistrationStatus = 'pending' | 'registered' | 'not_needed';

export const PRODUCT_CATEGORIES: ProductCategory[] = ['normal', 'reservation', 'collab'];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  normal: '通常',
  reservation: '予約',
  collab: 'コラボ',
};

export const REGISTRATION_STATUSES: RegistrationStatus[] = ['pending', 'registered', 'not_needed'];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: '未登録',
  registered: '登録済',
  not_needed: '不要',
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: ProductCategory;
  launchDate: string | null;        // 公開日
  releaseDate: string | null;       // 発売日
  reservationStart: string | null;  // 予約開始日
  reservationEnd: string | null;    // 予約終了日
  futureshopStatus: RegistrationStatus;
  zozoStatus: RegistrationStatus;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
