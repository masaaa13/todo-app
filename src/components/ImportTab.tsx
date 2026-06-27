import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import Encoding from 'encoding-japanese';
// import { supabase } from '../lib/supabase'; // Phase 1: DB保存実装時に復活
import { useFsProducts } from '../hooks/useFsProducts';
import type { ImportRowStatus } from '../types/importJob';
import { IMPORT_ROW_STATUS_LABELS } from '../types/importJob';
import type { MdProduct, MdVariation } from '../types/md';
import { FsImportSection } from './FsImportSection';
import styles from './ImportTab.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'sheet' | 'columns' | 'review' | 'done';
type SheetKind = 'sku' | 'md' | 'unknown';

type ParsedSheet = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
  kind: SheetKind;
};

type ColMap = {
  productNo: string;
  skuNo: string;
  urlCode: string;
  productName: string;
  price: string;
  janCode: string;
  colorDisplay: string;
  colorCode: string;
  sizeName: string;
  sizeCode: string;
};

type ReviewRow = {
  idx: number;
  productNo: string;
  skuNo: string;
  urlCode: string;
  rawData: Record<string, string>;
  status: ImportRowStatus;
  diffKeys: string[];
  selected: boolean;
};

type SpecData = {
  measureNames: string[];
  sizeRows: { label: string; values: string[] }[];
};

type ReleaseDateParseResult = {
  productDateMap: Map<string, string>; // productNo → date (populated when MD has 7-digit nos)
  weekDateMap: Map<string, string>;    // weekLabel → date (always populated)
  hasProductNos: boolean;
  sheetNames: string[];
  detectedProductNos: string[];
  detectedWeekLabels: string[];
};

type SupplementAlerts = {
  totalProducts: number;
  noCaption: string[];
  noSpec: string[];
  noMaterial: string[];
  specNoRows: string[];
  noReleaseDate: string[];
  releaseDateSkipReason: string;
};

type ImportHistorySkuRow = {
  productNo: string; productName: string; skuCode: string;
  color: string; size: string; janCode: string; price: string;
};

type ImportHistoryEntry = {
  id: string;
  datetime: string;
  filename: string;
  skuCount: number;
  productCount: number;
  status: '取込済み' | '商品一覧反映済み';
  skuRows?: ImportHistorySkuRow[]; // optional — kept for backward compat with old entries
};

type ImportSavedState = {
  filename: string;
  savedAt: string;
  skuCount: number;
  productCount: number;
  reviewRows: ReviewRow[];
  colMap: ColMap;
  captionFilename: string;
  specFilename: string;
  materialFilename: string;
  mdFilename: string;
  // Supplement maps — serialized as plain objects for JSON storage
  captionMapData: Record<string, string>;
  specMapData: Record<string, SpecData>;
  materialMapData: Record<string, string>; // merged (xlsx + manual)
  releaseDateMapData: Record<string, string>;
  // Image URL fields (optional for backward compat)
  imageUrlFilename?: string;
  imageUrlImportedAt?: string;
  imageUrlMapData?: ImageUrlMap;
  imageUrlSkuCount?: number;
  imageUrlProductCount?: number;
  imageUrlSkipCount?: number;
  imageUrlWarningCount?: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_COLMAP: ColMap = {
  productNo: '', skuNo: '', urlCode: '',
  productName: '', price: '', janCode: '',
  colorDisplay: '', colorCode: '', sizeName: '', sizeCode: '',
};
const PREVIEW_ROWS = 5;
const MAX_PREVIEW_COLS = 10;
const DEFAULT_RELEASE_YEAR = 2026;
const RELEASE_TIME_SUFFIX = '12:00';
const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  sku: 'SKU', md: 'MD表・対象外', unknown: '不明',
};

const IMPORT_STATE_KEY   = 'ecTodo.importState';
const IMPORT_HISTORY_KEY = 'ecTodo.importHistory';
const MAX_HISTORY = 10;

// Full 112-column header matching futureshop ccGoods CSV export exactly
const CCGOODS_HEADERS: readonly string[] = [
  'コントロールカラム', '商品URLコード', 'ステータス', '商品番号', '商品名',
  'メイングループ', '優先度', '本体価格', '定価', '消費税',
  '販売期間(From)', '販売期間(to)', '販売期間表示', 'クール便指定',
  '送料', '送料パターン', '送料パターン表示', '送料個別金額', '個別送料表示',
  'オススメ商品商品ページ内表示', 'オススメ商品リスト', 'オススメ商品表示方法',
  '商品価格上部コメントHTMLタグ', '商品価格上部コメント',
  '定価価格前文字', '定価価格後文字', '販売価格前文字', '取消線', '定価表示方法',
  '在庫管理', '在庫数表示設定', '在庫数表示設定方法', '在庫僅少表示閾値',
  '在庫なし表示テキスト', '在庫なし表示テキスト表示方法',
  '現在在庫数', '調整在庫数', '在庫数切れメール閾値',
  'バリエーション横軸名', 'バリエーション縦軸名',
  '会員価格設定', '会員価格', 'アクセス制限', 'ポイント付与率設定', 'ポイント付与率',
  'ステータス（他社サービス）', 'サンプル商品設定', 'サンプル商品同梱設定',
  '最大購入制限個数', '入荷お知らせメールボタン表示',
  'JANコード', 'キャッチコピー',
  'レコメンド２：行動履歴収集タグ出力フラグ', 'レコメンド２：レコメンド商品出力フラグ',
  'レコメンド２：レコメンド表示フラグ', 'レコメンド２：レコメンド使用タグ優先設定',
  'レコメンド２：商品ページ上部コメントの上', 'レコメンド２：商品ページ上部コメントの下',
  'レコメンド２：商品ページ下部コメントの上', 'レコメンド２：商品ページ下部コメントの下',
  'レコメンド２：商品ページおすすめ商品の上', 'レコメンド２：商品ページおすすめ商品の下',
  'お気に入り登録数', 'メール便指定', 'メール便同梱数', 'バンドル販売',
  '外部連携任意項目', 'おすすめ商品表示パターン設定',
  'おすすめ商品表示パターン(コマースクリエイター)',
  '外部連携商品名', '外部連携商品説明', 'レイアウト割当名',
  'ページ名(コマースクリエイター)', 'ページ名表示方法(コマースクリエイター)',
  'キーワード(コマースクリエイター)', 'キーワード表示方法(コマースクリエイター)',
  'Description(コマースクリエイター)', 'Description表示方法(コマースクリエイター)',
  '商品一言説明(コマースクリエイター)',
  '商品説明（大）', '商品説明（小）',
  '独自コメント（1）', '独自コメント（2）', '独自コメント（3）', '独自コメント（4）',
  '独自コメント（5）', '独自コメント（6）', '独自コメント（7）', '独自コメント（8）',
  '独自コメント（9）', '独自コメント（10）', '独自コメント（11）', '独自コメント（12）',
  '独自コメント（13）', '独自コメント（14）', '独自コメント（15）', '独自コメント（16）',
  '独自コメント（17）', '独自コメント（18）', '独自コメント（19）', '独自コメント（20）',
  'レコメンド２：レコメンド表示フラグ(コマースクリエイター)',
  'レコメンド２：レコメンド使用タグ優先設定(コマースクリエイター)',
  'レコメンド２：出力タグ１', 'レコメンド２：出力タグ２', 'レコメンド２：出力タグ３',
  'レコメンド２：出力タグ４', 'レコメンド２：出力タグ５', 'レコメンド２：出力タグ６',
  '商品URL', '登録日時', '最終更新日時',
]; // 112 columns

// Full 13-column header matching futureshop goodsVariationDetail CSV export exactly
const VARIATION_HEADERS: readonly string[] = [
  '商品URLコード',
  'バリエーション別選択肢（横軸）', 'バリエーション別枝番（横軸）',
  'バリエーション別選択肢（縦軸）', 'バリエーション別枝番（縦軸）',
  '代表バリエーション', '在庫閾値', '在庫切れメール閾値',
  '商品番号', '商品管理番号', '商品名', 'JANコード', '最終更新日付',
]; // 13 columns

// ── Parse utilities ───────────────────────────────────────────────────────────

function detectHeaderRow(raw: string[][]): number {
  // Find the first row (within first 10) where 5+ consecutive cells are non-empty
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    let consec = 0;
    let maxConsec = 0;
    for (const c of raw[i]) {
      if (String(c).trim()) { consec++; maxConsec = Math.max(maxConsec, consec); }
      else consec = 0;
    }
    if (maxConsec >= 5) return i;
  }
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    if (raw[i].some((c) => String(c).trim())) return i;
  }
  return 0;
}

function deduplicateHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((h) => {
    const key = String(h).trim();
    if (!key) return '';
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}_${n}`;
  });
}

function classifySheetKind(sheetName: string, headers: string[]): SheetKind {
  const skuKw = ['商品管理番号', '商品id', '品番', 'sku', 'jan'];
  if (skuKw.some((k) => headers.some((h) => h.toLowerCase().includes(k.toLowerCase())))) {
    return 'sku';
  }
  const mdNameKw = ['md', 'スケジュール', '納品計画', '予算計画'];
  const mdHeaderKw = ['予算', '実績', '達成率', '計画数'];
  const isMd =
    mdNameKw.some((k) => sheetName.toLowerCase().includes(k)) ||
    mdHeaderKw.some((k) => headers.some((h) => h.includes(k)));
  return isMd ? 'md' : 'unknown';
}

// ── Column detection ──────────────────────────────────────────────────────────

function detectCol(headers: string[], exact: string[], partial: string[]): string {
  // Exact keywords are checked in PRIORITY ORDER: first keyword that exists in headers wins.
  // (Do NOT use headers.find() here — that returns the first *header* matching any keyword,
  //  which ignores the intended priority of the keywords list.)
  for (const k of exact) {
    if (headers.includes(k)) return k;
  }
  return headers.find((h) => partial.some((k) => h.toLowerCase().includes(k.toLowerCase()))) ?? '';
}

function autoDetect(headers: string[]): ColMap {
  return {
    productNo:    detectCol(headers, ['品番', '商品番号'], []),
    skuNo:        detectCol(headers, ['商品管理番号', '倉庫コード'], ['商品id', '管理番号', 'sku番号']),
    urlCode:      detectCol(headers, [], ['urlコード', '商品url']),
    productName:  detectCol(headers, ['商品名'], ['品名']),
    // 税込 takes priority over 単価; futureshop requires tax-inclusive price
    price:        detectCol(headers, ['税込', '税込価格', '単価', '本体価格'], ['販売価格']),
    janCode:      detectCol(headers, ['JAN'], ['jan', 'ean', 'バーコード']),
    // カラー名 = display name only (e.g. "OFF WHITE"), not "02_OFF WHITE"
    colorDisplay: detectCol(headers, ['カラー名'], ['カラー表記']),
    colorCode:    detectCol(headers, ['カラー_2'], []),
    sizeName:     detectCol(headers, ['サイズ'], []),
    sizeCode:     detectCol(headers, ['サイズ_2'], []),
  };
}

// ── Row classification ────────────────────────────────────────────────────────

function classifyRows(
  rows: Record<string, string>[],
  colMap: ColMap,
  skuMap: Map<string, Record<string, string>>,
): ReviewRow[] {
  return rows.map((row, idx) => {
    const productNo = (row[colMap.productNo] ?? '').trim();
    const skuNo     = (row[colMap.skuNo]     ?? '').trim();
    const urlCode   = (row[colMap.urlCode]   ?? '').trim();

    if (!productNo && !skuNo) {
      return { idx, productNo, skuNo, urlCode, rawData: row, status: 'duplicate', diffKeys: [], selected: false };
    }
    const existing = skuNo ? skuMap.get(skuNo) : undefined;
    if (!existing) {
      return { idx, productNo, skuNo, urlCode, rawData: row, status: 'new', diffKeys: [], selected: true };
    }
    const diffKeys = Object.keys(row).filter((k) => (row[k] ?? '') !== (existing[k] ?? ''));
    const status: ImportRowStatus = diffKeys.length > 0 ? 'has_diff' : 'duplicate';
    return { idx, productNo, skuNo, urlCode, rawData: row, status, diffKeys, selected: status === 'has_diff' };
  });
}

// ── CSV utilities ─────────────────────────────────────────────────────────────

function csvEscape(v: string): string {
  if (!v) return '';
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toCsvRow(vals: string[]): string {
  return vals.map(csvEscape).join(',');
}

function downloadCsv(filename: string, content: string): void {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// futureshop の category.csv は Shift_JIS 指定のため専用関数で出力
function downloadShiftJisCsv(filename: string, content: string): void {
  const sjisArray = Encoding.convert(Encoding.stringToCode(content), {
    to: 'SJIS', from: 'UNICODE',
  });
  const blob = new Blob([new Uint8Array(sjisArray)], { type: 'text/csv;charset=shift_jis' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rv(raw: Record<string, string>, key: string): string {
  return key ? (raw[key] ?? '') : '';
}

// Build a header→index lookup for header-name-based field assignment (resistant to column order changes)
function buildHeaderIdx(headers: readonly string[]): Map<string, number> {
  return new Map(headers.map((h, i) => [h, i]));
}

// Material compositions extracted from 2026_3_swatch.pdf (18 pages, image-based PDF).
// Keys are 7-digit 品番. Entries can be overridden via the material xlsx upload slot.
const SWATCH_MATERIAL_DEFAULT: Record<string, string> = {
  '1263301': 'C/100%',
  '1263401': 'C/100%',
  '1263303': 'C/90% PE/10%',
  '1263304': 'C/100%',
  '1263503': 'PE/100%',
  '1263201': 'C/100% <別地>PE/100%',
  '1263305': 'C/80% PE/20% <別地>C/75% PE/25%',
  '1263402': 'PE/100%',
  '1263403': 'PE/75% NY/25%',
  '1263504': 'PE/100%',
  '1263601': 'NY/90% PU/10% <別地>PE/95% PU/5%',
  '1263602': 'C/60% PE/34% PU/6% <別地>NY/90% PU/10%',
  '1263603': 'NY/85% PU/15%',
  '1263620': 'C/85% PU/15%',
  '1263621': 'PE/100% <別地>NY/92% PU/8%',
  '1263605': 'C/95% PU/5%',
  '1263606': 'PE/65% C/35%',
  '1263701': 'PE/65% C/35%',
  '1263608': 'PE/95% PU/5%',
  '1263609': 'C/100% <別地>PE/82% C/18%',
  '1263707': 'PE/100% <別地>C/95% PU/5%',
  '1263702': 'NY/90% PU/10%',
  '1263622': 'C/100%',
  '1263613': 'NY/92% PU/8% <別地>C/60% NY/30% PU/10%',
  '1263611': 'C/95% PU/5%',
  '1263703': 'PE/92% PU/8% <別地>AC/85% PU/15%',
  '1263614': 'PE/100% <別地>PE/95% PU/5%',
  '1263615': 'C/100%',
  '1263704': 'C/100% <別地>PE/100%',
  '1263618': 'C/100%',
  '1263604': 'PE/100%',
  '1263705': 'C/85% PU/15%',
  '1263901': 'NY/68% PE/31% PU/1%',
  '1263902': 'PE/50% NY/50%',
  '1263904': 'NY/97% PE/2% PU/1%',
  '1263905': 'C/56% AC/24% NY/17% PU/3%',
  '1263906': 'C/56% AC/24% NY/17% PU/3%',
  '1263907': 'NY/98% PE/1% PU/1%',
  '1263960': 'PE/100%',
  '1263961': 'PE/75% PU/25%',
  // Big Tee (pages 10-17) — all C/100%
  '1264601': 'C/100%', '1264602': 'C/100%', '1264603': 'C/100%',
  '1264604': 'C/100%', '1264605': 'C/100%', '1264606': 'C/100%',
  '1264607': 'C/100%', '1264608': 'C/100%', '1264609': 'C/100%',
  '1264611': 'C/100%', '1264613': 'C/100%', '1264615': 'C/100%',
  '1264616': 'C/100%', '1264617': 'C/100%', '1264622': 'C/100%',
  '1264623': 'C/100%', '1264619': 'C/100%', '1264627': 'C/100%',
  '1264629': 'C/100%', '1264630': 'C/100%', '1264632': 'C/100%',
  '1264610': 'C/100%', '1264612': 'C/100%', '1264614': 'C/100%',
  '1264618': 'C/100%', '1264620': 'C/100%', '1264621': 'C/100%',
  '1264624': 'C/100%', '1264628': 'C/100%', '1264625': 'C/100%',
  '1264626': 'C/100%', '1264631': 'C/100%', '1264633': 'C/100%',
  // Sanrio collab (page 18)
  '1251008': 'C/100%',
  '1251009': 'C/100%',
  // Additions: products missing from initial map
  '1263501': '再生繊維（リヨセル）63% / ポリエステル19% / ナイロン18% / <別地>ナイロン100%',
  '1263607': 'ポリエステルサテン / ヒョウ柄ジャージ / <別地>シアーチュール',
  '1263931': 'コットンレース',
  '1263930': 'レース',
  '1263940': 'ナイロンツイル / <別地>メッシュ',
  '1263941': 'ナイロンタフタ',
  '1263944': 'ナイロンタフタ / <別地>メッシュ',
  '1263950': '合成皮革・メッシュ',
  '1263970': 'ポリエステルタフタ',
  // ちびまる子コラボ
  '1263001': 'C/100%',
  '1263002': 'C/100%',
  '1263003': 'C/100%',
  '1263004': 'C/100%',
  '1263005': 'AC/56% AC/24% NY/17% PU/3%',
  '1263006': 'AC/56% AC/24% NY/17% PU/3%',
  '1263007': 'メッシュ',
  '1263008': 'キャンバス',
  '1263009': '磁器',
  '1263010': '磁器',
  // 6月展 1266シリーズ
  '1266302': 'C/80% PE/20%',
  '1266501': 'PE/100% <別地>NY/85% PU/15%',
  '1266303': 'C/100%',
  '1266301': 'C/100%',
  '1266101': 'PE/55% C/45%',
  '1266304': 'C/80% PE/18% PU/2%',
  '1266201': 'C/50% PE/50% <別地>C/75% PE/25%',
  '1266307': 'リネン70% / レーヨン27% / ポリウレタン3% / <別地>ポリエステル97% / ポリウレタン3%',
  '1266102': 'PU/55% RA/45%',
  '1266306': 'PE/87% C/10% PU/3% <別地>PE/45% C/55%',
  '1266402': 'PE/87% RA/8% PU/5% <別地>NY/100% <別地>PE/73% RA/22% PU/5%',
  '1266103': 'PE/100% <別地>PE/100%',
  '1266305': 'C/100% <別地>C/80% PU/20%',
  '1266503': 'PE/100%',
  '1266104': 'C/100% <別地>NY/100%',
  '1266602': 'NY/90% PU/10%',
  '1266603': 'NY/95% PU/5%',
  '1266604': 'NY/90% PU/10% <別地>PE/100%',
  '1266605': 'PE/100% <別地>NY/90% PU/10%',
  '1266701': 'C/100%',
  '1266606': 'C/73% PE/27%',
  '1266614': 'C/85% PE/15%',
  '1266607': 'C/100%',
  '1266608': 'C/100%',
  '1266601': 'PE/90% PU/10%',
  '1266609': 'C/72% PE/28%',
  '1266615': 'C/100%',
  '1266706': 'C/100%',
  '1266612': 'C/72% PE/28%',
  '1266613': 'C/100%',
  '1266705': 'C/100%',
  '1266807': 'PE/100%',
  '1266801': 'RA/75% PE/25%',
  '1266802': 'C/100%',
  '1266804': 'C/100%',
  '1266806': 'AC/70% NY/20% W/10%',
  '1266808': 'AC/68% PE/28% PU/4%',
  '1266811': 'C/45% PE/30% AC/25%',
  '1266813': 'C/100%',
  '1266814': 'AC/70% W/30%',
  '1266810': 'AC/85% W/15%',
  '1266901': 'NY/97% PE/2% PU/1%',
  '1266904': 'NY/98% PE/1% PU/1%',
  '1266903': 'C/56% AC/24% NY/17% PU/3%',
  '1266907': 'C/56% AC/24% NY/17% PU/3%',
  '1266902': 'C/56% AC/24% NY/17% PU/3%',
  '1266905': 'C/56% AC/24% NY/17% PU/3%',
  '1266906': 'NY/49% AC/40% W/10% PU/1%',
  '1266930': 'コットンレース',
  '1266931': 'C/60% AC/40%',
  '1266933': 'PE/100%',
  '1266932': 'PE/100%',
  '1266941': 'エステルツイル / ナイロンリップストップ / メッシュ',
  '1266940': '合成皮革',
  '1266942': '合成皮革',
  '1266950': '合成皮革 / メッシュ',
  '1266960': 'フェイクファー',
  '1266970': '合成皮革',
  '1266971': '真鍮',
};

const MATERIAL_CODE_MAP: Record<string, string> = {
  C: 'コットン', PE: 'ポリエステル', PU: 'ポリウレタン',
  NY: 'ナイロン', AC: 'アクリル', RA: 'レーヨン', W: 'ウール',
};

// ノベルティ品番はfutureshop商品登録対象外のためCSV出力・補完チェックから除外
// 今後ノベルティが増えた場合はここに追加する
const EXCLUDED_PRODUCT_NOS = new Set([
  '1260001', // CAN MIRROR ノベルティ
]);

function isExcludedProductNo(productNo: string): boolean {
  return EXCLUDED_PRODUCT_NOS.has(productNo);
}

// ── Group inference ───────────────────────────────────────────────────────────

// キーワードを「単語境界」で照合する（例: CAP が CAPSULE にマッチしない）
function nameIncludes(productName: string, keyword: string): boolean {
  const escaped = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(productName);
}

// 【〇〇】形式のコラボ名を抽出（先頭のみ）
function extractCollabName(productName: string): string | null {
  const m = productName.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

type GroupRule = { keywords: string[]; group: string };

// メイングループ判定ルール（先勝ち）
const MAIN_GROUP_RULES: GroupRule[] = [
  { keywords: ['JUMPER SKIRT', 'ONE PIECE', 'ONE-PIECE', 'DRESS', 'BABYDOLL', 'BABY DOLL'], group: 'ONE PIECE' },
  { keywords: ['TOPS', 'L/S TEE', 'S/S TEE', 'LONG SLEEVE TEE', 'SHORT SLEEVE TEE', 'T-SHIRT', 'TEE', 'CUTSEW', 'KNIT', 'CARDIGAN', 'SWEAT', 'HOODIE', 'BOLERO', 'BUSTIER', 'BRA'], group: 'TOPS' },
  { keywords: ['BLOUSE', 'BLOUSES', 'SHIRT'], group: 'SHIRTS-BLOUSE' },
  { keywords: ['SKIRT'], group: 'SKIRT' },
  { keywords: ['SHORT PANTS', 'SALOPETTE', 'DENIM', 'PANTS', 'DRAWERS'], group: 'PANTS' },
  { keywords: ['OUTER', 'BLOUSON', 'COAT', 'JACKET', 'MA-1'], group: 'JACKET-OUTER' },
  { keywords: ['HEAD DRESS', 'HAT', 'CAP', 'BONNET'], group: 'HAT' },
  { keywords: ['SNEAKERS', 'SANDALS', 'SHOES'], group: 'SHOES' },
  { keywords: ['SOCKS'], group: 'SOCKS' },
  { keywords: ['POUCH', 'BAG', 'ACCESSORIES', 'CHARM', 'KEY RING', 'UMBRELLA', 'NECK WARMER', 'SWIM WEAR', 'SWIMSUIT', 'RASH GUARD', 'RUSH GUARD', 'HARNESS', 'BELT', 'MUFFLER', 'CARDCASE', 'BADGE'], group: 'GOODS' },
];

// category.csv サブグループ判定ルール（先勝ち）
// FS_カテゴリー.xlsx の対応表に存在するサブグループのみ列挙（先勝ち）
// SKIRT / BAG / HAT / SHOES / SOCKS はサブグループなし → ルールに含めない
const SUB_GROUP_RULES: GroupRule[] = [
  { keywords: ['L/S TEE', 'LONG SLEEVE TEE', 'LONG SLEEVE'], group: 'TOPS/T-SHIRT/LONG SLEEVE' },
  { keywords: ['S/S TEE', 'SHORT SLEEVE TEE', 'TEE'], group: 'TOPS/T-SHIRT/SHORT SLEEVE' },
  { keywords: ['T-SHIRT'], group: 'TOPS/T-SHIRT' },
  { keywords: ['CUTSEW'], group: 'TOPS/CUTSEW' },
  { keywords: ['KNIT'], group: 'TOPS/KNIT' },
  { keywords: ['CARDIGAN'], group: 'TOPS/CARDIGAN' },
  { keywords: ['SWEAT', 'HOODIE'], group: 'TOPS/SWEAT' },
  { keywords: ['BOLERO', 'BUSTIER', 'BRA'], group: 'TOPS/OTHER' },
  { keywords: ['TOPS'], group: 'TOPS/CUTSEW' },
  { keywords: ['BLOUSE', 'BLOUSES'], group: 'SHIRTS-BLOUSE/BLOUSES' },
  { keywords: ['SHIRT'], group: 'SHIRTS-BLOUSE/SHIRT' },
  { keywords: ['JUMPER SKIRT'], group: 'ONE PIECE/JAMPER SKIRT' },
  { keywords: ['ONE PIECE', 'ONE-PIECE', 'DRESS', 'BABYDOLL', 'BABY DOLL'], group: 'ONE PIECE/ONE PIECE' },
  { keywords: ['DENIM'], group: 'PANTS/DENIM' },
  { keywords: ['SHORT PANTS'], group: 'PANTS/SHORT PANTS' },
  { keywords: ['SALOPETTE'], group: 'PANTS/SALOPETTE' },
  { keywords: ['DRAWERS', 'PANTS'], group: 'PANTS/PANTS' },
  { keywords: ['OUTER', 'COAT', 'BLOUSON', 'MA-1'], group: 'JACKET-OUTER/OUTER' },
  { keywords: ['JACKET'], group: 'JACKET-OUTER/JACKET' },
  { keywords: ['ACCESSORIES', 'CHARM', 'KEY RING', 'HARNESS', 'BELT', 'BADGE', 'CARDCASE'], group: 'GOODS/ACCESSORIES' },
  { keywords: ['UMBRELLA'], group: 'GOODS/UMBRELLA' },
  { keywords: ['NECK WARMER', 'MUFFLER'], group: 'GOODS/NECK WARMER' },
  { keywords: ['SWIM WEAR', 'SWIMSUIT', 'RASH GUARD', 'RUSH GUARD'], group: 'GOODS/SWIM WEAR' },
];

function matchFirstRule(name: string, rules: GroupRule[]): string {
  for (const { keywords, group } of rules) {
    if (keywords.some((kw) => nameIncludes(name, kw))) return group;
  }
  return '';
}

// コラボ英字名 → category.csv 表示用日本語名のマッピング
const COLLAB_GROUP_NAME_MAP: Record<string, string> = {
  'CHARMMYKITTY': 'チャーミーキティ',
  'KEROKEROKEROPPI': 'はぴだんぶい',
};

// 品番別カテゴリー上書きマップ（商品名推定より最優先）
const PRODUCT_CATEGORY_OVERRIDES: Record<string, {
  mainGroup: string;
  subGroups: string[];
}> = {
  '1263704': { mainGroup: 'PANTS',     subGroups: ['PANTS/PANTS'] },
  '1263931': { mainGroup: 'HAT',       subGroups: [] },
  '1263941': { mainGroup: 'TOPS',      subGroups: ['TOPS/OTHER'] },
  '1263503': { mainGroup: 'ONE PIECE', subGroups: ['ONE PIECE/JAMPER SKIRT'] },
  // 1266101: "SHIRT BLOUSON" → SHIRTキーワードが先勝ちするため上書き
  '1266101': { mainGroup: 'JACKET-OUTER', subGroups: ['JACKET-OUTER/OUTER'] },
  // 1266104: "DENIM JACKET" → DENIMキーワードがJACKETより先勝ちするため上書き
  '1266104': { mainGroup: 'JACKET-OUTER', subGroups: ['JACKET-OUTER/JACKET'] },
  // 1266931: "KNIT FLIGHT CAP" → KNITキーワードがCAPより先勝ちするため上書き
  '1266931': { mainGroup: 'HAT', subGroups: [] },
  // 1266304: "SKIRT PANTS" → SKIRTが先勝ちするが導線はPANTSが適切
  '1266304': { mainGroup: 'PANTS', subGroups: ['PANTS/PANTS'] },
};

// ccGoods F列「メイングループ」を推定する。品番上書き → コラボ → 商品名推定の順。
function inferMainGroup(productName: string, productNo?: string): string {
  if (productNo && PRODUCT_CATEGORY_OVERRIDES[productNo]) {
    return PRODUCT_CATEGORY_OVERRIDES[productNo].mainGroup;
  }
  if (extractCollabName(productName)) return 'COLLABORATION';
  return matchFirstRule(productName, MAIN_GROUP_RULES);
}

// category.csv の表示先グループ（サブカテゴリ）一覧を返す。
// 品番上書き → コラボ COLLABORATION/日本語名 ＋ 通常サブカテゴリの順。
function inferSubGroups(productName: string, productNo?: string): string[] {
  if (productNo && PRODUCT_CATEGORY_OVERRIDES[productNo]) {
    return [...PRODUCT_CATEGORY_OVERRIDES[productNo].subGroups];
  }

  const collabName = extractCollabName(productName);
  const nameForMatching = collabName
    ? productName.replace(/^【.+?】\s*/, '')
    : productName;

  const result: string[] = [];
  if (collabName) {
    const displayName = COLLAB_GROUP_NAME_MAP[collabName] ?? collabName;
    result.push(`COLLABORATION/${displayName}`);
  }

  const sub = matchFirstRule(nameForMatching, SUB_GROUP_RULES);
  if (sub) result.push(sub);

  return result;
}

// Fixed values to inject into every ccGoods row, keyed by exact futureshop header name
const CCGOODS_FIXED: Record<string, string> = {
  'ステータス':                     '1',
  '消費税':                         '1',
  '販売期間表示':                   '1',
  '在庫管理':                       '1',
  '在庫なし表示テキスト':           'SOLD OUT',
  '在庫なし表示テキスト表示方法':   '0',
  '在庫数切れメール閾値':           '0',
};

// ── Supplement file parsers ───────────────────────────────────────────────────

async function parseCaptionFile(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const map = new Map<string, string>();
  const sevenDigit = /^\d{7}$/;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as string[][];
    for (const row of raw) {
      const c0 = String(row[0] ?? '').trim();
      const c1 = String(row[1] ?? '').trim();
      const c2 = String(row[2] ?? '').trim();
      if (sevenDigit.test(c0) && c1) {
        map.set(c0, c1);
      } else if (sevenDigit.test(c1) && c2) {
        map.set(c1, c2);
      }
    }
  }
  return map;
}

function isPartsRow(row: string[], measureCount: number): boolean {
  if (String(row[0] ?? '').trim() || String(row[1] ?? '').trim()) return false;
  const vals = Array.from({ length: measureCount }, (_, i) => String(row[i + 2] ?? '').trim());
  const nonEmpty = vals.filter((v) => v);
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => /[\u3040-\u30FF\u4E00-\u9FFF]/.test(v) && !/\d/.test(v));
}

async function parseSpecFile(buffer: ArrayBuffer): Promise<Map<string, SpecData>> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const map = new Map<string, SpecData>();
  const sevenDigit = /^\d{7}$/;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as string[][];
    let currentProduct: string | null = null;
    let measureNames: string[] = [];
    let partNames: string[] = [];
    let sizeRows: { label: string; values: string[] }[] = [];

    const flush = () => {
      if (!currentProduct || measureNames.length === 0 || sizeRows.length === 0) return;
      const combinedNames = measureNames.map((m, i) => {
        const p = partNames[i] ?? '';
        return p ? `${p} ${m}` : m;
      });
      // Shoe size pattern: first column named 'サイズ' with non-numeric values → promote to labels
      const sizeColIdx = combinedNames.indexOf('サイズ');
      let finalNames = combinedNames;
      let finalRows = sizeRows;
      if (sizeColIdx >= 0) {
        const allNonNumeric = sizeRows.every((r) => {
          const v = (r.values[sizeColIdx] ?? '').trim();
          return !v || isNaN(Number(v));
        });
        if (allNonNumeric) {
          finalNames = combinedNames.filter((_, i) => i !== sizeColIdx);
          finalRows = sizeRows.map((r) => ({
            label: (r.values[sizeColIdx] ?? '').trim() || r.label,
            values: r.values.filter((_, i) => i !== sizeColIdx),
          }));
        }
      }
      // Remove empty-header, management-memo header columns, and columns whose
      // values contain management memo text (e.g. OP column with "※小物は…")
      const MEMO_PATTERN = /※|記入|塗りつぶし|漏れ|背景|小物|必要に応じた|表示してください/;
      const validColIdx = finalNames
        .map((_, i) => i)
        .filter((i) => {
          const n = (finalNames[i] ?? '').trim();
          if (!n) return false;
          if (MEMO_PATTERN.test(n)) return false;
          // Also drop columns whose values contain management memo text
          if (finalRows.some((r) => MEMO_PATTERN.test(r.values[i] ?? ''))) return false;
          return true;
        });
      if (validColIdx.length < finalNames.length) {
        finalNames = validColIdx.map((i) => finalNames[i]);
        finalRows = finalRows.map((r) => ({
          label: r.label,
          values: validColIdx.map((i) => r.values[i] ?? ''),
        }));
      }

      if (finalNames.length > 0 && finalRows.length > 0)
        map.set(currentProduct, { measureNames: finalNames, sizeRows: finalRows });
    };

    for (const row of raw) {
      const c0 = String(row[0] ?? '').trim();
      if (sevenDigit.test(c0)) {
        flush();
        currentProduct = c0;
        measureNames = [];
        partNames = [];
        sizeRows = [];
        for (let i = 2; i < row.length; i++) measureNames.push(String(row[i] ?? '').trim());
        while (measureNames.length > 0 && !measureNames[measureNames.length - 1]) measureNames.pop();
        partNames = new Array(measureNames.length).fill('');
      } else if (currentProduct && !c0 && measureNames.length > 0) {
        if (isPartsRow(row, measureNames.length)) {
          let lastPart = '';
          for (let i = 0; i < measureNames.length; i++) {
            const v = String(row[i + 2] ?? '').trim();
            if (v) lastPart = v;
            if (lastPart) partNames[i] = lastPart;
          }
        } else {
          const label = String(row[1] ?? '').trim();
          const values = measureNames.map((_, i) => String(row[i + 2] ?? '').trim());
          if (values.some((v) => v)) {
            // Skip rows where all non-empty values have no digits — these are
            // measure-name rows repeated as data (e.g. "着丈 / 肩幅 / 身幅")
            const allTextNoDigit = values.filter((v) => v).every((v) => !/\d/.test(v));
            if (!allTextNoDigit) sizeRows.push({ label, values });
          }
        }
      }
    }
    flush();
  }
  return map;
}

async function parseMaterialXlsx(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  // Start from hardcoded defaults; xlsx entries override individual products
  const map = new Map<string, string>(Object.entries(SWATCH_MATERIAL_DEFAULT));
  const sevenDigit = /^\d{7}$/;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as string[][];
    for (const row of raw) {
      const c0 = String(row[0] ?? '').trim();
      const c1 = String(row[1] ?? '').trim();
      if (sevenDigit.test(c0) && c1) map.set(c0, c1);
    }
  }
  return map;
}

// Convert various date representations to YYYYMMDD12:00 (futureshop 販売期間(From) format)
function formatSaleStartDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  // Excel date serial (numeric)
  if (typeof value === 'number' && value > 0) {
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${mo}${dd}${RELEASE_TIME_SUFFIX}`;
  }

  const s = String(value).trim();
  if (!s) return '';

  // YYYY/M/D or YYYY/MM/DD
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}${RELEASE_TIME_SUFFIX}`;
  }

  // M/D or M月D日 (year-less → DEFAULT_RELEASE_YEAR)
  m = s.match(/^(\d{1,2})[\/月](\d{1,2})日?$/);
  if (m) {
    return `${DEFAULT_RELEASE_YEAR}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}${RELEASE_TIME_SUFFIX}`;
  }

  // YYYY年M月D日
  m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m) {
    return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}${RELEASE_TIME_SUFFIX}`;
  }

  return '';
}

// Parse MD xlsx to extract Map<productNo(7-digit), saleStartDate(YYYYMMDD12:00)>
// Scans all sheets; identifies the STORE 発売日 column by header keywords.
// Normalize "5/2週～" or "3/6週～4/1週" → "5/2週"

// Parse MD xlsx → ReleaseDateParseResult
// Builds weekDateMap (week-label → date) and productDateMap (productNo → date, when MD has 7-digit nos).
// If MD has no product numbers (hasProductNos=false), auto-fill should be suppressed.
async function parseReleaseDateFile(buffer: ArrayBuffer): Promise<ReleaseDateParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });

  const productDateMap = new Map<string, string>();
  const weekDateMap = new Map<string, string>();
  const detectedProductNos: string[] = [];
  const detectedWeekLabels: string[] = [];
  const sevenDigit = /^\d{7}$/;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][];
    if (raw.length < 2) continue;

    // Phase 1: Build weekDateMap from week-block structure
    //   col0: "5/2週"           col1: "発売日"
    //   col0: "(5/4～5/10)"     col1: "SHOP:5/8(金)"
    //   col0: ""                 col1: "STORE:5/6(水)"   ← target
    //   col0: "8/6週～9/1週"   col1: "発売日"            ← combined range: register all weeks
    let currentWeekLabels: string[] = [];
    for (const rawRow of raw) {
      const col0 = String(rawRow[0] ?? '').trim();
      const col1 = String(rawRow[1] ?? '').trim();
      if (/\d+\/\d+週/.test(col0)) {
        const allWeeks = col0.match(/\d+\/\d+週/g) ?? [];
        currentWeekLabels = allWeeks;
        for (const wl of allWeeks) {
          if (!detectedWeekLabels.includes(wl)) detectedWeekLabels.push(wl);
        }
      }
      if (currentWeekLabels.length > 0 && /^STORE:/i.test(col1)) {
        const dateRaw = col1.replace(/^STORE:/i, '').replace(/\(.+?\)/, '').trim();
        const formatted = formatSaleStartDate(dateRaw);
        if (formatted) {
          for (const wl of currentWeekLabels) {
            if (!weekDateMap.has(wl)) weekDateMap.set(wl, formatted);
          }
        }
        currentWeekLabels = [];
      }
    }

    // Phase 2: Scan for 7-digit product numbers (for MD tables that include them)
    // For each 7-digit cell, try to find a STORE date in the same row's columns
    for (const rawRow of raw) {
      const row = rawRow as unknown[];
      let productNo: string | null = null;
      let productNoColIdx = -1;
      for (let ci = 0; ci < row.length; ci++) {
        const s = String(row[ci] ?? '').trim();
        if (sevenDigit.test(s)) { productNo = s; productNoColIdx = ci; break; }
      }
      if (!productNo || productDateMap.has(productNo)) continue;
      if (!detectedProductNos.includes(productNo)) detectedProductNos.push(productNo);
      // Look for STORE: value in remaining columns of same row
      for (let ci = productNoColIdx + 1; ci < row.length; ci++) {
        const cell = String(row[ci] ?? '').trim();
        if (/^STORE:/i.test(cell)) {
          const dateRaw = cell.replace(/^STORE:/i, '').replace(/\(.+?\)/, '').trim();
          const formatted = formatSaleStartDate(dateRaw);
          if (formatted) productDateMap.set(productNo, formatted);
          break;
        }
      }
    }
  }

  return {
    productDateMap,
    weekDateMap,
    hasProductNos: productDateMap.size > 0,
    sheetNames: wb.SheetNames,
    detectedProductNos,
    detectedWeekLabels,
  };
}

function formatMaterialText(material: string): string {
  if (!material.trim()) return '';

  // Normalize typos and full-width 別地 brackets
  const normalized = material
    .replace(/ポリステル/g, 'ポリエステル')
    .replace(/＜別地＞/g, '<別地>');

  // Japanese-format strings: split on " / " separators, join with <br>
  // Strip <別地> before checking — it contains the kanji '別' and would
  // otherwise cause code-based materials (PE/100% <別地>NY/...) to enter this path.
  if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(normalized.replace(/<別地>/g, ''))) {
    const out = normalized
      .trim()
      .split(/\s*\/\s*/)
      .filter(Boolean)
      .join('<br>');
    return out.replace(/<別地>/g, '＜別地＞');
  }

  // Code-based format (C/100%, PE/100%, etc.)
  const parseSection = (s: string): string => {
    const trimmed = s.trim();
    if (!trimmed) return '';
    const parts: string[] = [];
    const re = /([A-Z]+)\s*\/?\ ?\s*(\d+(?:\.\d+)?)\s*%?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      const ja = MATERIAL_CODE_MAP[m[1]] ?? m[1];
      parts.push(`${ja}${m[2]}%`);
    }
    return parts.length > 0 ? parts.join('<br>') : trimmed;
  };

  const [main, ...betchi] = normalized.split('<別地>');
  const result = [parseSection(main)];
  for (const part of betchi) {
    const parsed = parseSection(part);
    if (parsed) result.push(`＜別地＞${parsed}`);
  }
  return result.filter(Boolean).join('<br>');
}

function formatSpecHtml(spec: SpecData | undefined, material: string): string {
  const formattedMaterial = formatMaterialText(material);

  if (!spec || spec.sizeRows.length === 0) {
    if (!formattedMaterial) return '';
    return (
      '<details class="accordion-001">\n' +
      '  <summary>サイズ・素材</summary>\n\n' +
      `<p><font style="font-weight:bold; ">素材</font><br>${formattedMaterial}<br></p>\n` +
      '</details>'
    );
  }

  // Remove columns where every size row has an empty value
  const activeCols = spec.measureNames
    .map((_, i) => i)
    .filter((i) => spec.sizeRows.some((row) => (row.values[i] ?? '').trim()));

  if (activeCols.length === 0) {
    if (!formattedMaterial) return '';
    return (
      '<details class="accordion-001">\n' +
      '  <summary>サイズ・素材</summary>\n\n' +
      `<p><font style="font-weight:bold; ">素材</font><br>${formattedMaterial}<br></p>\n` +
      '</details>'
    );
  }

  const activeNames = activeCols.map((i) => spec.measureNames[i]);
  const matHtml = formattedMaterial
    ? `<p><font style="font-weight:bold; ">素材</font><br>${formattedMaterial}<br></p>\n`
    : '';

  const headerCells = activeNames.map((n) => `<th>${n}</th>`).join('');
  const bodyRows = spec.sizeRows
    .map((r) => {
      const cells = activeCols.map((i) => `<td>${r.values[i] ?? ''}</td>`).join('');
      return `    <tr><th>${r.label}</th>${cells}</tr>`;
    })
    .join('\n');

  return (
    '<details class="accordion-001">\n' +
    '  <summary>サイズ・素材</summary>\n\n' +
    matHtml +
    '  <table class="table_size">\n' +
    `    <thead><tr><th>サイズ</th>${headerCells}</tr>\n    </thead>\n` +
    '    <tbody>\n' +
    bodyRows + '\n' +
    '    </tbody>\n' +
    '  </table>\n' +
    '</details>'
  );
}

function formatCaptionHtml(text: string): string {
  if (!text.trim()) return '';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/⚫︎/g, '●').trimEnd())
    .filter((l) => l.trim());
  const body = lines.join('<br>\n');
  return (
    '<details class="accordion-001">\n' +
    '  <summary>商品説明</summary>\n' +
    '<p><br>' + body + '</p>\n' +
    '</details>'
  );
}

function generateCcGoodsCsv(
  rows: ReviewRow[],
  colMap: ColMap,
  captionMap: Map<string, string>,
  specMap: Map<string, SpecData>,
  materialMap: Map<string, string>,
  releaseDateMap: Map<string, string>,
): string {
  const lines: string[] = [toCsvRow([...CCGOODS_HEADERS])];
  const hIdx = buildHeaderIdx(CCGOODS_HEADERS);

  // Validate that all fixed-value headers exist in the template (warn silently if not)
  // This guards against future futureshop format changes

  // First pass: determine whether each product is new ('n') or update ('u')
  // A product is 'u' if any of its SKUs already exist (has_diff or duplicate)
  const productHasExisting = new Set<string>();
  for (const r of rows) {
    if (!r.selected || !r.productNo) continue;
    if (r.status === 'has_diff' || r.status === 'duplicate') {
      productHasExisting.add(r.productNo);
    }
  }

  // Second pass: one row per unique product
  const seen = new Set<string>();
  const missingMaterialNos: string[] = [];
  const missingMainGroupNos: string[] = [];
  for (const r of rows) {
    if (!r.selected) continue;
    const productNo = r.productNo || rv(r.rawData, colMap.productNo);
    if (!productNo || seen.has(productNo)) continue;
    if (isExcludedProductNo(productNo)) continue;
    seen.add(productNo);
    const urlCode = r.urlCode || rv(r.rawData, colMap.urlCode) || productNo;

    // Base row: all 112 columns empty
    const row = new Array<string>(CCGOODS_HEADERS.length).fill('');

    // コントロールカラム: 'n' = new product, 'u' = update existing
    const ctrl = productHasExisting.has(productNo) ? 'u' : 'n';
    const ctrlIdx = hIdx.get('コントロールカラム');
    if (ctrlIdx !== undefined) row[ctrlIdx] = ctrl;

    // Mapped values from source file
    const setH = (headerName: string, val: string) => {
      const i = hIdx.get(headerName);
      if (i !== undefined) row[i] = val;
    };
    const productName = rv(r.rawData, colMap.productName);
    const mainGroup = inferMainGroup(productName, productNo);
    if (!mainGroup) missingMainGroupNos.push(productNo);
    setH('商品URLコード',       urlCode);
    setH('商品番号',            productNo);
    setH('商品名',              productName);
    setH('メイングループ',       mainGroup);
    setH('本体価格',            rv(r.rawData, colMap.price).replace(/[^0-9.]/g, ''));
    setH('JANコード',           rv(r.rawData, colMap.janCode));
    setH('販売期間(From)',      releaseDateMap.get(productNo) ?? '');
    setH('バリエーション横軸名', colMap.colorDisplay ? 'カラー' : '');
    setH('バリエーション縦軸名', colMap.sizeName     ? 'サイズ' : '');
    setH('商品説明（大）',    formatCaptionHtml(captionMap.get(productNo) ?? ''));
    const spec = specMap.get(productNo);
    const material = materialMap.get(productNo) ?? '';
    if (spec && !material.trim()) missingMaterialNos.push(productNo);
    setH('独自コメント（3）', formatSpecHtml(spec, material));

    // Fixed values (header-name keyed, order-independent)
    for (const [headerName, val] of Object.entries(CCGOODS_FIXED)) {
      const i = hIdx.get(headerName);
      if (i !== undefined) row[i] = val;
    }

    lines.push(toCsvRow(row));
  }
  if (missingMaterialNos.length > 0) {
    console.warn(
      `[素材未取得] 企画寸はあるが素材が未登録の品番 ${missingMaterialNos.length}件:`,
      missingMaterialNos.join(', '),
    );
  }
  if (missingMainGroupNos.length > 0) {
    console.warn(
      `[メイングループ未判定] ${missingMainGroupNos.length}件:`,
      missingMainGroupNos.join(', '),
    );
  }
  return lines.join('\n');
}

function generateVariationDetailCsv(rows: ReviewRow[], colMap: ColMap): string {
  const lines: string[] = [toCsvRow([...VARIATION_HEADERS])];
  const firstSkuPerProduct = new Set<string>();
  for (const r of rows) {
    if (!r.selected) continue;
    // Skip rows with no key identifiers (blank rows that may be selected via "select all")
    if (!r.skuNo && !r.productNo && !rv(r.rawData, colMap.productName)) continue;
    if (isExcludedProductNo(r.productNo)) continue;
    const urlCode   = r.urlCode || rv(r.rawData, colMap.urlCode) || r.productNo;
    // バリエーション別選択肢（横軸）= カラー名のみ (例: "OFF WHITE")
    // バリエーション別枝番（横軸）= 数値コード (例: "02")
    const colorDisp = rv(r.rawData, colMap.colorDisplay);
    const colorCode = rv(r.rawData, colMap.colorCode);
    const sizeDisp  = rv(r.rawData, colMap.sizeName);
    const sizeCode  = rv(r.rawData, colMap.sizeCode);
    const isFirst   = r.productNo ? !firstSkuPerProduct.has(r.productNo) : false;
    if (r.productNo) firstSkuPerProduct.add(r.productNo);
    // 商品名: 商品名のみ。色・サイズはバリエーション項目側で管理
    const skuName = rv(r.rawData, colMap.productName);
    lines.push(toCsvRow([
      urlCode,
      colorDisp,
      colorCode,
      sizeDisp,
      sizeCode,
      isFirst ? '1' : '',
      '2',  // 在庫閾値
      '0',  // 在庫切れメール閾値
      r.productNo,
      r.skuNo,
      skuName,
      rv(r.rawData, colMap.janCode),
      '',   // 最終更新日付 (futureshop manages)
    ]));
  }
  return lines.join('\n');
}

// ── Category CSV ─────────────────────────────────────────────────────────────

const CATEGORY_HEADERS = [
  'コントロールカラム', '商品URLコード', '商品名', '表示先グループ', '登録日時', '最終更新日時',
] as const;

function generateCategoryCsv(rows: ReviewRow[], colMap: ColMap): string {
  const lines: string[] = [toCsvRow([...CATEGORY_HEADERS])];
  const seenProducts = new Set<string>();
  const seenRows = new Set<string>(); // urlCode + subGroup の重複排除
  const missingSubGroupNos: string[] = [];

  for (const r of rows) {
    if (!r.selected) continue;
    const productNo = r.productNo || rv(r.rawData, colMap.productNo);
    if (!productNo || isExcludedProductNo(productNo)) continue;
    if (seenProducts.has(productNo)) continue;
    seenProducts.add(productNo);

    const productName = rv(r.rawData, colMap.productName);
    if (!productName) continue;
    const urlCode = r.urlCode || rv(r.rawData, colMap.urlCode) || productNo;

    const mainGroup = inferMainGroup(productName, productNo);
    // futureshop仕様: メイングループと同一の表示先グループは登録不可
    const subGroups = inferSubGroups(productName, productNo).filter((sg) => sg !== mainGroup);
    if (subGroups.length === 0) {
      // サブグループなし（SKIRT/BAG/HAT/SHOES/SOCKSなど）は category.csv に出力しない
      if (!mainGroup) missingSubGroupNos.push(productNo);
      continue;
    }

    for (const sg of subGroups) {
      const key = `${urlCode}\x00${sg}`;
      if (seenRows.has(key)) continue;
      seenRows.add(key);
      lines.push(toCsvRow(['n', urlCode, productName, sg, '', '']));
    }
  }

  if (missingSubGroupNos.length > 0) {
    console.warn(
      `[表示先グループ未判定] ${missingSubGroupNos.length}件:`,
      missingSubGroupNos.join(', '),
    );
  }

  // futureshop は CRLF 推奨
  return lines.join('\r\n');
}

function generateMissingSupplementsCsv(
  alerts: SupplementAlerts,
  reviewRows: ReviewRow[],
  colMap: ColMap,
): string {
  const headers = ['品番', '商品名', '未取得項目', '理由', '備考'];
  const lines = [toCsvRow(headers)];

  const productNameMap = new Map<string, string>();
  for (const r of reviewRows) {
    if (r.productNo && !productNameMap.has(r.productNo)) {
      productNameMap.set(r.productNo, rv(r.rawData, colMap.productName));
    }
  }

  const addRows = (productNos: string[], item: string, reason: string) => {
    for (const pno of productNos) {
      lines.push(toCsvRow([pno, productNameMap.get(pno) ?? '', item, reason, '']));
    }
  };

  const { noCaption, noSpec, specNoRows, noMaterial, noReleaseDate, releaseDateSkipReason } = alerts;
  addRows(noCaption,     'キャプション未取得', 'キャプションファイルに該当品番なし');
  addRows(noSpec,        '企画寸未取得',       '企画寸ファイルに該当品番なし');
  addRows(specNoRows,    '企画寸サイズ行なし', '企画寸あり・サイズ行なし');
  addRows(noMaterial,    '素材未取得',         'SWATCH_MATERIAL_DEFAULT または素材上書きに素材なし');
  addRows(noReleaseDate, '販売期間From未取得', releaseDateSkipReason || 'MD表から販売期間を取得できなかった');

  return lines.join('\n');
}

// ── SupplementCheck ───────────────────────────────────────────────────────────

function computeSupplementAlerts(
  rows: ReviewRow[],
  colMap: ColMap,
  captionMap: Map<string, string>,
  specMap: Map<string, SpecData>,
  materialMap: Map<string, string>,
  releaseDateMap: Map<string, string>,
  releaseDateParseResult: ReleaseDateParseResult | null,
): SupplementAlerts {
  const emptyBase = { totalProducts: 0, noCaption: [], noSpec: [], noMaterial: [], specNoRows: [], noReleaseDate: [], releaseDateSkipReason: '' };
  if (!rows || rows.length === 0) return emptyBase;

  let releaseDateSkipReason = '';
  if (!releaseDateParseResult) {
    releaseDateSkipReason = 'MD表が未投入です';
  } else if (!releaseDateParseResult.hasProductNos && releaseDateMap.size === 0) {
    releaseDateSkipReason = 'MD表に商品番号なし・SKU納期列との紐づきなし → 自動反映停止';
  }
  const seen = new Set<string>();
  const products: string[] = [];
  for (const r of rows) {
    if (!r.selected) continue;
    const productNo = (r.productNo || rv(r.rawData ?? {}, colMap?.productNo ?? '')).trim();
    if (!productNo || seen.has(productNo)) continue;
    if (isExcludedProductNo(productNo)) continue;
    seen.add(productNo);
    products.push(productNo);
  }
  const noCaption: string[] = [];
  const noSpec: string[] = [];
  const noMaterial: string[] = [];
  const specNoRows: string[] = [];
  const noReleaseDate: string[] = [];
  for (const p of products) {
    if (!(captionMap?.get(p) ?? '').trim()) noCaption.push(p);
    const spec = specMap?.get(p);
    if (!spec) {
      noSpec.push(p);
    } else if ((spec.sizeRows ?? []).length === 0) {
      specNoRows.push(p);
    }
    if (!(materialMap?.get(p) ?? '').trim()) noMaterial.push(p);
    if (!(releaseDateMap?.get(p) ?? '').trim()) noReleaseDate.push(p);
  }
  return { totalProducts: products.length, noCaption, noSpec, noMaterial, specNoRows, noReleaseDate, releaseDateSkipReason };
}

const MAX_ALERT_DISPLAY = 20;

function SupplementStatusCard({ alerts }: { alerts: SupplementAlerts }) {
  const { totalProducts, noCaption, noSpec, noMaterial, specNoRows, noReleaseDate, releaseDateSkipReason } = alerts;

  const warnItems: { label: string; items: string[]; reason?: string }[] = [
    { label: 'キャプション未取得', items: noCaption },
    { label: '企画寸未取得', items: noSpec },
    { label: '素材未取得', items: noMaterial },
    { label: '企画寸のサイズ行なし', items: specNoRows },
    { label: '販売期間From未取得', items: noReleaseDate, reason: releaseDateSkipReason || undefined },
  ].filter(({ items }) => items.length > 0);

  const totalMissing = noCaption.length + noSpec.length + noMaterial.length + specNoRows.length + noReleaseDate.length;

  const statItems = [
    { label: '商品説明', ok: totalProducts - noCaption.length, total: totalProducts },
    { label: '企画寸', ok: totalProducts - noSpec.length - specNoRows.length, total: totalProducts },
    { label: '素材', ok: totalProducts - noMaterial.length, total: totalProducts },
    { label: '販売期間From', ok: totalProducts - noReleaseDate.length, total: totalProducts },
  ];

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionCardHeading}>
        <span className={styles.sectionCardNum}>2</span>
        補完状況
        {totalProducts > 0 && (
          <span className={styles.sectionCardDesc} style={{ marginLeft: 'auto', fontSize: '0.76rem' }}>
            対象品番: {totalProducts}
          </span>
        )}
      </div>
      <div className={styles.statusPills}>
        {statItems.map(({ label, ok, total }) => {
          const isOk = ok === total;
          return (
            <div key={label} className={styles.statusPill} data-ok={isOk || undefined} data-warn={!isOk || undefined}>
              <span className={styles.statusPillLabel}>{label}</span>
              <span className={styles.statusPillCount}>{ok} / {total}</span>
            </div>
          );
        })}
        {totalMissing > 0 && (
          <div className={styles.statusPill} data-warn={true}>
            <span className={styles.statusPillLabel}>補完未取得</span>
            <span className={styles.statusPillCount}>{totalMissing}件</span>
          </div>
        )}
        {totalMissing === 0 && totalProducts > 0 && (
          <div className={styles.statusPill} data-ok={true}>
            <span className={styles.statusPillLabel}>全項目OK</span>
            <span className={styles.statusPillCount}>✓</span>
          </div>
        )}
      </div>
      {warnItems.length > 0 && (
        <div className={styles.supplementAlertList}>
          {warnItems.map(({ label, items, reason }) => {
            const shown = items.slice(0, MAX_ALERT_DISPLAY);
            const rest = items.length - shown.length;
            return (
              <div key={label} className={styles.supplementAlert}>
                <span className={styles.supplementAlertLabel}>⚠ {label}: {items.length}件</span>
                {reason && <span className={styles.supplementAlertReason}>{reason}</span>}
                <span className={styles.supplementAlertNos}>
                  {shown.join(', ')}{rest > 0 ? ` ほか${rest}件` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PageHeaderCard ────────────────────────────────────────────────────────────

function PageHeaderCard() {
  return (
    <div className={styles.pageHeaderCard}>
      <div className={styles.pageHeaderTitle}>商品登録CSV</div>
      <div className={styles.pageHeaderDesc}>
        SKU・商品説明・企画寸・素材・MD表を取り込み、FutureShop登録用CSVを作成します。
      </div>
      <div className={styles.pageHeaderNote}>
        チェックあり: 選択品番のみ出力 ／ チェックなし: 全件出力
      </div>
    </div>
  );
}

// ── CsvOutputCard ─────────────────────────────────────────────────────────────

type CsvOutputCardProps = {
  hasValidRows: boolean;
  selectedCount: number;
  manualCount: number;
  hasMissingSupplements: boolean;
  sentCount: number;
  onDownloadCcGoods: () => void;
  onDownloadVariation: () => void;
  onDownloadCategory: () => void;
  onDownloadMissingSupplements: () => void;
  onDownloadManualMaterial: () => void;
  onSendToProducts: () => void;
};

function CsvOutputCard({
  hasValidRows, selectedCount, manualCount, hasMissingSupplements, sentCount,
  onDownloadCcGoods, onDownloadVariation, onDownloadCategory,
  onDownloadMissingSupplements, onDownloadManualMaterial, onSendToProducts,
}: CsvOutputCardProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionCardHeading}>
        <span className={styles.sectionCardNum}>3</span>
        CSV出力
      </div>
      <p className={styles.sectionCardDesc}>
        {selectedCount > 0
          ? `チェックあり（${selectedCount}件）: 選択品番のみ出力します。`
          : 'チェックなし: 全件出力します。'}
      </p>
      <div className={styles.csvOutputBtns}>
        <button
          className={styles.csvBtnPrimary}
          onClick={onDownloadCcGoods}
          disabled={!hasValidRows}
          title={selectedCount > 0 ? `選択中の${selectedCount}件の品番のみ出力（112列）` : '全品番を出力（112列）'}
        >
          ⬇ ccGoods.csv
        </button>
        <button
          className={styles.csvBtnPrimary}
          onClick={onDownloadVariation}
          disabled={!hasValidRows}
          title={selectedCount > 0 ? `選択中の品番に紐づくSKU行のみ出力` : '全SKU行を出力（13列）'}
        >
          ⬇ variationDetail.csv
        </button>
        <button
          className={styles.csvBtnPrimary}
          onClick={onDownloadCategory}
          disabled={!hasValidRows}
          title={selectedCount > 0 ? `選択中の品番のカテゴリ行のみ出力（Shift_JIS）` : '全品番のカテゴリ行を出力（Shift_JIS）'}
        >
          ⬇ category.csv
        </button>
        <button
          className={styles.csvBtnSecondary}
          onClick={onDownloadMissingSupplements}
          disabled={!hasMissingSupplements}
          title="キャプション・企画寸・素材・販売期間Fromが未取得の品番一覧"
        >
          ⬇ 補完未取得.csv
        </button>
        <button
          className={styles.csvBtnSecondary}
          onClick={onDownloadManualMaterial}
          disabled={manualCount === 0}
          title="手動補完した素材をCSVで保存"
        >
          ⬇ 手動補完素材.csv
        </button>
      </div>
      <div className={styles.sendToProductsRow}>
        <button
          className={styles.sendToProductsBtn}
          onClick={onSendToProducts}
          disabled={!hasValidRows}
          title="取り込み商品を商品一覧タブへ一時反映します"
        >
          商品一覧へ反映
        </button>
        <span className={styles.sendToProductsDesc}>
          現在取り込んでいる商品を、商品一覧タブへ一時反映します。リロードすると消えます。
        </span>
        {sentCount > 0 && (
          <span className={styles.sendToProductsDone}>
            ✓ 商品一覧へ{sentCount}件反映しました。
          </span>
        )}
      </div>
    </div>
  );
}

// ── Manual material CSV helpers ───────────────────────────────────────────────

function generateManualMaterialCsv(
  manualMaterialMap: Map<string, string>,
  reviewRows: ReviewRow[],
  colMap: ColMap,
): string {
  const productNameMap = new Map<string, string>();
  for (const r of reviewRows) {
    if (r.productNo && !productNameMap.has(r.productNo))
      productNameMap.set(r.productNo, rv(r.rawData, colMap.productName));
  }
  const lines = [toCsvRow(['品番', '商品名', '素材'])];
  for (const [pno, mat] of manualMaterialMap) {
    if (!mat.trim()) continue;
    lines.push(toCsvRow([pno, productNameMap.get(pno) ?? '', mat.trim()]));
  }
  return lines.join('\n');
}

function parseCsvRowSimple(row: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i <= row.length) {
    if (row[i] === '"') {
      let field = '';
      i++;
      while (i < row.length) {
        if (row[i] === '"' && row[i + 1] === '"') { field += '"'; i += 2; }
        else if (row[i] === '"') { i++; break; }
        else field += row[i++];
      }
      result.push(field);
      if (row[i] === ',') i++;
    } else {
      const end = row.indexOf(',', i);
      if (end < 0) { result.push(row.slice(i)); break; }
      result.push(row.slice(i, end));
      i = end + 1;
    }
  }
  return result;
}

function parseManualMaterialCsv(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const stripped = text.replace(/^\uFEFF/, ''); // strip UTF-8 BOM
  const rows = stripped.split(/\r?\n/);
  if (rows.length < 2) return result;
  const headers = parseCsvRowSimple(rows[0]).map((h) => h.trim());
  const pnoIdx = headers.indexOf('品番');
  const matIdx = headers.indexOf('素材');
  if (pnoIdx < 0 || matIdx < 0) return result;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].trim()) continue;
    const cols = parseCsvRowSimple(rows[i]);
    const pno = (cols[pnoIdx] ?? '').trim();
    const mat = (cols[matIdx] ?? '').trim();
    if (!pno || !/^\d{7}$/.test(pno) || !mat) continue;
    result.set(pno, mat);
  }
  return result;
}

// ── ManualMaterialPanel ───────────────────────────────────────────────────────

type ManualMaterialPanelProps = {
  productNos: string[];
  reviewRows: ReviewRow[];
  colMap: ColMap;
  manualMaterialMap: Map<string, string>;
  noMaterialCount: number;
  onSetMaterial: (productNo: string, text: string) => void;
  onImportManual: (file: File) => void;
  onClearManual: () => void;
};

function ManualMaterialPanel({
  productNos, reviewRows, colMap, manualMaterialMap, noMaterialCount,
  onSetMaterial, onImportManual, onClearManual,
}: ManualMaterialPanelProps) {
  const importRef = useRef<HTMLInputElement>(null);

  const productNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reviewRows) {
      if (r.productNo && !m.has(r.productNo)) m.set(r.productNo, rv(r.rawData, colMap.productName));
    }
    return m;
  }, [reviewRows, colMap]);

  const manualCount = useMemo(
    () => [...manualMaterialMap.values()].filter((v) => v.trim()).length,
    [manualMaterialMap],
  );

  return (
    <div className={styles.sectionCard} style={{ borderColor: '#fbbf24' }}>
      <div className={styles.sectionCardHeading}>
        <span className={styles.sectionCardNum}>4</span>
        素材未取得の手動補完
        <span className={styles.manualMaterialCount} style={{ marginLeft: 'auto' }}>
          手動補完: {manualCount}件 / 素材未取得: {noMaterialCount}件
        </span>
      </div>
      <p className={styles.sectionCardDesc}>
        スワッチPDFから素材が取得できない品番は、ここで素材を入力できます。入力内容はccGoods.csvの独自コメント（3）に反映されます。
      </p>
      <div className={styles.manualMaterialActions}>
        <button
          className={styles.manualMaterialBtn}
          onClick={() => importRef.current?.click()}
          title="手動補完素材CSVを取込（既存に上書きマージ）"
        >
          ↑ 手動補完素材CSVを取込
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { onImportManual(file); e.target.value = ''; }
          }}
        />
        <button
          className={styles.manualMaterialClearBtn}
          onClick={onClearManual}
          disabled={manualCount === 0}
          title="手動補完をすべてクリア"
        >
          手動補完をクリア
        </button>
      </div>
      <div className={styles.manualMaterialList}>
        {productNos.map((pno) => {
          const currentVal = manualMaterialMap.get(pno) ?? '';
          const done = Boolean(currentVal.trim());
          return (
            <div key={pno} className={styles.manualMaterialRow} data-done={done || undefined}>
              <span className={styles.manualMaterialNo}>{pno}</span>
              <span className={styles.manualMaterialName}>{productNameMap.get(pno) ?? ''}</span>
              <input
                className={styles.manualMaterialInput}
                type="text"
                placeholder="例: C/100%  PE/100% <別地>NY/90% PU/10%"
                value={currentVal}
                onChange={(e) => onSetMaterial(pno, e.target.value)}
              />
              {done && <span className={styles.manualMaterialDone}>✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SupplementPanel ───────────────────────────────────────────────────────────

type SupplementSlotProps = {
  label: string;
  desc?: string;
  hint: string;
  accept?: string;
  filename: string;
  loading: boolean;
  onFile: (file: File) => Promise<void>;
};

function SupplementSlot({ label, desc, hint, accept = '.xlsx,.xls', filename, loading, onFile }: SupplementSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className={styles.supplementSlot}>
      <div className={styles.supplementSlotLabel}>{label}</div>
      {desc && <div className={styles.supplementSlotDesc}>{desc}</div>}
      <div
        className={styles.supplementDropZone}
        data-drag={drag || undefined}
        data-loaded={filename ? true : undefined}
        data-loading={loading || undefined}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className={styles.fileInput}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        />
        {loading ? '⏳ 解析中…' : filename ? `✅ ${filename}` : hint}
      </div>
    </div>
  );
}

type FileIntakeCardProps = {
  skuFilename: string;
  skuCount: number;
  captionFilename: string;
  specFilename: string;
  materialFilename: string;
  mdFilename: string;
  swatchFilename: string;
  imageUrlFilename: string;
  imageUrlSkuCount: number;
  imageUrlProductCount: number;
  imageUrlSkipCount: number;
  imageUrlWarningCount: number;
  captionLoading: boolean;
  specLoading: boolean;
  materialLoading: boolean;
  mdLoading: boolean;
  swatchLoading: boolean;
  imageUrlLoading: boolean;
  onCaptionFile: (file: File) => Promise<void>;
  onSpecFile: (file: File) => Promise<void>;
  onMaterialFile: (file: File) => Promise<void>;
  onMdFile: (file: File) => Promise<void>;
  onSwatchFile: (file: File) => Promise<void>;
  onImageUrlFile: (file: File) => Promise<void>;
  onGoToColumns: () => void;
};

function FileIntakeCard({
  skuFilename, skuCount,
  captionFilename, specFilename, materialFilename, mdFilename, swatchFilename,
  imageUrlFilename, imageUrlSkuCount, imageUrlProductCount, imageUrlSkipCount, imageUrlWarningCount,
  captionLoading, specLoading, materialLoading, mdLoading, swatchLoading, imageUrlLoading,
  onCaptionFile, onSpecFile, onMaterialFile, onMdFile, onSwatchFile, onImageUrlFile,
  onGoToColumns,
}: FileIntakeCardProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionCardHeading}>
        <span className={styles.sectionCardNum}>1</span>
        ファイル取込
        <button className={styles.columnsLinkBtn} onClick={onGoToColumns} title="列マッピングを確認・変更する">
          列設定を変更
        </button>
      </div>
      <div className={styles.skuSummaryChip}>
        ✅ SKUファイル取込済み：{skuFilename}（{skuCount} SKU）
      </div>
      <div className={styles.supplementSlots}>
        <SupplementSlot
          label="キャプション"
          desc="商品説明（大）に入れるcaption.xlsxをアップロード"
          hint="caption.xlsx をドロップ"
          filename={captionFilename}
          loading={captionLoading}
          onFile={onCaptionFile}
        />
        <SupplementSlot
          label="企画寸"
          desc="サイズ表に使用する企画寸ファイルをアップロード"
          hint="design_spec.xlsx をドロップ"
          filename={specFilename}
          loading={specLoading}
          onFile={onSpecFile}
        />
        <SupplementSlot
          label="素材"
          desc="商品素材を補完する素材一覧ファイルをアップロード"
          hint="素材上書き.xlsx をドロップ"
          filename={materialFilename}
          loading={materialLoading}
          onFile={onMaterialFile}
        />
        <SupplementSlot
          label="MD表"
          desc="販売期間From / 発売日を補完するMD表をアップロード"
          hint="MD表.xlsx をドロップ"
          filename={mdFilename}
          loading={mdLoading}
          onFile={onMdFile}
        />
        <SupplementSlot
          label="画像URL"
          desc="商品画像サムネイルに使用する画像URL CSVをアップロード"
          hint="画像URL CSVをドロップ"
          accept=".csv,.xlsx,.xls"
          filename={imageUrlFilename
            ? `${imageUrlFilename}（SKU ${imageUrlSkuCount}件 / 品番 ${imageUrlProductCount}件${imageUrlSkipCount > 0 ? ` / スキップ ${imageUrlSkipCount}件` : ''}${imageUrlWarningCount > 0 ? ` / 警告 ${imageUrlWarningCount}件` : ''}）`
            : ''}
          loading={imageUrlLoading}
          onFile={onImageUrlFile}
        />
      </div>
      <details className={styles.swatchDetails}>
        <summary className={styles.swatchSummary}>任意：swatch PDF / 素材PDF</summary>
        <p className={styles.swatchNote}>
          PDFからの素材読み取りは精度が安定しないため、通常は素材上書き.xlsxの利用を推奨します。
        </p>
        <SupplementSlot
          label="swatch PDF"
          hint="swatch.pdf をドロップ"
          accept=".pdf,application/pdf"
          filename={swatchFilename}
          loading={swatchLoading}
          onFile={onSwatchFile}
        />
      </details>
    </div>
  );
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

type StepDef = { id: Step; label: string };

const STEPS_FULL: StepDef[] = [
  { id: 'upload',  label: 'ファイル' },
  { id: 'sheet',   label: 'シート選択' },
  { id: 'columns', label: '列設定' },
  { id: 'review',  label: '確認・保存' },
];

const STEPS_SKIP: StepDef[] = [
  { id: 'upload',  label: 'ファイル' },
  { id: 'sheet',   label: 'シート選択' },
  { id: 'review',  label: '確認・保存' },
];

function StepIndicator({ steps, current }: { steps: StepDef[]; current: Step }) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <div className={styles.stepIndicator}>
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={styles.stepItem}
          data-active={current === s.id || undefined}
          data-done={i < currentIdx || undefined}
        >
          <span className={styles.stepNum}>{i + 1}</span>
          <span className={styles.stepLabel}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── UploadStep ────────────────────────────────────────────────────────────────

type UploadStepProps = {
  onFile: (file: File) => Promise<void>;
  loading: boolean;
  error: string | null;
  savedState: ImportSavedState | null;
  onResume: () => void;
};

function UploadStep({ onFile, loading, error, savedState, onResume }: UploadStepProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className={styles.uploadStepWrap}>
      <div className={styles.uploadIntro}>
        <div className={styles.uploadIntroTitle}>SKUファイルを取り込む</div>
        <div className={styles.uploadIntroDesc}>
          商品管理番号・SKU・JAN・カラー・サイズが入ったSKUファイルをアップロードしてください。
        </div>
      </div>

      {savedState && (
        <div className={styles.resumeCard}>
          <div className={styles.resumeCardTitle}>前回の取込状態があります</div>
          <div className={styles.resumeCardInfo}>
            <span>📄 {savedState.filename}</span>
            <span>SKU数: {savedState.skuCount}</span>
            <span>対象品番: {savedState.productCount}</span>
            <span>取込日時: {new Date(savedState.savedAt).toLocaleString('ja-JP')}</span>
          </div>
          <div className={styles.resumeCardBtns}>
            <button className={styles.resumeBtn} onClick={onResume}>
              前回の取込状態を開く
            </button>
          </div>
        </div>
      )}

      <div
        className={styles.uploadZone}
        data-drag={drag || undefined}
        data-loading={loading || undefined}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="SKUファイルをアップロード"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className={styles.fileInput}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        />
        <div className={styles.uploadIcon}>{loading ? '⏳' : '📊'}</div>
        <div className={styles.uploadText}>
          {loading ? 'SKUファイルを解析中...' : 'SKUファイルをドロップ、またはクリックして選択'}
        </div>
        <div className={styles.uploadHint}>商品管理番号・SKU・JAN・カラー・サイズを含むファイル（.xlsx / .xls / .csv）</div>
        {error && <div className={styles.uploadError} role="alert">{error}</div>}
      </div>
    </div>
  );
}

// ── PreviewTable ──────────────────────────────────────────────────────────────

function PreviewTable({ headers, rows, highlightCols = [] }: {
  headers: string[];
  rows: Record<string, string>[];
  highlightCols?: string[];
}) {
  const visHeaders = headers.slice(0, MAX_PREVIEW_COLS);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.previewTable}>
        <thead>
          <tr>
            {visHeaders.map((h) => (
              <th key={h} data-key={highlightCols.includes(h) || undefined}>{h}</th>
            ))}
            {headers.length > MAX_PREVIEW_COLS && (
              <th className={styles.moreCol}>…+{headers.length - MAX_PREVIEW_COLS}列</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
            <tr key={i}>
              {visHeaders.map((h) => (
                <td key={h} data-key={highlightCols.includes(h) || undefined}>{row[h] ?? ''}</td>
              ))}
              {headers.length > MAX_PREVIEW_COLS && <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── SheetStep ─────────────────────────────────────────────────────────────────

type SheetStepProps = {
  filename: string;
  sheets: ParsedSheet[];
  selected: ParsedSheet | null;
  onSelect: (s: ParsedSheet) => void;
  onNext: () => void;
};

function SheetStep({ filename, sheets, selected, onSelect, onNext }: SheetStepProps) {
  const isMd      = selected?.kind === 'md';
  const isUnknown = selected?.kind === 'unknown';

  return (
    <div>
      <div className={styles.sectionTitle}>取込対象のシートを選択してください</div>
      <div className={styles.filenameChip}>{filename}</div>

      <div className={styles.sheetList}>
        {sheets.map((s) => (
          <button
            key={s.name}
            className={styles.sheetCard}
            data-selected={selected?.name === s.name || undefined}
            data-blocked={s.kind === 'md' || undefined}
            onClick={() => onSelect(s)}
          >
            <span className={styles.sheetName}>{s.name}</span>
            <div className={styles.sheetMeta}>
              <span className={styles.kindBadge} data-kind={s.kind}>
                {SHEET_KIND_LABELS[s.kind]}
              </span>
              <span className={styles.sheetRowCount}>{s.rows.length.toLocaleString()} 行</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        isMd ? (
          <div className={styles.mdBlockMsg}>
            ⛔ このシートは MD表・スケジュール形式と判定されました。商品取込の対象外です。別のシートを選択してください。
          </div>
        ) : (
          <>
            {isUnknown && (
              <div className={styles.inlineWarn}>
                SKU列が自動検出できませんでした。次の画面で列を手動マッピングしてください。
              </div>
            )}
            <div className={styles.previewTitle}>
              「{selected.name}」先頭 {PREVIEW_ROWS} 行プレビュー
            </div>
            <PreviewTable headers={selected.headers} rows={selected.rows} />
            <div className={styles.stepActions}>
              <button className={styles.nextBtn} onClick={onNext}>
                {(() => {
                  const m = autoDetect(selected.headers);
                  return (m.skuNo || m.productNo) ? '確認・保存へ →' : '列設定へ →';
                })()}
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

// ── ColumnStep ────────────────────────────────────────────────────────────────

type ColStepProps = {
  sheet: ParsedSheet;
  colMap: ColMap;
  onChange: (m: ColMap) => void;
  onBack: () => void;
  onNext: () => void;
};

const COL_FIELDS: { key: keyof ColMap; label: string; required: boolean; hint: string }[] = [
  { key: 'productNo',    label: '品番',          required: false, hint: '→ 商品URLコード / 商品番号' },
  { key: 'skuNo',        label: '商品管理番号',   required: true,  hint: '→ SKU識別キー' },
  { key: 'productName',  label: '商品名',         required: false, hint: '→ ccGoods 商品名' },
  { key: 'price',        label: '価格（税込）',    required: false, hint: '→ 本体価格（税込優先）' },
  { key: 'janCode',      label: 'JAN コード',     required: false, hint: '' },
  { key: 'urlCode',      label: '商品URLコード',  required: false, hint: '空欄時は品番で代替' },
  { key: 'colorDisplay', label: 'カラー名',         required: false, hint: '→ 選択肢（横軸）' },
  { key: 'colorCode',    label: 'カラー枝番',      required: false, hint: '→ 枝番（横軸）' },
  { key: 'sizeName',     label: 'サイズ表記',      required: false, hint: '→ 選択肢（縦軸）' },
  { key: 'sizeCode',     label: 'サイズ枝番',      required: false, hint: '→ 枝番（縦軸）' },
];

function ColumnStep({ sheet, colMap, onChange, onBack, onNext }: ColStepProps) {
  const options = ['（なし）', ...sheet.headers];
  const set = (key: keyof ColMap) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...colMap, [key]: e.target.value === '（なし）' ? '' : e.target.value });

  const highlightCols = Object.values(colMap).filter(Boolean);
  const canProceed = Boolean(colMap.skuNo || colMap.productNo);

  return (
    <div>
      <div className={styles.sectionTitle}>
        キー列を確認・設定してください
        <span className={styles.autoLabel}>（自動検出済み）</span>
      </div>

      <div className={styles.colMapGrid}>
        {COL_FIELDS.map(({ key, label, required, hint }) => (
          <div key={key} className={styles.colMapField}>
            <label className={styles.colLabel}>
              {label}
              {required && <span className={styles.required}> *</span>}
            </label>
            <select
              className={styles.colSelect}
              value={colMap[key] || '（なし）'}
              onChange={set(key)}
            >
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {hint && <span className={styles.colHint}>{hint}</span>}
          </div>
        ))}
      </div>

      {!canProceed && (
        <div className={styles.inlineWarn}>
          「商品管理番号」または「品番」の列を選択してください
        </div>
      )}

      <div className={styles.previewTitle}>
        先頭 {PREVIEW_ROWS} 行プレビュー（キー列を強調表示）
      </div>
      <PreviewTable headers={sheet.headers} rows={sheet.rows} highlightCols={highlightCols} />

      <div className={styles.stepActions}>
        <button className={styles.backBtn} onClick={onBack}>← 戻る</button>
        <button className={styles.nextBtn} onClick={onNext} disabled={!canProceed}>
          取込内容を確認 →
        </button>
      </div>
    </div>
  );
}

// ── ReviewStep ────────────────────────────────────────────────────────────────

type ReviewStepProps = {
  rows: ReviewRow[];
  colMap: ColMap;
  saving: boolean;
  error: string | null;
  onToggle: (idx: number) => void;
  onToggleAll: (v: boolean) => void;
  onBack: () => void;
};

function ReviewStep({ rows, colMap, saving, error, onToggle, onToggleAll, onBack }: ReviewStepProps) {
  const [filter, setFilter] = useState<ImportRowStatus | 'all'>('all');

  const counts = {
    all:       rows.length,
    new:       rows.filter((r) => r.status === 'new').length,
    has_diff:  rows.filter((r) => r.status === 'has_diff').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    selected:  rows.filter((r) => r.selected).length,
  };

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const visibleSelected = visible.filter((r) => r.selected).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionCardHeading}>
        <span className={styles.sectionCardNum}>5</span>
        商品確認
      </div>
      <p className={styles.sectionCardDesc}>
        必要な品番にチェックを入れると、選択品番のみCSV出力できます。未選択の場合は全件出力されます。
      </p>

      <div className={styles.reviewSummary}>
        <span data-type="new"       className={styles.summaryBadge}>新規 {counts.new}</span>
        <span data-type="has_diff"  className={styles.summaryBadge}>差分あり {counts.has_diff}</span>
        <span data-type="duplicate" className={styles.summaryBadge}>重複 {counts.duplicate}</span>
        <span className={styles.selectedCount}>選択済み: {counts.selected} 件</span>
      </div>

      <div className={styles.filterRow}>
        {(['all', 'new', 'has_diff', 'duplicate'] as const).map((f) => (
          <button
            key={f}
            className={styles.filterBtn}
            data-active={filter === f || undefined}
            onClick={() => setFilter(f)}
          >
            {f === 'all'
              ? `すべて (${counts.all})`
              : `${IMPORT_ROW_STATUS_LABELS[f as ImportRowStatus]} (${counts[f]})`}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.reviewTable}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label="表示中を全選択"
                />
              </th>
              <th>状態</th>
              <th>#</th>
              {colMap.productNo && <th>品番</th>}
              {colMap.skuNo     && <th>商品管理番号</th>}
              {colMap.urlCode   && <th>URLコード</th>}
              <th>差分列数</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.idx}
                data-selected={row.selected || undefined}
                data-status={row.status}
                onClick={() => onToggle(row.idx)}
                className={styles.reviewRow}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={row.selected} onChange={() => onToggle(row.idx)} />
                </td>
                <td>
                  <span className={styles.statusBadge} data-status={row.status}>
                    {IMPORT_ROW_STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className={styles.rowNum}>{row.idx + 1}</td>
                {colMap.productNo && <td>{row.productNo || <span className={styles.empty}>—</span>}</td>}
                {colMap.skuNo     && <td>{row.skuNo     || <span className={styles.empty}>—</span>}</td>}
                {colMap.urlCode   && <td>{row.urlCode   || <span className={styles.empty}>—</span>}</td>}
                <td className={styles.diffCount}>
                  {row.diffKeys.length > 0
                    ? <span className={styles.diffBadge}>{row.diffKeys.length}</span>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className={styles.saveError} role="alert">{error}</div>}

      <div className={styles.stepActions}>
        <button className={styles.backBtn} onClick={onBack} disabled={saving}>← 戻る</button>
      </div>
    </div>
  );
}

// ── DoneStep ──────────────────────────────────────────────────────────────────

function DoneStep({ newCount, diffCount, onReset, onDownloadCcGoods, onDownloadVariation, onDownloadCategory }: {
  newCount: number;
  diffCount: number;
  onReset: () => void;
  onDownloadCcGoods: () => void;
  onDownloadVariation: () => void;
  onDownloadCategory: () => void;
}) {
  return (
    <div className={styles.doneStep}>
      <div className={styles.doneIcon}>✅</div>
      <div className={styles.doneTitle}>取込が完了しました</div>
      <div className={styles.doneCounts}>
        <span>新規登録: {newCount} 件</span>
        <span>更新: {diffCount} 件</span>
      </div>
      <div className={styles.csvBtnGroup}>
        <button className={styles.csvBtn} onClick={onDownloadCcGoods}>⬇ ccGoods.csv</button>
        <button className={styles.csvBtn} onClick={onDownloadVariation}>⬇ variationDetail.csv</button>
        <button className={styles.csvBtn} onClick={onDownloadCategory}>⬇ category.csv</button>
      </div>
      <button className={styles.resetBtn} onClick={onReset}>別のファイルを取込む</button>
    </div>
  );
}

// ── Import state / history helpers ───────────────────────────────────────────

function countUniqueProducts(rows: ReviewRow[], colMap: ColMap): number {
  const nos = new Set<string>();
  for (const r of rows) {
    const pno = r.productNo || rv(r.rawData, colMap.productNo);
    if (pno && !isExcludedProductNo(pno)) nos.add(pno);
  }
  return nos.size;
}

// Count valid SKU rows: same filter as reviewRowsToMdVariations
// (productNo exists + not excluded + skuCode exists)
function countValidSkus(rows: ReviewRow[], colMap: ColMap): number {
  let count = 0;
  for (const r of rows) {
    const productNo = r.productNo || rv(r.rawData, colMap.productNo);
    if (!productNo || isExcludedProductNo(productNo)) continue;
    const skuCode = r.skuNo || rv(r.rawData, colMap.skuNo);
    if (!skuCode) continue;
    count++;
  }
  return count;
}


// ── Image URL import ─────────────────────────────────────────────────────────

type ImageUrlMap = {
  byProductNo: Record<string, string>;
  bySkuCode: Record<string, string>;
};

type ImageUrlImportResult = {
  map: ImageUrlMap;
  skuCount: number;
  productCount: number;
  skipCount: number;
  warningCount: number;
};

const EMPTY_IMAGE_URL_MAP: ImageUrlMap = { byProductNo: {}, bySkuCode: {} };

function normalizeSku(sku: string): string {
  return sku.replace(/_/g, '');
}

function isValidImageUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function parseImageUrlFile(file: File): Promise<ImageUrlImportResult> {
  const byProductNo: Record<string, string> = {};
  const bySkuCode: Record<string, string> = {};
  let skipCount = 0;
  let warningCount = 0;

  const PRODUCT_NO_KEYS = ['品番', '商品番号', 'productNo', 'product_no', 'product'];
  const SKU_KEYS = ['SKU', 'sku', '商品管理番号', 'skuCode', 'sku_code'];
  const IMAGE_URL_KEYS = ['画像URL', 'imageUrl', 'image_url', 'image', '商品画像', 'メイン画像', 'サムネイル', 'thumbnail', 'url'];

  let rows: Record<string, string>[];

  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { map: EMPTY_IMAGE_URL_MAP, skuCount: 0, productCount: 0, skipCount: 0, warningCount: 0 };
    const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    rows = lines.slice(1).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
      return Object.fromEntries(rawHeaders.map((h, i) => [h, vals[i] ?? '']));
    });
  } else {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
  }

  if (rows.length === 0) return { map: EMPTY_IMAGE_URL_MAP, skuCount: 0, productCount: 0, skipCount: 0, warningCount: 0 };

  const headers = Object.keys(rows[0]);
  const productNoKey = PRODUCT_NO_KEYS.find((k) => headers.includes(k)) ?? '';
  const skuKey      = SKU_KEYS.find((k) => headers.includes(k)) ?? '';
  const imageUrlKey = IMAGE_URL_KEYS.find((k) => headers.includes(k)) ?? '';

  if (!imageUrlKey) {
    return { map: EMPTY_IMAGE_URL_MAP, skuCount: 0, productCount: 0, skipCount: rows.length, warningCount: 0 };
  }

  for (const row of rows) {
    const imageUrl  = (row[imageUrlKey] ?? '').trim();
    if (!imageUrl) { skipCount++; continue; }
    if (!isValidImageUrl(imageUrl)) { warningCount++; skipCount++; continue; }

    const productNo = productNoKey ? (row[productNoKey] ?? '').trim() : '';
    const rawSku    = skuKey ? (row[skuKey] ?? '').trim() : '';
    const sku       = rawSku ? normalizeSku(rawSku) : '';

    if (sku) {
      bySkuCode[sku] = imageUrl;
    } else if (productNo) {
      byProductNo[productNo] = imageUrl;
    } else {
      skipCount++;
    }
  }

  return {
    map: { byProductNo, bySkuCode },
    skuCount: Object.keys(bySkuCode).length,
    productCount: Object.keys(byProductNo).length,
    skipCount,
    warningCount,
  };
}

function saveImportStateToStorage(state: ImportSavedState): void {
  try {
    localStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceededError: degrade gracefully — save without reviewRows
    try {
      const slim = { ...state, reviewRows: [] };
      localStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(slim));
    } catch {
      // ignore
    }
  }
}

function loadImportStateFromStorage(): ImportSavedState | null {
  try {
    const raw = localStorage.getItem(IMPORT_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImportSavedState;
  } catch {
    return null;
  }
}

function loadImportHistoryFromStorage(): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(IMPORT_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ImportHistoryEntry[];
  } catch {
    return [];
  }
}

function saveImportHistoryToStorage(entries: ImportHistoryEntry[]): void {
  try {
    localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors for history
  }
}

// ── ImportHistorySection ──────────────────────────────────────────────────────

function ImportHistorySection({
  history,
  savedState,
  onClear,
}: {
  history: ImportHistoryEntry[];
  savedState: ImportSavedState | null;
  onClear: () => void;
}) {
  if (history.length === 0) return null;

  const latestId = history[0]?.id;

  const getExportData = () => {
    if (!savedState || savedState.reviewRows.length === 0) return null;
    const rows = savedState.reviewRows.map((r) => ({ ...r, selected: true }));
    const captionMap = new Map(Object.entries(savedState.captionMapData ?? {}));
    const specMap    = new Map<string, SpecData>(Object.entries(savedState.specMapData ?? {}));
    const materialMap= new Map(Object.entries(savedState.materialMapData ?? {}));
    const releaseDateMap = new Map(Object.entries(savedState.releaseDateMapData ?? {}));
    return { rows, colMap: savedState.colMap, captionMap, specMap, materialMap, releaseDateMap };
  };

  const handleCcGoods = () => {
    const d = getExportData();
    if (!d) return;
    downloadCsv('ccGoods.csv', generateCcGoodsCsv(d.rows, d.colMap, d.captionMap, d.specMap, d.materialMap, d.releaseDateMap));
  };
  const handleVariation = () => {
    const d = getExportData();
    if (!d) return;
    downloadCsv('goodsVariationDetail.csv', generateVariationDetailCsv(d.rows, d.colMap));
  };
  const handleCategory = () => {
    const d = getExportData();
    if (!d) return;
    downloadShiftJisCsv('category.csv', generateCategoryCsv(d.rows, d.colMap));
  };
  const handleAll = () => {
    const d = getExportData();
    if (!d) return;
    downloadCsv('ccGoods.csv', generateCcGoodsCsv(d.rows, d.colMap, d.captionMap, d.specMap, d.materialMap, d.releaseDateMap));
    downloadCsv('goodsVariationDetail.csv', generateVariationDetailCsv(d.rows, d.colMap));
    downloadShiftJisCsv('category.csv', generateCategoryCsv(d.rows, d.colMap));
  };

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionCardHeading}>
        <span className={styles.sectionCardNum}>📋</span>
        取込履歴
        <button className={styles.histClearBtn} onClick={onClear}>履歴をクリア</button>
      </div>
      <div className={styles.historyList}>
        {history.map((entry) => {
          const isLatest = entry.id === latestId;
          const canExport = isLatest && savedState !== null && savedState.reviewRows.length > 0;
          return (
            <div key={entry.id} className={styles.historyEntry}>
              <div className={styles.historyEntryMain}>
                <span className={styles.historyFilename}>{entry.filename}</span>
                <span className={styles.historyMeta}>{entry.skuCount} SKU / {entry.productCount}品番</span>
                <span className={styles.historyDatetime}>{entry.datetime}</span>
                <span
                  className={styles.historyStatus}
                  data-reflected={entry.status === '商品一覧反映済み' || undefined}
                >
                  {entry.status}
                </span>
              </div>
              {canExport ? (
                <div className={styles.histDownloadGroup}>
                  <button className={styles.histDownloadAllBtn} onClick={handleAll} title="3ファイルをまとめてダウンロード">
                    ⬇ 登録CSV一式
                  </button>
                  <button className={styles.histDownloadBtn} onClick={handleCcGoods}>ccGoods.csv</button>
                  <button className={styles.histDownloadBtn} onClick={handleVariation}>variationDetail.csv</button>
                  <button className={styles.histDownloadBtn} onClick={handleCategory}>category.csv</button>
                </div>
              ) : (
                <span className={styles.histNoData}>
                  {isLatest ? '再取込後に出力可能' : '最新取込のみ出力可能'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── MdProduct conversion ──────────────────────────────────────────────────────

function reviewRowsToMdProducts(
  rows: ReviewRow[],
  colMap: ColMap,
  releaseDateMap: Map<string, string>,
  supplementAlerts: SupplementAlerts,
  imageUrlMap?: ImageUrlMap,
): MdProduct[] {
  const noMaterialSet = new Set(supplementAlerts.noMaterial);
  const noCaptionSet = new Set(supplementAlerts.noCaption);
  const noSpecSet = new Set([...supplementAlerts.noSpec, ...supplementAlerts.specNoRows]);

  const skuCounts = new Map<string, number>();
  const productNameMap = new Map<string, string>();

  for (const r of rows) {
    const productNo = r.productNo || rv(r.rawData, colMap.productNo);
    if (!productNo || isExcludedProductNo(productNo)) continue;
    skuCounts.set(productNo, (skuCounts.get(productNo) ?? 0) + 1);
    if (!productNameMap.has(productNo)) {
      productNameMap.set(productNo, rv(r.rawData, colMap.productName));
    }
  }

  const seen = new Set<string>();
  const products: MdProduct[] = [];

  for (const r of rows) {
    const productNo = r.productNo || rv(r.rawData, colMap.productNo);
    if (!productNo || isExcludedProductNo(productNo) || seen.has(productNo)) continue;
    seen.add(productNo);

    const productName = productNameMap.get(productNo) ?? '';
    const category = inferMainGroup(productName, productNo) || '未分類';

    const releaseDateRaw = releaseDateMap.get(productNo) ?? '';
    let releaseDate: string | undefined;
    if (releaseDateRaw) {
      const m = releaseDateRaw.match(/^(\d{4})(\d{2})(\d{2})/);
      if (m) releaseDate = `${m[1]}-${m[2]}-${m[3]}`;
    }

    let status: string;
    let nextAction: string;
    if (noMaterialSet.has(productNo)) {
      status = '素材未取得';
      nextAction = '素材補完';
    } else if (noCaptionSet.has(productNo) || noSpecSet.has(productNo)) {
      status = '補完未取得';
      nextAction = '素材補完';
    } else {
      status = '登録準備OK';
      nextAction = 'CSV出力';
    }

    let imageUrl: string | undefined;
    if (imageUrlMap) {
      imageUrl = imageUrlMap.byProductNo[productNo];
      if (!imageUrl) {
        // fall back to first SKU-level image for this productNo
        for (const r of rows) {
          const pno = r.productNo || rv(r.rawData, colMap.productNo);
          if (pno !== productNo) continue;
          const sku = normalizeSku(r.skuNo || rv(r.rawData, colMap.skuNo));
          if (sku && imageUrlMap.bySkuCode[sku]) { imageUrl = imageUrlMap.bySkuCode[sku]; break; }
        }
      }
    }

    products.push({
      productNo,
      productName,
      category,
      releaseDate,
      skuCount: skuCounts.get(productNo),
      ecStock: null,
      recentSales: null,
      sellThroughRate: null,
      status,
      nextAction,
      imageUrl,
    });
  }

  return products;
}

function reviewRowsToMdVariations(
  rows: ReviewRow[],
  colMap: ColMap,
  releaseDateMap: Map<string, string>,
  supplementAlerts: SupplementAlerts,
  imageUrlMap?: ImageUrlMap,
): MdVariation[] {
  const noMaterialSet = new Set(supplementAlerts.noMaterial);
  const noCaptionSet = new Set(supplementAlerts.noCaption);
  const noSpecSet = new Set([...supplementAlerts.noSpec, ...supplementAlerts.specNoRows]);
  const variations: MdVariation[] = [];

  for (const r of rows) {
    const productNo = r.productNo || rv(r.rawData, colMap.productNo);
    if (!productNo || isExcludedProductNo(productNo)) continue;
    const skuCode = r.skuNo || rv(r.rawData, colMap.skuNo);
    if (!skuCode) continue;

    const productName = rv(r.rawData, colMap.productName);
    const color = colMap.colorDisplay ? (rv(r.rawData, colMap.colorDisplay) || undefined) : undefined;
    const size  = colMap.sizeName    ? (rv(r.rawData, colMap.sizeName)    || undefined) : undefined;
    const category = inferMainGroup(productName, productNo) || '未分類';

    const releaseDateRaw = releaseDateMap.get(productNo) ?? '';
    let releaseDate: string | undefined;
    if (releaseDateRaw) {
      const m = releaseDateRaw.match(/^(\d{4})(\d{2})(\d{2})/);
      if (m) releaseDate = `${m[1]}-${m[2]}-${m[3]}`;
    }

    let status: string;
    let nextAction: string;
    if (noMaterialSet.has(productNo)) {
      status = '素材未取得'; nextAction = '素材補完';
    } else if (noCaptionSet.has(productNo) || noSpecSet.has(productNo)) {
      status = '補完未取得'; nextAction = '素材補完';
    } else {
      status = '登録準備OK'; nextAction = 'CSV出力';
    }

    const normalizedSku = normalizeSku(skuCode);
    const imageUrl = imageUrlMap
      ? (imageUrlMap.bySkuCode[normalizedSku] ?? imageUrlMap.byProductNo[productNo])
      : undefined;

    variations.push({
      productNo, productName, skuCode, color, size, category, releaseDate,
      status, nextAction, ecStock: null, recentSales: null, sellThroughRate: null,
      imageUrl,
    });
  }

  return variations;
}

// ── Main component ────────────────────────────────────────────────────────────

type ImportTabProps = { user: User | null; onSendToProducts?: (products: MdProduct[], variations: MdVariation[]) => void };

export function ImportTab({ user, onSendToProducts }: ImportTabProps) {
  const { skus: existingSkus } = useFsProducts(user); // refresh: Phase 1で復活

  const [step, setStep] = useState<Step>('upload');
  const [columnsSkipped, setColumnsSkipped] = useState(false);
  const [filename, setFilename] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<ParsedSheet | null>(null);
  const [colMap, setColMap] = useState<ColMap>(EMPTY_COLMAP);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const saving = false; // Phase 1で useState に変更予定
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNew, setSavedNew] = useState(0);
  const [savedDiff, setSavedDiff] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  const [captionMap, setCaptionMap] = useState<Map<string, string>>(new Map());
  const [specMap, setSpecMap] = useState<Map<string, SpecData>>(new Map());
  const [materialMap, setMaterialMap] = useState<Map<string, string>>(
    () => new Map(Object.entries(SWATCH_MATERIAL_DEFAULT)),
  );
  const [manualMaterialMap, setManualMaterialMap] = useState<Map<string, string>>(new Map());

  // Manual entries take highest priority over materialMap (SWATCH_MATERIAL_DEFAULT + xlsx upload)
  const mergedMaterialMap = useMemo(() => {
    const m = new Map(materialMap);
    for (const [k, v] of manualMaterialMap) {
      if (v.trim()) m.set(k, v.trim());
    }
    return m;
  }, [materialMap, manualMaterialMap]);
  const [captionFilename, setCaptionFilename] = useState('');
  const [specFilename, setSpecFilename] = useState('');
  const [materialFilename, setMaterialFilename] = useState('');
  const [swatchFilename, setSwatchFilename] = useState('');
  const [captionLoading, setCaptionLoading] = useState(false);
  const [specLoading, setSpecLoading] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [swatchLoading, setSwatchLoading] = useState(false);
  const [releaseDateParseResult, setReleaseDateParseResult] = useState<ReleaseDateParseResult | null>(null);
  const [mdFilename, setMdFilename] = useState('');
  const [mdLoading, setMdLoading] = useState(false);

  // Image URL import state
  const [imageUrlMap, setImageUrlMap] = useState<ImageUrlMap>(EMPTY_IMAGE_URL_MAP);
  const [imageUrlFilename, setImageUrlFilename] = useState('');
  const [imageUrlLoading, setImageUrlLoading] = useState(false);
  const [imageUrlImportedAt, setImageUrlImportedAt] = useState('');
  const [imageUrlSkuCount, setImageUrlSkuCount] = useState(0);
  const [imageUrlProductCount, setImageUrlProductCount] = useState(0);
  const [imageUrlSkipCount, setImageUrlSkipCount] = useState(0);
  const [imageUrlWarningCount, setImageUrlWarningCount] = useState(0);

  // localStorage: import state and history
  const [savedState, setSavedState] = useState<ImportSavedState | null>(() => loadImportStateFromStorage());
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>(() => loadImportHistoryFromStorage());

  const skuMap = new Map(existingSkus.map((s) => [s.skuNo, s.rawData]));

  // Build releaseDateMap: productNo → saleStartDate
  // Phase 1: productDateMap when MD has 7-digit product nos (direct lookup).
  // Phase 2: when MD has only week labels, cross-reference via SKU '納期' column.
  const releaseDateMap = useMemo<Map<string, string>>(() => {
    if (!releaseDateParseResult) return new Map();
    const { productDateMap, weekDateMap, hasProductNos, sheetNames, detectedProductNos, detectedWeekLabels } = releaseDateParseResult;
    console.log('[MD解析] シート:', sheetNames);
    console.log('[MD解析] 週ラベル数:', detectedWeekLabels.length, detectedWeekLabels);
    console.log('[MD解析] 7桁品番数:', detectedProductNos.length, detectedProductNos.slice(0, 10));
    console.log('[MD解析] hasProductNos:', hasProductNos);
    if (hasProductNos) {
      console.log('[販売期間From] productDateMap:', [...productDateMap.entries()]);
      return productDateMap;
    }
    // No product numbers in MD — try cross-reference via SKU '納期' column
    if (weekDateMap.size === 0 || reviewRows.length === 0) {
      console.log('[販売期間From] MD表に品番なし・週マップ空 → 自動入力停止');
      return new Map();
    }
    const crossMap = new Map<string, string>();
    const seenPno = new Set<string>();
    for (const r of reviewRows) {
      const productNo = r.productNo.trim();
      if (!productNo || seenPno.has(productNo) || isExcludedProductNo(productNo)) continue;
      seenPno.add(productNo);
      const weekLabel = (r.rawData['納期'] ?? '').trim();
      if (!weekLabel) continue;
      const date = weekDateMap.get(weekLabel);
      if (date) crossMap.set(productNo, date);
    }
    console.log(`[販売期間From] SKU×MD cross-ref: ${crossMap.size}件マッチ`, [...crossMap.entries()]);
    return crossMap;
  }, [releaseDateParseResult, reviewRows]);

  const supplementAlerts = useMemo(
    () => computeSupplementAlerts(reviewRows, colMap, captionMap, specMap, mergedMaterialMap, releaseDateMap, releaseDateParseResult),
    [reviewRows, colMap, captionMap, specMap, mergedMaterialMap, releaseDateMap, releaseDateParseResult],
  );

  // Products to show in ManualMaterialPanel:
  // union of currently-missing + already-entered (so entered rows remain editable)
  const manualMaterialNos = useMemo(() => {
    const nos = new Set(supplementAlerts.noMaterial);
    for (const k of manualMaterialMap.keys()) nos.add(k);
    return [...nos];
  }, [supplementAlerts.noMaterial, manualMaterialMap]);

  const handleSetManualMaterial = useCallback((productNo: string, text: string) => {
    setManualMaterialMap((prev) => {
      const next = new Map(prev);
      if (text.trim()) next.set(productNo, text);
      else next.delete(productNo);
      return next;
    });
  }, []);

  const handleDownloadManualMaterial = () =>
    downloadCsv('手動補完素材.csv', generateManualMaterialCsv(manualMaterialMap, reviewRows, colMap));

  const handleImportManualMaterial = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseManualMaterialCsv(text);
      if (parsed.size === 0) return;
      setManualMaterialMap((prev) => {
        const next = new Map(prev);
        for (const [k, v] of parsed) next.set(k, v);
        return next;
      });
    } catch {
      // silent — supplement is optional
    }
  };

  const handleClearManualMaterial = () => {
    if (!window.confirm('手動補完した素材をすべてクリアします。よろしいですか？')) return;
    setManualMaterialMap(new Map());
  };

  const handleFile = async (file: File) => {
    setParseLoading(true);
    setParseError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });

      const parsed: ParsedSheet[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const raw = XLSX.utils.sheet_to_json(ws, {
          header: 1, defval: '', raw: false,
        }) as string[][];
        if (raw.length === 0) return { name, headers: [], rows: [], kind: 'unknown' as SheetKind };

        const headerRowIdx = detectHeaderRow(raw);
        const dedupedHeaders = deduplicateHeaders(raw[headerRowIdx].map(String));
        const namedCols = dedupedHeaders.map((h, i) => ({ h, i })).filter(({ h }) => h);
        const headers = namedCols.map(({ h }) => h);
        const rows = raw
          .slice(headerRowIdx + 1)
          .filter((r) => r.some((c) => String(c).trim()))
          .map((r) => Object.fromEntries(namedCols.map(({ h, i }) => [h, String(r[i] ?? '').trim()])));

        return { name, headers, rows, kind: classifySheetKind(name, headers) };
      });

      setFilename(file.name);
      setSheets(parsed);
      setSelectedSheet(null);
      setColMap(EMPTY_COLMAP);
      setStep('sheet');
    } catch {
      setParseError('ファイルの解析に失敗しました。Excel / CSV ファイルをご確認ください。');
    } finally {
      setParseLoading(false);
    }
  };

  const handleCaptionFile = async (file: File) => {
    setCaptionLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      setCaptionMap(await parseCaptionFile(buffer));
      setCaptionFilename(file.name);
    } catch {
      // silent — supplement is optional
    } finally {
      setCaptionLoading(false);
    }
  };

  const handleSpecFile = async (file: File) => {
    setSpecLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      setSpecMap(await parseSpecFile(buffer));
      setSpecFilename(file.name);
    } catch {
      // silent — supplement is optional
    } finally {
      setSpecLoading(false);
    }
  };

  const handleMaterialFile = async (file: File) => {
    setMaterialLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      setMaterialMap(await parseMaterialXlsx(buffer));
      setMaterialFilename(file.name);
    } catch {
      // silent — supplement is optional
    } finally {
      setMaterialLoading(false);
    }
  };

  const handleSwatchFile = async (file: File) => {
    setSwatchLoading(true);
    try {
      // PDF: just track filename; SWATCH_MATERIAL_DEFAULT already provides defaults
      setSwatchFilename(file.name);
    } catch {
      // silent
    } finally {
      setSwatchLoading(false);
    }
  };

  const handleMdFile = async (file: File) => {
    setMdLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      setReleaseDateParseResult(await parseReleaseDateFile(buffer));
      setMdFilename(file.name);
    } catch {
      // silent — supplement is optional
    } finally {
      setMdLoading(false);
    }
  };

  const handleImageUrlFile = async (file: File) => {
    setImageUrlLoading(true);
    try {
      const result = await parseImageUrlFile(file);
      setImageUrlMap(result.map);
      setImageUrlFilename(file.name);
      setImageUrlImportedAt(new Date().toLocaleString('ja-JP'));
      setImageUrlSkuCount(result.skuCount);
      setImageUrlProductCount(result.productCount);
      setImageUrlSkipCount(result.skipCount);
      setImageUrlWarningCount(result.warningCount);
    } catch {
      // silent — image URL import is optional
    } finally {
      setImageUrlLoading(false);
    }
  };

  // Keep importState in sync as supplement files are loaded during review step
  useEffect(() => {
    if (step !== 'review' || reviewRows.length === 0) return;
    const state: ImportSavedState = {
      filename,
      savedAt: new Date().toISOString(),
      skuCount: countValidSkus(reviewRows, colMap),
      productCount: countUniqueProducts(reviewRows, colMap),
      reviewRows,
      colMap,
      captionFilename,
      specFilename,
      materialFilename,
      mdFilename,
      captionMapData: Object.fromEntries(captionMap),
      specMapData: Object.fromEntries(specMap),
      materialMapData: Object.fromEntries(mergedMaterialMap),
      releaseDateMapData: Object.fromEntries(releaseDateMap),
      imageUrlFilename,
      imageUrlImportedAt,
      imageUrlMapData: imageUrlFilename ? imageUrlMap : undefined,
      imageUrlSkuCount,
      imageUrlProductCount,
      imageUrlSkipCount,
      imageUrlWarningCount,
    };
    saveImportStateToStorage(state);
    setSavedState(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, captionFilename, specFilename, materialFilename, mdFilename,
      captionMap, specMap, mergedMaterialMap, releaseDateMap,
      imageUrlFilename, imageUrlMap, imageUrlSkuCount, imageUrlProductCount,
      imageUrlSkipCount, imageUrlWarningCount]);

  const commitToReview = (rows: ReviewRow[], map: ColMap, fname: string) => {
    const skuCount = countValidSkus(rows, map);
    const productCount = countUniqueProducts(rows, map);
    const state: ImportSavedState = {
      filename: fname,
      savedAt: new Date().toISOString(),
      skuCount,
      productCount,
      reviewRows: rows,
      colMap: map,
      captionFilename,
      specFilename,
      materialFilename,
      mdFilename,
      // Supplement maps may be empty at this point; useEffect keeps them updated
      captionMapData: Object.fromEntries(captionMap),
      specMapData: Object.fromEntries(specMap),
      materialMapData: Object.fromEntries(mergedMaterialMap),
      releaseDateMapData: Object.fromEntries(releaseDateMap),
      imageUrlFilename,
      imageUrlImportedAt,
      imageUrlMapData: imageUrlFilename ? imageUrlMap : undefined,
      imageUrlSkuCount,
      imageUrlProductCount,
      imageUrlSkipCount,
      imageUrlWarningCount,
    };
    saveImportStateToStorage(state);
    setSavedState(state);

    // Add to history (no skuRows — history now uses savedState for CSV export)
    const newEntry: ImportHistoryEntry = {
      id: Date.now().toString(),
      datetime: new Date().toLocaleString('ja-JP'),
      filename: fname,
      skuCount,
      productCount,
      status: '取込済み',
    };
    const updated = [newEntry, ...importHistory].slice(0, MAX_HISTORY);
    setImportHistory(updated);
    saveImportHistoryToStorage(updated);
  };

  const handleToColumnsOrReview = () => {
    if (!selectedSheet) return;
    const autoMap = autoDetect(selectedSheet.headers);
    setColMap(autoMap);
    const canAutoSkip = Boolean(autoMap.skuNo || autoMap.productNo);
    if (canAutoSkip) {
      setColumnsSkipped(true);
      const rows = classifyRows(selectedSheet.rows, autoMap, skuMap);
      setReviewRows(rows);
      commitToReview(rows, autoMap, filename);
      setStep('review');
    } else {
      setColumnsSkipped(false);
      setStep('columns');
    }
  };

  const handleToReview = () => {
    if (!selectedSheet) return;
    const rows = classifyRows(selectedSheet.rows, colMap, skuMap);
    setReviewRows(rows);
    commitToReview(rows, colMap, filename);
    setStep('review');
  };

  const handleResume = () => {
    if (!savedState || savedState.reviewRows.length === 0) return;
    setFilename(savedState.filename);
    setColMap(savedState.colMap);
    setReviewRows(savedState.reviewRows);
    setColumnsSkipped(true);
    setCaptionFilename(savedState.captionFilename || '');
    setSpecFilename(savedState.specFilename || '');
    setMaterialFilename(savedState.materialFilename || '');
    setMdFilename(savedState.mdFilename || '');
    // Restore supplement maps
    if (savedState.captionMapData) {
      setCaptionMap(new Map(Object.entries(savedState.captionMapData)));
    }
    if (savedState.specMapData) {
      setSpecMap(new Map(Object.entries(savedState.specMapData)));
    }
    if (savedState.materialMapData && Object.keys(savedState.materialMapData).length > 0) {
      setMaterialMap(new Map(Object.entries(savedState.materialMapData)));
    }
    if (savedState.releaseDateMapData && Object.keys(savedState.releaseDateMapData).length > 0) {
      // Synthesize a ReleaseDateParseResult so the useMemo returns the saved map directly
      setReleaseDateParseResult({
        productDateMap: new Map(Object.entries(savedState.releaseDateMapData)),
        weekDateMap: new Map(),
        hasProductNos: true,
        sheetNames: [],
        detectedProductNos: [],
        detectedWeekLabels: [],
      });
    }
    // Restore image URL state
    if (savedState.imageUrlFilename) {
      setImageUrlFilename(savedState.imageUrlFilename);
      setImageUrlImportedAt(savedState.imageUrlImportedAt ?? '');
      setImageUrlMap(savedState.imageUrlMapData ?? EMPTY_IMAGE_URL_MAP);
      setImageUrlSkuCount(savedState.imageUrlSkuCount ?? 0);
      setImageUrlProductCount(savedState.imageUrlProductCount ?? 0);
      setImageUrlSkipCount(savedState.imageUrlSkipCount ?? 0);
      setImageUrlWarningCount(savedState.imageUrlWarningCount ?? 0);
    }
    setStep('review');
  };

  const handleToggle = (idx: number) =>
    setReviewRows((prev) => prev.map((r) => r.idx === idx ? { ...r, selected: !r.selected } : r));

  const handleToggleAll = (v: boolean) =>
    setReviewRows((prev) => prev.map((r) => ({ ...r, selected: v })));

  // When some rows are checked → export only selected. When 0 checked → export all.
  const effectiveRows = useMemo(() => {
    const selectedCount = reviewRows.filter((r) => r.selected).length;
    return selectedCount > 0
      ? reviewRows
      : reviewRows.map((r) => ({ ...r, selected: true }));
  }, [reviewRows]);

  const handleDownloadCcGoods = () =>
    downloadCsv('ccGoods.csv', generateCcGoodsCsv(effectiveRows, colMap, captionMap, specMap, mergedMaterialMap, releaseDateMap));

  const handleDownloadVariation = () =>
    downloadCsv('goodsVariationDetail.csv', generateVariationDetailCsv(effectiveRows, colMap));

  const handleDownloadCategory = () =>
    downloadShiftJisCsv('category.csv', generateCategoryCsv(effectiveRows, colMap));

  const handleDownloadMissingSupplements = () =>
    downloadCsv('補完未取得.csv', generateMissingSupplementsCsv(supplementAlerts, reviewRows, colMap));

  const hasMissingSupplements =
    supplementAlerts.noCaption.length > 0 ||
    supplementAlerts.noSpec.length > 0 ||
    supplementAlerts.specNoRows.length > 0 ||
    supplementAlerts.noMaterial.length > 0 ||
    supplementAlerts.noReleaseDate.length > 0;

  // CSV出力は「有効SKU行が1件以上あるか」で制御する。
  // EXCLUDED_PRODUCT_NOS（ノベルティ等）は除外対象のため有効行に含めない。
  const hasValidRows = useMemo(
    () => reviewRows.some((r) => {
      const productNo = r.productNo || rv(r.rawData, colMap.productNo);
      return (productNo && !isExcludedProductNo(productNo)) || Boolean(r.skuNo);
    }),
    [reviewRows, colMap],
  );

  const selectedCount = useMemo(
    () => reviewRows.filter((r) => r.selected).length,
    [reviewRows],
  );

  const manualCount = useMemo(
    () => [...manualMaterialMap.values()].filter((v) => v.trim()).length,
    [manualMaterialMap],
  );

  const handleSendToProducts = useCallback(() => {
    if (!onSendToProducts) return;
    const imgMap = imageUrlFilename ? imageUrlMap : undefined;
    const products  = reviewRowsToMdProducts(reviewRows, colMap, releaseDateMap, supplementAlerts, imgMap);
    const variations = reviewRowsToMdVariations(reviewRows, colMap, releaseDateMap, supplementAlerts, imgMap);
    onSendToProducts(products, variations);
    setSentCount(products.length);
    // Update history status to '商品一覧反映済み'
    setImportHistory((prev) => {
      if (prev.length === 0) return prev;
      const updated = [{ ...prev[0], status: '商品一覧反映済み' as const }, ...prev.slice(1)];
      saveImportHistoryToStorage(updated);
      return updated;
    });
  }, [onSendToProducts, reviewRows, colMap, releaseDateMap, supplementAlerts, imageUrlMap, imageUrlFilename]);

  // Phase 1: DB保存ロジックはここに実装予定（git履歴 commit fb4824d 参照）

  const handleReset = () => {
    setStep('upload');
    setColumnsSkipped(false);
    setFilename('');
    setSheets([]);
    setSelectedSheet(null);
    setColMap(EMPTY_COLMAP);
    setReviewRows([]);
    setSavedNew(0);
    setSavedDiff(0);
    setParseError(null);
    setSaveError(null);
    setCaptionMap(new Map());
    setSpecMap(new Map());
    setMaterialMap(new Map(Object.entries(SWATCH_MATERIAL_DEFAULT)));
    setManualMaterialMap(new Map());
    setCaptionFilename('');
    setSpecFilename('');
    setMaterialFilename('');
    setSwatchFilename('');
    setMdFilename('');
    // Clear saved state to show fresh upload
    localStorage.removeItem(IMPORT_STATE_KEY);
    setSavedState(null);
  };

  const activeSteps = columnsSkipped ? STEPS_SKIP : STEPS_FULL;

  return (
    <div className={styles.wrapper}>
      {step !== 'done' && <StepIndicator steps={activeSteps} current={step} />}

      {step === 'upload' && (
        <>
          <UploadStep
            onFile={handleFile}
            loading={parseLoading}
            error={parseError}
            savedState={savedState}
            onResume={handleResume}
          />
          <ImportHistorySection
            history={importHistory}
            savedState={savedState}
            onClear={() => {
              setImportHistory([]);
              saveImportHistoryToStorage([]);
            }}
          />
        </>
      )}

      {step === 'sheet' && (
        <SheetStep
          filename={filename}
          sheets={sheets}
          selected={selectedSheet}
          onSelect={setSelectedSheet}
          onNext={handleToColumnsOrReview}
        />
      )}

      {step === 'columns' && selectedSheet && (
        <ColumnStep
          sheet={selectedSheet}
          colMap={colMap}
          onChange={setColMap}
          onBack={() => setStep('sheet')}
          onNext={handleToReview}
        />
      )}

      {step === 'review' && (
        <>
          <PageHeaderCard />
          <FileIntakeCard
            skuFilename={filename}
            skuCount={countValidSkus(reviewRows, colMap)}
            captionFilename={captionFilename}
            specFilename={specFilename}
            materialFilename={materialFilename}
            mdFilename={mdFilename}
            swatchFilename={swatchFilename}
            imageUrlFilename={imageUrlFilename}
            imageUrlSkuCount={imageUrlSkuCount}
            imageUrlProductCount={imageUrlProductCount}
            imageUrlSkipCount={imageUrlSkipCount}
            imageUrlWarningCount={imageUrlWarningCount}
            captionLoading={captionLoading}
            specLoading={specLoading}
            materialLoading={materialLoading}
            mdLoading={mdLoading}
            swatchLoading={swatchLoading}
            imageUrlLoading={imageUrlLoading}
            onCaptionFile={handleCaptionFile}
            onSpecFile={handleSpecFile}
            onMaterialFile={handleMaterialFile}
            onMdFile={handleMdFile}
            onSwatchFile={handleSwatchFile}
            onImageUrlFile={handleImageUrlFile}
            onGoToColumns={() => setStep('columns')}
          />
          <SupplementStatusCard alerts={supplementAlerts} />
          <CsvOutputCard
            hasValidRows={hasValidRows}
            selectedCount={selectedCount}
            manualCount={manualCount}
            hasMissingSupplements={hasMissingSupplements}
            sentCount={sentCount}
            onDownloadCcGoods={handleDownloadCcGoods}
            onDownloadVariation={handleDownloadVariation}
            onDownloadCategory={handleDownloadCategory}
            onDownloadMissingSupplements={handleDownloadMissingSupplements}
            onDownloadManualMaterial={handleDownloadManualMaterial}
            onSendToProducts={handleSendToProducts}
          />
          {manualMaterialNos.length > 0 && (
            <ManualMaterialPanel
              productNos={manualMaterialNos}
              reviewRows={reviewRows}
              colMap={colMap}
              manualMaterialMap={manualMaterialMap}
              noMaterialCount={supplementAlerts.noMaterial.length}
              onSetMaterial={handleSetManualMaterial}
              onImportManual={handleImportManualMaterial}
              onClearManual={handleClearManualMaterial}
            />
          )}
          <ReviewStep
            rows={reviewRows}
            colMap={colMap}
            saving={saving}
            error={saveError}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            onBack={() => setStep(columnsSkipped ? 'sheet' : 'columns')}
          />
          <ImportHistorySection
            history={importHistory}
            savedState={savedState}
            onClear={() => {
              setImportHistory([]);
              saveImportHistoryToStorage([]);
            }}
          />
        </>
      )}

      {step === 'done' && (
        <DoneStep
          newCount={savedNew}
          diffCount={savedDiff}
          onReset={handleReset}
          onDownloadCcGoods={handleDownloadCcGoods}
          onDownloadVariation={handleDownloadVariation}
          onDownloadCategory={handleDownloadCategory}
        />
      )}

      <FsImportSection onSendToProducts={onSendToProducts} />
    </div>
  );
}
