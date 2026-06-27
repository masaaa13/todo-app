/**
 * FutureShop 商品検索API 検証スクリプト（ConoHa VPS proxy 経由）
 *
 * VPS の POST /check-products を叩き、FutureShop 登録商品の
 * productNo / url / uri / name / unitPrice / imageUrl / imageList / variations を取得する。
 *
 * 使い方:
 *   npm run fs:products:check -- --product 1266302
 *   npm run fs:products:check -- --product 1266302 --types variation,image,plannedStock
 *   npm run fs:products:check -- --products 1266302,1266303,1266304
 *
 * 必要な環境変数 (.env.local):
 *   FS_PROXY_BASE_URL  ConoHa VPS proxy のベースURL
 *   FS_PROXY_TOKEN     VPS proxy の Bearer トークン
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

const FS_PROXY_BASE_URL = process.env.FS_PROXY_BASE_URL ?? null;
const FS_PROXY_TOKEN    = process.env.FS_PROXY_TOKEN    ?? null;

console.log('\n[ENV] 環境変数確認:');
console.log('  FS_PROXY_BASE_URL :', FS_PROXY_BASE_URL ? '設定済み' : '未設定');
console.log('  FS_PROXY_TOKEN    :', FS_PROXY_TOKEN    ? '設定済み' : '未設定');

if (!FS_PROXY_BASE_URL || !FS_PROXY_TOKEN) {
  console.error('\n[ERROR] 必要な環境変数が不足しています。.env.local を確認してください:');
  if (!FS_PROXY_BASE_URL) console.error('  FS_PROXY_BASE_URL=<ConoHa VPS proxy URL>');
  if (!FS_PROXY_TOKEN)    console.error('  FS_PROXY_TOKEN=<VPS Bearer トークン>');
  process.exit(1);
}

// ── 引数パース ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product'  && argv[i + 1]) args.product  = argv[++i];
    if (argv[i] === '--products' && argv[i + 1]) args.products = argv[++i];
    if (argv[i] === '--types'    && argv[i + 1]) args.types    = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.product && !args.products) {
  console.log(`
Usage:
  node scripts/futureshop/check-products-api.mjs --product 1266302
  node scripts/futureshop/check-products-api.mjs --products 1266302,1266303
  node scripts/futureshop/check-products-api.mjs --product 1266302 --types variation,image,plannedStock
  `);
  process.exit(0);
}

// 品番リストを正規化（7桁チェック）
const rawNos = args.products
  ? args.products.split(',').map((s) => s.trim()).filter(Boolean)
  : [String(args.product).trim()];

const productNos = rawNos.map((n) => n.replace(/\D/g, ''));
for (const no of productNos) {
  if (no.length !== 7) {
    console.error(`[ERROR] --product は7桁の品番を指定してください: "${no}"`);
    process.exit(1);
  }
}

const requestTypes = (args.types ?? 'variation,image,comment,preorder,plannedStock')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ── マスキング ────────────────────────────────────────────────────────────────

function maskSecrets(s) {
  let r = String(s);
  for (const secret of [FS_PROXY_TOKEN, FS_PROXY_BASE_URL].filter(Boolean)) {
    r = r.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[MASKED]');
  }
  return r;
}

// ── tmp ディレクトリ ──────────────────────────────────────────────────────────

const TMP_DIR = path.join(ROOT, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── メイン ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n====== FutureShop 商品検索API 検証スクリプト（VPS proxy 経由）======');
  console.log('認証情報・シークレットはコンソールに表示されません。\n');

  console.log(`[INPUT] productNos : ${productNos.join(', ')}`);
  console.log(`[INPUT] types      : ${requestTypes.join(', ')}`);

  const startedAt = new Date().toISOString();
  const endpoint  = `${FS_PROXY_BASE_URL}/check-products`;

  console.log(`\n[API] POST [MASKED]/check-products`);
  console.log('[API] Authorization: Bearer [MASKED]');

  // ── VPS proxy 呼び出し ──────────────────────────────────────────────────────
  let vpsData;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FS_PROXY_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ productNos, types: requestTypes }),
    });

    console.log(`[API] ステータス: ${res.status} ${res.statusText}`);

    const text = await res.text();

    if (!res.ok) {
      console.error(`[API] エラー: ${maskSecrets(text.slice(0, 400))}`);
      process.exit(1);
    }

    vpsData = JSON.parse(text);
  } catch (err) {
    console.error(`\n[ERROR] ${maskSecrets(String(err.message))}`);
    process.exit(1);
  }

  if (!vpsData?.ok) {
    console.error(`[ERROR] VPS が ok=false を返しました: ${JSON.stringify(vpsData?.error ?? vpsData)}`);
    process.exit(1);
  }

  // ── フィールド検出 ────────────────────────────────────────────────────────
  const products = vpsData.products ?? [];
  const p0       = products[0] ?? {};
  const var0     = p0.variations?.[0] ?? {};
  const img0     = p0.imageList?.[0]  ?? {};
  const hints    = p0.rawHints ?? {};

  const detected = {
    hasProductNo:     !!p0.productNo,
    hasProductUrl:    !!p0.url,
    hasProductUri:    !!p0.uri,
    hasProductName:   !!p0.name,
    hasUnitPrice:     p0.unitPrice != null,
    hasVisible:       p0.visible   != null,
    hasGroupUrl:      !!p0.groupUrl,
    hasGroupName:     !!p0.groupName,
    hasDateCreated:   !!p0.dateCreated,
    hasImageUrl:      !!p0.imageUrl,
    hasImageList:     (p0.imageList?.length ?? 0) > 0,
    imageListCount:   p0.imageList?.length ?? 0,
    hasOriginalImagePath: !!img0.originalImagePath,
    hasLImagePath:    !!img0.lImagePath,
    hasMImagePath:    !!img0.mImagePath,
    hasVariationList: (p0.variations?.length ?? 0) > 0,
    variationCount:   p0.variations?.length ?? 0,
    hasSkuCode:       !!var0.skuCode,
    hasColorBranchNo: !!var0.colorBranchNo,
    hasColorName:     !!var0.colorName,
    hasSizeBranchNo:  !!var0.sizeBranchNo,
    hasSizeName:      !!var0.sizeName,
    hasJanCode:       !!var0.janCode,
    hasStockCount:    var0.stockCount != null,
    hasPreorder:      !!p0.hasPreorder,
    hasPlannedStock:  !!p0.hasPlannedStock,
    rawProductKeys:   hints.rawProductKeys   ?? [],
    rawVariationKeys: hints.rawVariationKeys ?? [],
    rawImageKeys:     hints.rawImageKeys     ?? [],
  };

  // ── 検出フィールド表示 ────────────────────────────────────────────────────
  console.log('\n====== 検出フィールド ======');
  for (const [k, v] of Object.entries(detected)) {
    if (Array.isArray(v)) {
      console.log(`   ${k}: [${v.join(', ')}]`);
    } else {
      const mark = typeof v === 'boolean' ? (v ? '✓' : '✗') : ' ';
      console.log(`  ${mark} ${k}: ${JSON.stringify(v)}`);
    }
  }

  // ── 商品サマリー表示 ──────────────────────────────────────────────────────
  if (products.length > 0) {
    console.log('\n====== 商品サマリー ======');
    for (const p of products) {
      console.log(`  productNo     : ${p.productNo ?? '—'}`);
      console.log(`  url           : ${p.url       ?? '—'}`);
      console.log(`  uri           : ${p.uri       ?? '—'}`);
      console.log(`  name          : ${p.name      ?? '—'}`);
      console.log(`  unitPrice     : ${p.unitPrice ?? '—'}`);
      console.log(`  visible       : ${p.visible   ?? '—'}`);
      console.log(`  groupName     : ${p.groupName ?? '—'}`);
      console.log(`  imageUrl      : ${p.imageUrl ? p.imageUrl.slice(0, 70) + '...' : '—'}`);
      console.log(`  imageList件数  : ${p.imageList?.length ?? 0}`);
      console.log(`  variation件数  : ${p.variations?.length ?? 0}`);
      console.log(`  hasPreorder   : ${p.hasPreorder}`);
      console.log(`  hasPlannedStock: ${p.hasPlannedStock}`);

      if ((p.variations?.length ?? 0) > 0) {
        console.log('  variations (先頭3件):');
        for (const v of p.variations.slice(0, 3)) {
          console.log(
            `    SKU ${v.skuCode} | 色 ${v.colorBranchNo ?? '?'}(${v.colorName ?? '?'})` +
            ` | サイズ ${v.sizeBranchNo ?? '?'}(${v.sizeName ?? '?'})` +
            ` | 在庫 ${v.stockCount ?? '—'} | JAN ${v.janCode ?? '—'}`
          );
        }
      }
    }
  }

  // ── フルレスポンス保存 ────────────────────────────────────────────────────
  const samplePath = path.join(TMP_DIR, 'futureshop-products-response.sample.json');
  fs.writeFileSync(samplePath, JSON.stringify(vpsData, null, 2), 'utf8');
  console.log(`\n[SAVED] フルレスポンス: ${samplePath}`);

  // ── summary JSON 構築 ─────────────────────────────────────────────────────
  const notes = [
    detected.hasProductUrl
      ? '✓ url（urlCode）が取得できます — 商品URL組み立てに利用可能'
      : '✗ url が取得できませんでした',
    detected.hasProductUri
      ? '✓ uri（フルURL）が取得できます — MDツールに直接使用可能'
      : '✗ uri が取得できませんでした',
    detected.hasImageUrl
      ? '✓ imageUrl が取得できます — MdProduct.imageUrl に直接反映可能'
      : '✗ imageUrl が取得できませんでした',
    detected.hasImageList
      ? `✓ imageList が取得できます（${detected.imageListCount}件） — 追加画像パスも利用可能`
      : '✗ imageList が取得できませんでした',
    detected.hasVariationList
      ? `✓ variations が取得できます（${detected.variationCount}件）`
      : '✗ variations が取得できませんでした',
    detected.hasSkuCode
      ? '✓ variation.skuCode（10桁）が取得できます — MdVariation.skuCode に反映可能'
      : '✗ variation.skuCode が取得できませんでした',
    detected.hasJanCode
      ? '✓ variation.janCode が取得できます'
      : '✗ variation.janCode が取得できませんでした',
    detected.hasStockCount
      ? '✓ variation.stockCount が取得できます'
      : '— variation.stockCount は null（在庫同期は /check-stock を使用）',
    detected.hasPreorder
      ? '✓ hasPreorder: true'
      : '— hasPreorder: false（この商品は予約販売なし）',
    detected.hasPlannedStock
      ? '✓ hasPlannedStock: true'
      : '— hasPlannedStock: false（この商品は予定在庫なし）',
    '認証情報はsummaryに含めない',
  ];

  const summary = {
    input: {
      productNos,
      types: requestTypes,
      via:   'vps-proxy /check-products',
    },
    source: {
      type:     'futureshop-api-v2-via-proxy',
      endpoint: '/check-products',
    },
    detectedFields: {
      hasProductNo:         detected.hasProductNo,
      hasProductUrl:        detected.hasProductUrl,
      hasProductUri:        detected.hasProductUri,
      hasProductName:       detected.hasProductName,
      hasUnitPrice:         detected.hasUnitPrice,
      hasVisible:           detected.hasVisible,
      hasGroupUrl:          detected.hasGroupUrl,
      hasGroupName:         detected.hasGroupName,
      hasDateCreated:       detected.hasDateCreated,
      hasImageUrl:          detected.hasImageUrl,
      hasImageList:         detected.hasImageList,
      imageListCount:       detected.imageListCount,
      hasOriginalImagePath: detected.hasOriginalImagePath,
      hasLImagePath:        detected.hasLImagePath,
      hasMImagePath:        detected.hasMImagePath,
      hasVariationList:     detected.hasVariationList,
      variationCount:       detected.variationCount,
      hasSkuCode:           detected.hasSkuCode,
      hasColorBranchNo:     detected.hasColorBranchNo,
      hasColorName:         detected.hasColorName,
      hasSizeBranchNo:      detected.hasSizeBranchNo,
      hasSizeName:          detected.hasSizeName,
      hasJanCode:           detected.hasJanCode,
      hasStockCount:        detected.hasStockCount,
      hasPreorder:          detected.hasPreorder,
      hasPlannedStock:      detected.hasPlannedStock,
    },
    rawProductKeys:   detected.rawProductKeys,
    rawVariationKeys: detected.rawVariationKeys,
    rawImageKeys:     detected.rawImageKeys,
    productCount:     products.length,
    totalCount:       vpsData.totalCount ?? products.length,
    products: products.map((p) => ({
      productNo:        p.productNo,
      url:              p.url,
      uri:              p.uri,
      name:             p.name,
      unitPrice:        p.unitPrice,
      regularPrice:     p.regularPrice,
      visible:          p.visible,
      groupUrl:         p.groupUrl,
      groupName:        p.groupName,
      dateCreated:      p.dateCreated,
      dateLastUpdated:  p.dateLastUpdated,
      imageUrl:         p.imageUrl,
      imageList:        p.imageList,
      variationCount:   p.variations?.length ?? 0,
      variations:       p.variations,
      hasPreorder:      p.hasPreorder,
      hasPlannedStock:  p.hasPlannedStock,
    })),
    notes,
    generatedAt: startedAt,
  };

  const summaryPath = path.join(TMP_DIR, 'futureshop-products-response.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[SAVED] サマリー: ${summaryPath}`);

  // ── 注記表示 ─────────────────────────────────────────────────────────────
  console.log('\n====== 注記 ======');
  for (const n of notes) console.log(`  ${n}`);
  console.log('\n====== 完了 ======\n');
}

main().catch((err) => {
  console.error('[FATAL]', maskSecrets(String(err.message)));
  process.exit(1);
});
