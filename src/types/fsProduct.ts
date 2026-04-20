export type FsProduct = {
  id: string;
  userId: string;
  productNo: string;           // 商品番号
  productUrlCode: string | null; // 商品URLコード
  name: string | null;
  createdAt: number;
  updatedAt: number;
};

export type FsProductSku = {
  id: string;
  userId: string;
  fsProductId: string | null;
  productNo: string | null;    // 商品番号
  skuNo: string;               // 商品管理番号
  skuName: string | null;
  rawData: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};
