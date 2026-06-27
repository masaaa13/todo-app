import { useState, useCallback } from 'react';
import type { MdProduct, MdVariation } from '../types/md';
import styles from './FsImportSection.module.css';

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
  warning?: string;
};

// ── Input parsing ─────────────────────────────────────────────────────────────

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
  const [inputText, setInputText] = useState('');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fetchError, setFetchError] = useState('');
  const [fetchedProducts, setFetchedProducts] = useState<VpsProduct[]>([]);
  const [failedNos, setFailedNos] = useState<string[]>([]);
  const [sendStatus, setSendStatus] = useState<'idle' | 'syncing' | 'sync-error'>('idle');
  const [syncError, setSyncError] = useState('');

  const parsedInput = parseInput(inputText);
  const hasValid    = parsedInput.valid.length > 0;

  const handleFetch = useCallback(async () => {
    const parsed = parseInput(inputText);
    if (parsed.valid.length === 0) return;
    const nos = parsed.valid;

    setFetchStatus('loading');
    setFetchError('');
    setFetchedProducts([]);
    setFailedNos([]);
    setSendStatus('idle');
    setSyncError('');

    try {
      const res = await fetch('/api/check-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productNos: nos,
          types: ['variation', 'image', 'comment', 'preorder', 'plannedStock'],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as VpsResponse;
      if (!data.ok) throw new Error('VPS returned ok=false');

      const returnedNos = new Set((data.products ?? []).map((p) => p.productNo));
      setFetchedProducts(data.products ?? []);
      setFailedNos(nos.filter((no) => !returnedNos.has(no)));
      setFetchStatus('idle');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
      setFetchStatus('error');
    }
  }, [inputText]);

  const handleSend = useCallback(async () => {
    if (fetchedProducts.length === 0 || !onSendToProducts) return;
    setSendStatus('syncing');
    setSyncError('');

    const { products: existing, variations: existingVars } = loadExisting();
    const newProducts   = fetchedProducts.map(toMdProduct);
    const newVariations = fetchedProducts.flatMap((p) =>
      (p.variations ?? []).map((v) => toMdVariation(v, p)),
    );

    let mergedProducts   = mergeProducts(existing, newProducts);
    let mergedVariations = mergeVariations(existingVars, newVariations);

    // Auto stock sync for the imported products
    const productNos = fetchedProducts.map((p) => p.productNo);
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
      // Show the error briefly before navigating
      await new Promise<void>((r) => setTimeout(r, 2500));
    }

    onSendToProducts(mergedProducts, mergedVariations);
  }, [fetchedProducts, onSendToProducts]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    setFetchedProducts([]);
    setFailedNos([]);
    setSendStatus('idle');
    setSyncError('');
    setFetchError('');
    setFetchStatus('idle');
  };

  const totalSkus    = fetchedProducts.reduce((n, p) => n + (p.variations?.length ?? 0), 0);
  const withImage    = fetchedProducts.filter((p) => !!p.imageUrl).length;
  const withPreorder = fetchedProducts.filter((p) => p.hasPreorder).length;
  const withPlanned  = fetchedProducts.filter((p) => p.hasPlannedStock).length;
  const hasSummary   = fetchedProducts.length > 0 || failedNos.length > 0;

  return (
    <div className={styles.section}>
      <div className={styles.heading}>
        <span className={styles.headingIcon}>FS</span>
        FutureShop商品取込
      </div>
      <p className={styles.desc}>
        品番を入力してFutureShopから商品情報を取得し、商品一覧へ反映します。既存データがある場合は更新（上書きマージ）します。
      </p>

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

      <div className={styles.btnRow}>
        <button
          className={styles.fetchBtn}
          onClick={handleFetch}
          disabled={!hasValid || fetchStatus === 'loading'}
        >
          {fetchStatus === 'loading' ? '取得中...' : 'FutureShopから取得'}
        </button>
      </div>

      {fetchStatus === 'error' && (
        <div className={styles.errorMsg}>{fetchError}</div>
      )}

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

      {fetchedProducts.length > 0 && (
        <>
          <div className={styles.previewLabel}>取得結果</div>
          <div className={styles.previewList}>
            {fetchedProducts.map((p) => (
              <ProductPreviewCard key={p.productNo} product={p} />
            ))}
          </div>

          <div className={styles.sendRow}>
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!onSendToProducts || sendStatus === 'syncing' || sendStatus === 'sync-error'}
            >
              {sendStatus === 'syncing' ? '在庫同期中...' : '商品一覧へ反映'}
            </button>
            <span className={styles.sendDesc}>
              {sendStatus === 'idle'
                ? `${fetchedProducts.length}品番を既存データと統合して商品一覧タブへ移動します。`
                : sendStatus === 'syncing'
                ? 'FutureShopから在庫を取得しています...'
                : ''}
            </span>
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

function ProductPreviewCard({ product: p }: { product: VpsProduct }) {
  return (
    <div className={styles.previewCard}>
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
