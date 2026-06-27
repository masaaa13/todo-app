import { useState, useCallback } from 'react';
import type { MdProduct, MdVariation } from '../types/md';
import styles from './FsImportSection.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TYPES  = ['variation', 'image', 'comment', 'preorder', 'plannedStock'];
const MAX_PAGES      = 5;
const MAX_PRODUCTS   = 250;

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
  visible: boolean;
  imageUrl: string;
  imageList: Record<string, string>[];
  variations: VpsVariation[];
  hasPreorder: boolean;
  hasPlannedStock: boolean;
};

type VpsResponse = {
  ok: boolean;
  products: VpsProduct[];
  productCount: number;
  totalCount: number;
  nextUrl?: string;
  warning?: string;
};

function extractCursor(nextUrl: string): string | null {
  try {
    return new URL(nextUrl).searchParams.get('cursor');
  } catch {
    return null;
  }
}

// ── Mode / search form types ──────────────────────────────────────────────────

type Mode = 'manual' | 'search';

type SearchForm = {
  productNoPrefix: string;
  mainGroupUrl: string;
  dateFrom: string;
  dateTo: string;
  visible: 'all' | 'public' | 'private';
};

// ── Input parsing (manual mode) ───────────────────────────────────────────────

type ParsedInput = {
  valid: string[];
  duplicates: number;
  invalid: string[];
};

function parseInput(text: string): ParsedInput {
  const tokens = text.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  let duplicates = 0;
  const invalid: string[] = [];

  for (const token of tokens) {
    const digits = token.replace(/\D/g, '');
    if (digits.length === 7) {
      if (seen.has(digits)) {
        duplicates++;
      } else {
        seen.add(digits);
        valid.push(digits);
      }
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
    productNo:       p.productNo,
    productName:     p.name,
    category:        inferCategory(p.name),
    status:          'FutureShop取込済み',
    nextAction:      '商品確認',
    skuCount:        p.variations.length,
    imageUrl:        p.imageUrl || undefined,
    price:           unitPriceNum(p),
    productUrl:      p.uri,
    productUrlCode:  p.url,
    visible:         p.visible,
    hasPreorder:     p.hasPreorder,
    hasPlannedStock: p.hasPlannedStock,
  };
}

function toMdVariation(v: VpsVariation, p: VpsProduct): MdVariation {
  const stock    = v.stockCount ?? null;
  const varPrice = v.price != null ? Number(v.price) : unitPriceNum(p);
  return {
    productNo:      p.productNo,
    productName:    p.name,
    skuCode:        v.skuCode,
    color:          v.colorName || undefined,
    size:           v.sizeName  || undefined,
    category:       inferCategory(p.name),
    status:         'FutureShop取込済み',
    nextAction:     '在庫確認',
    imageUrl:       p.imageUrl || undefined,
    productUrl:     p.uri,
    colorBranchNo:  v.colorBranchNo || undefined,
    colorName:      v.colorName     || undefined,
    sizeBranchNo:   v.sizeBranchNo  || undefined,
    sizeName:       v.sizeName      || undefined,
    janCode:        v.janCode       || undefined,
    price:          isNaN(varPrice ?? NaN) ? null : varPrice,
    stockType:      'actual',
    actualStock:    stock,
    availableStock: stock,
    ecStock:        stock,
  };
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeProducts(existing: MdProduct[], incoming: MdProduct[]): MdProduct[] {
  const map = new Map(existing.map((p) => [p.productNo, p]));
  for (const p of incoming) {
    map.set(p.productNo, { ...(map.get(p.productNo) ?? {}), ...p });
  }
  return Array.from(map.values());
}

function mergeVariations(existing: MdVariation[], incoming: MdVariation[]): MdVariation[] {
  const key = (v: MdVariation) => `${v.productNo}__${v.skuCode}`;
  const map = new Map(existing.map((v) => [key(v), v]));
  for (const v of incoming) {
    map.set(key(v), { ...(map.get(key(v)) ?? {}), ...v });
  }
  return Array.from(map.values());
}

// ── Props ─────────────────────────────────────────────────────────────────────

type FsImportSectionProps = {
  onSendToProducts?: (products: MdProduct[], variations: MdVariation[]) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FsImportSection({ onSendToProducts }: FsImportSectionProps) {
  const [mode, setMode] = useState<Mode>('manual');

  // Manual mode
  const [inputText, setInputText] = useState('');

  // Condition search mode
  const [searchForm, setSearchForm] = useState<SearchForm>({
    productNoPrefix: '',
    mainGroupUrl: '',
    dateFrom: '',
    dateTo: '',
    visible: 'all',
  });

  // Shared fetch state
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fetchError, setFetchError] = useState('');
  const [fetchedProducts, setFetchedProducts] = useState<VpsProduct[]>([]);
  const [failedNos, setFailedNos] = useState<string[]>([]);
  const [selectedNos, setSelectedNos] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore]         = useState(false);
  const [nextCursor, setNextCursor]   = useState<string | null>(null);
  const [pageCount, setPageCount]     = useState(0);
  const [noMorePages, setNoMorePages] = useState<'limit' | 'done' | null>(null);

  // Send state
  const [sendStatus, setSendStatus] = useState<'idle' | 'syncing' | 'sync-error'>('idle');
  const [syncError, setSyncError] = useState('');

  // Derived
  const parsedInput       = parseInput(inputText);
  const hasValid          = parsedInput.valid.length > 0;
  const hasApiCondition = !!(
    searchForm.dateFrom ||
    searchForm.dateTo ||
    searchForm.mainGroupUrl.trim()
  );

  let dateRangeError = '';
  if (searchForm.dateFrom && searchForm.dateTo) {
    const diff = (new Date(searchForm.dateTo).getTime() - new Date(searchForm.dateFrom).getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) dateRangeError = '更新日Fromは更新日To以前の日付を指定してください';
    else if (diff > 31) dateRangeError = '更新日の範囲は31日以内で指定してください';
  }

  const clearFetchState = () => {
    setFetchedProducts([]);
    setFailedNos([]);
    setSelectedNos(new Set());
    setHasMore(false);
    setNextCursor(null);
    setPageCount(0);
    setNoMorePages(null);
    setSendStatus('idle');
    setSyncError('');
    setFetchError('');
    setFetchStatus('idle');
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    clearFetchState();
  };

  // ── Manual mode fetch ───────────────────────────────────────────────────────

  const handleFetch = useCallback(async () => {
    const parsed = parseInput(inputText);
    if (parsed.valid.length === 0) return;
    const nos = parsed.valid;

    setFetchStatus('loading');
    setFetchError('');
    setFetchedProducts([]);
    setFailedNos([]);
    setSelectedNos(new Set());
    setHasMore(false);
    setSendStatus('idle');
    setSyncError('');

    try {
      const res = await fetch('/api/check-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNos: nos, types: DEFAULT_TYPES }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as VpsResponse;
      if (!data.ok) throw new Error('VPS returned ok=false');

      const products = data.products ?? [];
      const returnedNos = new Set(products.map((p) => p.productNo));
      setFetchedProducts(products);
      setSelectedNos(new Set(products.map((p) => p.productNo)));
      setFailedNos(nos.filter((no) => !returnedNos.has(no)));
      setFetchStatus('idle');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
      setFetchStatus('error');
    }
  }, [inputText]);

  // ── Condition search fetch ──────────────────────────────────────────────────

  const handleSearchFetch = useCallback(async () => {
    if (!hasApiCondition || dateRangeError) return;

    setFetchStatus('loading');
    setFetchError('');
    setFetchedProducts([]);
    setFailedNos([]);
    setSelectedNos(new Set());
    setHasMore(false);
    setNextCursor(null);
    setPageCount(0);
    setNoMorePages(null);
    setSendStatus('idle');
    setSyncError('');

    const body: Record<string, unknown> = { types: DEFAULT_TYPES, count: 50 };
    if (searchForm.dateFrom)            body.updateDateStart = `${searchForm.dateFrom}T00:00:00`;
    if (searchForm.dateTo)              body.updateDateEnd   = `${searchForm.dateTo}T23:59:59`;
    if (searchForm.mainGroupUrl.trim()) body.mainGroupUrl    = searchForm.mainGroupUrl.trim();

    try {
      const res = await fetch('/api/check-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as VpsResponse;
      if (!data.ok) throw new Error('VPS returned ok=false');

      let products = data.products ?? [];

      // Client-side filters (not sent to API)
      const prefix = searchForm.productNoPrefix.trim();
      if (prefix) products = products.filter((p) => p.productNo.startsWith(prefix));
      if (searchForm.visible !== 'all') {
        const wantPublic = searchForm.visible === 'public';
        products = products.filter((p) => p.visible === wantPublic);
      }

      const cursor = data.nextUrl ? extractCursor(data.nextUrl) : null;
      const canFetchMore = !!cursor && products.length < MAX_PRODUCTS;
      setFetchedProducts(products);
      setSelectedNos(new Set(products.map((p) => p.productNo)));
      setNextCursor(cursor);
      setPageCount(1);
      setHasMore(canFetchMore);
      setNoMorePages(canFetchMore ? null : data.nextUrl ? 'limit' : null);
      setFetchStatus('idle');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
      setFetchStatus('error');
    }
  }, [searchForm, hasApiCondition, dateRangeError]);

  // ── Fetch more (condition search paging) ───────────────────────────────────

  const handleFetchMore = useCallback(async () => {
    if (!nextCursor || !hasMore || fetchStatus === 'loading') return;

    setFetchStatus('loading');
    setFetchError('');

    // 1秒待機（API制限への配慮）
    await new Promise<void>((r) => setTimeout(r, 1000));

    const body: Record<string, unknown> = {
      types:  DEFAULT_TYPES,
      count:  50,
      cursor: nextCursor,
    };
    if (searchForm.dateFrom)            body.updateDateStart = `${searchForm.dateFrom}T00:00:00`;
    if (searchForm.dateTo)              body.updateDateEnd   = `${searchForm.dateTo}T23:59:59`;
    if (searchForm.mainGroupUrl.trim()) body.mainGroupUrl    = searchForm.mainGroupUrl.trim();

    try {
      const res = await fetch('/api/check-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as VpsResponse;
      if (!data.ok) throw new Error('VPS returned ok=false');

      let newProducts = data.products ?? [];

      // 初回と同じクライアントフィルタを適用
      const prefix = searchForm.productNoPrefix.trim();
      if (prefix) newProducts = newProducts.filter((p) => p.productNo.startsWith(prefix));
      if (searchForm.visible !== 'all') {
        const wantPublic = searchForm.visible === 'public';
        newProducts = newProducts.filter((p) => p.visible === wantPublic);
      }

      // 既存との dedup マージ
      const existingNos = new Set(fetchedProducts.map((p) => p.productNo));
      const toAdd       = newProducts.filter((p) => !existingNos.has(p.productNo));
      const combined    = [...fetchedProducts, ...toAdd];

      const newPageCount   = pageCount + 1;
      const cursor         = data.nextUrl ? extractCursor(data.nextUrl) : null;
      const canFetchMore   = !!cursor && newPageCount < MAX_PAGES && combined.length < MAX_PRODUCTS;

      setFetchedProducts(combined);
      setSelectedNos((prev) => {
        const next = new Set(prev);
        for (const p of toAdd) next.add(p.productNo);
        return next;
      });
      setNextCursor(cursor);
      setPageCount(newPageCount);
      setHasMore(canFetchMore);
      setNoMorePages(canFetchMore ? null : cursor ? 'limit' : 'done');
      setFetchStatus('idle');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
      setFetchStatus('error');
    }
  }, [nextCursor, hasMore, fetchStatus, fetchedProducts, pageCount, searchForm]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleProduct = useCallback((no: string) => {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  }, []);

  const selectAll    = useCallback(() => setSelectedNos(new Set(fetchedProducts.map((p) => p.productNo))), [fetchedProducts]);
  const deselectAll  = useCallback(() => setSelectedNos(new Set()), []);

  // ── Send + auto stock sync ──────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const toSend = fetchedProducts.filter((p) => selectedNos.has(p.productNo));
    if (toSend.length === 0 || !onSendToProducts) return;

    setSendStatus('syncing');
    setSyncError('');

    const { products: existing, variations: existingVars } = loadExisting();
    const newProducts   = toSend.map(toMdProduct);
    const newVariations = toSend.flatMap((p) => (p.variations ?? []).map((v) => toMdVariation(v, p)));

    let mergedProducts   = mergeProducts(existing, newProducts);
    let mergedVariations = mergeVariations(existingVars, newVariations);

    // Auto stock sync for selected products only
    const productNos = toSend.map((p) => p.productNo);
    let syncFailed = false;
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
          mergedVariations = mergedVariations.map((v) => {
            const skuNorm = v.skuCode.replaceAll('_', '');
            if (!Object.prototype.hasOwnProperty.call(stock, skuNorm)) return v;
            const s = stock[skuNorm];
            return { ...v, actualStock: s, availableStock: s, ecStock: s, stockType: 'actual' as const };
          });
          const stockByProduct: Record<string, number> = {};
          for (const v of mergedVariations) {
            if (v.actualStock != null && productNos.includes(v.productNo)) {
              stockByProduct[v.productNo] = (stockByProduct[v.productNo] ?? 0) + v.actualStock;
            }
          }
          mergedProducts = mergedProducts.map((p) => {
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

    if (syncFailed) {
      setSyncError('在庫同期に失敗しましたが、商品取込は完了しました');
      setSendStatus('sync-error');
      await new Promise<void>((r) => setTimeout(r, 2500));
    }

    onSendToProducts(mergedProducts, mergedVariations);
  }, [fetchedProducts, selectedNos, onSendToProducts]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    clearFetchState();
  };

  // ── Computed for summary ────────────────────────────────────────────────────

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
        FutureShopから商品情報を取得し、商品一覧へ反映します。既存データがある場合は更新（上書きマージ）します。
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
          className={`${styles.modeTab} ${mode === 'search' ? styles.modeTabActive : ''}`}
          onClick={() => switchMode('search')}
        >
          条件検索
        </button>
      </div>

      {/* ── Manual mode ── */}
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

      {/* ── Condition search mode ── */}
      {mode === 'search' && (
        <div className={styles.searchForm}>
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>更新日 From</span>
            <input
              type="date"
              className={styles.searchInput}
              value={searchForm.dateFrom}
              onChange={(e) => setSearchForm((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>更新日 To</span>
            <input
              type="date"
              className={styles.searchInput}
              value={searchForm.dateTo}
              onChange={(e) => setSearchForm((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
          {dateRangeError && (
            <div className={styles.errorMsg}>{dateRangeError}</div>
          )}
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>メイングループURLコード</span>
            <input
              type="text"
              className={styles.searchInput}
              value={searchForm.mainGroupUrl}
              onChange={(e) => setSearchForm((f) => ({ ...f, mainGroupUrl: e.target.value }))}
              placeholder="例: tops"
            />
          </div>
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>商品番号（取得結果内で絞り込み）</span>
            <input
              type="text"
              className={styles.searchInput}
              value={searchForm.productNoPrefix}
              onChange={(e) => setSearchForm((f) => ({ ...f, productNoPrefix: e.target.value }))}
              placeholder="例: 1266"
              maxLength={7}
            />
          </div>
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>公開状態（取得結果内で絞り込み）</span>
            <div className={styles.radioGroup}>
              {(['all', 'public', 'private'] as const).map((v) => (
                <label key={v} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="fs-visible"
                    value={v}
                    checked={searchForm.visible === v}
                    onChange={() => setSearchForm((f) => ({ ...f, visible: v }))}
                  />
                  {v === 'all' ? 'すべて' : v === 'public' ? '公開中' : '非公開'}
                </label>
              ))}
            </div>
          </div>
          {!hasApiCondition && (
            <div className={styles.parsedHint}>更新日またはメイングループURLコードを入力してください</div>
          )}
        </div>
      )}

      {/* ── Fetch button ── */}
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
            onClick={handleSearchFetch}
            disabled={!hasApiCondition || !!dateRangeError || fetchStatus === 'loading'}
          >
            {fetchStatus === 'loading' ? '検索中...' : '条件で検索'}
          </button>
        )}
      </div>

      {fetchStatus === 'error' && (
        <div className={styles.errorMsg}>{fetchError}</div>
      )}

      {/* ── Fetch summary ── */}
      {hasSummary && (
        <div className={styles.fetchSummary}>
          {fetchedProducts.length > 0 && (
            <span className={styles.summarySuccess}>取得成功: {fetchedProducts.length}品番</span>
          )}
          {fetchedProducts.length > 0 && (
            <>
              <span className={styles.summaryDot}>·</span>
              <span>SKU数: {totalSkus}件</span>
              <span className={styles.summaryDot}>·</span>
              <span>画像あり: {withImage}件</span>
              {withPreorder > 0 && (
                <>
                  <span className={styles.summaryDot}>·</span>
                  <span>予約販売あり: {withPreorder}件</span>
                </>
              )}
              {withPlanned > 0 && (
                <>
                  <span className={styles.summaryDot}>·</span>
                  <span>予定在庫あり: {withPlanned}件</span>
                </>
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

      {/* ── Product list with selection ── */}
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
                onToggle={() => toggleProduct(p.productNo)}
              />
            ))}
          </div>

          {/* ── Pagination (condition search only) ── */}
          {mode === 'search' && (hasMore || noMorePages !== null) && (
            <div className={styles.paginationRow}>
              {hasMore && (
                <button
                  type="button"
                  className={styles.fetchMoreBtn}
                  onClick={handleFetchMore}
                  disabled={fetchStatus === 'loading'}
                >
                  {fetchStatus === 'loading'
                    ? '取得中...'
                    : `次の50件を取得（${pageCount + 1} / ${MAX_PAGES}ページ目）`}
                </button>
              )}
              {noMorePages === 'limit' && (
                <div className={styles.hasMoreWarning}>
                  取得上限（{MAX_PAGES}ページ / {MAX_PRODUCTS}件）に達しました。条件を絞ってください。
                </div>
              )}
              {noMorePages === 'done' && pageCount > 1 && (
                <div className={styles.paginationDone}>
                  全 {fetchedProducts.length}件を取得しました
                </div>
              )}
            </div>
          )}

          <div className={styles.sendRow}>
            <button
              type="button"
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={
                !onSendToProducts ||
                selectedNos.size === 0 ||
                sendStatus === 'syncing' ||
                sendStatus === 'sync-error'
              }
            >
              {sendStatus === 'syncing'
                ? '在庫同期中...'
                : `選択した${selectedNos.size}件を商品一覧へ反映`}
            </button>
            {sendStatus === 'syncing' && (
              <span className={styles.sendDesc}>FutureShopから在庫を取得しています...</span>
            )}
            {syncError && (
              <span className={styles.syncErrorMsg}>{syncError}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Product preview card ──────────────────────────────────────────────────────

function ProductPreviewCard({
  product: p,
  selected,
  onToggle,
}: {
  product: VpsProduct;
  selected: boolean;
  onToggle: () => void;
}) {
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
        <div className={styles.previewProductNo}>{p.productNo}</div>
        <div className={styles.previewName}>{p.name}</div>
        <div className={styles.previewMeta}>
          <span>{Number(p.unitPrice).toLocaleString()}円</span>
          <span className={styles.metaDivider}>·</span>
          <span className={styles.metaVisible} data-visible={p.visible || undefined}>
            {p.visible ? '公開中' : '非公開'}
          </span>
          <span className={styles.metaDivider}>·</span>
          <span>URLコード: {p.url}</span>
          {p.hasPreorder && (
            <span className={styles.metaBadge} data-type="preorder">予約販売</span>
          )}
          {p.hasPlannedStock && (
            <span className={styles.metaBadge} data-type="planned">予定在庫</span>
          )}
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
