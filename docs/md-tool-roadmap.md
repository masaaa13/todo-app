# Candy Stripper MD Tool Roadmap

> radial（アパレルデータプラットフォーム）を参考に、  
> futureshop EC + 店舗POS + WMS データを一元管理するMDツールを構築する。  
> 参考: `sample_data/reference/radial/radial_intro.pdf`

---

## Phase 0: 商品登録CSV生成（完了）

- SKU xlsx 取込（倉庫コード / 品番 / JAN / カラー / サイズ）
- caption / 企画寸 / スワッチ / MD表 補完
- 素材マップ（SWATCH_MATERIAL_DEFAULT）
- 販売期間From反映（MD表 週ラベル × SKU 納期列 クロスリファレンス）
- ccGoods.csv 出力（112列）
- goodsVariationDetail.csv 出力（13列）
- category.csv 出力（6列・Shift_JIS）
- 除外品番（1260001系）
- カテゴリ分類 / 例外上書き（PRODUCT_CATEGORY_OVERRIDES）

---

## Phase 1: 商品データ保存・選択出力

- 取込データをアプリ内に一時保存（localStorage or Supabase）
- 品番単位で選択・チェック
- 選択品番のみCSV出力
- 出力履歴保存（日時・展・件数）
- 「次フェーズ実装予定」ボタン → 実装

---

## Phase 2: futureshop API連携

- 商品情報取得（マスタ・SKU・JAN・価格）
- 在庫取得（EC在庫・倉庫在庫）
- 受注取得（SKU別・日次）
- 売上・在庫データの蓄積・履歴管理
- 詳細: `docs/futureshop-api-plan.md`

---

## Phase 3: 売れ筋・死に筋検知

radial 参考: 消化週数 < 販売可能週数 − n → 売れ筋、消化週数 > 販売可能週数 + n → 死に筋

- 消化週数（直近販売ペースから在庫売り切り予測週数）
- 販売可能週数（販売終了日までの残り週数）
- 消化率（販売数 / 仕入数）
- 在庫過多アラート
- 機会損失アラート（売れ筋なのに在庫少）
- 条件設定画面（n値・対象カテゴリ・除外品番）

---

## Phase 3.5: バリエーション別管理（進行中）

**基本方針:**

- 商品別表示はMD俯瞰用（品番単位での全体把握・ステータス管理）
- バリエーション別表示は在庫/店舗依頼用（SKU / カラー / サイズ単位での実務管理）

**実装済み:**

- 商品一覧タブに「商品別 / バリエーション別」切替を追加
- `MdVariation` 型（SKU単位: 品番・商品名・SKUコード・カラー・サイズ・カテゴリ・発売日・ステータス）
- 商品登録CSVから MdVariation[] を生成（`reviewRowsToMdVariations`）
- `ecTodo.mdVariations` として localStorage 保存（商品一覧データと同期）
- バリエーション別テーブル表示（12列）
- バリエーション別検索（品番・商品名・SKU・カラー・サイズ）
- バリエーション別 CSV 出力（`mdVariations.csv`）
- 保存データクリア時に mdProducts と mdVariations の両方を削除

**次フェーズ予定:**

- 在庫CSV取込（futureshop在庫データをバリエーション別に反映）
- 売上CSV取込（受注データをSKU別に集計）
- futureshop API連携（在庫・受注リアルタイム取得）
- 店舗別在庫・移動候補の算出
- 除外品番: 現在は品番単位で除外。将来的にSKU単位除外も検討

---

## Phase 3.5.1: 商品登録CSV取込フロー改善（完了）

**目的:** 取込画面の操作性向上と状態の永続化

**実装済み:**

- ①ファイル画面: 「SKUファイルを取り込む」に変更、ファイル内容説明を追加
- ③列設定スキップ: autoDetect 成功時は自動スキップし確認・保存へ直行
  - シート選択ボタンが「確認・保存へ →」/ 「列設定へ →」に動的切替
  - 確認・保存画面に「列設定を変更」リンクボタンを追加
  - StepIndicator が 3ステップ / 4ステップに動的切替
- ④確認・保存 ファイル取込欄:
  - SKUファイルをスロットから外してサマリーチップ表示に変更
  - 名称変更: 商品説明(大)→キャプション, 企画寸, 素材, 販売期間(From)→MD表
  - swatch PDF を `<details>` 折りたたみに分離（任意・解析不安定の注記付き）
  - 並び順: キャプション→企画寸→素材→MD表→swatch(任意)
- 商品登録CSVの状態保持 (`ecTodo.importState`):
  - 確認・保存画面遷移時に reviewRows + colMap + ファイル名を保存
  - タブ開時に自動読込、ファイル名/SKU件数/日時を表示して再開 or 破棄
  - `QuotaExceededError` 時は reviewRows を省いてフォールバック保存
- 過去取込履歴 (`ecTodo.importHistory`):
  - 最大10件を保存（古い順に削除）
  - SKUデータCSVダウンロード機能（`取込済みSKUデータ_{filename}.csv`）
  - 商品一覧へ反映時にステータスを「商品一覧反映済み」に更新

**今後の予定（このフェーズで実装しないもの）:**

- 在庫CSV取込、売上CSV取込
- futureshop API連携
- 商品画像取込
- カラム幅調整UI
- DB/Supabase保存

---

## Phase 3.6: テーブルUI拡張（進行中）

**実装済み:**

- 商品一覧（商品別 / バリエーション別）に「表示項目」ボタンを追加
- 欲しいものリストに「表示項目」ボタンを追加
- チェックボックスパネルで列のON/OFFを切替可能（クリック外で閉じる）
- 「すべて表示」「初期表示に戻す」ボタンを実装
- localStorage に表示項目設定を保存（リロード後も維持）
  - 商品別: `ecTodo.productsColumns.product`
  - バリエーション別: `ecTodo.productsColumns.variation`
  - 欲しいものリスト: `ecTodo.wishlistColumns`
- テーブル列定義を `TableColumn<T>` 型の配列ベースに整理（th/td を自動生成）
- バリエーション別の初期OFF列: EC在庫・直近売上・消化率・次アクション（横幅対策）
- 商品別は画像列を定義済み（defaultVisible: false、表示は「準備中」）
- CSV出力は既存仕様を維持（全列出力、表示項目と非連動）
- WishlistTab のヘッダー行を sticky に改善
- **列の並び替え**: ↑/↓ボタンで列順を変更（パネル内で即時反映）
- **列幅調整**: 数値入力でpx指定（≥40px、空欄はデフォルト幅）
- **ColumnConfig型**: `{ key, visible, width? }` でlocalStorageに一括保存
- **旧形式との後方互換**: `string[]` → `ColumnConfig[]` 自動マイグレーション
- **3つのリセットボタン**: すべて表示 / 初期表示に戻す / 幅を初期値に戻す
- **table-layout: fixed + colgroup**: 列幅を確実に反映（overflow-x: auto でスクロール）
- **列幅ドラッグ調整**: テーブルヘッダー右端のハンドルをドラッグして列幅を変更（min:50px, max:500px）
- **列順ドラッグ変更**: 表示項目パネル内の ☰ ハンドルをドラッグして列順を変更（HTML5 DnD）
- ↑/↓ボタン・px入力は補助操作として継続維持

**次フェーズ予定:**

- テーブルヘッダー自体のドラッグで列順変更（現在はパネル内のみ）
- 商品画像URLを取り込み、商品一覧/欲しいものリストで画像サムネイルを表示
- 画像表示は商品別・バリエーション別どちらにも対応（まずは商品別）
- バリエーション別: 品番・商品名を左固定（sticky left）

---

## Phase 3.7: 画像列の土台追加（完了）

**目的:** 商品一覧 / 欲しいものリストで商品画像サムネイルを表示できる土台を作る

**実装済み（Phase 3.7.0 — 土台）:**

- `MdProduct` / `MdVariation` / `WishlistItem` に `imageUrl?: string` を追加
- 商品一覧 商品別: 「画像」列を追加（`defaultVisible: false`、`defaultWidth: 90`）
- 商品一覧 バリエーション別: 「画像」列を追加（`defaultVisible: false`、`defaultWidth: 90`）
- 欲しいものリスト: 「画像」列を追加（`defaultVisible: false`、`defaultWidth: 90`）
- `imageUrl` がある場合はサムネイル表示（48px × 60px、`object-fit: cover`、角丸、枠線）
- `imageUrl` がない場合は「画像なし」プレースホルダー表示
- 画像読み込みエラー時もプレースホルダーに切り替え
- 表示項目設定で画像列のON/OFF、列順変更、列幅変更が可能
- `localStorage` に保存、旧設定には末尾に追加

**実装済み（Phase 3.7.1 — 画像URL CSV取込）:**

- 商品登録CSVタブの確認・保存画面「ファイル取込」欄に「画像URL」スロットを追加（MD表の次）
- 対応フォーマット: CSV / xlsx / xls
- 対応列名: 品番（品番/商品番号/productNo 等）、SKU（SKU/sku/skuCode 等）、画像URL（画像URL/imageUrl/image 等）
- SKU単位 → 品番単位の優先順で紐づけ
- SKU正規化: `1266302_78_9` / `1266302789` 両表記に対応
- 不正URLはスキップして警告カウント
- 取込結果を「SKU N件 / 品番 N件 / スキップ N件」形式で表示
- `ecTodo.importState` に imageUrlMap・ファイル名・件数等を保存
- リロード・取込状態復元時に画像URL状態も復元
- 「商品一覧へ反映」時に imageUrlMap を MdProduct / MdVariation に適用
  - MdVariation: SKU単位 → 品番単位の優先
  - MdProduct: 品番単位 → 同品番最初のSKU画像の優先
  - WishlistItem: MdVariation.imageUrl を引き継ぐ
- CSV出力には画像URL列を追加しない（既存仕様維持）

**次フェーズ予定:**

- FutureShop API連携での画像URL自動取得
- SKU別画像の精度向上（バリエーション別）
- 画像URL CSVダウンロード（インポート済み内容の確認用）
- 商品一覧反映後に画像URLを追加取込した場合の即時更新

---

## Phase 4: 売上・在庫分析 / 予算管理（土台完成）

**目的:** 分析・判断用データ項目の整備と予算管理ダッシュボードの土台作成

**実装済み（Phase 4.0 — 土台）:**

- `MdProduct` / `MdVariation` に在庫区分・売上・販促・予算管理用フィールドを追加
  - 在庫区分: `stockType` / `actualStock` / `preorderStock` / `plannedStock` / `availableStock`
  - 売上データ: `salesQty7d|14d|30d` / `salesAmount7d|14d|30d` / `monthlySalesQty|Amount`
  - 販促: `budgetGroup` / `collaborationName` / `salesType` / `isCollaboration` / `isSaleTarget` / `isTimeSaleTarget`
- `MdVariation` / `WishlistItem` に欲しいもの効果測定フィールドを追加
  - `wishlistAddedAt` / `wishlistRequestedQty` / `wishlistStockBefore|After` / `wishlistSalesAfter7d|14d` / `wishlistEffect`
- `BudgetSummary` 型を追加
- 商品一覧 商品別に分析列を追加（在庫区分・販売可能在庫・7日販売数・月売上 等）
- 商品一覧 バリエーション別に分析列を追加（販売可能在庫・7日販売数・30日販売数 等）
- 欲しいものリストに効果測定列を追加（欲しいもの追加日・追加前後在庫・効果判定 等）
- 予算管理タブを新設（月商3,000万円目標のダッシュボード土台）
- 全新規フィールドは optional — 既存データとの後方互換を維持

**在庫区分の定義:**

- `actual`: 実在庫（倉庫にあり通常発送可能）
- `preorder`: 予約在庫（予約アイテム用、1点ずつ決済）
- `planned`: 予定在庫（コラボ・売れ筋向け、まとめ決済可能）
- `mixed`: 複合（複数区分を含む）
- `unknown`: 未判定

**FutureShop API連携予定:**

優先（読み取り系 — 分析・判断用）:
- 在庫検索API（SKU別在庫を取得）
- 受注検索API（受注一覧を取得）
- 受注取得API（受注詳細・SKU別売上を取得）
- 商品検索API（商品マスタ・画像情報の取得）

後回し（書き込み系）:
- 在庫更新API
- 発送API
- 入金API
- 受注ステータス変更API
- 会員系API
- ポイント系API
- 実店舗登録/更新/削除API

**次フェーズ予定:**

- 在庫検索APIでSKU別在庫（実在庫・予約在庫・予定在庫）を取得
- 受注検索・取得APIでSKU別売上（7日・14日・30日・月次）を取得
- 商品検索APIで商品マスタ・画像情報の取得可否を確認
- 品番別・SKU別・コラボ別・タイムセール別に売上を集計
- 欲しいもの追加後の売上効果を自動判定
- 月商3,000万円に向けた予算進捗・着地予測・必要日販を表示

---

## Phase 4.5: FutureShop 在庫検索API 検証（完了）

**目的:** 在庫検索APIのレスポンス構造を確認し、MDツールへの反映可否を判断する

**実装済み:**

- `scripts/futureshop/check-stock-api.mjs` — 在庫検索API検証スクリプト
- `package.json` に `fs:stock:check` スクリプトを追加
- `.env.local` の必要環境変数: `FUTURESHOP_API_BASE_URL` / `FUTURESHOP_API_KEY` / `FUTURESHOP_SHOP_ID`
- APIキー・認証情報はコンソールに表示しない設計（マスク処理済み）
- 1秒待機によるレート制限対策（FutureShop API 1秒1リクエスト制限）
- マスク済みレスポンスを `tmp/futureshop-stock-response.sample.json` に保存
- 検出フィールドサマリーを `tmp/futureshop-stock-response.summary.json` に保存
- `tmp/` は `.gitignore` で管理対象外

**確認したい項目:**

- SKU単位在庫が取得できるか（商品管理番号 / カラー枝番号 / サイズ枝番号）
- 実在庫 / 予約在庫 / 予定在庫がAPI上で区別できるか
- 販売可能在庫フィールドの有無
- 在庫ステータスの有無

**使い方:**
```bash
npm run fs:stock:check -- --product 1266302
```

**次フェーズ予定:** 検証結果をもとにMDツールへの在庫同期ボタンを追加する

---

## Phase 5: 欲しいものリスト高度化

- 店舗側へ共有する補充リスト自動生成（バリエーション別を基本単位とする）
- 条件変更UI（SKU / カラー / サイズ単位の目標在庫数）
- CSV / Google Sheets 出力
- 週次業務の自動化

---

## Phase 6: 在庫移動・追加発注候補

- 店舗別 / EC別 在庫可視化
- 店舗別売上（POS連携）
- 移動候補の自動抽出（死に筋店舗 → 売れ筋店舗）
- 追加発注候補
- アクション管理（完了・保留・却下）

---

## Phase 7: radial風UI

radial参考: 左サイドバー型・商品一覧・商品詳細タブ構成

- 左サイドバーナビゲーション
- 商品一覧（フィルター・検索・ソート・ステータス表示）
- 商品詳細ページ
  - ライフサイクルtab（売上・在庫・消化率推移グラフ）
  - チャネルtab（EC / 店舗別の売上・在庫・消化率）
  - コメントtab（顧客の声・社内メモ）
  - 商品マスタtab（基本情報・SKU一覧）
- グループ分析（カテゴリ / シーズン別 売上・消化率）
- アクションリスト管理

---

## 将来のタブ構成案

| タブ | Phase | 内容 |
|------|-------|------|
| 商品登録CSV | 0（完了）| futureshop CSV生成 |
| 商品一覧 | 2〜 | 商品マスタ・在庫・売上一覧 |
| 欲しいものリスト | 3〜 | 店舗共有リスト |
| 予算管理 | 4〜 | 売上進捗・品番別・コラボ別・効果測定 |
| 売れ筋・死に筋 | 4〜 | 消化週数ベースアラート |
| 在庫移動 | 6〜 | 移動指示書・追加発注候補 |
| 設定 | 1〜 | 条件・除外品番・API設定 |
