# Data Structure & File Layout

今後のファイル格納ルール。  
Claude Code が読み取りやすいよう input / output / reference を分ける。

---

## 推奨ディレクトリ構成

```text
sample_data/
  client_provided/
    6月展/                          ← 現在はフラット配置でOK（次回以降この構成に寄せる）
      input/
        sku/                        ← SKU xlsx（例: 再6.18_【1266SKU】...xlsx）
        caption/                    ← キャプション xlsx（例: キャプション2.xlsx）
        spec/                       ← 企画寸 xlsx（例: 企画寸(26_6月展).xlsx）
        swatch/                     ← スワッチ PDF（例: 1266スワッチ.pdf）
        md/                         ← MD表 xlsx（例: 6月展MD表.xlsx）
      output/
        ccGoods/                    ← 出力済み ccGoods.csv
        variationDetail/            ← 出力済み goodsVariationDetail.csv
        category/                   ← 出力済み category.csv
      reference/
        notes.md                    ← 品番メモ・素材判読不可リスト等
    ちびまる子/
      input/
      output/
      reference/
    3月展/
      input/
      output/
      reference/

  reference/
    radial/
      radial_intro.pdf              ← 参考資料（アパレルデータプラットフォーム）
      pages/                        ← PDF→PNG変換済みページ（Claude Code参照用）
        page-01.png
        ...
    futureshop/
      csv_specs/                    ← ccGoods/variationDetail/category の仕様書
      api_docs/                     ← futureshop API ドキュメント

  api_samples/
    futureshop/
      orders/                       ← 受注APIレスポンスサンプル（JSON）
      stock/                        ← 在庫APIレスポンスサンプル
      products/                     ← 商品APIレスポンスサンプル

  generated/
    2026-06-25_6月展/               ← 出力日_展名
      ccGoods.csv
      goodsVariationDetail.csv
      category.csv
    2026-MM-DD_展名/
      ...
```

---

## 命名規則

| 種別 | 形式 | 例 |
|------|------|----|
| 入力 SKU | `YYYYMMDD_【品番シリーズSKU】展名.xlsx` | `再6.18_【1266SKU】2026年6月展_共有.xlsx` |
| 入力 キャプション | `キャプションN.xlsx` | `キャプション2.xlsx` |
| 入力 企画寸 | `企画寸(YY_展名).xlsx` | `企画寸(26_6月展).xlsx` |
| 入力 スワッチ | `品番シリーズスワッチ.pdf` | `1266スワッチ.pdf` |
| 入力 MD表 | `展名MD表.xlsx` | `6月展MD表.xlsx` |
| 出力 ccGoods | `ccGoods_YYYYMMDD.csv` | `ccGoods_20260625.csv` |
| 出力 variationDetail | `goodsVariationDetail_YYYYMMDD.csv` | |
| 出力 category | `category_YYYYMMDD.csv` | |

---

## 移行方針

- 今ある6月展ファイルは急いで移動しなくてOK
- 次回（9月展・10月展 等）以降は `input/` サブディレクトリに配置する
- PDF参照用の `pages/` ディレクトリは `.gitignore` に追加を検討（大容量）

---

## アプリ内データ（将来）

Phase 1以降で Supabase に保存するデータ:

```text
import_jobs        ← 取込ジョブ（展・日時・件数）
import_rows        ← 取込行データ（全列生データ）
fs_products        ← futureshop 商品マスタ
fs_product_skus    ← futureshop SKUマスタ
fs_stock           ← 在庫スナップショット（日次）
fs_orders          ← 受注データ（日次累計）
```
