/**
 * FutureShop 受注API 検証スクリプト（ConoHa VPS 中継API経由）
 *
 * 目的:
 *   - 受注データからSKU別販売数・売上金額を取得できるか検証する
 *   - 個人情報（氏名・住所・電話・メール等）は保存・出力しない
 *   - summary JSON は MDツール反映形式で保存する
 *
 * 使い方:
 *   npm run fs:orders:check -- --days 3
 *   npm run fs:orders:check -- --from 2026-06-25 --to 2026-06-27
 *   npm run fs:orders:check -- --days 7 --product 1266302
 *
 * 必要な環境変数 (.env.local):
 *   FS_PROXY_BASE_URL   ConoHa VPS 中継APIのベースURL
 *   FS_PROXY_TOKEN      Bearer 認証トークン
 *
 * 注意:
 *   受注用エンドポイントは未確定。/search-orders → /orders → /get-orders の順で試行する。
 *   いずれも404/405の場合は「VPS実装確認が必要」として終了する。
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
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

// ── 環境変数チェック ──────────────────────────────────────────────────────────

const PROXY_BASE_URL = process.env.FS_PROXY_BASE_URL ?? null;
const PROXY_TOKEN    = process.env.FS_PROXY_TOKEN    ?? null;

console.log('\n[ENV] 環境変数確認:');
console.log('  FS_PROXY_BASE_URL :', PROXY_BASE_URL ? '設定済み' : '未設定');
console.log('  FS_PROXY_TOKEN    :', PROXY_TOKEN    ? '設定済み' : '未設定');

if (!PROXY_BASE_URL || !PROXY_TOKEN) {
  console.error('\n[ERROR] 必要な環境変数が設定されていません。');
  console.error('.env.local に以下を追加してください:');
  console.error('  FS_PROXY_BASE_URL=<ConoHa VPS 中継APIのベースURL>');
  console.error('  FS_PROXY_TOKEN=<Bearer トークン>\n');
  process.exit(1);
}

// ── 引数パース ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days'    && argv[i + 1]) args.days    = Number(argv[++i]);
    if (argv[i] === '--from'    && argv[i + 1]) args.from    = argv[++i];
    if (argv[i] === '--to'      && argv[i + 1]) args.to      = argv[++i];
    if (argv[i] === '--product' && argv[i + 1]) args.product = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

// 日付範囲を決定
let dateFrom, dateTo;

if (args.from && args.to) {
  dateFrom = args.from;
  dateTo   = args.to;
} else {
  const days = args.days ?? 3;
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - days);
  dateFrom = from.toISOString().slice(0, 10);
  dateTo   = now.toISOString().slice(0, 10);
}

const filterProduct = args.product ? String(args.product).replace(/\D/g, '') : null;

if (filterProduct && filterProduct.length !== 7) {
  console.error(`[ERROR] --product は7桁の品番を指定してください: "${args.product}"`);
  process.exit(1);
}

console.log(`\n[INPUT] 期間: ${dateFrom} 〜 ${dateTo}`);
if (filterProduct) console.log(`[INPUT] 絞り込み品番: ${filterProduct}`);

// ── マスキング ────────────────────────────────────────────────────────────────

// コンソール出力に認証情報が混入しないよう URL・token をマスク
function maskStr(s) {
  let r = String(s);
  if (PROXY_BASE_URL) r = r.replace(new RegExp(PROXY_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED_URL]');
  if (PROXY_TOKEN)    r = r.replace(new RegExp(PROXY_TOKEN.replace(   /[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED]');
  return r;
}

// レスポンスオブジェクト内の個人情報フィールドを削除 / [MASKED] に置換
const PERSONAL_INFO_KEYS = new Set([
  'name', 'customerName', 'customer', 'member', 'memberId',
  'email', 'mail', 'tel', 'phone',
  'address', 'address1', 'address2', 'zip', 'postalCode', 'prefecture', 'city',
  'delivery', 'shipping', 'billing', 'payment', 'card',
  'token', 'accessToken', 'refreshToken',
  'password', 'secret', 'authorization', 'apiKey',
  'lastName', 'firstName', 'familyName', 'givenName',
  'receiverName', 'senderName',
]);

function maskPersonalInfo(obj, depth = 0) {
  if (depth > 10) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => maskPersonalInfo(v, depth + 1));
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const kLower = k.toLowerCase();
    const isPersonal = PERSONAL_INFO_KEYS.has(k) || PERSONAL_INFO_KEYS.has(kLower) ||
      [...PERSONAL_INFO_KEYS].some((p) => kLower.includes(p.toLowerCase()));
    result[k] = isPersonal ? '[MASKED]' : maskPersonalInfo(v, depth + 1);
  }
  return result;
}

// ── SKU ユーティリティ ────────────────────────────────────────────────────────

function normalizeSku(raw) {
  // 1266302_78_9 → 1266302789
  return String(raw ?? '').replaceAll('_', '').replace(/\D/g, '');
}

function parseSku10(sku10) {
  const s = normalizeSku(sku10);
  if (s.length !== 10) return null;
  return {
    productNo:     s.slice(0, 7),
    colorBranchNo: s.slice(7, 9),
    sizeBranchNo:  s.slice(9, 10),
  };
}

// ── 受注エンドポイント探索 ────────────────────────────────────────────────────

// 試行するエンドポイント候補（未確定）
const ORDER_ENDPOINT_CANDIDATES = [
  '/search-orders',
  '/orders',
  '/get-orders',
  '/check-orders',
];

// 各エンドポイントへのリクエスト payload 候補
function buildPayload(endpoint) {
  const base = {
    from: dateFrom,
    to:   dateTo,
  };
  if (filterProduct) base.productNo = filterProduct;

  // エンドポイントによって payload キー名が異なる場合を考慮
  if (endpoint === '/search-orders') {
    return { orderDateFrom: dateFrom, orderDateTo: dateTo, ...(filterProduct ? { productNo: filterProduct } : {}) };
  }
  return base;
}

async function tryEndpoint(endpoint) {
  const payload = buildPayload(endpoint);
  console.log(`\n[API] POST [MASKED_URL]${endpoint}`);
  console.log(`[API] payload: ${JSON.stringify(payload)}`);
  console.log('[API] Authorization: Bearer [MASKED]');

  try {
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

    if (res.status === 404 || res.status === 405) {
      console.log(`[SKIP] ${endpoint} → ${res.status} (エンドポイント未実装またはメソッド不一致)`);
      return null;
    }

    let json = null;
    try { json = JSON.parse(text); } catch {
      console.log('[WARN] レスポンスがJSON形式ではありません');
      return { status: res.status, ok: res.ok, json: null, text: maskStr(text.slice(0, 500)) };
    }

    return { status: res.status, ok: res.ok, json, endpoint };
  } catch (err) {
    console.log(`[ERROR] ${endpoint}: ${maskStr(String(err.message))}`);
    return null;
  }
}

// ── 受注データ解析 ────────────────────────────────────────────────────────────

// レスポンスから「受注明細の配列」を抽出する（フォーマット未確定のため複数パターン試行）
function extractOrderLines(json) {
  if (!json || typeof json !== 'object') return [];

  // パターン1: { orders: [ { lines: [...] } ] }
  if (Array.isArray(json.orders)) {
    const lines = [];
    for (const order of json.orders) {
      const status = order.status ?? order.orderStatus ?? order.statusCode ?? '';
      const isCanceled = /cancel|キャンセル|取消/i.test(String(status));
      if (isCanceled) continue;
      const orderDate = order.orderDate ?? order.orderedAt ?? order.createdAt ?? '';
      const orderNo = order.orderNo ?? order.orderId ?? order.id ?? '';
      const details = order.lines ?? order.details ?? order.items ?? order.orderDetails ?? [];
      if (Array.isArray(details)) {
        for (const line of details) {
          lines.push({ ...line, _orderDate: orderDate, _orderNo: orderNo, _orderStatus: status });
        }
      }
    }
    return lines;
  }

  // パターン2: { data: { orders: [...] } }
  if (json.data && Array.isArray(json.data.orders)) {
    return extractOrderLines({ orders: json.data.orders });
  }

  // パターン3: { items: [...] } (直接明細の場合)
  if (Array.isArray(json.items)) return json.items;

  // パターン4: { result: [...] }
  if (Array.isArray(json.result)) return json.result;

  return [];
}

// 受注明細 1件からSKU・数量・金額を抽出（フォーマット未確定のため複数キー候補）
function extractLineFields(line) {
  const skuRaw =
    line.skuCode ?? line.sku ?? line.skuNo ?? line.goodsVariationCode ??
    line.goodsCode ?? line.janCode ?? null;

  const productNoRaw =
    line.productNo ?? line.goodsNo ?? line.itemCode ?? null;

  const qty =
    typeof line.quantity === 'number' ? line.quantity :
    typeof line.qty      === 'number' ? line.qty :
    typeof line.orderQty === 'number' ? line.orderQty :
    typeof line.count    === 'number' ? line.count :
    null;

  const unitPrice =
    typeof line.unitPrice  === 'number' ? line.unitPrice :
    typeof line.price      === 'number' ? line.price :
    typeof line.salePrice  === 'number' ? line.salePrice :
    null;

  const lineAmount =
    typeof line.lineAmount  === 'number' ? line.lineAmount :
    typeof line.subtotal    === 'number' ? line.subtotal :
    typeof line.totalAmount === 'number' ? line.totalAmount :
    (qty != null && unitPrice != null ? qty * unitPrice : null);

  const discount =
    typeof line.discountAmount === 'number' ? line.discountAmount :
    typeof line.discount       === 'number' ? line.discount :
    null;

  const finalAmount =
    (lineAmount != null && discount != null) ? lineAmount - discount :
    lineAmount;

  return { skuRaw, productNoRaw, qty, unitPrice, lineAmount, discount, finalAmount };
}

// ── フィールド検出 ─────────────────────────────────────────────────────────────

function detectFields(json, lines) {
  const anyLine = lines[0] ?? {};
  return {
    hasOrderDate:    lines.some((l) => l._orderDate),
    hasOrderStatus:  lines.some((l) => l._orderStatus),
    hasCancelStatus: json.orders?.some((o) => /cancel|キャンセル/i.test(String(o.status ?? ''))),
    hasSkuCode:      lines.some((l) => !!(l.skuCode ?? l.sku ?? l.skuNo ?? l.goodsVariationCode)),
    hasProductNo:    lines.some((l) => !!(l.productNo ?? l.goodsNo ?? l.itemCode)),
    hasQuantity:     lines.some((l) => l.quantity != null || l.qty != null),
    hasUnitPrice:    lines.some((l) => l.unitPrice != null || l.price != null),
    hasLineAmount:   lines.some((l) => l.lineAmount != null || l.subtotal != null),
    hasDiscount:     lines.some((l) => l.discountAmount != null || l.discount != null),
    sampleLineKeys:  Object.keys(anyLine).filter((k) => !k.startsWith('_')).slice(0, 30),
  };
}

// ── SKU別・品番別集計 ─────────────────────────────────────────────────────────

function aggregateSales(lines) {
  const skuMap  = {};  // skuCode → { productNo, colorBranchNo, sizeBranchNo, salesQty, salesAmount, orderNos }
  const prodMap = {};  // productNo → { salesQty, salesAmount, orderNos }
  let canceledOrders = 0;
  let invalidLines   = 0;

  for (const line of lines) {
    const { skuRaw, productNoRaw, qty, finalAmount, lineAmount } = extractLineFields(line);

    // SKU正規化
    const skuNorm = skuRaw ? normalizeSku(skuRaw) : null;
    const parsed  = skuNorm ? parseSku10(skuNorm) : null;

    const productNo = parsed?.productNo ??
      (productNoRaw ? String(productNoRaw).replace(/\D/g, '').slice(0, 7) : null);

    if (!productNo || qty == null) {
      invalidLines++;
      continue;
    }

    // 品番フィルター
    if (filterProduct && productNo !== filterProduct) continue;

    const amount = finalAmount ?? lineAmount ?? 0;
    const orderNo = line._orderNo ?? 'unknown';

    // SKU別集計
    if (skuNorm && parsed) {
      if (!skuMap[skuNorm]) {
        skuMap[skuNorm] = {
          productNo,
          skuCode:       skuNorm,
          colorBranchNo: parsed.colorBranchNo,
          sizeBranchNo:  parsed.sizeBranchNo,
          salesQty:    0,
          salesAmount: 0,
          orderCount:  0,
          _orderNos:   new Set(),
        };
      }
      skuMap[skuNorm].salesQty    += qty;
      skuMap[skuNorm].salesAmount += amount;
      skuMap[skuNorm]._orderNos.add(orderNo);
    }

    // 品番別集計
    if (!prodMap[productNo]) {
      prodMap[productNo] = { productNo, salesQty: 0, salesAmount: 0, _orderNos: new Set() };
    }
    prodMap[productNo].salesQty    += qty;
    prodMap[productNo].salesAmount += amount;
    prodMap[productNo]._orderNos.add(orderNo);
  }

  const skuSales = Object.values(skuMap).map(({ _orderNos, ...rest }) => ({
    ...rest,
    orderCount: _orderNos.size,
  }));

  const productSales = Object.values(prodMap).map(({ _orderNos, ...rest }) => ({
    ...rest,
    orderCount: _orderNos.size,
  }));

  return { skuSales, productSales, canceledOrders, invalidLines };
}

// ── tmp ディレクトリ確保 ──────────────────────────────────────────────────────

const TMP_DIR = path.join(ROOT, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── メイン ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n====== FutureShop 受注API 検証スクリプト（ConoHa VPS 中継API）======');
  console.log('認証情報・個人情報はコンソールに表示されません。\n');

  const startedAt = new Date().toISOString();

  // エンドポイント探索
  let found = null;
  for (const endpoint of ORDER_ENDPOINT_CANDIDATES) {
    found = await tryEndpoint(endpoint);
    if (found !== null) break;
  }

  // ── エンドポイントが見つからない場合 ──────────────────────────────────────
  if (!found) {
    console.log('\n[RESULT] いずれのエンドポイントも応答しませんでした。');
    console.log('  → ConoHa VPS に受注API エンドポイントが未実装の可能性があります。');
    console.log('  → 公式仕様確認またはVPS実装確認が必要です。');

    const summary = buildSummary({
      endpoint: '未確定 (404/接続エラー)',
      detectedFields: {},
      lines: [],
      json: null,
      notes: [
        `試行エンドポイント: ${ORDER_ENDPOINT_CANDIDATES.join(', ')}`,
        'いずれも404またはエラー → VPS に受注エンドポイントが未実装の可能性',
        '対応策: ConoHa VPS 実装を確認するか、FutureShop Open API を直接検討',
        '受注API用に別途エンドポイント・tokenが必要な場合は .env.local に追加してください',
        '  例: FS_ORDERS_ENDPOINT=<orders endpoint URL>',
        '      FS_ORDERS_TOKEN=<orders API token (既存tokenと同じ場合は不要)>',
      ],
    }, startedAt);

    const summaryPath = path.join(TMP_DIR, 'futureshop-orders-response.summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n[SAVED] サマリー: ${summaryPath}`);
    console.log('\n====== 完了（エンドポイント未確定）======\n');
    return;
  }

  // ── レスポンス取得成功 ─────────────────────────────────────────────────────
  const { json, endpoint, status } = found;

  console.log(`\n[OK] エンドポイント確定: ${endpoint} (HTTP ${status})`);

  // 個人情報マスク済みフルレスポンスを保存
  const maskedJson = maskPersonalInfo(json);
  const samplePath = path.join(TMP_DIR, 'futureshop-orders-response.sample.json');
  fs.writeFileSync(samplePath, JSON.stringify(maskedJson, null, 2), 'utf8');
  console.log(`[SAVED] マスク済みフルレスポンス: ${samplePath}`);

  // 受注明細を抽出
  const lines = extractOrderLines(json);
  console.log(`\n[PARSE] 受注明細行数 (キャンセル除外後): ${lines.length}`);

  // フィールド検出
  const detectedFields = detectFields(json, lines);

  console.log('\n====== 検出フィールド ======');
  for (const [k, v] of Object.entries(detectedFields)) {
    if (k === 'sampleLineKeys') {
      console.log(`  sampleLineKeys: [${v.join(', ')}]`);
    } else {
      console.log(`  ${v ? '✓' : '✗'} ${k}`);
    }
  }

  // SKU別・品番別集計
  const { skuSales, productSales, canceledOrders, invalidLines } = aggregateSales(lines);

  const totalSalesQty    = skuSales.reduce((s, r) => s + r.salesQty,    0);
  const totalSalesAmount = skuSales.reduce((s, r) => s + r.salesAmount, 0);
  const orderCount = new Set(lines.map((l) => l._orderNo)).size;

  // SKU別サマリーをコンソール表示
  if (skuSales.length > 0) {
    console.log('\n====== SKU別販売集計 ======');
    for (const s of skuSales) {
      console.log(`  SKU ${s.skuCode} (品番: ${s.productNo} / 色: ${s.colorBranchNo} / サイズ: ${s.sizeBranchNo})`);
      console.log(`    → 販売数: ${s.salesQty} / 売上金額: ¥${s.salesAmount} / 受注件数: ${s.orderCount}`);
    }
  } else {
    console.log('\n[INFO] SKU別集計結果なし（明細なし or 全行が無効）');
  }

  if (productSales.length > 0) {
    console.log('\n====== 品番別販売集計 ======');
    for (const p of productSales) {
      console.log(`  品番 ${p.productNo}: 販売数 ${p.salesQty} / 売上金額 ¥${p.salesAmount} / 受注件数 ${p.orderCount}`);
    }
  }

  const notes = [
    `エンドポイント: ${endpoint}`,
    '個人情報フィールドはマスク済み / summaryに含めない',
    'キャンセル除外: _orderStatus に cancel/キャンセルを含む受注を除外',
    '売上金額: lineAmount → finalAmount (lineAmount - discount) の優先順',
    '未確定事項: レスポンス仕様は実装確認後に更新してください',
  ];

  if (!found.ok) notes.push(`HTTP ${status} → エラーレスポンスの可能性 (内容はsampleファイルを確認)`);
  if (invalidLines > 0) notes.push(`無効行 ${invalidLines} 件 (SKU/数量が取得できなかった行)`);
  if (canceledOrders > 0) notes.push(`キャンセル受注 ${canceledOrders} 件を除外`);

  const summary = buildSummary({
    endpoint,
    detectedFields,
    lines,
    json,
    notes,
    skuSales,
    productSales,
    orderCount,
    totalSalesQty,
    totalSalesAmount,
    canceledOrders,
    invalidLines,
  }, startedAt);

  const summaryPath = path.join(TMP_DIR, 'futureshop-orders-response.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n[SAVED] サマリー: ${summaryPath}`);

  console.log('\n====== 注記 ======');
  for (const n of notes) console.log(`  - ${n}`);
  console.log('\n====== 完了 ======\n');
}

// ── サマリー JSON 生成 ────────────────────────────────────────────────────────

function buildSummary(opts, startedAt) {
  const {
    endpoint, detectedFields, notes,
    skuSales = [], productSales = [],
    orderCount = 0, totalSalesQty = 0, totalSalesAmount = 0,
    canceledOrders = 0, invalidLines = 0,
  } = opts;

  return {
    input: {
      from:    dateFrom,
      to:      dateTo,
      days:    args.days ?? null,
      product: filterProduct ?? null,
    },
    source: {
      type:     'fs-proxy',
      endpoint: endpoint ?? '未確定',
      routeVar: 'FS_PROXY_BASE_URL / FS_PROXY_TOKEN',
    },
    detectedFields: {
      hasOrderDate:    detectedFields.hasOrderDate    ?? false,
      hasOrderStatus:  detectedFields.hasOrderStatus  ?? false,
      hasCancelStatus: detectedFields.hasCancelStatus ?? false,
      hasSkuCode:      detectedFields.hasSkuCode      ?? false,
      hasProductNo:    detectedFields.hasProductNo    ?? false,
      hasQuantity:     detectedFields.hasQuantity     ?? false,
      hasUnitPrice:    detectedFields.hasUnitPrice    ?? false,
      hasLineAmount:   detectedFields.hasLineAmount   ?? false,
      hasDiscount:     detectedFields.hasDiscount     ?? false,
      sampleLineKeys:  detectedFields.sampleLineKeys  ?? [],
    },
    totals: {
      orderCount,
      lineCount:    opts.lines?.length ?? 0,
      salesQty:     totalSalesQty,
      salesAmount:  totalSalesAmount,
    },
    skuSales,
    productSales,
    excluded: {
      canceledOrders,
      invalidLines,
      personalInfoFieldsRemoved: true,
    },
    mdVariationFields: {
      salesQty7d:       '今回の期間が7日以内なら skuSales[n].salesQty で近似可能',
      salesQty14d:      '14日指定で再取得して反映',
      salesQty30d:      '30日指定で再取得して反映',
      salesAmount7d:    '同上 (amount)',
      salesAmount14d:   '同上',
      salesAmount30d:   '同上',
      monthlySalesQty:  '月初〜月末で取得して反映',
      monthlySalesAmount: '同上',
    },
    notes: [
      '個人情報はsummaryに含めない',
      'キャンセル/返品の除外条件は要確認 (レスポンス仕様依存)',
      ...notes,
    ],
    generatedAt: startedAt,
  };
}

main().catch((err) => {
  console.error('[FATAL]', maskStr(String(err.message)));
  process.exit(1);
});
