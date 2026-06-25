# futureshop API Plan

> 今回は設計のみ。実装はPhase 2以降。  
> サンプルレスポンスは `sample_data/api_samples/futureshop/` に保存する。

---

## 目的

- 商品情報・在庫・受注を futureshop API で自動取得
- Candy Stripper の MD判断・欲しいものリスト・売れ筋/死に筋検知に活用
- EC データ（futureshop）+ 店舗 POS + 倉庫 WMS の三点連携が最終ゴール

---

## 取得したいデータ

| データ種別 | 用途 |
|-----------|------|
| 商品マスタ | 品番・商品名・発売日・販売終了日・カテゴリ |
| SKU | SKU管理番号・カラー・サイズ・JAN |
| 販売価格 | 通常価格・セール価格 |
| 在庫 | EC在庫数（SKU単位・日次スナップショット） |
| 受注 | SKU別受注数・受注日・出荷日 |
| 出荷 | 実出荷数・出荷日 |
| 返品 | 返品数・返品日 |
| 発売日 | 実際の公開日（MD表と突合） |
| カテゴリ | メイングループ・サブグループ |

---

## 将来機能（取得データの活用先）

| 機能 | 必要データ |
|------|-----------|
| 週次欲しいものリスト | 在庫・売上・消化率 |
| 売れ筋検知 | 消化週数 < 販売可能週数 − n |
| 死に筋検知 | 消化週数 > 販売可能週数 + n |
| 在庫移動候補 | 店舗別在庫・店舗別売上 |
| 追加発注候補 | 消化率・残在庫・発注リードタイム |
| 店舗共有CSV/xlsx | 上記全て |

---

## 設定画面で変更できる条件（将来実装）

```text
分析対象:
  - 対象期間（直近N週）
  - 対象カテゴリ（メイングループ指定）
  - 対象品番（絞り込み・除外）

在庫条件:
  - 店舗在庫（閾値）
  - EC在庫（最低維持数）
  - 欠品/低在庫判定数

売れ筋/死に筋条件:
  - 消化率閾値
  - 発売日からの経過日数
  - n値（販売可能週数との差）

商品区分:
  - コラボ/通常商品区分
  - 除外品番リスト

在庫移動条件:
  - 店舗へ回したい在庫数
  - ECに残す最低在庫数
```

---

## 実装方針

```
Step 1: APIサンプル取得・保存
  └── sample_data/api_samples/futureshop/ に JSON保存
  └── 認証方法・エンドポイント・レート制限を確認

Step 2: 手動実行スクリプト
  └── npm run fetch:stock などで手動取得
  └── Supabase に蓄積開始

Step 3: 定期取得
  └── Supabase Edge Functions or Cron
  └── 日次・週次スナップショット

Step 4: 条件変更UI
  └── 設定タブで閾値・対象期間を変更
  └── リアルタイムプレビュー
```

---

## API認証

- futureshop API キーは環境変数で管理
- フロントエンドに直接持たない（Supabase Edge Function 経由）

```env
FUTURESHOP_API_KEY=xxxx
FUTURESHOP_SHOP_ID=xxxx
```

---

## 参考

- futureshop API ドキュメント: `sample_data/reference/futureshop/api_docs/`
- radial の機能参考: `sample_data/reference/radial/radial_intro.pdf`
  - EC / POS / WMS データ自動集計（p.10）
  - チャンス・リスクの自動アラート（p.11）
  - 商品詳細ライフサイクルtab / チャネルtab（p.14, p.15）
