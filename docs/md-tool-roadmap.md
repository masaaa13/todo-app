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

## Phase 4.5: ConoHa VPS 中継API を使った在庫取得検証（確定）

**方針:**

FutureShop Open API 直接接続は断念。  
ZOZO客注管理スプシ/GAS で既に動作している **ConoHa VPS 中継API** を使い、  
MDツールでも同じルートで SKU 別在庫を取得する。

**確定仕様:**

| 項目 | 内容 |
|------|------|
| エンドポイント | `POST {FS_PROXY_BASE_URL}/check-stock` |
| 認証 | `Authorization: Bearer {FS_PROXY_TOKEN}` |
| リクエスト | `{ "productNos": ["1266302"] }` (7桁品番) |
| レスポンス | `{ "ok": true, "stock": { "1266302789": 3, ... } }` |
| SKU解析 | 10桁SKU → productNo(先頭7桁) + colorBranchNo(8〜9桁) + sizeBranchNo(10桁目) |

**取得できる項目:**

| フィールド | 取得可否 | 補足 |
|---|---|---|
| skuCode (10桁) | ✓ | レスポンスのキー |
| productNo (7桁) | ✓ | SKU先頭7桁から補完 |
| colorBranchNo | ✓ | SKU 8〜9桁目から補完 |
| sizeBranchNo | ✓ | SKU 10桁目から補完 |
| actualStock | ✓ | `stock[skuCode]` の値 |
| availableStock | ✓ | actualStock と同値（このルートでは区別なし） |
| updatedAt | △ | レスポンスにあれば使用、なければ取得日時を記録 |
| preorderStock | ✗ | このルートでは未対応（次フェーズ） |
| plannedStock | ✗ | このルートでは未対応（次フェーズ） |
| goodsUrlCode | ✗ | このルートでは返ってこない |
| JANコード | ✗ | このルートでは返ってこない |

**MdVariation への反映方針:**

```
actualStock    = stock[skuCode]
availableStock = stock[skuCode]
stockType      = "actual"
preorderStock  = null
plannedStock   = null
updatedAt      = レスポンス値 or 取得日時
```

**実装済み:**

- `scripts/futureshop/check-stock-api.mjs` — ConoHa VPS 中継API 専用に書き換え
- `--product 1266302`（7桁品番）または `--sku 1266302789`（10桁SKU→先頭7桁変換）
- 使用環境変数: `FS_PROXY_BASE_URL` / `FS_PROXY_TOKEN`
- `tmp/futureshop-stock-response.sample.json` — フルレスポンス保存
- `tmp/futureshop-stock-response.summary.json` — MdVariation 反映形式サマリー

**使い方:**
```bash
npm run fs:stock:check -- --product 1266302
npm run fs:stock:check -- --sku 1266302789
```

**今回実装しないこと:**

- ~~MDツール画面への在庫同期ボタン追加~~ → Phase 4.6 で実装済み
- 複数SKU一括取得・在庫更新API・受注API連携

**次フェーズ予定:**

- 予約在庫・予定在庫の取得ルート確認（別エンドポイントの可能性あり）
- goodsUrlCode / JANコードが必要な場合は別ルート（FutureShop 商品検索API）を検討

---

## Phase 4.6: SKU別在庫同期ボタン（実装済み）

**概要:**

商品一覧タブに「在庫同期」ボタンを追加し、FutureShop ConoHa VPS 中継APIから  
SKU別在庫を取得して MdVariation / MdProduct に反映する。

**実装内容:**

| ファイル | 変更内容 |
|----------|----------|
| `api/check-stock.ts` | Vercel serverless function。`FS_PROXY_TOKEN` はサーバー側でのみ保持、ブラウザに漏れない |
| `vite.config.ts` | dev server 用ミドルウェア。`.env.local` を読み込み `/api/check-stock` をローカルでも動作させる |
| `src/types/md.ts` | `WishlistItem` に `actualStock / availableStock / stockType / preorderStock / plannedStock` 追加 |
| `src/App.tsx` | `syncStocks()` コールバックと `syncStatus` state を追加。ProductsTab に渡す |
| `src/components/ProductsTab.tsx` | `DashboardHeader` に「在庫同期」ボタン追加。syncStatus でテキスト/スタイル切り替え |
| `src/components/WishlistTab.tsx` | `toWishlistItems()` に在庫フィールドを追加 |

**処理フロー:**

```
ボタンクリック
  → mdVariations から productNo を収集（重複排除）
  → 100件ずつ chunk に分割
  → POST /api/check-stock（1100ms インターバル）
  → Vercel function / dev middleware → ConoHa VPS /check-stock
  → stockMap { skuCode: qty } を取得
  → MdVariation: skuCode.replaceAll('_', '') でマッチ
    actualStock = qty, availableStock = qty, stockType = 'actual'
  → MdProduct: productNo ごとに actualStock を集計
  → localStorage 保存 → state 更新 → 再レンダー
```

**同期ステータス:**

| 状態 | ボタン表示 |
|------|------------|
| idle | `在庫同期` |
| syncing | `同期中...` (disabled) |
| success | `✓ {N}SKU 同期済み` |
| error | `同期エラー: {message}` |

**セキュリティ:**

- `FS_PROXY_TOKEN` は `api/check-stock.ts` と `vite.config.ts` のサーバー側のみで使用
- ブラウザには一切送信されない
- `.env.local` は git add 禁止（`.gitignore` で管理）

---

## Phase 4.7: 受注API検証 / SKU別売上集計（検証中）

**目的:**

FutureShop 受注検索API / 受注取得API、または既存 ConoHa VPS 中継API 経由で  
受注データを取得し、SKU別の販売数・売上金額を MDツールに反映できるか検証する。

**方針:**

- 個人情報（氏名・住所・電話・メール・会員ID・決済情報）は保存・出力しない
- まず直近3日程度で検証し、本番APIへの大量アクセスを避ける
- キャンセル・返品を除外した正味販売数・売上を集計する
- 問題なければ次フェーズで売上同期ボタンを追加する

**検証スクリプト:**

```bash
npm run fs:orders:check -- --days 3
npm run fs:orders:check -- --from 2026-06-25 --to 2026-06-27
npm run fs:orders:check -- --days 7 --product 1266302
```

**エンドポイント候補（未確定）:**

| 候補 | 試行結果 |
|------|----------|
| `POST /search-orders` | 要確認 |
| `POST /orders` | 要確認 |
| `POST /get-orders` | 要確認 |
| `POST /check-orders` | 要確認 |

使用環境変数（既存と同じ予定）:
- `FS_PROXY_BASE_URL`
- `FS_PROXY_TOKEN`

受注APIで別エンドポイント・別tokenが必要な場合:
- `FS_ORDERS_ENDPOINT`（URLを個別指定する場合）
- `FS_ORDERS_TOKEN`（別tokenが必要な場合）

**取得・集計したいフィールド:**

| フィールド | 確認項目 |
|---|---|
| 受注日 | `orderDate` / `orderedAt` |
| 受注ステータス | キャンセル除外に使用 |
| SKUコード | `skuCode` / `goodsVariationCode` 等 |
| 品番 | `productNo` / `goodsNo` 等 |
| 数量 | `quantity` / `qty` 等 |
| 単価 | `unitPrice` / `price` 等 |
| 小計 | `lineAmount` / `subtotal` 等 |
| 値引き | `discountAmount` 等 |

**MDVariation への反映予定フィールド:**

- `salesQty7d` / `salesQty14d` / `salesQty30d`
- `salesAmount7d` / `salesAmount14d` / `salesAmount30d`
- `monthlySalesQty` / `monthlySalesAmount`

**集計ルール:**

- SKUコードは `replaceAll('_','')` で10桁に正規化
- productNo = SKU先頭7桁 / colorBranchNo = 8〜9桁 / sizeBranchNo = 10桁目
- キャンセル受注はステータスで除外
- 売上金額 = lineAmount（なければ unitPrice × qty）- discount
- 送料・手数料は商品別売上に含めない

**保存先（git管理外）:**

- `tmp/futureshop-orders-response.sample.json` — マスク済みフルレスポンス
- `tmp/futureshop-orders-response.summary.json` — MDツール反映用サマリー

**今回実装しないこと:**

- MDツール画面への売上同期ボタン追加
- MdVariation への salesQty7d 等の反映
- localStorage への売上保存
- 書き込み系API（発送・入金・ステータス変更）
- 顧客データ保存
- Vercel 反映

---

## Phase 4.8: FutureShop 商品検索API検証（完了）

**目的:**

FutureShop 商品検索APIを ConoHa VPS proxy 経由で実行し、MdProduct / MdVariation 変換に必要な  
フィールド（商品URL・URI・画像URL・バリエーション・予約/予定在庫）が取得できることを確認する。

**方針:**

- MacからFutureShop OAuth2トークンエンドポイントへの直接接続はIPアドレス制限により403になる
- ConoHa VPS に `POST /check-products` を追加し、VPS proxy 経由で呼び出す構成に変更
- 既存の `getToken()` と `requireAuth` をVPS側で流用
- 環境変数: `FS_PROXY_BASE_URL` / `FS_PROXY_TOKEN`（.env.local）
- 個人情報フィールドは保存・出力しない
- シークレット・トークン実値はコンソール・ファイルともに非表示（[MASKED]）

**検証スクリプト:**

```bash
npm run fs:products:check -- --product 1266302
npm run fs:products:check -- --product 1266302 --types variation,image,plannedStock
npm run fs:products:check -- --products 1266302,1266303
```

**エンドポイント:**

| メソッド | パス | 説明 |
|----------|------|------|
| `POST` | `{FS_PROXY_BASE_URL}/check-products` | VPS proxy → FutureShop /admin-api/v1/products |

使用環境変数:
- `FS_PROXY_BASE_URL` — ConoHa VPS proxy のベースURL
- `FS_PROXY_TOKEN` — VPS proxy の Bearer トークン

**確認済みフィールドマッピング（品番 1266302 で検証）:**

| MDツール用途 | VPS responseフィールド | 確認結果 |
|---|---|---|
| 商品ページURL（フル） | `products[].uri` | ✓ `https://store.candystripper.jp/c/.../1266302` |
| URLコード（短縮） | `products[].url` | ✓ `"1266302"` |
| 商品名 | `products[].name` | ✓ `"STAR FRILL DENIM PANTS"` |
| 定価（税込） | `products[].unitPrice` | ✓ `24200` |
| 公開状態 | `products[].visible` | ✓ `true` |
| 代表画像URL | `products[].imageUrl` | ✓ 取得済み |
| 画像リスト（全サイズ） | `products[].imageList[]` | ✓ **27件** |
| SKUコード（10桁） | `products[].variations[].skuCode` | ✓ 例: `1266302789` |
| カラー枝番 | `variations[].colorBranchNo` | ✓ 例: `"78"` |
| カラー名 | `variations[].colorName` | ✓ 例: `"INDIGO"` |
| サイズ枝番 | `variations[].sizeBranchNo` | ✓ 例: `"9"` |
| サイズ名 | `variations[].sizeName` | ✓ 例: `"F"` |
| JANコード | `variations[].janCode` | ✓ 取得済み |
| 在庫数 | `variations[].stockCount` | ✓ 取得可能（最新在庫同期・一括更新は `/check-stock` を正とする） |
| 予約販売 | `products[].hasPreorder` | ✓ `true` |
| 予定在庫 | `products[].hasPlannedStock` | ✓ `true` |

**FutureShop rawImageKeys（確認済み画像パス種別）:**

`originalImagePath` / `xxlImagePath` / `xlImagePath` / `lImagePath` / `mImagePath` / `sImagePath` / `xsImagePath`

- 現在の VPS imageList マッピングは `originalImagePath` / `lImagePath` / `mImagePath` のみ
- 必要に応じて `xxlImagePath` / `sImagePath` / `xsImagePath` を VPS 側に追加可能

**FutureShop rawVariationKeys（確認済みバリエーションフィールド）:**

`skuNo` / `horizontalNo` / `horizontalName` / `verticalNo` / `verticalName` / `janCode` / `count` / `price` / `representativeVariation` / `leadTime` / `weight`

- `count` はバリエーションオブジェクト直下に存在（`inventoryInfo.count` ではない）
- VPS 側で `v.count` をマップ済み → `/check-products` でも `variations[].stockCount` として取得可能

**保存先（git管理外）:**

- `tmp/futureshop-products-response.sample.json` — VPS レスポンス全体
- `tmp/futureshop-products-response.summary.json` — MDツール反映用サマリー

**今回実装しないこと:**

- MDツール画面への商品同期ボタン追加
- MdProduct / MdVariation への一括書き込み
- localStorage への商品データ保存
- 書き込み系API（商品登録・更新・削除）
- Vercel 反映

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
