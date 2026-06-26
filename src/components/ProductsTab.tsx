import { useState, useRef, useEffect, useMemo } from 'react';
import type { MdProduct, MdVariation } from '../types/md';
import styles from './ProductsTab.module.css';

type ViewMode = 'product' | 'variation';

type TableColumn<T> = {
  key: string;
  label: string;
  defaultVisible: boolean;
  render: (row: T) => React.ReactNode;
};

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
  const header = '品番,商品名,カテゴリ,発売日,SKU数,EC在庫,直近売上,消化率,ステータス,次アクション';
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
  const header = '品番,商品名,SKU,カラー,サイズ,カテゴリ,発売日,EC在庫,直近売上,消化率,ステータス,次アクション';
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

// ── Column visibility helpers ─────────────────────────────────────────────────

function loadVisible(
  columns: { key: string; defaultVisible: boolean }[],
  storageKey: string,
): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set(columns.filter((c) => c.defaultVisible).map((c) => c.key));
}

function saveVisible(storageKey: string, visible: Set<string>): void {
  try { localStorage.setItem(storageKey, JSON.stringify([...visible])); } catch {}
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
};

function DashboardHeader({
  isReal, savedAt, onClearProducts,
  csvLabel, csvNote, onCsvDownload, csvDisabled,
}: DashboardHeaderProps) {
  const badgeVariant = !isReal ? 'sample' : savedAt ? 'saved' : 'temp';
  const badgeText = !isReal ? 'サンプル表示中' : savedAt ? '保存済みデータ表示中' : '一時反映データ表示中';

  const handleClear = () => {
    if (window.confirm('保存された商品一覧データをクリアします。よろしいですか？')) {
      onClearProducts();
    }
  };

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

// ── Column selector ───────────────────────────────────────────────────────────

type ColumnSelectorProps = {
  columns: { key: string; label: string }[];
  visible: Set<string>;
  onToggle: (key: string, v: boolean) => void;
  onShowAll: () => void;
  onReset: () => void;
};

function ColumnSelector({ columns, visible, onToggle, onShowAll, onReset }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

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
            {columns.map((col) => (
              <label key={col.key} className={styles.colSelectorItem}>
                <input
                  type="checkbox"
                  className={styles.colSelectorCheck}
                  checked={visible.has(col.key)}
                  onChange={(e) => onToggle(col.key, e.target.checked)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

const PRODUCT_COLUMNS: TableColumn<MdProduct>[] = [
  { key: 'productNo',       label: '品番',       defaultVisible: true,  render: (p) => <span className={styles.productNo}>{p.productNo}</span> },
  { key: 'productName',     label: '商品名',     defaultVisible: true,  render: (p) => <span className={styles.productName}>{p.productName}</span> },
  { key: 'category',        label: 'カテゴリ',   defaultVisible: true,  render: (p) => <span className={styles.categoryBadge}>{p.category}</span> },
  { key: 'releaseDate',     label: '発売日',     defaultVisible: true,  render: (p) => <span className={styles.dateCell}>{p.releaseDate ?? '—'}</span> },
  { key: 'skuCount',        label: 'SKU数',      defaultVisible: true,  render: (p) => <span className={styles.numCell}>{p.skuCount ?? '—'}</span> },
  { key: 'ecStock',         label: 'EC在庫',     defaultVisible: true,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'recentSales',     label: '直近売上',   defaultVisible: true,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'sellThroughRate', label: '消化率',     defaultVisible: true,  render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'status',          label: 'ステータス', defaultVisible: true,  render: (p) => <StatusPill status={p.status} /> },
  { key: 'nextAction',      label: '次アクション', defaultVisible: true, render: (p) => <ActionPill action={p.nextAction} /> },
  { key: 'image',           label: '画像',       defaultVisible: false, render: () => <span className={styles.naCell}>準備中</span> },
];

const VARIATION_COLUMNS: TableColumn<MdVariation>[] = [
  { key: 'productNo',       label: '品番',       defaultVisible: true,  render: (v) => <span className={styles.productNo}>{v.productNo}</span> },
  { key: 'productName',     label: '商品名',     defaultVisible: true,  render: (v) => <span className={styles.productName}>{v.productName}</span> },
  { key: 'skuCode',         label: 'SKU',        defaultVisible: true,  render: (v) => <span className={styles.skuCell}>{v.skuCode.replaceAll('_', '')}</span> },
  { key: 'color',           label: 'カラー',     defaultVisible: true,  render: (v) => <span className={styles.colorCell}>{v.color ?? '—'}</span> },
  { key: 'size',            label: 'サイズ',     defaultVisible: true,  render: (v) => <span className={styles.sizeCell}>{v.size ?? '—'}</span> },
  { key: 'category',        label: 'カテゴリ',   defaultVisible: true,  render: (v) => <span className={styles.categoryBadge}>{v.category}</span> },
  { key: 'releaseDate',     label: '発売日',     defaultVisible: true,  render: (v) => <span className={styles.dateCell}>{v.releaseDate ?? '—'}</span> },
  { key: 'ecStock',         label: 'EC在庫',     defaultVisible: false, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'recentSales',     label: '直近売上',   defaultVisible: false, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'sellThroughRate', label: '消化率',     defaultVisible: false, render: () => <span className={styles.naCell}>準備中</span> },
  { key: 'status',          label: 'ステータス', defaultVisible: true,  render: (v) => <StatusPill status={v.status} /> },
  { key: 'nextAction',      label: '次アクション', defaultVisible: false, render: (v) => <ActionPill action={v.nextAction} /> },
];

// ── Table panels ──────────────────────────────────────────────────────────────

type ProductTablePanelProps = {
  products: MdProduct[];
  totalCount: number;
  isReal: boolean;
  savedAt: string | null;
  columns: TableColumn<MdProduct>[];
};

function ProductTablePanel({ products, totalCount, isReal, savedAt, columns }: ProductTablePanelProps) {
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
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={styles.th}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={columns.length}>該当する商品がありません</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.productNo} className={styles.tr}>
                  {columns.map((col) => (
                    <td key={col.key} className={styles.td}>{col.render(p)}</td>
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
  columns: TableColumn<MdVariation>[];
};

function VariationTablePanel({ variations, totalCount, hasVariations, columns }: VariationTablePanelProps) {
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
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={styles.th}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variations.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={columns.length}>該当するバリエーションがありません</td>
              </tr>
            ) : (
              variations.map((v, i) => (
                <tr key={`${v.skuCode}-${i}`} className={styles.tr}>
                  {columns.map((col) => (
                    <td key={col.key} className={styles.td}>{col.render(v)}</td>
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
};

export function ProductsTab({
  products = [],
  variations = [],
  savedAt = null,
  onClearProducts,
}: ProductsTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('product');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [varKeyword, setVarKeyword] = useState('');
  const [varCategory, setVarCategory] = useState('');
  const [varStatus, setVarStatus] = useState('');

  // Column visibility
  const [productVisible, setProductVisible] = useState<Set<string>>(() =>
    loadVisible(PRODUCT_COLUMNS, PRODUCT_STORAGE_KEY)
  );
  const [variationVisible, setVariationVisible] = useState<Set<string>>(() =>
    loadVisible(VARIATION_COLUMNS, VARIATION_STORAGE_KEY)
  );

  const toggleProduct = (key: string, show: boolean) =>
    setProductVisible((prev) => {
      const next = new Set(prev);
      if (show) next.add(key); else next.delete(key);
      saveVisible(PRODUCT_STORAGE_KEY, next);
      return next;
    });

  const toggleVariation = (key: string, show: boolean) =>
    setVariationVisible((prev) => {
      const next = new Set(prev);
      if (show) next.add(key); else next.delete(key);
      saveVisible(VARIATION_STORAGE_KEY, next);
      return next;
    });

  const showAllProduct = () => {
    const all = new Set(PRODUCT_COLUMNS.map((c) => c.key));
    setProductVisible(all);
    saveVisible(PRODUCT_STORAGE_KEY, all);
  };
  const resetProduct = () => {
    const defaults = new Set(PRODUCT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
    setProductVisible(defaults);
    saveVisible(PRODUCT_STORAGE_KEY, defaults);
  };

  const showAllVariation = () => {
    const all = new Set(VARIATION_COLUMNS.map((c) => c.key));
    setVariationVisible(all);
    saveVisible(VARIATION_STORAGE_KEY, all);
  };
  const resetVariation = () => {
    const defaults = new Set(VARIATION_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
    setVariationVisible(defaults);
    saveVisible(VARIATION_STORAGE_KEY, defaults);
  };

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

  const visibleProductCols = PRODUCT_COLUMNS.filter((c) => productVisible.has(c.key));
  const visibleVariationCols = VARIATION_COLUMNS.filter((c) => variationVisible.has(c.key));

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
      />

      <div className={styles.viewControlRow}>
        <ViewToggle viewMode={viewMode} onChangeMode={setViewMode} />
        <ColumnSelector
          columns={viewMode === 'product' ? PRODUCT_COLUMNS : VARIATION_COLUMNS}
          visible={viewMode === 'product' ? productVisible : variationVisible}
          onToggle={viewMode === 'product' ? toggleProduct : toggleVariation}
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
              columns={visibleProductCols}
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
              columns={visibleVariationCols}
            />
          </div>
        </>
      )}
    </div>
  );
}
