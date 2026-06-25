export type MdProduct = {
  productNo: string;
  productName: string;
  category: string;
  releaseDate?: string;
  skuCount?: number;
  ecStock?: number | null;
  recentSales?: number | null;
  sellThroughRate?: number | null;
  status: string;
  nextAction: string;
};

export type WishlistItem = {
  productNo: string;
  productName: string;
  category: string;
  status: string;
  releaseDate?: string;
  skuCount?: number;
  reason: string;
  priority: '高' | '中' | '低';
  suggestedAction: string;
};
