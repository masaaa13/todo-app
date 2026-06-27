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
  imageUrl?: string;
};

export type MdVariation = {
  productNo: string;
  productName: string;
  skuCode: string;
  color?: string;
  size?: string;
  category: string;
  releaseDate?: string;
  status: string;
  nextAction: string;
  ecStock?: number | null;
  recentSales?: number | null;
  sellThroughRate?: number | null;
  imageUrl?: string;
};

export type WishlistItem = {
  productNo: string;
  productName: string;
  skuCode: string;
  color?: string;
  size?: string;
  category: string;
  releaseDate?: string;
  skuCount?: number;
  status: string;
  reason: string;
  priority: '高' | '中' | '低';
  suggestedAction: string;
  imageUrl?: string;
};
