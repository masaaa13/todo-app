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

  // 在庫区分
  stockType?: 'actual' | 'preorder' | 'planned' | 'mixed' | 'unknown';
  actualStock?: number | null;
  preorderStock?: number | null;
  plannedStock?: number | null;
  availableStock?: number | null;

  // 売上データ
  salesQty7d?: number | null;
  salesQty14d?: number | null;
  salesQty30d?: number | null;
  salesAmount7d?: number | null;
  salesAmount14d?: number | null;
  salesAmount30d?: number | null;
  monthlySalesQty?: number | null;
  monthlySalesAmount?: number | null;

  // 販促・予算管理
  budgetGroup?: string;
  collaborationName?: string;
  salesType?: 'normal' | 'collaboration' | 'sale' | 'timeSale' | 'preorder' | 'planned' | 'other';
  isCollaboration?: boolean;
  isSaleTarget?: boolean;
  isTimeSaleTarget?: boolean;
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

  // 在庫区分
  stockType?: 'actual' | 'preorder' | 'planned' | 'mixed' | 'unknown';
  actualStock?: number | null;
  preorderStock?: number | null;
  plannedStock?: number | null;
  availableStock?: number | null;

  // 売上データ
  salesQty7d?: number | null;
  salesQty14d?: number | null;
  salesQty30d?: number | null;
  salesAmount7d?: number | null;
  salesAmount14d?: number | null;
  salesAmount30d?: number | null;
  monthlySalesQty?: number | null;
  monthlySalesAmount?: number | null;

  // 販促・予算管理
  budgetGroup?: string;
  collaborationName?: string;
  salesType?: 'normal' | 'collaboration' | 'sale' | 'timeSale' | 'preorder' | 'planned' | 'other';
  isCollaboration?: boolean;
  isSaleTarget?: boolean;
  isTimeSaleTarget?: boolean;

  // 欲しいもの効果測定
  wishlistAddedAt?: string;
  wishlistRequestedQty?: number | null;
  wishlistStockBefore?: number | null;
  wishlistStockAfter?: number | null;
  wishlistSalesAfter7d?: number | null;
  wishlistSalesAfter14d?: number | null;
  wishlistEffect?: '高効果' | '中効果' | '低効果' | '要確認' | '未判定';
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

  // 在庫
  actualStock?: number | null;
  availableStock?: number | null;
  stockType?: 'actual' | 'preorder' | 'planned' | 'mixed' | 'unknown';
  preorderStock?: number | null;
  plannedStock?: number | null;

  // 効果測定
  wishlistAddedAt?: string;
  wishlistRequestedQty?: number | null;
  wishlistStockBefore?: number | null;
  wishlistStockAfter?: number | null;
  wishlistSalesAfter7d?: number | null;
  wishlistSalesAfter14d?: number | null;
  wishlistEffect?: '高効果' | '中効果' | '低効果' | '要確認' | '未判定';
};

export type BudgetSummary = {
  month: string;
  monthlyBudget: number | null;
  monthlySalesAmount: number | null;
  progressRate: number | null;
  forecastAmount: number | null;
  shortageAmount: number | null;
  remainingDays: number | null;
  requiredDailySales: number | null;
  yoyRate: number | null;
};
