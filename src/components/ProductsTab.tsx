import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { MdProduct, MdVariation } from '../types/md';
import styles from './ProductsTab.module.css';

type StockSyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'success'; skuCount: number; productCount: number }
  | { state: 'error'; message: string };

type SalesSyncStatus =
  | { state: 'idle' }
  | { state: 'syncing'; page: number }
  | { state: 'success'; orderCount: number; lineCount: number; totalSalesQty: number; totalSalesAmount: number; skuCount: number; productCount: number; cancelledOrders: number; pageCount: number; paginationStatus: 'complete' | 'limit_reached' }
  | { state: 'error'; message: string };

type FsUpdateStatus =
  | { state: 'idle' }
  | { state: 'syncing'; done: number; total: number }
  | { state: 'success'; targetCount: number; updatedProducts: number; unchangedProducts: number; updatedSkus: number }
  | { state: 'error'; message: string };

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'product' | 'variation';
type CandidateFilter = 'all' | 'inStock' | 'hot' | 'dead' | 'unsynced';

type ColumnConfig = {
  key: string;
  visible: boolean;
  width?: number;
};

type SortConfig = { key: string; dir: 'asc' | 'desc' } | null;

type TableColumn<T> = {
  key: string;
  label: string;
  defaultVisible: boolean;
  defaultWidth?: number;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  render: (row: T) => React.ReactNode;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRODUCT_STORAGE_KEY = 'ecTodo.productsColumns.product';
const VARIATION_STORAGE_KEY = 'ecTodo.productsColumns.variation';

// ── Dummy data ────────────────────────────────────────────────────────────────

const DUMMY_PRODUCTS: MdProduct[] = [
  {
    productNo: '1266610',
    productName: 'SHOULDER PAD FLOWER TOPS',
    category: 'TOPS',
    releaseDate: '2026-09-02',
    skuCount: 3,
    ecStock: null,
    recentSales: null,
    sellThroughRate: null,
    status: '素材補完済み',
    nextAction: '商品確認',
  },
  {
    productNo: '1266702',
    productName: 'LACY PANTS',
    category: 'PANTS',
    releaseDate: '2026-09-09',
    skuCount: 3,
    ecStock: null,
    recentSales: null,
    sellThroughRate: null,
    status: '素材補完済み',
    nextAction: '商品確認',
  },
  {
    productNo: '1266809',
    productName: 'TWIN BUNNYS CHECK KNIT',
    category: 'TOPS',
    releaseDate: '2026-10-14',
    skuCount: 3,
    ecStock: null,
    recentSales: null,
    sellThroughRate: null,
    status: '素材未取得',
    nextAction: '素材補完',
  },
  {
    productNo: '1266304',
    productName: 'LINGERIE DENIM SKIRT PANTS',
    category: 'PANTS',
    releaseDate: '2026-08-13',
    skuCount: 3,
    ecStock: null,
    recentSales: null,
    sellThroughRate: null,
    status: 'category確認済み',
    nextAction: '商品確認',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────


function numValue(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function stockValue(v: { availableStock?: number | null; actualStock?: number | null; ecStock?: number | null }): number {
  return Math.max(
    numValue(v.availableStock),
    numValue(v.actualStock),
    numValue(v.ecStock),
  );
}

function salesValue(v: { salesQty30d?: number | null; monthlySalesQty?: number | null; recentSales?: number | null }): number {
  return Math.max(
    numValue(v.salesQty30d),
    numValue(v.monthlySalesQty),
    numValue(v.recentSales),
  );
}


function isInStockCandidate(v: MdProduct | MdVariation): boolean {
  return stockValue(v) > 0;
}

function isHotCandidate(v: MdProduct | MdVariation): boolean {
  return stockValue(v) > 0 && salesValue(v) >= 3;
}

function isDeadCandidate(v: MdProduct | MdVariation): boolean {
  return stockValue(v) >= 2 && salesValue(v) === 0;
}

function isFsSyncedVariation(v: MdVariation): boolean {
  return Boolean(
    v.productUrl ||
    v.imageUrl ||
    v.colorBranchNo ||
    v.sizeBranchNo ||
    v.janCode ||
    v.visible !== undefined ||
    v.hasPreorder !== undefined ||
    v.hasPlannedStock !== undefined
  );
}

function candidateLabel(v: MdProduct | MdVariation): string {
  if (isHotCandidate(v)) return '売れ筋候補';
  if (isDeadCandidate(v)) return '死に筋候補';
  if (isInStockCandidate(v)) return '在庫あり';
  return '—';
}


function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function csvDateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function sortHotCandidateRows<T extends MdProduct | MdVariation>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    salesValue(b) - salesValue(a) ||
    stockValue(a) - stockValue(b) ||
    String(a.productNo).localeCompare(String(b.productNo))
  );
}

function sortDeadCandidateRows<T extends MdProduct | MdVariation>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    stockValue(b) - stockValue(a) ||
    String(a.productNo).localeCompare(String(b.productNo))
  );
}

function downloadMdProductsCsv(products: MdProduct[], filename = 'mdProducts.csv'): void {
  const header = '品番,商品名,カテゴリ,発売日,SKU数,EC在庫,直近売上,消化率,ステータス,次アクション,商品URL,期間販売数,期間売上,月間販売数,月間売上,候補区分';
  const rows = products.map((p) => {
    const cols = [
      p.productNo,
      p.productName,
      p.category,
      p.releaseDate ?? '',
      p.skuCount != null ? String(p.skuCount) : '',
      p.ecStock != null ? String(p.ecStock) : '準備中',
      p.recentSales != null ? String(p.recentSales) : '準備中',
      p.sellThroughRate != null ? String(p.sellThroughRate) : '準備中',
      p.status,
      p.nextAction,
      p.productUrl ?? '',
      p.salesQty30d    != null ? String(p.salesQty30d)    : '',
      p.salesAmount30d != null ? String(p.salesAmount30d) : '',
      p.monthlySalesQty    != null ? String(p.monthlySalesQty)    : '',
      p.monthlySalesAmount != null ? String(p.monthlySalesAmount) : '',
      candidateLabel(p),
    ];
    return cols.map((v) => csvEscape(v ?? '')).join(',');
  });
  const content = [header, ...rows].join('\r\n');
  const bom = '﻿';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMdVariationsCsv(variations: MdVariation[], filename = 'mdVariations.csv'): void {
  const header = '品番,商品名,SKU,カラー,サイズ,カテゴリ,発売日,EC在庫,直近売上,消化率,ステータス,次アクション,商品URL,期間販売数,期間売上,月間販売数,月間売上,候補区分';
  const rows = variations.map((v) => {
    const cols = [
      v.productNo,
      v.productName,
      v.skuCode.replaceAll('_', ''),
      v.color ?? '',
      v.size ?? '',
      v.category,
      v.releaseDate ?? '',
      v.ecStock != null ? String(v.ecStock) : '準備中',
      v.recentSales != null ? String(v.recentSales) : '準備中',
      v.sellThroughRate != null ? String(v.sellThroughRate) : '準備中',
      v.status,
      v.nextAction,
      v.productUrl ?? '',
      v.salesQty30d    != null ? String(v.salesQty30d)    : '',
      v.salesAmount30d != null ? String(v.salesAmount30d) : '',
      v.monthlySalesQty    != null ? String(v.monthlySalesQty)    : '',
      v.monthlySalesAmount != null ? String(v.monthlySalesAmount) : '',
      candidateLabel(v),
    ];
    return cols.map((v) => csvEscape(v ?? '')).join(',');
  });
  const content = [header, ...rows].join('\r\n');
  const bom = '﻿';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${day} ${h}:${min}`;
}

function normalizeVisible(value: unknown): boolean | null {
  if (value === true  || value === 'true')  return true;
  if (value === false || value === 'false') return false;
  return null;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// ── Column config helpers ─────────────────────────────────────────────────────

function loadColumnConfig(
  columns: { key: string; defaultVisible: boolean }[],
  storageKey: string,
): ColumnConfig[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          return columns.map((c) => ({ key: c.key, visible: c.defaultVisible }));
        }
        if (typeof parsed[0] === 'string') {
          const visibleSet = new Set(parsed as string[]);
          return columns.map((c) => ({ key: c.key, visible: visibleSet.has(c.key) }));
        }
        if (parsed[0] != null && typeof parsed[0] === 'object' && 'key' in (parsed[0] as object)) {
          const saved = parsed as ColumnConfig[];
          const savedKeys = new Set(saved.map((c) => c.key));
          const missing = columns
            .filter((c) => !savedKeys.has(c.key))
            .map((c) => ({ key: c.key, visible: c.defaultVisible }));
          return [...saved, ...missing];
        }
      }
    }
  } catch {}
  return columns.map((c) => ({ key: c.key, visible: c.defaultVisible }));
}

function saveColumnConfig(storageKey: string, configs: ColumnConfig[]): void {
  try { localStorage.setItem(storageKey, JSON.stringify(configs)); } catch {}
}

function defaultColumnConfigs(columns: { key: string; defaultVisible: boolean }[]): ColumnConfig[] {
  return columns.map((c) => ({ key: c.key, visible: c.defaultVisible }));
}

// ── Sub-components ────────────────────────────────────────────────────────────

type DashboardHeaderProps = {
  isReal: boolean;
  savedAt: string | null;
  onClearProducts: () => void;
  csvLabel: string;
  csvNote: string;
  onCsvDownload: () => void;
  csvDisabled: boolean;
  onSyncStocks?: () => void;
  syncStatus?: StockSyncStatus;
  hasVariations: boolean;
};

function DashboardHeader({
  isReal, savedAt, onClearProducts,
  csvLabel, csvNote, onCsvDownload, csvDisabled,
  onSyncStocks, syncStatus, hasVariations,
}: DashboardHeaderProps) {
  const badgeVariant = !isReal ? 'sample' : savedAt ? 'saved' : 'temp';
  const badgeText = !isReal ? 'サンプル表示中' : savedAt ? '保存済みデータ表示中' : '一時反映データ表示中';

  const handleClear = () => {
    if (window.confirm('保存された商品一覧データをクリアします。よろしいですか？')) {
      onClearProducts();
    }
  };

  const syncLabel = (() => {
    if (!syncStatus || syncStatus.state === 'idle') return '在庫同期';
    if (syncStatus.state === 'syncing') return '同期中...';
    if (syncStatus.state === 'success') return `✓ ${syncStatus.skuCount}SKU 同期済み`;
    return `同期エラー: ${syncStatus.message.slice(0, 20)}`;
  })();
  const syncVariant = (() => {
    if (!syncStatus || syncStatus.state === 'idle') return 'idle';
    if (syncStatus.state === 'syncing') return 'syncing';
    if (syncStatus.state === 'success') return 'success';
    return 'error';
  })();

  return (
    <div className={styles.dashboardHeader}>
      <div className={styles.headerLeft}>
        <div className={styles.headerTitleRow}>
          <span className={styles.headerTitle}>商品一覧</span>
          <span className={styles.headerSubtitle}>MD Product List</span>
        </div>
        <p className={styles.headerDesc}>
          商品登録CSV・在庫・受注データをもとに、MD判断に使う商品情報を一覧化します。
        </p>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.statusBadge} data-variant={badgeVariant}>{badgeText}</span>
        {isReal && savedAt && (
          <span className={styles.headerSavedAt}>保存日時: {formatSavedAt(savedAt)}</span>
        )}
        <div className={styles.csvBtnWrap}>
          <button
            className={styles.csvExportBtn}
            onClick={onCsvDownload}
            disabled={csvDisabled}
            title={csvNote}
          >
            {csvLabel}
          </button>
          {!csvDisabled && (
            <span className={styles.csvBtnNote}>{csvNote}</span>
          )}
        </div>
        {onSyncStocks && (
          <button
            className={styles.syncBtn}
            data-variant={syncVariant}
            onClick={onSyncStocks}
            disabled={!hasVariations || syncStatus?.state === 'syncing'}
            title={!hasVariations ? 'バリエーションデータがありません' : '在庫をFutureShopから取得します'}
          >
            {syncLabel}
          </button>
        )}
        {isReal && (
          <button className={styles.clearBtn} onClick={handleClear}>
            保存データをクリア
          </button>
        )}
      </div>
    </div>
  );
}

function ViewToggle({ viewMode, onChangeMode }: { viewMode: ViewMode; onChangeMode: (m: ViewMode) => void }) {
  return (
    <div className={styles.viewToggle}>
      <button
        className={styles.viewToggleBtn}
        data-active={viewMode === 'product' || undefined}
        onClick={() => onChangeMode('product')}
      >
        商品別
      </button>
      <button
        className={styles.viewToggleBtn}
        data-active={viewMode === 'variation' || undefined}
        onClick={() => onChangeMode('variation')}
      >
        バリエーション別
      </button>
    </div>
  );
}

type KpiRowProps = {
  products: MdProduct[];
  isReal: boolean;
  candidateFilter: CandidateFilter;
  onCandidateFilter: (filter: CandidateFilter) => void;
  unsyncedProductCount: number;
};

function KpiRow({ products, isReal, candidateFilter, onCandidateFilter, unsyncedProductCount }: KpiRowProps) {
  const totalSku = products.reduce((sum, p) => sum + (p.skuCount ?? 0), 0);
  const kpis: { label: string; value: string; active: boolean; filter: CandidateFilter }[] = [
    { label: '登録商品数', value: isReal ? String(products.length) : '—', active: isReal, filter: 'all' },
    { label: 'SKU数', value: isReal ? String(totalSku) : '—', active: isReal, filter: 'all' },
    { label: '在庫あり', value: `${products.filter(isInStockCandidate).length}品番`, active: products.some(isInStockCandidate), filter: 'inStock' },
    { label: '売れ筋候補', value: `${products.filter(isHotCandidate).length}品番`, active: products.some(isHotCandidate), filter: 'hot' },
    { label: '死に筋候補', value: `${products.filter(isDeadCandidate).length}品番`, active: products.some(isDeadCandidate), filter: 'dead' },
    { label: '未同期SKUあり', value: `${unsyncedProductCount}品番`, active: unsyncedProductCount > 0, filter: 'unsynced' },
  ];

  return (
    <div className={styles.kpiRow}>
      {kpis.map(({ label, value, active, filter }) => (
        <button
          key={label}
          type="button"
          className={`${styles.kpiCard} ${styles.kpiCardButton}`}
          data-active={active || undefined}
          data-selected={candidateFilter === filter || undefined}
          onClick={() => onCandidateFilter(candidateFilter === filter ? 'all' : filter)}
          title={`${label}で絞り込み`}
        >
          <span className={styles.kpiValue}>{value}</span>
          <span className={styles.kpiLabel}>{label}</span>
        </button>
      ))}
    </div>
  );
}

function VariationKpiRow({
  variations,
  isReal,
  candidateFilter,
  onCandidateFilter,
}: {
  variations: MdVariation[];
  isReal: boolean;
  candidateFilter: CandidateFilter;
  onCandidateFilter: (filter: CandidateFilter) => void;
}) {
  const uniqueProductCount = useMemo(
    () => new Set(variations.map((v) => v.productNo)).size,
    [variations],
  );

  const unsyncedCount = variations.filter((v) => !isFsSyncedVariation(v)).length;

  const kpis: { label: string; value: string; active: boolean; filter: CandidateFilter }[] = [
    { label: '登録商品数', value: isReal ? String(uniqueProductCount) : '—', active: isReal, filter: 'all' },
    { label: 'SKU数', value: isReal ? String(variations.length) : '—', active: isReal, filter: 'all' },
    { label: '在庫あり', value: `${variations.filter(isInStockCandidate).length}SKU`, active: variations.some(isInStockCandidate), filter: 'inStock' },
    { label: '売れ筋候補', value: `${variations.filter(isHotCandidate).length}SKU`, active: variations.some(isHotCandidate), filter: 'hot' },
    { label: '死に筋候補', value: `${variations.filter(isDeadCandidate).length}SKU`, active: variations.some(isDeadCandidate), filter: 'dead' },
    { label: '未同期SKU', value: `${unsyncedCount}SKU`, active: unsyncedCount > 0, filter: 'unsynced' },
  ];

  return (
    <div className={styles.kpiRow}>
      {kpis.map(({ label, value, active, filter }) => (
        <button
          key={label}
          type="button"
          className={`${styles.kpiCard} ${styles.kpiCardButton}`}
          data-active={active || undefined}
          data-selected={candidateFilter === filter || undefined}
          onClick={() => onCandidateFilter(candidateFilter === filter ? 'all' : filter)}
          title={`${label}で絞り込み`}
        >
          <span className={styles.kpiValue}>{value}</span>
          <span className={styles.kpiLabel}>{label}</span>
        </button>
      ))}
    </div>
  );
}

type FilterPanelProps = {
  keyword: string;
  category: string;
  status: string;
  visible?: string;
  candidateFilter: CandidateFilter;
  categories: string[];
  statuses: string[];
  onKeyword: (v: string) => void;
  onCategory: (v: string) => void;
  onStatus: (v: string) => void;
  onVisible?: (v: string) => void;
  onCandidateFilter: (v: CandidateFilter) => void;
  filteredCount: number;
  totalCount: number;
};

function CandidateFilterSelect({
  value,
  onChange,
}: {
  value: CandidateFilter;
  onChange: (v: CandidateFilter) => void;
}) {
  return (
    <div className={styles.filterGroup}>
      <label className={styles.filterLabel}>候補区分</label>
      <select className={styles.filterSelect} value={value} onChange={(e) => onChange(e.target.value as CandidateFilter)}>
        <option value="all">全て</option>
        <option value="inStock">在庫あり</option>
        <option value="hot">売れ筋候補</option>
        <option value="dead">死に筋候補</option>
        <option value="unsynced">未同期SKU</option>
      </select>
    </div>
  );
}

function FilterPanel({
  keyword, category, status, visible, candidateFilter, categories, statuses,
  onKeyword, onCategory, onStatus, onVisible, onCandidateFilter, filteredCount, totalCount,
}: FilterPanelProps) {
  return (
    <div className={styles.filterPanel}>
      <div className={styles.filterPanelTitle}>フィルター</div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>キーワード</label>
        <input
          className={styles.filterInput}
          type="search"
          placeholder="品番・商品名"
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
        />
      </div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>カテゴリ</label>
        <select className={styles.filterSelect} value={category} onChange={(e) => onCategory(e.target.value)}>
          <option value="">全て</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>ステータス</label>
        <select className={styles.filterSelect} value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">全て</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {onVisible && (
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>公開状態</label>
          <select className={styles.filterSelect} value={visible ?? 'all'} onChange={(e) => onVisible(e.target.value)}>
            <option value="all">全て</option>
            <option value="public">公開中</option>
            <option value="private">非公開</option>
            <option value="unknown">不明</option>
          </select>
        </div>
      )}
      <CandidateFilterSelect value={candidateFilter} onChange={onCandidateFilter} />
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>コラボ/通常</label>
        <select className={styles.filterSelect} disabled>
          <option>全て（次フェーズ）</option>
        </select>
      </div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>発売月</label>
        <select className={styles.filterSelect} disabled>
          <option>全て（次フェーズ）</option>
        </select>
      </div>
      <div className={styles.filterDivider} />
      <div className={styles.filterCountArea}>
        <div className={styles.filterCountRow}>
          <span className={styles.filterCountLabel}>表示中</span>
          <span className={styles.filterCountValue}>{filteredCount}件</span>
        </div>
        <div className={styles.filterCountRow}>
          <span className={styles.filterCountLabel}>全体</span>
          <span className={styles.filterCountValue}>{totalCount}件</span>
        </div>
        <div className={`${styles.filterCountRow} ${styles.filterCountCsvRow}`}>
          <span className={styles.filterCountLabel}>CSV出力対象</span>
          <span className={styles.filterCountValue}>{filteredCount}件</span>
        </div>
      </div>
    </div>
  );
}

function VariationFilterPanel({
  keyword, category, status, candidateFilter, categories, statuses,
  onKeyword, onCategory, onStatus, onCandidateFilter, filteredCount, totalCount,
}: FilterPanelProps) {
  return (
    <div className={styles.filterPanel}>
      <div className={styles.filterPanelTitle}>フィルター</div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>キーワード</label>
        <input
          className={styles.filterInput}
          type="search"
          placeholder="品番・商品名・SKU・カラー・サイズ"
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
        />
      </div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>カテゴリ</label>
        <select className={styles.filterSelect} value={category} onChange={(e) => onCategory(e.target.value)}>
          <option value="">全て</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>ステータス</label>
        <select className={styles.filterSelect} value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">全て</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <CandidateFilterSelect value={candidateFilter} onChange={onCandidateFilter} />
      <div className={styles.filterDivider} />
      <div className={styles.filterCountArea}>
        <div className={styles.filterCountRow}>
          <span className={styles.filterCountLabel}>表示中</span>
          <span className={styles.filterCountValue}>{filteredCount}件</span>
        </div>
        <div className={styles.filterCountRow}>
          <span className={styles.filterCountLabel}>全体 (SKU数)</span>
          <span className={styles.filterCountValue}>{totalCount}件</span>
        </div>
        <div className={`${styles.filterCountRow} ${styles.filterCountCsvRow}`}>
          <span className={styles.filterCountLabel}>CSV出力対象</span>
          <span className={styles.filterCountValue}>{filteredCount}件</span>
        </div>
      </div>
    </div>
  );
}

// ── Pills ─────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  let variant: string;
  if (status === '登録準備OK') variant = 'ok';
  else if (status === '素材補完済み') variant = 'done';
  else if (status.includes('確認済み')) variant = 'info';
  else if (status === '素材未取得') variant = 'warn';
  else if (status === '補完未取得') variant = 'danger';
  else variant = 'neutral';
  return <span className={styles.statusPill} data-variant={variant}>{status}</span>;
}

function ActionPill({ action }: { action: string }) {
  let variant: string;
  if (action === 'CSV出力') variant = 'primary';
  else if (action === '素材補完') variant = 'warn';
  else if (action === '商品確認') variant = 'check';
  else variant = 'neutral';
  return <span className={styles.actionPill} data-variant={variant}>{action}</span>;
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

function ProductThumbnail({ imageUrl, alt }: { imageUrl?: string; alt: string }) {
  if (!imageUrl) {
    return <div className={styles.thumbnailPlaceholder}>画像なし</div>;
  }
  return (
    <img
      src={imageUrl}
      alt={alt}
      className={styles.thumbnail}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const placeholder = document.createElement('div');
        placeholder.className = styles.thumbnailPlaceholder;
        placeholder.textContent = '画像なし';
        e.currentTarget.parentNode?.appendChild(placeholder);
      }}
    />
  );
}

// ── Column selector ───────────────────────────────────────────────────────────

type ColumnSelectorProps = {
  configs: ColumnConfig[];
  columns: { key: string; label: string }[];
  onChange: (configs: ColumnConfig[]) => void;
  onShowAll: () => void;
  onReset: () => void;
};

function ColumnSelector({ configs, columns, onChange, onShowAll, onReset }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const colMap = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDraggingKey(null);
      setDragOverKey(null);
    }
  }, [open]);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggingKey(key);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  };

  const handleDrop = (e: React.DragEvent, toKey: string) => {
    e.preventDefault();
    if (!draggingKey || draggingKey === toKey) {
      setDraggingKey(null);
      setDragOverKey(null);
      return;
    }
    const fromIdx = configs.findIndex((c) => c.key === draggingKey);
    const toIdx = configs.findIndex((c) => c.key === toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...configs];
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    onChange(next);
    setDraggingKey(null);
    setDragOverKey(null);
  };

  const handleDragEnd = () => {
    setDraggingKey(null);
    setDragOverKey(null);
  };

  return (
    <div className={styles.colSelectorWrap} ref={wrapRef}>
      <button
        className={styles.colSelectorBtn}
        onClick={() => setOpen((v) => !v)}
        data-open={open || undefined}
      >
        表示項目
      </button>
      {open && (
        <div className={styles.colSelectorPanel}>
          <div className={styles.colSelectorActions}>
            <button className={styles.colSelectorAction} onClick={onShowAll}>すべて表示</button>
            <button className={styles.colSelectorAction} onClick={onReset}>初期表示に戻す</button>
          </div>
          <div className={styles.colSelectorList}>
            {configs.map((config) => {
              const col = colMap.get(config.key);
              if (!col) return null;
              return (
                <div
                  key={config.key}
                  className={styles.colSelectorItem}
                  draggable
                  onDragStart={(e) => handleDragStart(e, config.key)}
                  onDragOver={(e) => handleDragOver(e, config.key)}
                  onDrop={(e) => handleDrop(e, config.key)}
                  onDragEnd={handleDragEnd}
                  data-dragging={draggingKey === config.key || undefined}
                  data-dragover={(dragOverKey === config.key && draggingKey !== config.key) || undefined}
                >
                  <span className={styles.dragHandle} title="ドラッグで並び替え">☰</span>
                  <input
                    type="checkbox"
                    className={styles.colSelectorCheck}
                    checked={config.visible}
                    onChange={(e) =>
                      onChange(configs.map((c) => c.key === config.key ? { ...c, visible: e.target.checked } : c))
                    }
                  />
                  <span className={styles.colSelectorLabel}>{col.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Display value helpers ─────────────────────────────────────────────────────

function fmtStockType(v?: MdProduct['stockType'] | MdVariation['stockType']): string {
  if (v === 'actual')   return '実在庫';
  if (v === 'preorder') return '予約在庫';
  if (v === 'planned')  return '予定在庫';
  if (v === 'mixed')    return '複合';
  if (v === 'unknown')  return '未判定';
  return '準備中';
}

function fmtSalesType(v?: MdProduct['salesType'] | MdVariation['salesType']): string {
  if (v === 'normal')        return '通常';
  if (v === 'collaboration') return 'コラボ';
  if (v === 'sale')          return 'セール';
  if (v === 'timeSale')      return 'タイムセール';
  if (v === 'preorder')      return '予約';
  if (v === 'planned')       return '予定在庫';
  if (v === 'other')         return 'その他';
  return '準備中';
}

function fmtNum(v: number | null | undefined): string {
  return v != null ? String(v) : '準備中';
}

function fmtBool(v: boolean | undefined): string {
  return v === true ? '対象' : v === false ? '—' : '準備中';
}

function fmtVisible(v: boolean | undefined | null): string {
  if (v === true) return '公開中';
  if (v === false) return '非公開';
  return '—';
}

function fmtImportSource(v: MdProduct['importSource']): string {
  if (v === 'csv') return 'CSV';
  if (v === 'futureshop') return 'FS取込';
  if (v === 'manual') return '手動';
  return '—';
}

function compareValues(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
  dir: 'asc' | 'desc',
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  let cmp: number;
  if (typeof a === 'string' && typeof b === 'string') {
    cmp = a.localeCompare(b, 'ja');
  } else {
    cmp = a < b ? -1 : a > b ? 1 : 0;
  }
  return dir === 'asc' ? cmp : -cmp;
}

// ── Column definitions ────────────────────────────────────────────────────────

const PRODUCT_COLUMNS: TableColumn<MdProduct>[] = [
  { key: 'productNo',         label: '品番',           defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (p) => p.productNo, render: (p) => <span className={styles.productNo}>{p.productNo}</span> },
  { key: 'productName',       label: '商品名',         defaultVisible: true,  defaultWidth: 220, sortable: true, sortValue: (p) => p.productName, render: (p) => <span className={styles.productName}>{p.productName}</span> },
  { key: 'category',          label: 'カテゴリ',       defaultVisible: true,  defaultWidth: 130, sortable: true, sortValue: (p) => p.category, render: (p) => <span className={styles.categoryBadge}>{p.category}</span> },
  { key: 'releaseDate',       label: '発売日',         defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (p) => p.releaseDate ?? null, render: (p) => <span className={styles.dateCell}>{p.releaseDate ?? '—'}</span> },
  { key: 'skuCount',          label: 'SKU数',          defaultVisible: true,  defaultWidth: 80,  sortable: true, sortValue: (p) => p.skuCount ?? null, render: (p) => <span className={styles.numCell}>{p.skuCount ?? '—'}</span> },
  { key: 'ecStock',           label: 'EC在庫',         defaultVisible: true,  defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'recentSales',       label: '直近売上',       defaultVisible: true,  defaultWidth: 100, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'sellThroughRate',   label: '消化率',         defaultVisible: true,  defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'candidateType',     label: '候補区分',       defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (p) => candidateLabel(p), render: (p) => <span className={styles.naCell}>{candidateLabel(p)}</span> },
  { key: 'status',            label: 'ステータス',     defaultVisible: true,  defaultWidth: 120, sortable: true, sortValue: (p) => p.status, render: (p) => <StatusPill status={p.status} /> },
  { key: 'nextAction',        label: '次アクション',   defaultVisible: true,  defaultWidth: 180, sortable: true, sortValue: (p) => p.nextAction, render: (p) => <ActionPill action={p.nextAction} /> },
  { key: 'image',             label: '画像',           defaultVisible: false, defaultWidth: 90,  render: (p) => <ProductThumbnail imageUrl={p.imageUrl} alt={p.productName} /> },
  // 公開状態・取込情報
  { key: 'visibleStatus',     label: '公開状態',       defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (p) => p.visible ?? null, render: (p) => <span className={styles.visiblePill} data-v={p.visible === true ? 'public' : p.visible === false ? 'private' : 'unknown'}>{fmtVisible(p.visible)}</span> },
  { key: 'hasPreorder',       label: '予約販売',       defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (p) => p.hasPreorder ?? null, render: (p) => <span className={styles.naCell}>{p.hasPreorder == null ? '—' : p.hasPreorder ? 'あり' : 'なし'}</span> },
  { key: 'hasPlannedStockFlag', label: '予定在庫',     defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (p) => p.hasPlannedStock ?? null, render: (p) => <span className={styles.naCell}>{p.hasPlannedStock == null ? '—' : p.hasPlannedStock ? 'あり' : 'なし'}</span> },
  { key: 'importSource',      label: '取込元',         defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (p) => p.importSource ?? null, render: (p) => <span className={styles.naCell}>{fmtImportSource(p.importSource)}</span> },
  // 在庫区分
  { key: 'stockType',         label: '在庫区分',       defaultVisible: true,  defaultWidth: 100, render: (p) => <span className={styles.naCell}>{fmtStockType(p.stockType)}</span> },
  { key: 'actualStock',       label: '実在庫',         defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (p) => p.actualStock ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.actualStock)}</span> },
  { key: 'preorderStock',     label: '予約在庫',       defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.preorderStock)}</span> },
  { key: 'plannedStock',      label: '予定在庫',       defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.plannedStock)}</span> },
  { key: 'availableStock',    label: '販売可能在庫',   defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (p) => p.availableStock ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.availableStock)}</span> },
  // 売上データ
  { key: 'salesQty7d',        label: '7日販売数',      defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (p) => p.salesQty7d ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesQty7d)}</span> },
  { key: 'salesQty14d',       label: '14日販売数',     defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (p) => p.salesQty14d ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesQty14d)}</span> },
  { key: 'salesQty30d',       label: '期間販売数',     defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (p) => p.salesQty30d ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesQty30d)}</span> },
  { key: 'salesAmount7d',     label: '7日売上',        defaultVisible: false, defaultWidth: 100, sortable: true, sortValue: (p) => p.salesAmount7d ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesAmount7d)}</span> },
  { key: 'salesAmount14d',    label: '14日売上',       defaultVisible: false, defaultWidth: 100, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesAmount14d)}</span> },
  { key: 'salesAmount30d',    label: '期間売上',       defaultVisible: true,  defaultWidth: 100, sortable: true, sortValue: (p) => p.salesAmount30d ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesAmount30d)}</span> },
  { key: 'monthlySalesQty',   label: '月間販売数',       defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (p) => p.monthlySalesQty ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.monthlySalesQty)}</span> },
  { key: 'monthlySalesAmount',label: '月間売上',         defaultVisible: true,  defaultWidth: 100, sortable: true, sortValue: (p) => p.monthlySalesAmount ?? null, render: (p) => <span className={styles.numCell}>{fmtNum(p.monthlySalesAmount)}</span> },
  // 販促・予算管理
  { key: 'budgetGroup',       label: '予算グループ',   defaultVisible: false, defaultWidth: 110, render: (p) => <span className={styles.naCell}>{p.budgetGroup ?? '準備中'}</span> },
  { key: 'collaborationName', label: 'コラボ名',       defaultVisible: false, defaultWidth: 130, render: (p) => <span className={styles.naCell}>{p.collaborationName ?? '準備中'}</span> },
  { key: 'salesType',         label: '販売区分',       defaultVisible: false, defaultWidth: 110, render: (p) => <span className={styles.naCell}>{fmtSalesType(p.salesType)}</span> },
  { key: 'isCollaboration',   label: 'コラボ',         defaultVisible: false, defaultWidth: 80,  render: (p) => <span className={styles.naCell}>{fmtBool(p.isCollaboration)}</span> },
  { key: 'isSaleTarget',      label: 'セール対象',     defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.naCell}>{fmtBool(p.isSaleTarget)}</span> },
  { key: 'isTimeSaleTarget',  label: 'タイムセール対象', defaultVisible: false, defaultWidth: 120, render: (p) => <span className={styles.naCell}>{fmtBool(p.isTimeSaleTarget)}</span> },
  { key: 'productUrl',        label: '商品URL',        defaultVisible: false, defaultWidth: 100, render: (p) => p.productUrl ? <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className={styles.productUrlLink}>商品ページ</a> : <span className={styles.naCell}>—</span> },
];

const VARIATION_COLUMNS: TableColumn<MdVariation>[] = [
  { key: 'productNo',         label: '品番',           defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (v) => v.productNo, render: (v) => <span className={styles.productNo}>{v.productNo}</span> },
  { key: 'productName',       label: '商品名',         defaultVisible: true,  defaultWidth: 220, sortable: true, sortValue: (v) => v.productName, render: (v) => <span className={styles.productName}>{v.productName}</span> },
  { key: 'skuCode',           label: 'SKU',            defaultVisible: true,  defaultWidth: 120, sortable: true, sortValue: (v) => v.skuCode, render: (v) => <span className={styles.skuCell}>{v.skuCode.replaceAll('_', '')}</span> },
  { key: 'color',             label: 'カラー',         defaultVisible: true,  defaultWidth: 120, sortable: true, sortValue: (v) => v.color ?? null, render: (v) => <span className={styles.colorCell}>{v.color ?? '—'}</span> },
  { key: 'size',              label: 'サイズ',         defaultVisible: true,  defaultWidth: 80,  sortable: true, sortValue: (v) => v.size ?? null, render: (v) => <span className={styles.sizeCell}>{v.size ?? '—'}</span> },
  { key: 'category',          label: 'カテゴリ',       defaultVisible: true,  defaultWidth: 130, sortable: true, sortValue: (v) => v.category, render: (v) => <span className={styles.categoryBadge}>{v.category}</span> },
  { key: 'releaseDate',       label: '発売日',         defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (v) => v.releaseDate ?? null, render: (v) => <span className={styles.dateCell}>{v.releaseDate ?? '—'}</span> },
  { key: 'ecStock',           label: 'EC在庫',         defaultVisible: false, defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'recentSales',       label: '直近売上',       defaultVisible: false, defaultWidth: 100, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'sellThroughRate',   label: '消化率',         defaultVisible: false, defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'candidateType',     label: '候補区分',       defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (v) => candidateLabel(v), render: (v) => <span className={styles.naCell}>{candidateLabel(v)}</span> },
  { key: 'fsSyncStatus',      label: 'FS同期',         defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (v) => isFsSyncedVariation(v), render: (v) => <span className={styles.naCell}>{isFsSyncedVariation(v) ? '同期済み' : '未同期'}</span> },
  { key: 'status',            label: 'ステータス',     defaultVisible: true,  defaultWidth: 120, sortable: true, sortValue: (v) => v.status ?? '', render: (v) => <StatusPill status={v.status ?? 'FutureShop取込済み'} /> },
  { key: 'nextAction',        label: '次アクション',   defaultVisible: false, defaultWidth: 180, render: (v) => <ActionPill action={v.nextAction ?? '在庫確認'} /> },
  { key: 'image',             label: '画像',           defaultVisible: false, defaultWidth: 90,  render: (v) => <ProductThumbnail imageUrl={v.imageUrl} alt={v.productName ?? v.productNo} /> },
  // 在庫区分
  { key: 'stockType',         label: '在庫区分',       defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.naCell}>{fmtStockType(v.stockType)}</span> },
  { key: 'actualStock',       label: '実在庫',         defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (v) => v.actualStock ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.actualStock)}</span> },
  { key: 'preorderStock',     label: '予約在庫',       defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.preorderStock)}</span> },
  { key: 'plannedStock',      label: '予定在庫',       defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.plannedStock)}</span> },
  { key: 'availableStock',    label: '販売可能在庫',   defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (v) => v.availableStock ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.availableStock)}</span> },
  // 売上データ
  { key: 'salesQty7d',        label: '7日販売数',      defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (v) => v.salesQty7d ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesQty7d)}</span> },
  { key: 'salesQty14d',       label: '14日販売数',     defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.salesQty14d)}</span> },
  { key: 'salesQty30d',       label: '期間販売数',     defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (v) => v.salesQty30d ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesQty30d)}</span> },
  { key: 'salesAmount7d',     label: '7日売上',        defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesAmount7d)}</span> },
  { key: 'salesAmount14d',    label: '14日売上',       defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesAmount14d)}</span> },
  { key: 'salesAmount30d',    label: '期間売上',       defaultVisible: true,  defaultWidth: 100, sortable: true, sortValue: (v) => v.salesAmount30d ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesAmount30d)}</span> },
  { key: 'monthlySalesQty',   label: '月間販売数',       defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (v) => v.monthlySalesQty ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.monthlySalesQty)}</span> },
  { key: 'monthlySalesAmount',label: '月間売上',         defaultVisible: true,  defaultWidth: 100, sortable: true, sortValue: (v) => v.monthlySalesAmount ?? null, render: (v) => <span className={styles.numCell}>{fmtNum(v.monthlySalesAmount)}</span> },
  // 販促
  { key: 'collaborationName', label: 'コラボ名',       defaultVisible: false, defaultWidth: 130, render: (v) => <span className={styles.naCell}>{v.collaborationName ?? '準備中'}</span> },
  { key: 'salesType',         label: '販売区分',       defaultVisible: false, defaultWidth: 110, render: (v) => <span className={styles.naCell}>{fmtSalesType(v.salesType)}</span> },
  { key: 'isSaleTarget',      label: 'セール対象',     defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.naCell}>{fmtBool(v.isSaleTarget)}</span> },
  { key: 'isTimeSaleTarget',  label: 'タイムセール対象', defaultVisible: false, defaultWidth: 120, render: (v) => <span className={styles.naCell}>{fmtBool(v.isTimeSaleTarget)}</span> },
  { key: 'productUrl',        label: '商品URL',        defaultVisible: false, defaultWidth: 100, render: (v) => v.productUrl ? <a href={v.productUrl} target="_blank" rel="noopener noreferrer" className={styles.productUrlLink}>商品ページ</a> : <span className={styles.naCell}>—</span> },
];

// ── Table panels ──────────────────────────────────────────────────────────────

type ProductTablePanelProps = {
  products: MdProduct[];
  totalCount: number;
  isReal: boolean;
  savedAt: string | null;
  configs: ColumnConfig[];
  columns: TableColumn<MdProduct>[];
  onWidthChange: (key: string, width: number) => void;
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
};

function ProductTablePanel({ products, totalCount, isReal, savedAt, configs, columns, onWidthChange, sortConfig, onSort }: ProductTablePanelProps) {
  const colMap = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragWidthRef = useRef(0);

  const visibleCols = useMemo(() =>
    configs
      .filter((c) => c.visible)
      .flatMap((c) => {
        const col = colMap.get(c.key);
        return col ? [{ config: c, col }] : [];
      }),
    [configs, colMap]
  );

  const getWidth = (config: ColumnConfig, col: TableColumn<MdProduct>) =>
    localWidths[config.key] ?? config.width ?? col.defaultWidth ?? 100;

  // Sum of all visible column widths → sets explicit table width so fixed layout works
  const totalWidth = visibleCols.reduce((sum, { config, col }) => sum + getWidth(config, col), 0);

  const startResize = (e: React.MouseEvent, key: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: currentWidth };
    dragWidthRef.current = currentWidth;
    setResizingKey(key);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const w = Math.min(500, Math.max(50, resizingRef.current.startWidth + delta));
      dragWidthRef.current = w;
      setLocalWidths((prev) => ({ ...prev, [resizingRef.current!.key]: w }));
    };

    const onMouseUp = () => {
      const k = resizingRef.current?.key;
      const finalWidth = dragWidthRef.current;
      if (k) {
        onWidthChange(k, finalWidth);
        setLocalWidths((prev) => {
          const next = { ...prev };
          delete next[k];
          return next;
        });
      }
      resizingRef.current = null;
      setResizingKey(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const noticeText = !isReal
    ? '現在はMDツール化に向けたサンプル表示です。実データ連携は次フェーズで実装予定です。'
    : savedAt
    ? '商品登録CSVタブから反映・保存された商品データです。ブラウザ内に保存されています。'
    : '商品登録CSVタブから一時反映された商品データです。リロードすると消えます。';

  const isFiltered = products.length !== totalCount;

  return (
    <div className={styles.tablePanel}>
      <div className={styles.tablePanelHeader}>
        <p className={styles.sampleNotice} data-real={isReal || undefined}>
          {noticeText}
        </p>
        {isFiltered && (
          <span className={styles.tableFilterNote}>
            表示中 {products.length}件 / 全{totalCount}件
          </span>
        )}
      </div>
      <div className={styles.tableWrap}>
        <table
          className={styles.table}
          style={{ width: totalWidth, minWidth: totalWidth }}
        >
          <colgroup>
            {visibleCols.map(({ config, col }) => (
              <col key={config.key} style={{ width: getWidth(config, col) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleCols.map(({ config, col }) => {
                const w = getWidth(config, col);
                const isSorted = sortConfig?.key === config.key;
                const sortIcon = isSorted ? (sortConfig!.dir === 'asc' ? ' ▲' : ' ▼') : col.sortable ? ' ↕' : '';
                return (
                  <th
                    key={config.key}
                    className={`${styles.th}${col.sortable ? ` ${styles.thSortable}` : ''}`}
                    style={{ width: w, minWidth: w }}
                    data-resizing={resizingKey === config.key || undefined}
                    data-sorted={isSorted || undefined}
                  >
                    <span
                      className={styles.thLabel}
                      onClick={col.sortable ? () => onSort?.(config.key) : undefined}
                    >
                      {col.label}
                      {sortIcon && <span className={styles.sortIcon}>{sortIcon}</span>}
                    </span>
                    <span
                      className={styles.resizeHandle}
                      onMouseDown={(e) => startResize(e, config.key, w)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={Math.max(visibleCols.length, 1)}>
                  該当する商品がありません
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.productNo} className={styles.tr}>
                  {visibleCols.map(({ config, col }) => (
                    <td key={config.key} className={styles.td}>{col.render(p)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type VariationTablePanelProps = {
  variations: MdVariation[];
  totalCount: number;
  hasVariations: boolean;
  configs: ColumnConfig[];
  columns: TableColumn<MdVariation>[];
  onWidthChange: (key: string, width: number) => void;
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
};

function VariationTablePanel({ variations, totalCount, hasVariations, configs, columns, onWidthChange, sortConfig, onSort }: VariationTablePanelProps) {
  const colMap = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragWidthRef = useRef(0);

  const visibleCols = useMemo(() =>
    configs
      .filter((c) => c.visible)
      .flatMap((c) => {
        const col = colMap.get(c.key);
        return col ? [{ config: c, col }] : [];
      }),
    [configs, colMap]
  );

  const getWidth = (config: ColumnConfig, col: TableColumn<MdVariation>) =>
    localWidths[config.key] ?? config.width ?? col.defaultWidth ?? 100;

  const totalWidth = visibleCols.reduce((sum, { config, col }) => sum + getWidth(config, col), 0);

  const startResize = (e: React.MouseEvent, key: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: currentWidth };
    dragWidthRef.current = currentWidth;
    setResizingKey(key);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const w = Math.min(500, Math.max(50, resizingRef.current.startWidth + delta));
      dragWidthRef.current = w;
      setLocalWidths((prev) => ({ ...prev, [resizingRef.current!.key]: w }));
    };

    const onMouseUp = () => {
      const k = resizingRef.current?.key;
      const finalWidth = dragWidthRef.current;
      if (k) {
        onWidthChange(k, finalWidth);
        setLocalWidths((prev) => {
          const next = { ...prev };
          delete next[k];
          return next;
        });
      }
      resizingRef.current = null;
      setResizingKey(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  if (!hasVariations) {
    return (
      <div className={styles.tablePanel}>
        <div className={styles.variationEmptyNotice}>
          商品登録CSVタブで商品データを取り込み、「商品一覧へ反映」を押すと、バリエーション別一覧を表示できます。
        </div>
      </div>
    );
  }

  const isFiltered = variations.length !== totalCount;

  return (
    <div className={styles.tablePanel}>
      <div className={styles.tablePanelHeader}>
        <p className={styles.sampleNotice} data-real={true}>
          SKU別バリエーション一覧です。EC在庫・直近売上は次フェーズ（futureshop API連携）で反映予定です。
        </p>
        {isFiltered && (
          <span className={styles.tableFilterNote}>
            表示中 {variations.length}件 / 全{totalCount}件
          </span>
        )}
      </div>
      <div className={styles.tableWrap}>
        <table
          className={styles.table}
          style={{ width: totalWidth, minWidth: totalWidth }}
        >
          <colgroup>
            {visibleCols.map(({ config, col }) => (
              <col key={config.key} style={{ width: getWidth(config, col) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleCols.map(({ config, col }) => {
                const w = getWidth(config, col);
                const isSorted = sortConfig?.key === config.key;
                const sortIcon = isSorted ? (sortConfig!.dir === 'asc' ? ' ▲' : ' ▼') : col.sortable ? ' ↕' : '';
                return (
                  <th
                    key={config.key}
                    className={`${styles.th}${col.sortable ? ` ${styles.thSortable}` : ''}`}
                    style={{ width: w, minWidth: w }}
                    data-resizing={resizingKey === config.key || undefined}
                    data-sorted={isSorted || undefined}
                  >
                    <span
                      className={styles.thLabel}
                      onClick={col.sortable ? () => onSort?.(config.key) : undefined}
                    >
                      {col.label}
                      {sortIcon && <span className={styles.sortIcon}>{sortIcon}</span>}
                    </span>
                    <span
                      className={styles.resizeHandle}
                      onMouseDown={(e) => startResize(e, config.key, w)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {variations.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={Math.max(visibleCols.length, 1)}>
                  該当するバリエーションがありません
                </td>
              </tr>
            ) : (
              variations.map((v, i) => (
                <tr key={`${v.skuCode}-${i}`} className={styles.tr}>
                  {visibleCols.map(({ config, col }) => (
                    <td key={config.key} className={styles.td}>{col.render(v)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Next phase card ───────────────────────────────────────────────────────────

function NextPhaseCard() {
  const items = [
    '商品登録CSVタブから商品データを保存',
    'futureshop APIから在庫・受注を取得',
    'SKU別売上・在庫を蓄積',
    '売れ筋/死に筋を自動判定',
    '欲しいものリストを自動生成',
    '店舗共有用CSV/xlsxを出力',
  ];

  return (
    <div className={styles.nextPhaseCard}>
      <div className={styles.nextPhaseHeading}>次フェーズで追加予定</div>
      <ul className={styles.nextPhaseList}>
        {items.map((item) => (
          <li key={item} className={styles.nextPhaseItem}>
            <span className={styles.nextPhaseIcon}>→</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── FS update section ─────────────────────────────────────────────────────────

type FsUpdateSectionProps = {
  onUpdateFsProducts?: () => Promise<void>;
  fsUpdateStatus?: FsUpdateStatus;
  lastFsSyncAt?: string | null;
  hasData: boolean;
};

function FsUpdateSection({ onUpdateFsProducts, fsUpdateStatus, lastFsSyncAt, hasData }: FsUpdateSectionProps) {
  const status = fsUpdateStatus ?? { state: 'idle' as const };
  const isSyncing = status.state === 'syncing';
  const isStale = lastFsSyncAt ? daysSince(lastFsSyncAt) > 7 : false;

  return (
    <div className={styles.fsUpdateSection}>
      <div className={styles.fsUpdateLeft}>
        <button
          className={styles.fsUpdateBtn}
          onClick={onUpdateFsProducts}
          disabled={!hasData || isSyncing || !onUpdateFsProducts}
          title={!hasData ? '商品データがありません' : 'FutureShopから商品情報を一括更新します'}
        >
          {isSyncing && status.state === 'syncing'
            ? `更新中... (${status.done}/${status.total})`
            : 'FutureShop商品情報を更新'}
        </button>
        {lastFsSyncAt && (
          <span className={`${styles.lastSyncText} ${isStale ? styles.lastSyncWarning : ''}`}>
            商品情報 最終更新: {formatSavedAt(lastFsSyncAt)}
            {isStale && '　⚠ 7日以上更新されていません'}
          </span>
        )}
      </div>
      {status.state === 'success' && (
        <div className={styles.fsUpdateResult}>
          <span className={styles.fsUpdateResultSuccess}>更新完了</span>
          <span className={styles.fsUpdateResultDetail}>
            対象: {status.targetCount}品番 / 更新: {status.updatedProducts}品番 / 変更なし: {status.unchangedProducts}品番 / SKU更新: {status.updatedSkus}件
          </span>
        </div>
      )}
      {status.state === 'error' && (
        <div className={styles.fsUpdateResult}>
          <span className={styles.fsUpdateResultError}>更新エラー: {status.message}</span>
        </div>
      )}
    </div>
  );
}

// ── Sales sync section ────────────────────────────────────────────────────────

type SalesSyncSectionProps = {
  onSyncSales?: (dateFrom: string, dateTo: string) => Promise<void>;
  salesSyncStatus?: SalesSyncStatus;
  hasData: boolean;
};

function SalesSyncSection({ onSyncSales, salesSyncStatus, hasData }: SalesSyncSectionProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(todayStr);

  const status    = salesSyncStatus ?? { state: 'idle' as const };
  const isSyncing = status.state === 'syncing';

  const handleSync = useCallback(async () => {
    if (!onSyncSales || !hasData || isSyncing || !dateFrom || !dateTo) return;
    await onSyncSales(dateFrom, dateTo);
  }, [onSyncSales, hasData, isSyncing, dateFrom, dateTo]);

  return (
    <div className={styles.salesSyncSection}>
      <div className={styles.salesSyncHeader}>
        <span className={styles.salesSyncTitle}>売上同期</span>
        <span className={styles.salesSyncDesc}>FutureShop受注データからSKU別販売数・売上金額を反映します</span>
      </div>
      <div className={styles.salesSyncBody}>
        <div className={styles.salesSyncRow}>
          <label className={styles.salesSyncLabel}>注文日 From</label>
          <input
            type="date"
            className={styles.salesSyncInput}
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <label className={styles.salesSyncLabel}>To</label>
          <input
            type="date"
            className={styles.salesSyncInput}
            value={dateTo}
            min={dateFrom}
            max={todayStr}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <button
            className={styles.salesSyncBtn}
            onClick={handleSync}
            disabled={!hasData || isSyncing || !onSyncSales || !dateFrom || !dateTo}
          >
            {status.state === 'syncing' ? `${status.page}ページ目取得中...` : '売上同期'}
          </button>
          {(status.state === 'idle' || status.state === 'syncing') && hasData && (
            <span className={styles.salesSyncNote}>
              最大20ページ取得するため、最大20秒程度かかる場合があります
            </span>
          )}
          {!hasData && (
            <span className={styles.salesSyncNote}>
              商品データがありません。先に商品登録CSVタブから取り込んでください。
            </span>
          )}
        </div>

        {status.state === 'success' && (
          <div className={styles.salesSyncResult}>
            <div className={styles.salesSyncResultGrid}>
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>受注件数</span>
                <span className={styles.salesResultValue}>{status.orderCount.toLocaleString()}</span>
              </div>
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>明細行数</span>
                <span className={styles.salesResultValue}>{status.lineCount.toLocaleString()}</span>
              </div>
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>総販売点数</span>
                <span className={styles.salesResultValue}>{status.totalSalesQty.toLocaleString()}</span>
              </div>
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>総売上金額</span>
                <span className={styles.salesResultValue}>¥{status.totalSalesAmount.toLocaleString()}</span>
              </div>
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>SKU数</span>
                <span className={styles.salesResultValue}>{status.skuCount.toLocaleString()}</span>
              </div>
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>品番数</span>
                <span className={styles.salesResultValue}>{status.productCount.toLocaleString()}</span>
              </div>
              {status.cancelledOrders > 0 && (
                <div className={styles.salesResultItem}>
                  <span className={styles.salesResultLabel}>キャンセル除外</span>
                  <span className={styles.salesResultValue}>{status.cancelledOrders.toLocaleString()}件</span>
                </div>
              )}
              <div className={styles.salesResultItem}>
                <span className={styles.salesResultLabel}>取得ページ数</span>
                <span className={styles.salesResultValue}>{status.pageCount}ページ</span>
              </div>
            </div>
            {status.paginationStatus === 'limit_reached' && (
              <p className={styles.salesNextUrlWarning}>
                20ページ上限に達したため暫定値です。全データを取得するにはページング上限の拡張が必要です。
              </p>
            )}
            {status.paginationStatus === 'complete' && status.pageCount > 1 && (
              <p className={styles.salesCompleteNote}>
                全{status.pageCount}ページ取得済み（全件反映済み）
              </p>
            )}
          </div>
        )}

        {status.state === 'error' && (
          <div className={styles.salesSyncError}>
            同期エラー: {status.message.slice(0, 80)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ProductsTabProps = {
  products?: MdProduct[];
  variations?: MdVariation[];
  savedAt?: string | null;
  onClearProducts?: () => void;
  onSyncStocks?: () => void;
  syncStatus?: StockSyncStatus;
  onSyncSales?: (dateFrom: string, dateTo: string) => Promise<void>;
  salesSyncStatus?: SalesSyncStatus;
  onUpdateFsProducts?: () => Promise<void>;
  fsUpdateStatus?: FsUpdateStatus;
  lastFsSyncAt?: string | null;
};

export function ProductsTab({
  products = [],
  variations = [],
  savedAt = null,
  onClearProducts,
  onSyncStocks,
  syncStatus,
  onSyncSales,
  salesSyncStatus,
  onUpdateFsProducts,
  fsUpdateStatus,
  lastFsSyncAt,
}: ProductsTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('product');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [visible, setVisible] = useState('all');
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>('all');
  const [varKeyword, setVarKeyword] = useState('');
  const [varCategory, setVarCategory] = useState('');
  const [varStatus, setVarStatus] = useState('');
  const [varCandidateFilter, setVarCandidateFilter] = useState<CandidateFilter>('all');
  const [productSortConfig, setProductSortConfig] = useState<SortConfig>(null);
  const [varSortConfig, setVarSortConfig] = useState<SortConfig>(null);

  const [productConfigs, setProductConfigs] = useState<ColumnConfig[]>(() =>
    loadColumnConfig(PRODUCT_COLUMNS, PRODUCT_STORAGE_KEY)
  );
  const [variationConfigs, setVariationConfigs] = useState<ColumnConfig[]>(() =>
    loadColumnConfig(VARIATION_COLUMNS, VARIATION_STORAGE_KEY)
  );

  const handleProductSort = useCallback((key: string) => {
    setProductSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const handleVarSort = useCallback((key: string) => {
    setVarSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const handleProductChange = (newConfigs: ColumnConfig[]) => {
    setProductConfigs(newConfigs);
    saveColumnConfig(PRODUCT_STORAGE_KEY, newConfigs);
  };
  const handleVariationChange = (newConfigs: ColumnConfig[]) => {
    setVariationConfigs(newConfigs);
    saveColumnConfig(VARIATION_STORAGE_KEY, newConfigs);
  };

  const handleProductWidthChange = useCallback((key: string, width: number) => {
    setProductConfigs((prev) => {
      const next = prev.map((c) => c.key === key ? { ...c, width } : c);
      saveColumnConfig(PRODUCT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleVariationWidthChange = useCallback((key: string, width: number) => {
    setVariationConfigs((prev) => {
      const next = prev.map((c) => c.key === key ? { ...c, width } : c);
      saveColumnConfig(VARIATION_STORAGE_KEY, next);
      return next;
    });
  }, []);

  // "初期表示に戻す" resets order, visibility, and widths all together
  const showAllProduct = () => handleProductChange(productConfigs.map((c) => ({ ...c, visible: true })));
  const resetProduct   = () => handleProductChange(defaultColumnConfigs(PRODUCT_COLUMNS));

  const showAllVariation = () => handleVariationChange(variationConfigs.map((c) => ({ ...c, visible: true })));
  const resetVariation   = () => handleVariationChange(defaultColumnConfigs(VARIATION_COLUMNS));

  const isReal = products.length > 0;
  const hasVariations = variations.length > 0;
  const activeData = isReal ? products : DUMMY_PRODUCTS;
  const unsyncedProductNos = useMemo(
    () => new Set(variations.filter((v) => !isFsSyncedVariation(v)).map((v) => v.productNo)),
    [variations],
  );

  const categories = useMemo(
    () => Array.from(new Set(activeData.map((p) => p.category))).filter(Boolean),
    [activeData],
  );
  const statuses = useMemo(
    () => Array.from(new Set(activeData.map((p) => p.status))).filter(Boolean),
    [activeData],
  );
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return activeData.filter((p) => {
      if (kw && !p.productNo.toLowerCase().includes(kw) && !p.productName.toLowerCase().includes(kw)) return false;
      if (category && p.category !== category) return false;
      if (status && p.status !== status) return false;
      if (visible === 'public'  && normalizeVisible(p.visible) !== true)  return false;
      if (visible === 'private' && normalizeVisible(p.visible) !== false) return false;
      if (visible === 'unknown' && normalizeVisible(p.visible) !== null)  return false;
      if (candidateFilter === 'inStock' && !isInStockCandidate(p)) return false;
      if (candidateFilter === 'hot' && !isHotCandidate(p)) return false;
      if (candidateFilter === 'dead' && !isDeadCandidate(p)) return false;
      if (candidateFilter === 'unsynced' && !unsyncedProductNos.has(p.productNo)) return false;
      return true;
    });
  }, [activeData, keyword, category, status, visible, candidateFilter, unsyncedProductNos]);

  const varCategories = useMemo(
    () => Array.from(new Set(variations.map((v) => v.category))).filter(Boolean),
    [variations],
  );
  const varStatuses = useMemo(
    () => Array.from(new Set(variations.map((v) => v.status))).filter(Boolean),
    [variations],
  );
  const filteredVariations = useMemo(() => {
    const kw = varKeyword.trim().toLowerCase();
    return variations.filter((v) => {
      if (kw) {
        const hit = [v.productNo, v.productName, v.skuCode, v.skuCode.replaceAll('_', ''), v.color ?? '', v.size ?? '']
          .some((s) => (s ?? '').toLowerCase().includes(kw));
        if (!hit) return false;
      }
      if (varCategory && v.category !== varCategory) return false;
      if (varStatus && v.status !== varStatus) return false;
      if (varCandidateFilter === 'inStock' && !isInStockCandidate(v)) return false;
      if (varCandidateFilter === 'hot' && !isHotCandidate(v)) return false;
      if (varCandidateFilter === 'dead' && !isDeadCandidate(v)) return false;
      if (varCandidateFilter === 'unsynced' && isFsSyncedVariation(v)) return false;
      return true;
    });
  }, [variations, varKeyword, varCategory, varStatus, varCandidateFilter]);

  const sortedProducts = useMemo(() => {
    if (!productSortConfig) return filtered;
    const col = PRODUCT_COLUMNS.find((c) => c.key === productSortConfig.key);
    if (!col?.sortValue) return filtered;
    const { dir } = productSortConfig;
    return [...filtered].sort((a, b) => compareValues(col.sortValue!(a), col.sortValue!(b), dir));
  }, [filtered, productSortConfig]);

  const sortedVariations = useMemo(() => {
    if (!varSortConfig) return filteredVariations;
    const col = VARIATION_COLUMNS.find((c) => c.key === varSortConfig.key);
    if (!col?.sortValue) return filteredVariations;
    const { dir } = varSortConfig;
    return [...filteredVariations].sort((a, b) => compareValues(col.sortValue!(a), col.sortValue!(b), dir));
  }, [filteredVariations, varSortConfig]);

  const productCsvNote = isReal
    ? filtered.length !== activeData.length
      ? `表示中${filtered.length}件 / 全${activeData.length}件`
      : `${filtered.length}件を出力`
    : '商品登録CSVタブから反映するとCSV出力できます。';

  const variationCsvNote = hasVariations
    ? filteredVariations.length !== variations.length
      ? `表示中${filteredVariations.length}件 / 全${variations.length}件`
      : `${filteredVariations.length}件を出力`
    : 'バリエーションデータがありません。商品登録CSVタブから反映してください。';

  // CSV exports use sorted data so output order matches display
  const handleProductCsv = () => downloadMdProductsCsv(sortedProducts);
  const handleVariationCsv = () => downloadMdVariationsCsv(sortedVariations);

  const hotCandidateCount = viewMode === 'product'
    ? activeData.filter(isHotCandidate).length
    : variations.filter(isHotCandidate).length;

  const deadCandidateCount = viewMode === 'product'
    ? activeData.filter(isDeadCandidate).length
    : variations.filter(isDeadCandidate).length;

  const candidateCsvUnit = viewMode === 'product' ? '品番' : 'SKU';
  const candidateCsvDisabled = viewMode === 'product' ? !isReal : !hasVariations;

  const handleHotCandidateCsv = () => {
    if (viewMode === 'product') {
      const rows = sortHotCandidateRows(activeData.filter(isHotCandidate));
      downloadMdProductsCsv(rows, `candystripper_hot_candidates_products_${csvDateStamp()}.csv`);
      return;
    }
    const rows = sortHotCandidateRows(variations.filter(isHotCandidate));
    downloadMdVariationsCsv(rows, `candystripper_hot_candidates_skus_${csvDateStamp()}.csv`);
  };

  const handleDeadCandidateCsv = () => {
    if (viewMode === 'product') {
      const rows = sortDeadCandidateRows(activeData.filter(isDeadCandidate));
      downloadMdProductsCsv(rows, `candystripper_dead_candidates_products_${csvDateStamp()}.csv`);
      return;
    }
    const rows = sortDeadCandidateRows(variations.filter(isDeadCandidate));
    downloadMdVariationsCsv(rows, `candystripper_dead_candidates_skus_${csvDateStamp()}.csv`);
  };

  return (
    <div className={styles.root}>
      <DashboardHeader
        isReal={isReal}
        savedAt={savedAt}
        onClearProducts={onClearProducts ?? (() => {})}
        csvLabel={viewMode === 'product' ? '⬇ 商品一覧.csv' : '⬇ バリエーション一覧.csv'}
        csvNote={viewMode === 'product' ? productCsvNote : variationCsvNote}
        onCsvDownload={viewMode === 'product' ? handleProductCsv : handleVariationCsv}
        csvDisabled={viewMode === 'product' ? !isReal : !hasVariations}
        onSyncStocks={onSyncStocks}
        syncStatus={syncStatus}
        hasVariations={hasVariations}
      />

      <div className={styles.candidateCsvActions}>
        <button
          type="button"
          className={`${styles.candidateCsvBtn} ${styles.hotCsvBtn}`}
          onClick={handleHotCandidateCsv}
          disabled={candidateCsvDisabled || hotCandidateCount === 0}
          title={viewMode === 'product' ? '商品別の売れ筋候補をCSV出力します' : 'SKU別の売れ筋候補をCSV出力します'}
        >
          ⬇ 売れ筋候補CSV
        </button>
        <span className={styles.candidateCsvNote}>{hotCandidateCount}{candidateCsvUnit}を出力</span>

        <button
          type="button"
          className={`${styles.candidateCsvBtn} ${styles.deadCsvBtn}`}
          onClick={handleDeadCandidateCsv}
          disabled={candidateCsvDisabled || deadCandidateCount === 0}
          title={viewMode === 'product' ? '商品別の死に筋候補をCSV出力します' : 'SKU別の死に筋候補をCSV出力します'}
        >
          ⬇ 死に筋候補CSV
        </button>
        <span className={styles.candidateCsvNote}>{deadCandidateCount}{candidateCsvUnit}を出力</span>
      </div>

      <FsUpdateSection
        onUpdateFsProducts={onUpdateFsProducts}
        fsUpdateStatus={fsUpdateStatus}
        lastFsSyncAt={lastFsSyncAt}
        hasData={isReal}
      />

      <SalesSyncSection
        onSyncSales={onSyncSales}
        salesSyncStatus={salesSyncStatus}
        hasData={isReal}
      />

      <div className={styles.viewControlRow}>
        <ViewToggle viewMode={viewMode} onChangeMode={setViewMode} />
        <ColumnSelector
          configs={viewMode === 'product' ? productConfigs : variationConfigs}
          columns={viewMode === 'product' ? PRODUCT_COLUMNS : VARIATION_COLUMNS}
          onChange={viewMode === 'product' ? handleProductChange : handleVariationChange}
          onShowAll={viewMode === 'product' ? showAllProduct : showAllVariation}
          onReset={viewMode === 'product' ? resetProduct : resetVariation}
        />
      </div>

      {viewMode === 'product' ? (
        <>
          <KpiRow
            products={activeData}
            isReal={isReal}
            candidateFilter={candidateFilter}
            onCandidateFilter={setCandidateFilter}
            unsyncedProductCount={unsyncedProductNos.size}
          />
          <div className={styles.mainLayout}>
            <FilterPanel
              keyword={keyword}
              category={category}
              status={status}
              visible={visible}
              candidateFilter={candidateFilter}
              categories={categories}
              statuses={statuses}
              onKeyword={setKeyword}
              onCategory={setCategory}
              onStatus={setStatus}
              onVisible={setVisible}
              onCandidateFilter={setCandidateFilter}
              filteredCount={filtered.length}
              totalCount={activeData.length}
            />
            <ProductTablePanel
              products={sortedProducts}
              totalCount={activeData.length}
              isReal={isReal}
              savedAt={savedAt}
              configs={productConfigs}
              columns={PRODUCT_COLUMNS}
              onWidthChange={handleProductWidthChange}
              sortConfig={productSortConfig}
              onSort={handleProductSort}
            />
          </div>
          <NextPhaseCard />
        </>
      ) : (
        <>
          <VariationKpiRow
            variations={variations}
            isReal={hasVariations}
            candidateFilter={varCandidateFilter}
            onCandidateFilter={setVarCandidateFilter}
          />
          <div className={styles.mainLayout}>
            <VariationFilterPanel
              keyword={varKeyword}
              category={varCategory}
              status={varStatus}
              candidateFilter={varCandidateFilter}
              categories={varCategories.filter((v): v is string => Boolean(v))}
              statuses={varStatuses.filter((v): v is string => Boolean(v))}
              onKeyword={setVarKeyword}
              onCategory={setVarCategory}
              onStatus={setVarStatus}
              onCandidateFilter={setVarCandidateFilter}
              filteredCount={filteredVariations.length}
              totalCount={variations.length}
            />
            <VariationTablePanel
              variations={sortedVariations}
              totalCount={variations.length}
              hasVariations={hasVariations}
              configs={variationConfigs}
              columns={VARIATION_COLUMNS}
              onWidthChange={handleVariationWidthChange}
              sortConfig={varSortConfig}
              onSort={handleVarSort}
            />
          </div>
        </>
      )}
    </div>
  );
}
