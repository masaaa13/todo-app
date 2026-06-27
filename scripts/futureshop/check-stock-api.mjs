/**
 * FutureShop 在庫検索 検証スクリプト（ConoHa VPS 中継API経由）
 *
 * 確定仕様:
 *   - ConoHa VPS 中継API  POST /check-stock
 *   - 入力: 7桁 productNo を productNos 配列で渡す
 *   - レスポンス: { ok: true, stock: { "1266302789": 3, ... } }
 *   - SKU(10桁) → productNo(先頭7桁) + colorBranchNo(8〜9桁) + sizeBranchNo(10桁目)
 *
 * 使い方:
 *   npm run fs:stock:check -- --product 1266302    # 7桁品番指定
 *   npm run fs:stock:check -- --sku 1266302789     # 10桁SKU指定(先頭7桁をproductNoに変換)
 *
 * 必要な環境変数 (.env.local):
 *   FS_PROXY_BASE_URL   ConoHa VPS 中継APIのベースURL
 *   FS_PROXY_TOKEN      Bearer 認証トークン
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── .env.local 読み込み ────────────────────────────────────────────────────────

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

// ── 環境変数チェック ─────────────────────────────────────────────────────────

const PROXY_BASE_URL = process.env.FS_PROXY_BASE_URL ?? null;
const PROXY_TOKEN    = process.env.FS_PROXY_TOKEN    ?? null;

console.log('\n[ENV] 環境変数確認:');
console.log('  FS_PROXY_BASE_URL :', PROXY_BASE_URL ? '設定済み' : '未設定');
console.log('  FS_PROXY_TOKEN    :', PROXY_TOKEN    ? '設定済み' : '未設定');

if (!PROXY_BASE_URL || !PROXY_TOKEN) {
  console.error('\n[ERROR] 必要な環境変数が設定されていません。');
  console.error('.env.local に以下を追加してください:\n');
  console.error('  FS_PROXY_BASE_URL=<ConoHa VPS 中継APIのベースURL>');
  console.error('  FS_PROXY_TOKEN=<Bearer トークン>\n');
  process.exit(1);
}

// ── 引数パース ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product' && argv[i + 1]) args.product = argv[++i];
    if (argv[i] === '--sku'     && argv[i + 1]) args.sku     = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.product && !args.sku) {
  console.log(`
Usage:
  node scripts/futureshop/check-stock-api.mjs --product <7桁品番>
  node scripts/futureshop/check-stock-api.mjs --sku <10桁SKU>

例:
  npm run fs:stock:check -- --product 1266302
  npm run fs:stock:check -- --sku 1266302789
  `);
  process.exit(0);
}

// ── SKU / productNo 解析 ────────────────────────────────────────────────────

function parseSku(sku10) {
  const s = String(sku10).replace(/\D/g, '');
  if (s.length !== 10) return null;
  return {
    productNo:     s.slice(0, 7),
    colorBranchNo: s.slice(7, 9),
    sizeBranchNo:  s.slice(9, 10),
  };
}

let productNo;
let inputSku = null;

if (args.sku) {
  const parsed = parseSku(args.sku);
  if (!parsed) {
    console.error(`[ERROR] SKUは10桁の数字を指定してください: "${args.sku}"`);
    process.exit(1);
  }
  productNo = parsed.productNo;
  inputSku  = args.sku;
  console.log(`\n[INPUT] SKU ${args.sku} → productNo: ${productNo} / colorBranchNo: ${parsed.colorBranchNo} / sizeBranchNo: ${parsed.sizeBranchNo}`);
} else {
  productNo = String(args.product).replace(/\D/g, '');
  if (productNo.length !== 7) {
    console.error(`[ERROR] productNo は7桁の数字を指定してください: "${args.product}"`);
    process.exit(1);
  }
  console.log(`\n[INPUT] productNo: ${productNo}`);
}

// ── マスキング ───────────────────────────────────────────────────────────────

function maskStr(s) {
  let r = String(s);
  if (PROXY_BASE_URL) r = r.replace(new RegExp(PROXY_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED_URL]');
  if (PROXY_TOKEN)    r = r.replace(new RegExp(PROXY_TOKEN.replace(   /[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED]');
  return r;
}

// ── ConoHa VPS 中継API 呼び出し ──────────────────────────────────────────────

async function fetchStock(pNo) {
  const endpoint = '/check-stock';
  const payload  = { productNos: [pNo] };

  console.log(`\n[API] POST ${maskStr(PROXY_BASE_URL)}${endpoint}`);
  console.log(`[API] payload: ${JSON.stringify(payload)}`);
  console.log('[API] Authorization: Bearer [MASKED]');

  const res = await fetch(`${PROXY_BASE_URL}${endpoint}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${PROXY_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  console.log(`[API] ステータス: ${res.status} ${res.statusText}`);

  const text = await res.text();

  if (!res.ok) {
    console.log(`[API] エラーレスポンス: ${maskStr(text.slice(0, 300))}`);
    return { ok: false, status: res.status, json: null };
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    console.log('[WARN] レスポンスがJSON形式ではありません');
    return { ok: false, status: res.status, json: null };
  }

  return { ok: true, status: res.status, json };
}

// ── SKU Map → candidates 変換 ────────────────────────────────────────────────

function buildCandidates(stockMap, baseProductNo, fetchedAt) {
  if (!stockMap || typeof stockMap !== 'object') return [];

  return Object.entries(stockMap).map(([skuCode, qty]) => {
    const parsed = parseSku(skuCode);
    const actualStock = typeof qty === 'number' ? qty : null;

    return {
      productNo:     parsed?.productNo    ?? baseProductNo,
      skuCode,
      colorBranchNo: parsed?.colorBranchNo ?? null,
      sizeBranchNo:  parsed?.sizeBranchNo  ?? null,
      actualStock,
      preorderStock:  null,
      plannedStock:   null,
      availableStock: actualStock,
      stockType:      'actual',
      updatedAt:      null,
      fetchedAt,
    };
  });
}

// ── tmp ディレクトリ確保 ────────────────────────────────────────────────────

const TMP_DIR = path.join(ROOT, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n====== FutureShop 在庫取得 検証スクリプト（ConoHa VPS 中継API）======');
  console.log('認証情報はコンソールに表示されません。\n');

  const fetchedAt = new Date().toISOString();

  let result;
  try {
    result = await fetchStock(productNo);
  } catch (err) {
    console.error(`\n[ERROR] リクエスト失敗: ${maskStr(String(err.message))}`);
    process.exit(1);
  }

  // ── レスポンス検証 ──────────────────────────────────────────────────────
  const stockMap   = result.json?.stock ?? null;
  const apiOk      = result.json?.ok    === true;
  const updatedAt  = result.json?.updatedAt ?? null;

  if (!apiOk || !stockMap) {
    console.log('[WARN] json.ok が true でないか、json.stock が存在しません');
  } else {
    console.log(`[OK] json.ok = true / SKUキー数: ${Object.keys(stockMap).length}`);
  }

  // ── candidates 生成 ──────────────────────────────────────────────────────
  const candidates = buildCandidates(
    stockMap,
    productNo,
    updatedAt ?? fetchedAt,
  );

  // updatedAt がレスポンスにある場合は candidates に反映
  if (updatedAt) {
    for (const c of candidates) c.updatedAt = updatedAt;
  }

  // ── フィールド検出フラグ ────────────────────────────────────────────────
  const hasStock = candidates.some(c => c.actualStock != null);
  const detected = {
    hasSkuCode:         candidates.some(c => c.skuCode        != null),
    hasProductNo:       candidates.some(c => c.productNo      != null),
    hasColorBranchNo:   candidates.some(c => c.colorBranchNo  != null),
    hasSizeBranchNo:    candidates.some(c => c.sizeBranchNo   != null),
    hasActualStock:     hasStock,
    hasPreorderStock:   false,
    hasPlannedStock:    false,
    hasAvailableStock:  hasStock,
    hasUpdatedAt:       !!updatedAt,
  };

  // ── フルレスポンス保存（マスク不要な項目のみ） ───────────────────────────
  const samplePath = path.join(TMP_DIR, 'futureshop-stock-response.sample.json');
  const sampleData = {
    ok:      result.json?.ok      ?? null,
    stock:   result.json?.stock   ?? null,
    updatedAt: result.json?.updatedAt ?? null,
    _meta: { httpStatus: result.status, fetchedAt },
  };
  fs.writeFileSync(samplePath, JSON.stringify(sampleData, null, 2), 'utf8');
  console.log(`\n[SAVED] フルレスポンス: ${samplePath}`);

  // ── サマリー生成 ─────────────────────────────────────────────────────────
  const notes = [
    'ConoHa VPS 中継API POST /check-stock を使用',
    '入力は7桁productNo。SKU指定時は先頭7桁からproductNoを推定',
    'レスポンスは skuNo => 在庫数 のMap',
    '予約在庫・予定在庫の区別はこのルートでは未確認 — 次フェーズで確認',
  ];
  if (!apiOk)    notes.push('json.ok が false またはレスポンスエラー');
  if (!stockMap) notes.push('json.stock が存在しませんでした — エンドポイントまたはpayloadを確認');

  const summary = {
    input: {
      product: args.product ?? null,
      sku:     inputSku,
    },
    source: {
      type:     'fs-proxy',
      endpoint: '/check-stock',
      routeVar: 'FS_PROXY_BASE_URL / FS_PROXY_TOKEN',
    },
    detectedFields: detected,
    candidates,
    notes,
    savedAt: fetchedAt,
  };

  const summaryPath = path.join(TMP_DIR, 'futureshop-stock-response.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[SAVED] サマリー: ${summaryPath}`);

  // ── コンソール出力 ───────────────────────────────────────────────────────
  console.log('\n====== 検出フィールド ======');
  for (const [k, v] of Object.entries(detected)) {
    console.log(`  ${v ? '✓' : '✗'} ${k}`);
  }

  if (candidates.length > 0) {
    console.log('\n====== SKU候補 ======');
    for (const c of candidates) {
      const { fetchedAt: _f, ...display } = c;
      console.log(JSON.stringify(display, null, 2));
    }
  } else {
    console.log('\n[INFO] SKU候補なし — json.stock が空か取得失敗');
  }

  console.log('\n====== 注記 ======');
  for (const n of notes) console.log(`  - ${n}`);

  console.log('\n====== 完了 ======\n');
}

main().catch((err) => {
  console.error('[FATAL]', maskStr(String(err.message)));
  process.exit(1);
});
