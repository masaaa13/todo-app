import { useState, useRef, useCallback, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useFsProducts } from '../hooks/useFsProducts';
import type { ImportRowStatus } from '../types/importJob';
import { IMPORT_ROW_STATUS_LABELS } from '../types/importJob';
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

type SupplementAlerts = {
  totalProducts: number;
  noCaption: string[];
  noSpec: string[];
  noMaterial: string[];
  specNoRows: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_COLMAP: ColMap = {
  productNo: '', skuNo: '', urlCode: '',
  productName: '', price: '', janCode: '',
  colorDisplay: '', colorCode: '', sizeName: '', sizeCode: '',
};
const PREVIEW_ROWS = 5;
const MAX_PREVIEW_COLS = 10;
const STEP_ORDER: Step[] = ['upload', 'sheet', 'columns', 'review'];
const STEP_LABELS: Record<Step, string> = {
  upload: 'ファイル', sheet: 'シート選択',
  columns: '列設定', review: '確認・保存', done: '完了',
};
const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  sku: 'SKU', md: 'MD表・対象外', unknown: '不明',
};

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
    skuNo:        detectCol(headers, ['商品管理番号'], ['商品id', '管理番号', 'sku番号']),
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
  if (!spec || spec.sizeRows.length === 0) return '';

  // Remove columns where every size row has an empty value
  const activeCols = spec.measureNames
    .map((_, i) => i)
    .filter((i) => spec.sizeRows.some((row) => (row.values[i] ?? '').trim()));

  if (activeCols.length === 0) return '';

  const activeNames = activeCols.map((i) => spec.measureNames[i]);
  const formattedMaterial = formatMaterialText(material);
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
    setH('商品URLコード',       urlCode);
    setH('商品番号',            productNo);
    setH('商品名',              rv(r.rawData, colMap.productName));
    setH('本体価格',            rv(r.rawData, colMap.price).replace(/[^0-9.]/g, ''));
    setH('JANコード',           rv(r.rawData, colMap.janCode));
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

// ── SupplementCheck ───────────────────────────────────────────────────────────

function computeSupplementAlerts(
  rows: ReviewRow[],
  colMap: ColMap,
  captionMap: Map<string, string>,
  specMap: Map<string, SpecData>,
  materialMap: Map<string, string>,
): SupplementAlerts {
  if (!rows || rows.length === 0) {
    return { totalProducts: 0, noCaption: [], noSpec: [], noMaterial: [], specNoRows: [] };
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
  for (const p of products) {
    if (!(captionMap?.get(p) ?? '').trim()) noCaption.push(p);
    const spec = specMap?.get(p);
    if (!spec) {
      noSpec.push(p);
    } else if ((spec.sizeRows ?? []).length === 0) {
      specNoRows.push(p);
    }
    if (!(materialMap?.get(p) ?? '').trim()) noMaterial.push(p);
  }
  return { totalProducts: products.length, noCaption, noSpec, noMaterial, specNoRows };
}

const MAX_ALERT_DISPLAY = 20;

function SupplementCheckPanel({ alerts }: { alerts: SupplementAlerts }) {
  const { totalProducts, noCaption, noSpec, noMaterial, specNoRows } = alerts;

  const warnItems = [
    { label: 'キャプション未取得', items: noCaption },
    { label: '企画寸未取得', items: noSpec },
    { label: '素材未取得', items: noMaterial },
    { label: '企画寸のサイズ行なし', items: specNoRows },
  ].filter(({ items }) => items.length > 0);

  return (
    <div className={styles.supplementCheck}>
      <div className={styles.supplementCheckTitle}>補完チェック</div>
      <div className={styles.supplementCheckStats}>
        <span>対象品番: {totalProducts}</span>
        <span>説明あり: {totalProducts - noCaption.length} / {totalProducts}</span>
        <span>企画寸あり: {totalProducts - noSpec.length - specNoRows.length} / {totalProducts}</span>
        <span>素材あり: {totalProducts - noMaterial.length} / {totalProducts}</span>
      </div>
      {warnItems.length === 0 ? (
        <div className={styles.supplementCheckOk}>チェックOK — 全項目揃っています</div>
      ) : (
        <div className={styles.supplementAlertList}>
          {warnItems.map(({ label, items }) => {
            const shown = items.slice(0, MAX_ALERT_DISPLAY);
            const rest = items.length - shown.length;
            return (
              <div key={label} className={styles.supplementAlert}>
                <span className={styles.supplementAlertLabel}>⚠ {label}: {items.length}件</span>
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

// ── SupplementPanel ───────────────────────────────────────────────────────────

type SupplementSlotProps = {
  label: string;
  hint: string;
  accept?: string;
  filename: string;
  loading: boolean;
  onFile: (file: File) => Promise<void>;
};

function SupplementSlot({ label, hint, accept = '.xlsx,.xls', filename, loading, onFile }: SupplementSlotProps) {
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

type SupplementPanelProps = {
  captionFilename: string;
  specFilename: string;
  materialFilename: string;
  captionLoading: boolean;
  specLoading: boolean;
  materialLoading: boolean;
  onCaptionFile: (file: File) => Promise<void>;
  onSpecFile: (file: File) => Promise<void>;
  onMaterialFile: (file: File) => Promise<void>;
};

function SupplementPanel({
  captionFilename, specFilename, materialFilename,
  captionLoading, specLoading, materialLoading,
  onCaptionFile, onSpecFile, onMaterialFile,
}: SupplementPanelProps) {
  return (
    <div className={styles.supplementPanel}>
      <div className={styles.supplementTitle}>補完ファイル（任意）</div>
      <div className={styles.supplementSlots}>
        <SupplementSlot
          label="商品説明（大）"
          hint="caption.xlsx をドロップ"
          filename={captionFilename}
          loading={captionLoading}
          onFile={onCaptionFile}
        />
        <SupplementSlot
          label="独自コメント（3） 企画寸"
          hint="design_spec.xlsx をドロップ"
          filename={specFilename}
          loading={specLoading}
          onFile={onSpecFile}
        />
        <SupplementSlot
          label="独自コメント（3）素材"
          hint="swatch.pdf / 素材上書き.xlsx をドロップ"
          accept=".xlsx,.xls,.csv,.pdf,application/pdf"
          filename={materialFilename}
          loading={materialLoading}
          onFile={onMaterialFile}
        />
      </div>
    </div>
  );
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <div className={styles.stepIndicator}>
      {STEP_ORDER.map((s, i) => (
        <div
          key={s}
          className={styles.stepItem}
          data-active={current === s || undefined}
          data-done={i < currentIdx || undefined}
        >
          <span className={styles.stepNum}>{i + 1}</span>
          <span className={styles.stepLabel}>{STEP_LABELS[s]}</span>
        </div>
      ))}
    </div>
  );
}

// ── UploadStep ────────────────────────────────────────────────────────────────

type UploadStepProps = { onFile: (file: File) => Promise<void>; loading: boolean; error: string | null };

function UploadStep({ onFile, loading, error }: UploadStepProps) {
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
      aria-label="Excelファイルをアップロード"
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
        {loading ? 'Excelを解析中...' : 'ファイルをドロップ、またはクリックして選択'}
      </div>
      <div className={styles.uploadHint}>.xlsx / .xls / .csv に対応</div>
      {error && <div className={styles.uploadError} role="alert">{error}</div>}
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
              <button className={styles.nextBtn} onClick={onNext}>列設定へ →</button>
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
  onSave: () => void;
  onDownloadCcGoods: () => void;
  onDownloadVariation: () => void;
};

function ReviewStep({
  rows, colMap, saving, error,
  onToggle, onToggleAll, onBack, onSave,
  onDownloadCcGoods, onDownloadVariation,
}: ReviewStepProps) {
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
    <div>
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
        <div className={styles.csvBtnGroup}>
          <button className={styles.csvBtn} onClick={onDownloadCcGoods} disabled={counts.selected === 0}>
            ⬇ ccGoods.csv
          </button>
          <button className={styles.csvBtn} onClick={onDownloadVariation} disabled={counts.selected === 0}>
            ⬇ variationDetail.csv
          </button>
        </div>
        <button
          className={styles.saveBtn}
          onClick={onSave}
          disabled={saving || counts.selected === 0}
        >
          {saving ? '保存中...' : `${counts.selected} 件を取込む`}
        </button>
      </div>
    </div>
  );
}

// ── DoneStep ──────────────────────────────────────────────────────────────────

function DoneStep({ newCount, diffCount, onReset, onDownloadCcGoods, onDownloadVariation }: {
  newCount: number;
  diffCount: number;
  onReset: () => void;
  onDownloadCcGoods: () => void;
  onDownloadVariation: () => void;
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
      </div>
      <button className={styles.resetBtn} onClick={onReset}>別のファイルを取込む</button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ImportTabProps = { user: User | null };

export function ImportTab({ user }: ImportTabProps) {
  const { skus: existingSkus, refresh } = useFsProducts(user);

  const [step, setStep] = useState<Step>('upload');
  const [filename, setFilename] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<ParsedSheet | null>(null);
  const [colMap, setColMap] = useState<ColMap>(EMPTY_COLMAP);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNew, setSavedNew] = useState(0);
  const [savedDiff, setSavedDiff] = useState(0);

  const [captionMap, setCaptionMap] = useState<Map<string, string>>(new Map());
  const [specMap, setSpecMap] = useState<Map<string, SpecData>>(new Map());
  const [materialMap, setMaterialMap] = useState<Map<string, string>>(
    () => new Map(Object.entries(SWATCH_MATERIAL_DEFAULT)),
  );
  const [captionFilename, setCaptionFilename] = useState('');
  const [specFilename, setSpecFilename] = useState('');
  const [materialFilename, setMaterialFilename] = useState('');
  const [captionLoading, setCaptionLoading] = useState(false);
  const [specLoading, setSpecLoading] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);

  const skuMap = new Map(existingSkus.map((s) => [s.skuNo, s.rawData]));

  const supplementAlerts = useMemo(
    () => computeSupplementAlerts(reviewRows, colMap, captionMap, specMap, materialMap),
    [reviewRows, colMap, captionMap, specMap, materialMap],
  );

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
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        // PDF: just show filename; SWATCH_MATERIAL_DEFAULT already loaded as initial state
        setMaterialFilename(file.name);
      } else {
        const buffer = await file.arrayBuffer();
        setMaterialMap(await parseMaterialXlsx(buffer));
        setMaterialFilename(file.name);
      }
    } catch {
      // silent — supplement is optional
    } finally {
      setMaterialLoading(false);
    }
  };

  const handleToColumns = () => {
    if (!selectedSheet) return;
    setColMap(autoDetect(selectedSheet.headers));
    setStep('columns');
  };

  const handleToReview = () => {
    if (!selectedSheet) return;
    setReviewRows(classifyRows(selectedSheet.rows, colMap, skuMap));
    setStep('review');
  };

  const handleToggle = (idx: number) =>
    setReviewRows((prev) => prev.map((r) => r.idx === idx ? { ...r, selected: !r.selected } : r));

  const handleToggleAll = (v: boolean) =>
    setReviewRows((prev) => prev.map((r) => ({ ...r, selected: v })));

  const handleDownloadCcGoods = () =>
    downloadCsv('ccGoods.csv', generateCcGoodsCsv(reviewRows, colMap, captionMap, specMap, materialMap));

  const handleDownloadVariation = () =>
    downloadCsv('goodsVariationDetail.csv', generateVariationDetailCsv(reviewRows, colMap));

  const handleSave = async () => {
    if (!supabase || !user) return;
    setSaving(true);
    setSaveError(null);

    const selected = reviewRows.filter((r) => r.selected);
    const now = new Date().toISOString();

    try {
      const { data: jobData, error: jobErr } = await supabase
        .from('import_jobs')
        .insert({
          user_id: user.id, filename,
          status: 'done',
          sheet_name: selectedSheet?.name ?? null,
          total_rows: reviewRows.length,
          new_count:       reviewRows.filter((r) => r.status === 'new').length,
          duplicate_count: reviewRows.filter((r) => r.status === 'duplicate').length,
          diff_count:      reviewRows.filter((r) => r.status === 'has_diff').length,
          imported_count: selected.length,
          created_at: now, updated_at: now,
        })
        .select('id')
        .single();
      if (jobErr) throw new Error(jobErr.message);

      const jobId = (jobData as { id: string }).id;

      const BATCH = 500;
      for (let i = 0; i < reviewRows.length; i += BATCH) {
        const batch = reviewRows.slice(i, i + BATCH).map((r) => ({
          job_id: jobId, user_id: user.id,
          sheet_name: selectedSheet?.name ?? '',
          row_index: r.idx,
          product_no: r.productNo || null,
          sku_no: r.skuNo || null,
          product_url_code: r.urlCode || null,
          raw_data: r.rawData,
          diff_data: r.diffKeys.length > 0
            ? Object.fromEntries(
                r.diffKeys.map((k) => [k, { old: skuMap.get(r.skuNo)?.[k] ?? '', new: r.rawData[k] ?? '' }])
              )
            : null,
          row_status: r.status,
          selected: r.selected,
          created_at: now,
        }));
        const { error: rowsErr } = await supabase.from('import_rows').insert(batch);
        if (rowsErr) throw new Error(rowsErr.message);
      }

      const toUpsert = selected.filter((r) => r.status === 'new' || r.status === 'has_diff');

      for (const r of toUpsert) {
        if (r.productNo) {
          await supabase.from('fs_products').upsert(
            {
              user_id: user.id,
              product_no: r.productNo,
              product_url_code: r.urlCode || null,
              name: rv(r.rawData, colMap.productName) || null,
              updated_at: now,
            },
            { onConflict: 'user_id,product_no' },
          );
        }

        if (r.skuNo) {
          let fsProductId: string | null = null;
          if (r.productNo) {
            const { data: pd } = await supabase
              .from('fs_products')
              .select('id')
              .eq('user_id', user.id)
              .eq('product_no', r.productNo)
              .maybeSingle();
            fsProductId = (pd as { id: string } | null)?.id ?? null;
          }
          await supabase.from('fs_product_skus').upsert(
            {
              user_id: user.id,
              fs_product_id: fsProductId,
              product_no: r.productNo || null,
              sku_no: r.skuNo,
              sku_name: rv(r.rawData, colMap.productName) || null,
              raw_data: r.rawData,
              updated_at: now,
            },
            { onConflict: 'user_id,sku_no' },
          );
        }
      }

      setSavedNew(toUpsert.filter((r) => r.status === 'new').length);
      setSavedDiff(toUpsert.filter((r) => r.status === 'has_diff').length);
      await refresh();
      setStep('done');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
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
    setCaptionFilename('');
    setSpecFilename('');
    setMaterialFilename('');
  };

  return (
    <div className={styles.wrapper}>
      {step !== 'done' && <StepIndicator current={step} />}

      {step === 'upload' && (
        <UploadStep onFile={handleFile} loading={parseLoading} error={parseError} />
      )}

      {step === 'sheet' && (
        <SheetStep
          filename={filename}
          sheets={sheets}
          selected={selectedSheet}
          onSelect={setSelectedSheet}
          onNext={handleToColumns}
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
          <SupplementPanel
            captionFilename={captionFilename}
            specFilename={specFilename}
            materialFilename={materialFilename}
            captionLoading={captionLoading}
            specLoading={specLoading}
            materialLoading={materialLoading}
            onCaptionFile={handleCaptionFile}
            onSpecFile={handleSpecFile}
            onMaterialFile={handleMaterialFile}
          />
          <SupplementCheckPanel alerts={supplementAlerts} />
          <ReviewStep
            rows={reviewRows}
            colMap={colMap}
            saving={saving}
            error={saveError}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            onBack={() => setStep('columns')}
            onSave={handleSave}
            onDownloadCcGoods={handleDownloadCcGoods}
            onDownloadVariation={handleDownloadVariation}
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
        />
      )}
    </div>
  );
}
