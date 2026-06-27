import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { MdProduct, MdVariation } from '../types/md';
import styles from './ProductsTab.module.css';

type StockSyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'success'; skuCount: number; productCount: number }
  | { state: 'error'; message: string };

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'product' | 'variation';

type ColumnConfig = {
  key: string;
  visible: boolean;
  width?: number;
};

type TableColumn<T> = {
  key: string;
  label: string;
  defaultVisible: boolean;
  defaultWidth?: number;
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

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function downloadMdProductsCsv(products: MdProduct[]): void {
  const header = '品番,商品名,カテゴリ,発売日,SKU数,EC在庫,直近売上,消化率,ステータス,次アクション,商品URL';
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
    ];
    return cols.map(csvEscape).join(',');
  });
  const content = [header, ...rows].join('\r\n');
  const bom = '﻿';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mdProducts.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMdVariationsCsv(variations: MdVariation[]): void {
  const header = '品番,商品名,SKU,カラー,サイズ,カテゴリ,発売日,EC在庫,直近売上,消化率,ステータス,次アクション,商品URL';
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
    ];
    return cols.map(csvEscape).join(',');
  });
  const content = [header, ...rows].join('\r\n');
  const bom = '﻿';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mdVariations.csv';
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

type KpiRowProps = { products: MdProduct[]; isReal: boolean };

function KpiRow({ products, isReal }: KpiRowProps) {
  const totalSku = products.reduce((s, p) => s + (p.skuCount ?? 0), 0);
  const kpis = [
    { label: '登録商品数', value: isReal ? String(products.length) : '—', active: isReal },
    { label: 'SKU数', value: isReal ? String(totalSku) : '—', active: isReal },
    { label: '在庫あり', value: '準備中', active: false },
    { label: '売れ筋候補', value: '準備中', active: false },
    { label: '死に筋候補', value: '準備中', active: false },
    { label: '欲しいもの候補', value: '準備中', active: false },
  ];

  return (
    <div className={styles.kpiRow}>
      {kpis.map(({ label, value, active }) => (
        <div key={label} className={styles.kpiCard} data-active={active || undefined}>
          <span className={styles.kpiValue}>{value}</span>
          <span className={styles.kpiLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function VariationKpiRow({ variations, isReal }: { variations: MdVariation[]; isReal: boolean }) {
  const uniqueProductCount = useMemo(
    () => new Set(variations.map((v) => v.productNo)).size,
    [variations],
  );
  const kpis = [
    { label: '登録商品数', value: isReal ? String(uniqueProductCount) : '—', active: isReal },
    { label: 'SKU数', value: isReal ? String(variations.length) : '—', active: isReal },
    { label: '在庫あり', value: '準備中', active: false },
    { label: '売れ筋候補', value: '準備中', active: false },
    { label: '死に筋候補', value: '準備中', active: false },
    { label: '欲しいもの候補', value: '準備中', active: false },
  ];

  return (
    <div className={styles.kpiRow}>
      {kpis.map(({ label, value, active }) => (
        <div key={label} className={styles.kpiCard} data-active={active || undefined}>
          <span className={styles.kpiValue}>{value}</span>
          <span className={styles.kpiLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

type FilterPanelProps = {
  keyword: string;
  category: string;
  status: string;
  categories: string[];
  statuses: string[];
  onKeyword: (v: string) => void;
  onCategory: (v: string) => void;
  onStatus: (v: string) => void;
  filteredCount: number;
  totalCount: number;
};

function FilterPanel({
  keyword, category, status, categories, statuses,
  onKeyword, onCategory, onStatus, filteredCount, totalCount,
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
  keyword, category, status, categories, statuses,
  onKeyword, onCategory, onStatus, filteredCount, totalCount,
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

// ── Column definitions ────────────────────────────────────────────────────────

const PRODUCT_COLUMNS: TableColumn<MdProduct>[] = [
  { key: 'productNo',         label: '品番',           defaultVisible: true,  defaultWidth: 90,  render: (p) => <span className={styles.productNo}>{p.productNo}</span> },
  { key: 'productName',       label: '商品名',         defaultVisible: true,  defaultWidth: 220, render: (p) => <span className={styles.productName}>{p.productName}</span> },
  { key: 'category',          label: 'カテゴリ',       defaultVisible: true,  defaultWidth: 130, render: (p) => <span className={styles.categoryBadge}>{p.category}</span> },
  { key: 'releaseDate',       label: '発売日',         defaultVisible: true,  defaultWidth: 110, render: (p) => <span className={styles.dateCell}>{p.releaseDate ?? '—'}</span> },
  { key: 'skuCount',          label: 'SKU数',          defaultVisible: true,  defaultWidth: 80,  render: (p) => <span className={styles.numCell}>{p.skuCount ?? '—'}</span> },
  { key: 'ecStock',           label: 'EC在庫',         defaultVisible: true,  defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'recentSales',       label: '直近売上',       defaultVisible: true,  defaultWidth: 100, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'sellThroughRate',   label: '消化率',         defaultVisible: true,  defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'status',            label: 'ステータス',     defaultVisible: true,  defaultWidth: 120, render: (p) => <StatusPill status={p.status} /> },
  { key: 'nextAction',        label: '次アクション',   defaultVisible: true,  defaultWidth: 180, render: (p) => <ActionPill action={p.nextAction} /> },
  { key: 'image',             label: '画像',           defaultVisible: false, defaultWidth: 90,  render: (p) => <ProductThumbnail imageUrl={p.imageUrl} alt={p.productName} /> },
  // 在庫区分
  { key: 'stockType',         label: '在庫区分',       defaultVisible: true,  defaultWidth: 100, render: (p) => <span className={styles.naCell}>{fmtStockType(p.stockType)}</span> },
  { key: 'actualStock',       label: '実在庫',         defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.actualStock)}</span> },
  { key: 'preorderStock',     label: '予約在庫',       defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.preorderStock)}</span> },
  { key: 'plannedStock',      label: '予定在庫',       defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.plannedStock)}</span> },
  { key: 'availableStock',    label: '販売可能在庫',   defaultVisible: true,  defaultWidth: 110, render: (p) => <span className={styles.numCell}>{fmtNum(p.availableStock)}</span> },
  // 売上データ
  { key: 'salesQty7d',        label: '7日販売数',      defaultVisible: true,  defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.salesQty7d)}</span> },
  { key: 'salesQty14d',       label: '14日販売数',     defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.salesQty14d)}</span> },
  { key: 'salesQty30d',       label: '30日販売数',     defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.salesQty30d)}</span> },
  { key: 'salesAmount7d',     label: '7日売上',        defaultVisible: false, defaultWidth: 100, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesAmount7d)}</span> },
  { key: 'salesAmount14d',    label: '14日売上',       defaultVisible: false, defaultWidth: 100, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesAmount14d)}</span> },
  { key: 'salesAmount30d',    label: '30日売上',       defaultVisible: false, defaultWidth: 100, render: (p) => <span className={styles.numCell}>{fmtNum(p.salesAmount30d)}</span> },
  { key: 'monthlySalesQty',   label: '月販売数',       defaultVisible: false, defaultWidth: 90,  render: (p) => <span className={styles.numCell}>{fmtNum(p.monthlySalesQty)}</span> },
  { key: 'monthlySalesAmount',label: '月売上',         defaultVisible: true,  defaultWidth: 100, render: (p) => <span className={styles.numCell}>{fmtNum(p.monthlySalesAmount)}</span> },
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
  { key: 'productNo',         label: '品番',           defaultVisible: true,  defaultWidth: 90,  render: (v) => <span className={styles.productNo}>{v.productNo}</span> },
  { key: 'productName',       label: '商品名',         defaultVisible: true,  defaultWidth: 220, render: (v) => <span className={styles.productName}>{v.productName}</span> },
  { key: 'skuCode',           label: 'SKU',            defaultVisible: true,  defaultWidth: 120, render: (v) => <span className={styles.skuCell}>{v.skuCode.replaceAll('_', '')}</span> },
  { key: 'color',             label: 'カラー',         defaultVisible: true,  defaultWidth: 120, render: (v) => <span className={styles.colorCell}>{v.color ?? '—'}</span> },
  { key: 'size',              label: 'サイズ',         defaultVisible: true,  defaultWidth: 80,  render: (v) => <span className={styles.sizeCell}>{v.size ?? '—'}</span> },
  { key: 'category',          label: 'カテゴリ',       defaultVisible: true,  defaultWidth: 130, render: (v) => <span className={styles.categoryBadge}>{v.category}</span> },
  { key: 'releaseDate',       label: '発売日',         defaultVisible: true,  defaultWidth: 110, render: (v) => <span className={styles.dateCell}>{v.releaseDate ?? '—'}</span> },
  { key: 'ecStock',           label: 'EC在庫',         defaultVisible: false, defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'recentSales',       label: '直近売上',       defaultVisible: false, defaultWidth: 100, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'sellThroughRate',   label: '消化率',         defaultVisible: false, defaultWidth: 90,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'status',            label: 'ステータス',     defaultVisible: true,  defaultWidth: 120, render: (v) => <StatusPill status={v.status} /> },
  { key: 'nextAction',        label: '次アクション',   defaultVisible: false, defaultWidth: 180, render: (v) => <ActionPill action={v.nextAction} /> },
  { key: 'image',             label: '画像',           defaultVisible: false, defaultWidth: 90,  render: (v) => <ProductThumbnail imageUrl={v.imageUrl} alt={v.productName} /> },
  // 在庫区分
  { key: 'stockType',         label: '在庫区分',       defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.naCell}>{fmtStockType(v.stockType)}</span> },
  { key: 'actualStock',       label: '実在庫',         defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.actualStock)}</span> },
  { key: 'preorderStock',     label: '予約在庫',       defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.preorderStock)}</span> },
  { key: 'plannedStock',      label: '予定在庫',       defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.plannedStock)}</span> },
  { key: 'availableStock',    label: '販売可能在庫',   defaultVisible: true,  defaultWidth: 110, render: (v) => <span className={styles.numCell}>{fmtNum(v.availableStock)}</span> },
  // 売上データ
  { key: 'salesQty7d',        label: '7日販売数',      defaultVisible: true,  defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.salesQty7d)}</span> },
  { key: 'salesQty14d',       label: '14日販売数',     defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.salesQty14d)}</span> },
  { key: 'salesQty30d',       label: '30日販売数',     defaultVisible: true,  defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.salesQty30d)}</span> },
  { key: 'salesAmount7d',     label: '7日売上',        defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesAmount7d)}</span> },
  { key: 'salesAmount14d',    label: '14日売上',       defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesAmount14d)}</span> },
  { key: 'salesAmount30d',    label: '30日売上',       defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.numCell}>{fmtNum(v.salesAmount30d)}</span> },
  { key: 'monthlySalesQty',   label: '月販売数',       defaultVisible: false, defaultWidth: 90,  render: (v) => <span className={styles.numCell}>{fmtNum(v.monthlySalesQty)}</span> },
  { key: 'monthlySalesAmount',label: '月売上',         defaultVisible: false, defaultWidth: 100, render: (v) => <span className={styles.numCell}>{fmtNum(v.monthlySalesAmount)}</span> },
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
};

function ProductTablePanel({ products, totalCount, isReal, savedAt, configs, columns, onWidthChange }: ProductTablePanelProps) {
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
                return (
                  <th
                    key={config.key}
                    className={styles.th}
                    style={{ width: w, minWidth: w }}
                    data-resizing={resizingKey === config.key || undefined}
                  >
                    <span className={styles.thLabel}>{col.label}</span>
                    <span
                      className={styles.resizeHandle}
                      onMouseDown={(e) => startResize(e, config.key, w)}
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
};

function VariationTablePanel({ variations, totalCount, hasVariations, configs, columns, onWidthChange }: VariationTablePanelProps) {
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
                return (
                  <th
                    key={config.key}
                    className={styles.th}
                    style={{ width: w, minWidth: w }}
                    data-resizing={resizingKey === config.key || undefined}
                  >
                    <span className={styles.thLabel}>{col.label}</span>
                    <span
                      className={styles.resizeHandle}
                      onMouseDown={(e) => startResize(e, config.key, w)}
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

// ── Main component ────────────────────────────────────────────────────────────

type ProductsTabProps = {
  products?: MdProduct[];
  variations?: MdVariation[];
  savedAt?: string | null;
  onClearProducts?: () => void;
  onSyncStocks?: () => void;
  syncStatus?: StockSyncStatus;
};

export function ProductsTab({
  products = [],
  variations = [],
  savedAt = null,
  onClearProducts,
  onSyncStocks,
  syncStatus,
}: ProductsTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('product');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [varKeyword, setVarKeyword] = useState('');
  const [varCategory, setVarCategory] = useState('');
  const [varStatus, setVarStatus] = useState('');

  const [productConfigs, setProductConfigs] = useState<ColumnConfig[]>(() =>
    loadColumnConfig(PRODUCT_COLUMNS, PRODUCT_STORAGE_KEY)
  );
  const [variationConfigs, setVariationConfigs] = useState<ColumnConfig[]>(() =>
    loadColumnConfig(VARIATION_COLUMNS, VARIATION_STORAGE_KEY)
  );

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
      return true;
    });
  }, [activeData, keyword, category, status]);

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
          .some((s) => s.toLowerCase().includes(kw));
        if (!hit) return false;
      }
      if (varCategory && v.category !== varCategory) return false;
      if (varStatus && v.status !== varStatus) return false;
      return true;
    });
  }, [variations, varKeyword, varCategory, varStatus]);

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

  return (
    <div className={styles.root}>
      <DashboardHeader
        isReal={isReal}
        savedAt={savedAt}
        onClearProducts={onClearProducts ?? (() => {})}
        csvLabel={viewMode === 'product' ? '⬇ 商品一覧.csv' : '⬇ バリエーション一覧.csv'}
        csvNote={viewMode === 'product' ? productCsvNote : variationCsvNote}
        onCsvDownload={
          viewMode === 'product'
            ? () => downloadMdProductsCsv(filtered)
            : () => downloadMdVariationsCsv(filteredVariations)
        }
        csvDisabled={viewMode === 'product' ? !isReal : !hasVariations}
        onSyncStocks={onSyncStocks}
        syncStatus={syncStatus}
        hasVariations={hasVariations}
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
          <KpiRow products={activeData} isReal={isReal} />
          <div className={styles.mainLayout}>
            <FilterPanel
              keyword={keyword}
              category={category}
              status={status}
              categories={categories}
              statuses={statuses}
              onKeyword={setKeyword}
              onCategory={setCategory}
              onStatus={setStatus}
              filteredCount={filtered.length}
              totalCount={activeData.length}
            />
            <ProductTablePanel
              products={filtered}
              totalCount={activeData.length}
              isReal={isReal}
              savedAt={savedAt}
              configs={productConfigs}
              columns={PRODUCT_COLUMNS}
              onWidthChange={handleProductWidthChange}
            />
          </div>
          <NextPhaseCard />
        </>
      ) : (
        <>
          <VariationKpiRow variations={variations} isReal={hasVariations} />
          <div className={styles.mainLayout}>
            <VariationFilterPanel
              keyword={varKeyword}
              category={varCategory}
              status={varStatus}
              categories={varCategories}
              statuses={varStatuses}
              onKeyword={setVarKeyword}
              onCategory={setVarCategory}
              onStatus={setVarStatus}
              filteredCount={filteredVariations.length}
              totalCount={variations.length}
            />
            <VariationTablePanel
              variations={filteredVariations}
              totalCount={variations.length}
              hasVariations={hasVariations}
              configs={variationConfigs}
              columns={VARIATION_COLUMNS}
              onWidthChange={handleVariationWidthChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
