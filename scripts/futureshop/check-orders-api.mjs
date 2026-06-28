/**
 * FutureShop 受注API 検証スクリプト（ConoHa VPS 中継API経由）
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
 *   顧客情報（氏名・住所・電話・メール等）は保存・出力しない。
 *   VPS側で除外済みのため、このスクリプトは集計結果のみを扱う。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── .env.local 読み込み ───────────────────────────────────────────────────────

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

let dateFrom, dateTo;
if (args.from && args.to) {
  dateFrom = args.from;
  dateTo   = args.to;
} else {
  const days = args.days ?? 3;
  const now  = new Date();
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

// ── マスキング ─────────────────────────────────────────────────────────────────

function maskStr(s) {
  let r = String(s);
  if (PROXY_BASE_URL) r = r.replace(new RegExp(PROXY_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED_URL]');
  if (PROXY_TOKEN)    r = r.replace(new RegExp(PROXY_TOKEN.replace(   /[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED]');
  return r;
}

// ── API 呼び出し ──────────────────────────────────────────────────────────────

async function fetchOrders() {
  const payload = {
    orderDateStart: `${dateFrom}T00:00:00`,
    orderDateEnd:   `${dateTo}T23:59:59`,
  };

  console.log('\n[API] POST [MASKED_URL]/check-orders');
  console.log(`[API] payload: ${JSON.stringify(payload)}`);
  console.log('[API] Authorization: Bearer [MASKED]');

  const res = await fetch(`${PROXY_BASE_URL}/check-orders`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${PROXY_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  console.log(`[API] ステータス: ${res.status} ${res.statusText}`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ERROR] VPS /check-orders が ${res.status} を返しました`);
    console.error(`[ERROR] body: ${maskStr(text.slice(0, 300))}`);
    process.exit(1);
  }

  return await res.json();
}

// ── tmp ディレクトリ確保 ──────────────────────────────────────────────────────

const TMP_DIR = path.join(ROOT, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── メイン ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n====== FutureShop 受注API スクリプト（ConoHa VPS 中継API）======');
  console.log('認証情報・個人情報はコンソールに表示されません。\n');

  const data = await fetchOrders();

  if (!data.ok) {
    console.error('[ERROR] VPS から ok:false が返りました:', data.error ?? '(詳細なし)');
    process.exit(1);
  }

  // 品番フィルター（VPS集計後にクライアント側でさらに絞り込む場合）
  let skuSales     = data.skuSales     ?? [];
  let productSales = data.productSales ?? [];
  if (filterProduct) {
    skuSales     = skuSales.filter((s)     => s.productNo === filterProduct);
    productSales = productSales.filter((p) => p.productNo === filterProduct);
  }

  const totalSalesQty    = skuSales.reduce((s, x) => s + (x.salesQty    ?? 0), 0);
  const totalSalesAmount = skuSales.reduce((s, x) => s + (x.salesAmount ?? 0), 0);

  // ── コンソール表示 ─────────────────────────────────────────────────────────
  console.log('\n====== 集計サマリー ======');
  console.log(`  受注件数     : ${data.orderCount ?? 0}`);
  console.log(`  明細行数     : ${data.lineCount  ?? 0}`);
  console.log(`  総販売数     : ${totalSalesQty}`);
  console.log(`  総売上金額   : ¥${totalSalesAmount.toLocaleString()}`);

  const excl = data.excluded ?? {};
  if ((excl.cancelledOrders ?? 0) > 0) console.log(`  キャンセル除外: ${excl.cancelledOrders} 件`);
  if ((excl.refundedOrders  ?? 0) > 0) console.log(`  返品除外      : ${excl.refundedOrders} 件`);
  if ((excl.invalidLines    ?? 0) > 0) console.log(`  無効行        : ${excl.invalidLines} 件`);
  if (data.nextUrl)                     console.log(`  次ページ      : あり (nextUrl=${data.nextUrl})`);
  if (data.warning)                     console.log(`  ⚠ ${data.warning}`);

  if (skuSales.length > 0) {
    console.log('\n====== SKU別販売集計 ======');
    for (const s of skuSales) {
      console.log(`  SKU ${s.skuCode} (品番: ${s.productNo} / 色: ${s.colorBranchNo} / サイズ: ${s.sizeBranchNo})`);
      console.log(`    → 販売数: ${s.salesQty} / 売上金額: ¥${(s.salesAmount ?? 0).toLocaleString()} / 受注件数: ${s.orderCount}`);
    }
  } else {
    console.log('\n[INFO] SKU別集計結果なし');
  }

  if (productSales.length > 0) {
    console.log('\n====== 品番別販売集計 ======');
    for (const p of productSales) {
      console.log(`  品番 ${p.productNo}: 販売数 ${p.salesQty} / 売上金額 ¥${(p.salesAmount ?? 0).toLocaleString()} / 受注件数 ${p.orderCount}`);
    }
  }

  if (data.rawHints) {
    console.log('\n====== rawHints (フィールド確認) ======');
    console.log(`  orderKeys   : [${(data.rawHints.orderKeys   ?? []).join(', ')}]`);
    console.log(`  shipmentKeys: [${(data.rawHints.shipmentKeys ?? []).join(', ')}]`);
    console.log(`  productKeys : [${(data.rawHints.productKeys  ?? []).join(', ')}]`);
  }

  // ── サマリー保存 ───────────────────────────────────────────────────────────
  const summary = {
    input: {
      from:    dateFrom,
      to:      dateTo,
      days:    args.days ?? null,
      product: filterProduct ?? null,
    },
    source:    { type: 'fs-proxy', endpoint: '/check-orders' },
    totals: {
      orderCount:       data.orderCount    ?? 0,
      lineCount:        data.lineCount     ?? 0,
      totalSalesQty,
      totalSalesAmount,
    },
    skuSales,
    productSales,
    excluded:  data.excluded  ?? {},
    rawHints:  data.rawHints  ?? {},
    notes: [
      '顧客情報はVPS側で除外済み・このサマリーに含まれない',
      'キャンセル/返品はVPS側で除外済み',
    ],
    generatedAt: new Date().toISOString(),
  };

  const summaryPath = path.join(TMP_DIR, 'futureshop-orders-response.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n[SAVED] サマリー: ${summaryPath}`);
  console.log('\n====== 完了 ======\n');
}

main().catch((err) => {
  console.error('[FATAL]', maskStr(String(err.message)));
  process.exit(1);
});
