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
