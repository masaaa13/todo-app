import { useState, useCallback } from 'react';
import type { MdProduct, MdVariation } from '../types/md';
import styles from './FsImportSection.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TYPES       = ['variation', 'image', 'comment', 'preorder', 'plannedStock'];
const MAX_FULL_SYNC_PAGES = 50;

// ── VPS response types ────────────────────────────────────────────────────────

type VpsVariation = {
  skuCode: string;
  colorBranchNo: string;
  colorName: string;
  sizeBranchNo: string;
  sizeName: string;
  janCode: string;
  stockCount: number | null;
  price?: number | null;
};

type VpsProduct = {
  productNo: string;
  url: string;
  uri: string;
  name: string;
  unitPrice: number | string;
  visible: boolean | string | null;
  imageUrl: string;
  imageList: Record<string, string>[];
  variations: VpsVariation[];
  hasPreorder: boolean;
  hasPlannedStock: boolean;
};

function normalizeVisible(value: unknown): boolean | null {
  if (value === true  || value === 'true')  return true;
  if (value === false || value === 'false') return false;
  return null;
}

type VpsResponse = {
  ok: boolean;
  products: VpsProduct[];
  productCount: number;
  totalCount: number;
  nextUrl?: string;
  warning?: string;
};

type VpsErrorResponse = {
  error?: string;
  upstreamStatus?: number;
  detail?: unknown;
};

function extractCursor(nextUrl: string): string | null {
  try { return new URL(nextUrl).searchParams.get('cursor'); }
  catch { return null; }
}

// ── Mode / types ──────────────────────────────────────────────────────────────

type Mode = 'manual' | 'fullSync';
type SyncVisibleFilter = 'all' | 'public' | 'private';

type SyncChangeLog = { productNo: string; changes: string[] };

type FullSyncResult = {
  totalFetched: number;
  newProducts: number;
  updatedProducts: number;
  skippedProducts: number;
  newSkus: number;
  updatedSkus: number;
  skippedSkus: number;
  pageCount: number;
  paginationStatus: 'complete' | 'limit_reached';
  changeLog: SyncChangeLog[];
};

type FullSyncState =
  | { phase: 'idle' }
  | { phase: 'loading'; page: number }
  | { phase: 'done'; result: FullSyncResult }
  | { phase: 'error'; message: string };

type SendResult = {
  added: number;
  updated: number;
  skipped: number;
  skuAdded: number;
  skuUpdated: number;
  skuSkipped: number;
  stockOk: boolean;
};

// ── Input parsing (manual mode) ───────────────────────────────────────────────

type ParsedInput = { valid: string[]; duplicates: number; invalid: string[] };

function parseInput(text: string): ParsedInput {
  const tokens = text.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  let duplicates = 0;
  const invalid: string[] = [];
  for (const token of tokens) {
    const digits = token.replace(/\D/g, '');
    if (digits.length === 7) {
      if (seen.has(digits)) { duplicates++; }
      else { seen.add(digits); valid.push(digits); }
    } else {
      if (!invalid.includes(token)) invalid.push(token);
    }
  }
  return { valid, duplicates, invalid };
}

// ── Category inference ────────────────────────────────────────────────────────

type GroupRule = { keywords: string[]; group: string };

const MAIN_GROUP_RULES: GroupRule[] = [
  { keywords: ['JUMPER SKIRT', 'ONE PIECE', 'ONE-PIECE', 'DRESS', 'BABYDOLL', 'BABY DOLL'], group: 'ONE PIECE' },
  { keywords: ['TOPS', 'L/S TEE', 'S/S TEE', 'TEE', 'CUTSEW', 'KNIT', 'CARDIGAN', 'SWEAT', 'HOODIE', 'BOLERO', 'BUSTIER', 'BRA'], group: 'TOPS' },
  { keywords: ['BLOUSE', 'BLOUSES', 'SHIRT'], group: 'SHIRTS-BLOUSE' },
  { keywords: ['SKIRT'], group: 'SKIRT' },
  { keywords: ['SHORT PANTS', 'SALOPETTE', 'DENIM', 'PANTS', 'DRAWERS'], group: 'PANTS' },
  { keywords: ['OUTER', 'BLOUSON', 'COAT', 'JACKET', 'MA-1'], group: 'JACKET-OUTER' },
  { keywords: ['HEAD DRESS', 'HAT', 'CAP', 'BONNET'], group: 'HAT' },
  { keywords: ['SNEAKERS', 'SANDALS', 'SHOES'], group: 'SHOES' },
  { keywords: ['SOCKS'], group: 'SOCKS' },
  { keywords: ['POUCH', 'BAG', 'ACCESSORIES', 'CHARM', 'KEY RING', 'UMBRELLA', 'NECK WARMER', 'SWIM WEAR', 'SWIMSUIT', 'RASH GUARD', 'HARNESS', 'BELT', 'MUFFLER', 'CARDCASE', 'BADGE'], group: 'GOODS' },
];

function nameIncludes(name: string, kw: string): boolean {
  const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(name);
}

function inferCategory(productName: string): string {
  if (/^【.+?】/.test(productName)) return 'COLLABORATION';
  for (const { keywords, group } of MAIN_GROUP_RULES) {
    if (keywords.some((kw) => nameIncludes(productName, kw))) return group;
  }
  return 'OTHER';
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const MD_PRODUCTS_KEY   = 'ecTodo.mdProducts';
const MD_VARIATIONS_KEY = 'ecTodo.mdVariations';

function loadExisting(): { products: MdProduct[]; variations: MdVariation[]; savedAt: string | null } {
  try {
    const rawP = localStorage.getItem(MD_PRODUCTS_KEY);
    const rawV = localStorage.getItem(MD_VARIATIONS_KEY);
    const parsedP = rawP ? (JSON.parse(rawP) as { products?: MdProduct[]; savedAt?: string }) : {};
    const parsedV = rawV ? (JSON.parse(rawV) as { variations?: MdVariation[] }) : {};
    return {
      products:   Array.isArray(parsedP.products)   ? parsedP.products   : [],
      variations: Array.isArray(parsedV.variations) ? parsedV.variations : [],
      savedAt:    typeof parsedP.savedAt === 'string' ? parsedP.savedAt : null,
    };
  } catch {
    return { products: [], variations: [], savedAt: null };
  }
}

// ── Conversion ────────────────────────────────────────────────────────────────

function unitPriceNum(p: VpsProduct): number | null {
  const n = Number(p.unitPrice);
  return isNaN(n) ? null : n;
}

function toMdProduct(p: VpsProduct): MdProduct {
  return {
    productNo:       String(p.productNo),
    productName:     p.name,
    category:        inferCategory(p.name),
    status:          'FutureShop取込済み',
    nextAction:      '商品確認',
    skuCount:        p.variations.length,
    imageUrl:        p.imageUrl || undefined,
    price:           unitPriceNum(p),
    productUrl:      p.uri,
    productUrlCode:  p.url,
    visible:         normalizeVisible(p.visible) ?? undefined,
    hasPreorder:     p.hasPreorder,
    hasPlannedStock: p.hasPlannedStock,
    importSource:    'futureshop',
  };
}

function toMdVariation(v: VpsVariation, p: VpsProduct): MdVariation {
  const stock    = v.stockCount ?? null;
  const varPrice = v.price != null ? Number(v.price) : unitPriceNum(p);
  return {
    productNo:       String(p.productNo),
    productName:     p.name,
    skuCode:         v.skuCode,
    color:           v.colorName || undefined,
    size:            v.sizeName  || undefined,
    category:        inferCategory(p.name),
    status:          'FutureShop取込済み',
    nextAction:      '在庫確認',
    imageUrl:        p.imageUrl || undefined,
    productUrl:      p.uri,
    colorBranchNo:   v.colorBranchNo || undefined,
    colorName:       v.colorName     || undefined,
    sizeBranchNo:    v.sizeBranchNo  || undefined,
    sizeName:        v.sizeName      || undefined,
    janCode:         v.janCode       || undefined,
    price:           isNaN(varPrice ?? NaN) ? null : varPrice,
    stockType:       'actual',
    actualStock:     stock,
    availableStock:  stock,
    ecStock:         stock,
    visible:         normalizeVisible(p.visible) ?? undefined,
    hasPreorder:     p.hasPreorder,
    hasPlannedStock: p.hasPlannedStock,
  };
}

// ── Smart merge ───────────────────────────────────────────────────────────────

const FS_PRODUCT_UPDATE_KEYS: (keyof MdProduct)[] = [
  'productName', 'category', 'imageUrl', 'price', 'productUrl', 'productUrlCode',
  'visible', 'hasPreorder', 'hasPlannedStock', 'importSource', 'skuCount',
];

const FS_VARIATION_UPDATE_KEYS: (keyof MdVariation)[] = [
  'productName', 'color', 'size', 'colorBranchNo', 'colorName',
  'sizeBranchNo', 'sizeName', 'janCode', 'price',
  'actualStock', 'availableStock', 'ecStock', 'stockType',
  'productUrl', 'imageUrl', 'visible', 'hasPreorder', 'hasPlannedStock',
];

function fmtVis(v: unknown): string {
  return v === true ? '公開中' : v === false ? '非公開' : '不明';
}

function detectProductChanges(existing: MdProduct, incoming: MdProduct): string[] {
  const out: string[] = [];
  for (const key of FS_PRODUCT_UPDATE_KEYS) {
    const o = (existing as Record<string, unknown>)[key];
    const n = (incoming as Record<string, unknown>)[key];
    if (n === undefined || o === n) continue;
    if (key === 'visible') out.push(`visible: ${fmtVis(o)} → ${fmtVis(n)}`);
    else if (key === 'price') out.push(`price: ${o ?? '—'} → ${n}`);
    else out.push(`${key} 更新`);
  }
  return out;
}

function detectVariationChanges(existing: MdVariation, incoming: MdVariation): string[] {
  const out: string[] = [];
  for (const key of FS_VARIATION_UPDATE_KEYS) {
    const o = (existing as Record<string, unknown>)[key];
    const n = (incoming as Record<string, unknown>)[key];
    if (n === undefined || o === n) continue;
    out.push(`${key} 更新`);
  }
  return out;
}

type MergeOutput = {
  products: MdProduct[];
  variations: MdVariation[];
  stats: {
    newProducts: number; updatedProducts: number; skippedProducts: number;
    newSkus: number; updatedSkus: number; skippedSkus: number;
  };
  changeLog: SyncChangeLog[];
};

function smartMerge(
  existing: MdProduct[],
  existingVars: MdVariation[],
  incoming: MdProduct[],
  incomingVars: MdVariation[],
  updateExisting: boolean,
): MergeOutput {
  const exMap    = new Map(existing.map((p) => [String(p.productNo), p]));
  const varKey   = (v: MdVariation) => `${String(v.productNo)}__${v.skuCode}`;
  const exVarMap = new Map(existingVars.map((v) => [varKey(v), v]));

  const resultProd = new Map(existing.map((p) => [String(p.productNo), p]));
  const resultVar  = new Map(existingVars.map((v) => [varKey(v), v]));

  const stats = { newProducts: 0, updatedProducts: 0, skippedProducts: 0, newSkus: 0, updatedSkus: 0, skippedSkus: 0 };
  const changeLog: SyncChangeLog[] = [];

  for (const p of incoming) {
    const key = String(p.productNo);
    const ex  = exMap.get(key);
    if (!ex) {
      resultProd.set(key, p);
      stats.newProducts++;
    } else if (updateExisting) {
      const changes = detectProductChanges(ex, p);
      if (changes.length > 0) {
        const patch: Partial<MdProduct> = {};
        for (const fk of FS_PRODUCT_UPDATE_KEYS) {
          const n = (p as Record<string, unknown>)[fk];
          if (n !== undefined) (patch as Record<string, unknown>)[fk] = n;
        }
        resultProd.set(key, { ...ex, ...patch });
        stats.updatedProducts++;
        if (changeLog.length < 20) changeLog.push({ productNo: key, changes });
      } else {
        stats.skippedProducts++;
      }
    } else {
      stats.skippedProducts++;
    }
  }

  for (const v of incomingVars) {
    const k   = varKey(v);
    const exV = exVarMap.get(k);
    if (!exV) {
      resultVar.set(k, v);
      stats.newSkus++;
    } else if (updateExisting) {
      const changes = detectVariationChanges(exV, v);
      if (changes.length > 0) {
        const patch: Partial<MdVariation> = {};
        for (const key of FS_VARIATION_UPDATE_KEYS) {
          const n = (v as Record<string, unknown>)[key];
          if (n !== undefined) (patch as Record<string, unknown>)[key] = n;
        }
        resultVar.set(k, { ...exV, ...patch });
        stats.updatedSkus++;
      } else {
        stats.skippedSkus++;
      }
    } else {
      stats.skippedSkus++;
    }
  }

  return {
    products:   Array.from(resultProd.values()),
    variations: Array.from(resultVar.values()),
    stats,
    changeLog,
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

type FsImportSectionProps = {
  onSendToProducts?: (products: MdProduct[], variations: MdVariation[]) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FsImportSection({ onSendToProducts }: FsImportSectionProps) {
  const [mode, setMode] = useState<Mode>('manual');
  const [updateExisting, setUpdateExisting] = useState(false);

  // Manual mode
  const [inputText, setInputText] = useState('');

  // Full sync mode
  const [syncVisibleFilter, setSyncVisibleFilter] = useState<SyncVisibleFilter>('all');
  const [fullSyncState, setFullSyncState] = useState<FullSyncState>({ phase: 'idle' });

  // Manual fetch state
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fetchError, setFetchError] = useState('');
  const [fetchedProducts, setFetchedProducts] = useState<VpsProduct[]>([]);
  const [failedNos, setFailedNos] = useState<string[]>([]);
  const [selectedNos, setSelectedNos] = useState<Set<string>>(new Set());

  // Manual send state
  const [sendStatus, setSendStatus] = useState<'idle' | 'syncing'>('idle');
  const [sentNos, setSentNos] = useState<Set<string>>(new Set());
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const parsedInput = parseInput(inputText);
  const hasValid    = parsedInput.valid.length > 0;

  const clearFetchState = () => {
    setFetchedProducts([]);
    setFailedNos([]);
    setSelectedNos(new Set());
    setSendStatus('idle');
    setSentNos(new Set());
    setSendResult(null);
    setFetchError('');
    setFetchStatus('idle');
    setFullSyncState({ phase: 'idle' });
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    clearFetchState();
  };

  // ── Manual mode fetch ───────────────────────────────────────────────────────

  const handleFetch = useCallback(async () => {
    const parsed = parseInput(inputText);
    if (parsed.valid.length === 0) return;

    setFetchStatus('loading');
    setFetchError('');
    setFetchedProducts([]);
    setFailedNos([]);
    setSelectedNos(new Set());
    setSendStatus('idle');
    setSendResult(null);

    try {
      const res = await fetch('/api/check-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNos: parsed.valid, types: DEFAULT_TYPES }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as VpsResponse;
      if (!data.ok) throw new Error('VPS returned ok=false');

      const products      = data.products ?? [];
      const returnedNos   = new Set(products.map((p) => p.productNo));
      setFetchedProducts(products);
      setSelectedNos(new Set(products.map((p) => p.productNo)));
      setFailedNos(parsed.valid.filter((no) => !returnedNos.has(no)));
      setFetchStatus('idle');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
      setFetchStatus('error');
    }
  }, [inputText]);

  // ── Full sync ──────────────────────────────────────────────────────────────

  const handleFullSync = useCallback(async () => {
    setFullSyncState({ phase: 'loading', page: 1 });

    try {
      let allProducts: VpsProduct[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      let paginationStatus: 'complete' | 'limit_reached' = 'complete';

      while (pageCount < MAX_FULL_SYNC_PAGES) {
        const body: Record<string, unknown> = { mode: 'all', types: DEFAULT_TYPES, count: 250 };
        if (cursor) body.cursor = cursor;

        const res = await fetch('/api/check-products', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as VpsErrorResponse;
          const statusPart = errData.upstreamStatus
            ? ` (HTTP ${errData.upstreamStatus})`
            : ` (HTTP ${res.status})`;
          const detailPart = errData.detail != null
            ? `\ndetail: ${typeof errData.detail === 'object' ? JSON.stringify(errData.detail) : String(errData.detail)}`
            : '';
          throw new Error(`${errData.error ?? 'エラー'}${statusPart}${detailPart}`);
        }
        const data = await res.json() as VpsResponse;
        if (!data.ok) throw new Error('VPS returned ok=false');

        allProducts = [...allProducts, ...(data.products ?? [])];
        pageCount++;

        const nextCursor = data.nextUrl ? extractCursor(data.nextUrl) : null;
        if (!nextCursor) { paginationStatus = 'complete'; break; }
        if (pageCount >= MAX_FULL_SYNC_PAGES) { paginationStatus = 'limit_reached'; break; }

        cursor = nextCursor;
        setFullSyncState({ phase: 'loading', page: pageCount + 1 });
        await new Promise<void>((r) => setTimeout(r, 1000));
      }

      // Dedup by productNo (keep first occurrence)
      const seen = new Set<string>();
      const deduped = allProducts.filter((p) => {
        const no = String(p.productNo);
        if (seen.has(no)) return false;
        seen.add(no);
        return true;
      });

      // Apply visible filter
      let filtered = deduped;
      if (syncVisibleFilter !== 'all') {
        const wantPublic = syncVisibleFilter === 'public';
        filtered = deduped.filter((p) => normalizeVisible(p.visible) === wantPublic);
      }

      const totalFetched       = filtered.length;
      const incomingProducts   = filtered.map(toMdProduct);
      const incomingVariations = filtered.flatMap((p) => (p.variations ?? []).map((v) => toMdVariation(v, p)));

      const { products: existing, variations: existingVars } = loadExisting();
      const { products, variations, stats, changeLog } = smartMerge(
        existing, existingVars, incomingProducts, incomingVariations, updateExisting,
      );

      onSendToProducts?.(products, variations);

      setFullSyncState({
        phase: 'done',
        result: { totalFetched, ...stats, pageCount, paginationStatus, changeLog },
      });
    } catch (err) {
      setFullSyncState({ phase: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [syncVisibleFilter, updateExisting, onSendToProducts]);

  // ── Selection (manual mode) ────────────────────────────────────────────────

  const toggleProduct = useCallback((no: string) => {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  }, []);

  const selectAll   = useCallback(() => setSelectedNos(new Set(fetchedProducts.map((p) => p.productNo))), [fetchedProducts]);
  const deselectAll = useCallback(() => setSelectedNos(new Set()), []);

  // ── Send + auto stock sync (manual mode) ───────────────────────────────────

  const handleSend = useCallback(async () => {
    const toSend = fetchedProducts.filter((p) => selectedNos.has(p.productNo));
    if (toSend.length === 0 || !onSendToProducts) return;

    setSendStatus('syncing');
    setSendResult(null);

    const { products: existing, variations: existingVars } = loadExisting();
    const incomingProducts   = toSend.map(toMdProduct);
    const incomingVariations = toSend.flatMap((p) => (p.variations ?? []).map((v) => toMdVariation(v, p)));

    const { products: merged, variations: mergedVars, stats } = smartMerge(
      existing, existingVars, incomingProducts, incomingVariations, updateExisting,
    );

    let finalProducts   = merged;
    let finalVariations = mergedVars;
    let syncFailed      = false;

    // Auto stock sync for selected products
    const productNos = toSend.map((p) => p.productNo);
    try {
      const res = await fetch('/api/check-stock', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNos }),
      });
      if (res.ok) {
        const data = await res.json() as { ok?: boolean; stock?: Record<string, number> };
        if (data.ok && data.stock) {
          const stock = data.stock;
          finalVariations = finalVariations.map((v) => {
            const skuNorm = v.skuCode.replaceAll('_', '');
            if (!Object.prototype.hasOwnProperty.call(stock, skuNorm)) return v;
            const s = stock[skuNorm];
            return { ...v, actualStock: s, availableStock: s, ecStock: s, stockType: 'actual' as const };
          });
          const stockByProduct: Record<string, number> = {};
          for (const v of finalVariations) {
            if (v.actualStock != null && productNos.includes(v.productNo)) {
              stockByProduct[v.productNo] = (stockByProduct[v.productNo] ?? 0) + v.actualStock;
            }
          }
          finalProducts = finalProducts.map((p) => {
            if (!Object.prototype.hasOwnProperty.call(stockByProduct, p.productNo)) return p;
            const s = stockByProduct[p.productNo];
            return { ...p, actualStock: s, availableStock: s, stockType: 'actual' as const };
          });
        } else {
          syncFailed = true;
        }
      } else {
        syncFailed = true;
      }
    } catch {
      syncFailed = true;
    }

    setSentNos((prev) => {
      const next = new Set(prev);
      for (const no of toSend.map((p) => p.productNo)) next.add(no);
      return next;
    });
    setSendResult({
      added:      stats.newProducts,
      updated:    stats.updatedProducts,
      skipped:    stats.skippedProducts,
      skuAdded:   stats.newSkus,
      skuUpdated: stats.updatedSkus,
      skuSkipped: stats.skippedSkus,
      stockOk:    !syncFailed,
    });
    setSendStatus('idle');
    onSendToProducts(finalProducts, finalVariations);
  }, [fetchedProducts, selectedNos, onSendToProducts, updateExisting]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    clearFetchState();
  };

  // ── Computed (manual mode) ─────────────────────────────────────────────────

  const totalSkus    = fetchedProducts.reduce((n, p) => n + (p.variations?.length ?? 0), 0);
  const withImage    = fetchedProducts.filter((p) => !!p.imageUrl).length;
  const withPreorder = fetchedProducts.filter((p) => p.hasPreorder).length;
  const withPlanned  = fetchedProducts.filter((p) => p.hasPlannedStock).length;
  const hasSummary   = fetchedProducts.length > 0 || failedNos.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.section}>
      <div className={styles.heading}>
        <span className={styles.headingIcon}>FS</span>
        FutureShop商品取込
      </div>
      <p className={styles.desc}>
        FutureShopから商品情報を取得し、商品一覧へ反映します。品番指定は特定商品の即時取得に、全件同期はFutureShop全商品の一括取得に使います。
      </p>

      {/* ── Mode tabs ── */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={`${styles.modeTab} ${mode === 'manual' ? styles.modeTabActive : ''}`}
          onClick={() => switchMode('manual')}
        >
          品番指定
        </button>
        <button
          type="button"
          className={`${styles.modeTab} ${mode === 'fullSync' ? styles.modeTabActive : ''}`}
          onClick={() => switchMode('fullSync')}
        >
          全件同期
        </button>
      </div>

      {/* ── Manual mode input ── */}
      {mode === 'manual' && (
        <div className={styles.inputArea}>
          <label className={styles.label}>品番（7桁・カンマまたは改行区切り）</label>
          <textarea
            className={styles.textarea}
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={'1266302\n1266303,1266304'}
            rows={3}
          />
          <div className={styles.parsedMeta}>
            {parsedInput.valid.length > 0 ? (
              <span className={styles.parsedValid}>
                取得対象: {parsedInput.valid.length}件
                <span className={styles.parsedNosList}> — {parsedInput.valid.join(', ')}</span>
              </span>
            ) : (
              <span className={styles.parsedHint}>7桁の品番を入力してください</span>
            )}
            {parsedInput.duplicates > 0 && (
              <span className={styles.parsedDup}>　重複除外: {parsedInput.duplicates}件</span>
            )}
            {parsedInput.invalid.length > 0 && (
              <span className={styles.parsedInvalid}>
                　無効: {parsedInput.invalid.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Full sync options ── */}
      {mode === 'fullSync' && (
        <div className={styles.searchForm}>
          <p className={styles.searchNote}>
            FutureShopに登録されている商品を全件取得し、MDツールの商品一覧へ反映します。既存商品は通常スキップしますが、「既存商品も更新する」をONにすると、商品名・画像・URL・公開状態などをFutureShop情報で更新します。
          </p>
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>公開状態</span>
            <div className={styles.radioGroup}>
              {(['all', 'public', 'private'] as const).map((v) => (
                <label key={v} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="fs-sync-visible"
                    value={v}
                    checked={syncVisibleFilter === v}
                    onChange={() => setSyncVisibleFilter(v)}
                    disabled={fullSyncState.phase === 'loading'}
                  />
                  {v === 'all' ? 'すべて' : v === 'public' ? '公開中' : '非公開'}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Shared: update existing checkbox ── */}
      <div className={styles.updateExistingRow}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
            disabled={mode === 'fullSync' && fullSyncState.phase === 'loading'}
          />
          既存商品もFutureShop情報で更新する
        </label>
        {updateExisting && (
          <span className={styles.updateExistingNote}>
            ON: 商品名・画像・価格・URL・公開状態などを最新値で更新します。MD判断・売上・メモは保持されます。
          </span>
        )}
      </div>

      {/* ── Fetch / sync button ── */}
      <div className={styles.btnRow}>
        {mode === 'manual' ? (
          <button
            type="button"
            className={styles.fetchBtn}
            onClick={handleFetch}
            disabled={!hasValid || fetchStatus === 'loading'}
          >
            {fetchStatus === 'loading' ? '取得中...' : 'FutureShopから取得'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.fetchBtn}
            onClick={handleFullSync}
            disabled={fullSyncState.phase === 'loading'}
          >
            {fullSyncState.phase === 'loading'
              ? `${fullSyncState.page}ページ目取得中...`
              : 'FutureShop商品を全件同期'}
          </button>
        )}
      </div>

      {/* ── Manual mode: errors / summary / product list ── */}
      {mode === 'manual' && (
        <>
          {fetchStatus === 'error' && (
            <div className={styles.errorMsg}>{fetchError}</div>
          )}

          {hasSummary && (
            <div className={styles.fetchSummary}>
              {fetchedProducts.length > 0 && (
                <>
                  <span className={styles.summarySuccess}>取得成功: {fetchedProducts.length}品番</span>
                  <span className={styles.summaryDot}>·</span>
                  <span>SKU数: {totalSkus}件</span>
                  <span className={styles.summaryDot}>·</span>
                  <span>画像あり: {withImage}件</span>
                  {withPreorder > 0 && (
                    <><span className={styles.summaryDot}>·</span><span>予約販売あり: {withPreorder}件</span></>
                  )}
                  {withPlanned > 0 && (
                    <><span className={styles.summaryDot}>·</span><span>予定在庫あり: {withPlanned}件</span></>
                  )}
                </>
              )}
              {failedNos.length > 0 && (
                <>
                  {fetchedProducts.length > 0 && <span className={styles.summaryDot}>·</span>}
                  <span className={styles.summaryFail}>
                    取得失敗: {failedNos.length}品番（{failedNos.join(', ')}）
                  </span>
                </>
              )}
            </div>
          )}

          {fetchedProducts.length > 0 && (
            <>
              <div className={styles.selectionBar}>
                <button type="button" className={styles.selectionBtn} onClick={selectAll}>全選択</button>
                <button type="button" className={styles.selectionBtn} onClick={deselectAll}>全解除</button>
                <span className={styles.selectionCount}>
                  選択: {selectedNos.size}件 / {fetchedProducts.length}件
                </span>
              </div>

              <div className={styles.previewList}>
                {fetchedProducts.map((p) => (
                  <ProductPreviewCard
                    key={p.productNo}
                    product={p}
                    selected={selectedNos.has(p.productNo)}
                    sent={sentNos.has(p.productNo)}
                    onToggle={() => toggleProduct(p.productNo)}
                  />
                ))}
              </div>

              <div className={styles.sendRow}>
                <button
                  type="button"
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={!onSendToProducts || selectedNos.size === 0 || sendStatus === 'syncing'}
                >
                  {sendStatus === 'syncing'
                    ? '在庫同期中...'
                    : `選択した${selectedNos.size}件を商品一覧へ反映`}
                </button>
                {sendStatus === 'syncing' && (
                  <span className={styles.sendDesc}>FutureShopから在庫を取得しています...</span>
                )}
                {sendResult && (
                  <div className={styles.sendResultBlock}>
                    <span className={sendResult.stockOk ? styles.sentDone : styles.syncErrorMsg}>
                      反映完了{!sendResult.stockOk && '（在庫同期は失敗）'}
                    </span>
                    <span className={styles.sendResultDetail}>
                      新規追加: {sendResult.added}品番 / 更新: {sendResult.updated}品番 / スキップ: {sendResult.skipped}品番
                    </span>
                    <span className={styles.sendResultDetail}>
                      SKU追加: {sendResult.skuAdded}件 / SKU更新: {sendResult.skuUpdated}件 / SKUスキップ: {sendResult.skuSkipped}件
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Full sync mode: result ── */}
      {mode === 'fullSync' && (
        <>
          {fullSyncState.phase === 'error' && (
            <div className={styles.errorMsg}>同期エラー: {fullSyncState.message}</div>
          )}

          {fullSyncState.phase === 'done' && (() => {
            const r = fullSyncState.result;
            return (
              <div className={styles.fullSyncResult}>
                <div className={styles.fullSyncResultTitle}>
                  全件同期完了
                  {r.paginationStatus === 'limit_reached' && (
                    <span className={styles.fullSyncLimitBadge}>50ページ上限・暫定値</span>
                  )}
                  {r.paginationStatus === 'complete' && (
                    <span className={styles.fullSyncDoneBadge}>全{r.pageCount}ページ取得済み</span>
                  )}
                </div>
                <div className={styles.fullSyncGrid}>
                  {[
                    ['取得商品数', `${r.totalFetched}品番`],
                    ['新規追加',   `${r.newProducts}品番`],
                    ['更新',       `${r.updatedProducts}品番`],
                    ['変更なしスキップ', `${r.skippedProducts}品番`],
                    ['SKU追加',    `${r.newSkus}件`],
                    ['SKU更新',    `${r.updatedSkus}件`],
                    ['SKU変更なしスキップ', `${r.skippedSkus}件`],
                    ['取得ページ数', `${r.pageCount}ページ`],
                  ].map(([label, value]) => (
                    <div key={label} className={styles.fullSyncItem}>
                      <span className={styles.fullSyncLabel}>{label}</span>
                      <span className={styles.fullSyncValue}>{value}</span>
                    </div>
                  ))}
                </div>
                {r.paginationStatus === 'limit_reached' && (
                  <p className={styles.fullSyncWarning}>
                    50ページ上限に達したため暫定値です。全データを取得するにはページング上限の拡張が必要です。
                  </p>
                )}
                {r.changeLog.length > 0 && (
                  <div className={styles.changeLogBlock}>
                    <div className={styles.changeLogTitle}>変更ログ（最大20件）</div>
                    {r.changeLog.map((log) => (
                      <div key={log.productNo} className={styles.changeLogRow}>
                        <span className={styles.changeLogNo}>{log.productNo}:</span>
                        <span>{log.changes.join(' / ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ── Product preview card ──────────────────────────────────────────────────────

function ProductPreviewCard({
  product: p,
  selected,
  sent,
  onToggle,
}: {
  product: VpsProduct;
  selected: boolean;
  sent: boolean;
  onToggle: () => void;
}) {
  const visNorm = normalizeVisible(p.visible);
  return (
    <div className={`${styles.previewCard} ${selected ? styles.previewCardSelected : ''}`}>
      <label className={styles.previewCheck}>
        <input
          type="checkbox"
          className={styles.previewCheckInput}
          checked={selected}
          onChange={onToggle}
        />
      </label>
      <div className={styles.previewThumbWrap}>
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} className={styles.previewThumb} />
        ) : (
          <div className={styles.previewThumbPlaceholder}>画像なし</div>
        )}
      </div>
      <div className={styles.previewInfo}>
        <div className={styles.previewProductNo}>
          {p.productNo}
          {sent && <span className={styles.sentBadge}>反映済み</span>}
        </div>
        <div className={styles.previewName}>{p.name}</div>
        <div className={styles.previewMeta}>
          <span>{Number(p.unitPrice).toLocaleString()}円</span>
          <span className={styles.metaDivider}>·</span>
          <span className={styles.metaVisible} data-visible={visNorm ?? 'unknown'}>
            {visNorm === true ? '公開中' : visNorm === false ? '非公開' : '不明'}
          </span>
          <span className={styles.metaDivider}>·</span>
          <span>URLコード: {p.url}</span>
          {p.hasPreorder && <span className={styles.metaBadge} data-type="preorder">予約販売</span>}
          {p.hasPlannedStock && <span className={styles.metaBadge} data-type="planned">予定在庫</span>}
        </div>
        <div className={styles.previewUrl}>
          <a href={p.uri} target="_blank" rel="noopener noreferrer" className={styles.uriLink}>
            {p.uri}
          </a>
        </div>
        {(p.variations?.length ?? 0) > 0 && (
          <div className={styles.variationList}>
            <div className={styles.variationListLabel}>SKU ({p.variations.length}件)</div>
            {p.variations.slice(0, 3).map((v) => (
              <div key={v.skuCode} className={styles.variationRow}>
                <span className={styles.skuCode}>{v.skuCode}</span>
                <span>{v.colorName}</span>
                <span>{v.sizeName}</span>
                <span>在庫 {v.stockCount ?? '—'}</span>
                <span className={styles.janCode}>{v.janCode}</span>
              </div>
            ))}
            {p.variations.length > 3 && (
              <div className={styles.variationMore}>他 {p.variations.length - 3}件</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
