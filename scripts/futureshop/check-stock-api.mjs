/**
 * FutureShop 在庫検索API 検証スクリプト
 *
 * 目的:
 *   - 在庫検索APIのレスポンス構造を確認する
 *   - SKU単位在庫 / 実在庫 / 予約在庫 / 予定在庫が取得できるか検証する
 *   - 結果をマスクして tmp/ に保存する
 *   - APIキーや認証情報はコンソールに表示しない
 *
 * 使い方:
 *   node scripts/futureshop/check-stock-api.mjs --product 1266302
 *   npm run fs:stock:check -- --product 1266302
 *
 * 必要な環境変数 (.env.local に設定):
 *   FUTURESHOP_API_BASE_URL  例: https://xxxx.future-shop.jp/api/v1
 *   FUTURESHOP_API_KEY       futureshop APIキー
 *   FUTURESHOP_SHOP_ID       ショップID（エンドポイント構築に使用）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── .env.local 読み込み ──────────────────────────────────────────────────────
// dotenv 未インストールのため手動パース

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

// ── 環境変数チェック ──────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'FUTURESHOP_API_BASE_URL',
  'FUTURESHOP_API_KEY',
  'FUTURESHOP_SHOP_ID',
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error('\n[ERROR] 必要な環境変数が設定されていません:');
  for (const k of missing) {
    console.error(`  Missing required env: ${k}`);
  }
  console.error('\n.env.local に以下を追加してください:');
  console.error('  FUTURESHOP_API_BASE_URL=https://<shop>.future-shop.jp/api/v1');
  console.error('  FUTURESHOP_API_KEY=<your-api-key>');
  console.error('  FUTURESHOP_SHOP_ID=<your-shop-id>');
  console.error('\nAPIキーの取得方法: futureshop 管理画面 > API設定 を参照');
  process.exit(1);
}

// ── 引数パース ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product' && argv[i + 1]) args.product = argv[++i];
    if (argv[i] === '--goods-id' && argv[i + 1]) args.goodsId = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.product && !args.goodsId) {
  console.log(`
Usage:
  node scripts/futureshop/check-stock-api.mjs --product <品番>
  node scripts/futureshop/check-stock-api.mjs --goods-id <商品ID>

例:
  node scripts/futureshop/check-stock-api.mjs --product 1266302
  npm run fs:stock:check -- --product 1266302
  `);
  process.exit(0);
}

// ── マスキング ────────────────────────────────────────────────────────────────

const MASK_KEYS = new Set([
  'name', 'customername', 'email', 'tel', 'phone',
  'address', 'zip', 'postalcode', 'token', 'accesstoken',
  'refreshtoken', 'password', 'secret', 'authorization',
  'apikey', 'api_key', 'x-api-key',
]);

function maskValue(key, value) {
  if (MASK_KEYS.has(key.toLowerCase())) return '[MASKED]';
  return value;
}

function deepMask(obj) {
  if (Array.isArray(obj)) return obj.map(deepMask);
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = maskValue(k, deepMask(v));
    }
    return result;
  }
  return obj;
}

// ── API リクエスト ────────────────────────────────────────────────────────────

const BASE_URL = process.env.FUTURESHOP_API_BASE_URL.replace(/\/$/, '');
const API_KEY  = process.env.FUTURESHOP_API_KEY;

/**
 * FutureShop 在庫検索API
 * エンドポイント候補:
 *   GET /stocks?goodsCode=<品番>
 *   GET /stocks?goodsUrlCode=<商品URLコード>
 *   GET /goods/<goodsId>/stocks
 *
 * 実際のエンドポイントはAPI仕様書に合わせて調整してください。
 */
async function fetchStockByProduct(productNo) {
  // 商品URLコード = 品番 として試みる（FutureShopでは通常一致）
  const endpoints = [
    `${BASE_URL}/stocks?goodsUrlCode=${encodeURIComponent(productNo)}`,
    `${BASE_URL}/stocks?goodsCode=${encodeURIComponent(productNo)}`,
    `${BASE_URL}/goods/${encodeURIComponent(productNo)}/stocks`,
    `${BASE_URL}/goodsStock?goodsUrlCode=${encodeURIComponent(productNo)}`,
  ];

  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  let lastError = null;

  for (const url of endpoints) {
    // URLにAPIキーが入らないようにログ用URLを生成
    const safeUrl = url.replace(API_KEY, '[MASKED]');
    console.log(`\n[INFO] 試行中: ${safeUrl}`);

    try {
      // 1秒待機（FutureShop APIは1秒1リクエスト制限）
      await new Promise((r) => setTimeout(r, 1100));

      const res = await fetch(url, { method: 'GET', headers });

      console.log(`[INFO] ステータス: ${res.status} ${res.statusText}`);

      if (res.status === 404) {
        console.log('[INFO] 404 - このエンドポイントは存在しない可能性があります。次を試みます。');
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        console.error('[ERROR] 認証エラー。APIキーまたはショップIDを確認してください。');
        return { endpoint: safeUrl, status: res.status, error: 'Unauthorized / Forbidden' };
      }

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        console.log('[WARN] レスポンスがJSONではありません。最初の200文字:');
        console.log(text.slice(0, 200));
        return { endpoint: safeUrl, status: res.status, rawText: text.slice(0, 500), json: null };
      }

      return { endpoint: safeUrl, status: res.status, json };

    } catch (err) {
      lastError = err;
      console.error(`[ERROR] リクエスト失敗: ${err.message}`);
    }
  }

  return { error: lastError?.message ?? '全エンドポイント失敗', json: null };
}

async function fetchStockByGoodsId(goodsId) {
  const url = `${BASE_URL}/goods/${encodeURIComponent(goodsId)}/stocks`;
  const safeUrl = url.replace(API_KEY, '[MASKED]');
  console.log(`\n[INFO] goodsId 指定: ${safeUrl}`);

  await new Promise((r) => setTimeout(r, 1100));

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json',
      },
    });

    console.log(`[INFO] ステータス: ${res.status} ${res.statusText}`);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* noop */ }
    return { endpoint: safeUrl, status: res.status, json };
  } catch (err) {
    return { error: err.message, json: null };
  }
}

// ── サマリー生成 ──────────────────────────────────────────────────────────────

function detectFields(json) {
  const flat = JSON.stringify(json).toLowerCase();

  const candidates = [];
  const notes = [];

  // FutureShopの在庫フィールド候補キー名
  const SKU_CANDIDATES  = ['goodsmanagementno', 'managementno', 'skucode', 'goodsmanagementnumber', 'variationcode'];
  const VAR_CANDIDATES  = ['colorbranch', 'colorno', 'sizebranch', 'sizeno', 'variationno', 'branchno'];
  const STOCK_CANDIDATES = ['stock', 'stockqty', 'stockcount', 'quantity', 'inventoryqty'];
  const PREORDER_CANDIDATES = ['preorder', 'reservestock', 'reserveqty', 'yoyakustock'];
  const PLANNED_CANDIDATES  = ['plannedstock', 'plannedqty', 'yoteistock', 'futurestock'];
  const AVAIL_CANDIDATES    = ['availablestock', 'availableqty', 'salablestock', 'saleablestock'];
  const STATUS_CANDIDATES   = ['stockstatus', 'salestatus', 'inventorystatus', 'stockstatustype'];

  const detected = {
    hasSkuCode:         SKU_CANDIDATES.some((k) => flat.includes(k)),
    hasVariationBranch: VAR_CANDIDATES.some((k) => flat.includes(k)),
    hasActualStock:     STOCK_CANDIDATES.some((k) => flat.includes(k)),
    hasPreorderStock:   PREORDER_CANDIDATES.some((k) => flat.includes(k)),
    hasPlannedStock:    PLANNED_CANDIDATES.some((k) => flat.includes(k)),
    hasAvailableStock:  AVAIL_CANDIDATES.some((k) => flat.includes(k)),
    hasStockStatus:     STATUS_CANDIDATES.some((k) => flat.includes(k)),
  };

  // フィールドヒント収集（実際のキー名を探す）
  function findMatchingKeys(obj, candidates, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object') return [];
    const found = [];
    for (const [k, v] of Object.entries(obj)) {
      if (candidates.some((c) => k.toLowerCase().includes(c))) found.push(k);
      if (typeof v === 'object') found.push(...findMatchingKeys(v, candidates, depth + 1));
    }
    return [...new Set(found)];
  }

  // バリエーション配列を探す
  const varArrayKey = findArrayKey(json);
  const variations = varArrayKey ? (json[varArrayKey] ?? []) : (Array.isArray(json) ? json : []);

  for (const v of variations.slice(0, 5)) {
    if (typeof v !== 'object' || !v) continue;

    const skuKey   = findMatchingKeys(v, SKU_CANDIDATES)[0];
    const colorKey = findMatchingKeys(v, ['colorbranch', 'colorno', 'colorbranchno'])[0];
    const sizeKey  = findMatchingKeys(v, ['sizebranch', 'sizeno', 'sizebranchno'])[0];
    const stockKey = findMatchingKeys(v, STOCK_CANDIDATES)[0];
    const preKey   = findMatchingKeys(v, PREORDER_CANDIDATES)[0];
    const planKey  = findMatchingKeys(v, PLANNED_CANDIDATES)[0];
    const availKey = findMatchingKeys(v, AVAIL_CANDIDATES)[0];

    const actualStock  = stockKey ? (v[stockKey] ?? null) : null;
    const preordStock  = preKey   ? (v[preKey]   ?? null) : null;
    const plannedStock = planKey  ? (v[planKey]  ?? null) : null;
    const availStock   = availKey ? (v[availKey] ?? null) : null;

    // 在庫区分仮判定
    let stockType = 'unknown';
    const hasActual  = actualStock  != null && actualStock  > 0;
    const hasPreord  = preordStock  != null && preordStock  > 0;
    const hasPlanned = plannedStock != null && plannedStock > 0;
    const count = [hasActual, hasPreord, hasPlanned].filter(Boolean).length;
    if (count >= 2)       stockType = 'mixed';
    else if (hasPreord)   stockType = 'preorder';
    else if (hasPlanned)  stockType = 'planned';
    else if (hasActual)   stockType = 'actual';
    else if (actualStock === 0) stockType = 'actual';

    candidates.push({
      productNo:     args.product ?? args.goodsId,
      skuCode:       skuKey   ? v[skuKey]   : null,
      colorBranchNo: colorKey ? v[colorKey] : null,
      sizeBranchNo:  sizeKey  ? v[sizeKey]  : null,
      actualStock,
      preorderStock: preordStock,
      plannedStock,
      availableStock: availStock,
      stockType,
      rawFieldHints: {
        skuCode:       skuKey   ?? '未検出',
        actualStock:   stockKey ?? '未検出',
        preorderStock: preKey   ?? '未検出',
        plannedStock:  planKey  ?? '未検出',
        availableStock: availKey ?? '未検出',
      },
    });
  }

  if (!detected.hasPreorderStock) notes.push('予約在庫フィールドはレスポンス上で未確認');
  if (!detected.hasPlannedStock)  notes.push('予定在庫フィールドはレスポンス上で未確認');
  if (!detected.hasSkuCode)       notes.push('SKUコード/商品管理番号フィールドが未確認 — FutureShopの実際のキー名を要確認');
  if (candidates.length === 0)    notes.push('バリエーション配列が見つかりませんでした。レスポンス構造を確認してください');

  return { detected, candidates, notes };
}

function findArrayKey(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length > 0) return k;
  }
  return null;
}

// ── tmp ディレクトリ確保 ──────────────────────────────────────────────────────

const TMP_DIR = path.join(ROOT, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── メイン実行 ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n====== FutureShop 在庫検索API 検証スクリプト ======');
  console.log(`入力: product=${args.product ?? '—'} / goodsId=${args.goodsId ?? '—'}`);
  console.log('APIキーはマスクされています。コンソールには表示されません。\n');

  let result;
  if (args.goodsId) {
    result = await fetchStockByGoodsId(args.goodsId);
  } else {
    result = await fetchStockByProduct(args.product);
  }

  // レスポンス全体をマスクして保存
  const maskedFull = result.json ? deepMask(result.json) : result;
  const samplePath = path.join(TMP_DIR, 'futureshop-stock-response.sample.json');
  fs.writeFileSync(samplePath, JSON.stringify(maskedFull, null, 2), 'utf8');
  console.log(`\n[SAVED] フルレスポンス (マスク済み): ${samplePath}`);

  // サマリー生成
  const { detected, candidates, notes } = result.json
    ? detectFields(result.json)
    : { detected: {}, candidates: [], notes: ['APIレスポンスがJSONではないか、エラーが発生しました'] };

  const summary = {
    input: {
      product: args.product ?? null,
      goodsId: args.goodsId ?? null,
    },
    requestInfo: {
      endpoint: result.endpoint ?? null,
      httpStatus: result.status ?? null,
    },
    detectedFields: detected,
    candidates,
    notes,
    savedAt: new Date().toISOString(),
  };

  const summaryPath = path.join(TMP_DIR, 'futureshop-stock-response.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[SAVED] サマリー: ${summaryPath}`);

  // コンソール出力
  console.log('\n====== 検出フィールド ======');
  for (const [k, v] of Object.entries(detected)) {
    console.log(`  ${v ? '✓' : '✗'} ${k}`);
  }

  if (candidates.length > 0) {
    console.log('\n====== SKU候補 (最大5件) ======');
    for (const c of candidates) {
      console.log(JSON.stringify(c, null, 2));
    }
  }

  if (notes.length > 0) {
    console.log('\n====== 注記 ======');
    for (const n of notes) console.log(`  - ${n}`);
  }

  console.log('\n====== 完了 ======\n');
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
