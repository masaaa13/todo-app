import { useState, useMemo } from 'react';
import type { MdProduct } from '../types/md';
import styles from './ProductsTab.module.css';

// ── Dummy data ────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────

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
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mdProducts.csv';
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

// ── Sub-components ────────────────────────────────────────────────────────

type DashboardHeaderProps = {
  isReal: boolean;
  savedAt: string | null;
  filteredProducts: MdProduct[];
  totalCount: number;
  onClearProducts: () => void;
};

function DashboardHeader({ isReal, savedAt, filteredProducts, totalCount, onClearProducts }: DashboardHeaderProps) {
  const badgeVariant = !isReal ? 'sample' : savedAt ? 'saved' : 'temp';
  const badgeText = !isReal ? 'サンプル表示中' : savedAt ? '保存済みデータ表示中' : '一時反映データ表示中';
  const isFiltered = filteredProducts.length !== totalCount;

  const handleClear = () => {
    if (window.confirm('保存された商品一覧データをクリアします。よろしいですか？')) {
      onClearProducts();
    }
  };

  const csvTitle = isReal
    ? isFiltered
      ? `表示中${filteredProducts.length}件 / 全${totalCount}件を出力`
      : `${filteredProducts.length}件を出力`
    : '商品登録CSVタブから商品一覧へ反映するとCSV出力できます。';

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
            onClick={() => downloadMdProductsCsv(filteredProducts)}
            disabled={!isReal}
            title={csvTitle}
          >
            ⬇ 商品一覧.csv
          </button>
          {isReal && (
            <span className={styles.csvBtnNote}>
              {isFiltered
                ? `表示中${filteredProducts.length}件 / 全${totalCount}件`
                : `表示中${filteredProducts.length}件を出力`}
            </span>
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

type StatusPillProps = { status: string };

function StatusPill({ status }: StatusPillProps) {
  let variant: string;
  if (status === '登録準備OK') variant = 'ok';
  else if (status === '素材補完済み') variant = 'done';
  else if (status.includes('確認済み')) variant = 'info';
  else if (status === '素材未取得') variant = 'warn';
  else if (status === '補完未取得') variant = 'danger';
  else variant = 'neutral';
  return <span className={styles.statusPill} data-variant={variant}>{status}</span>;
}

type ActionPillProps = { action: string };

function ActionPill({ action }: ActionPillProps) {
  let variant: string;
  if (action === 'CSV出力') variant = 'primary';
  else if (action === '素材補完') variant = 'warn';
  else if (action === '商品確認') variant = 'check';
  else variant = 'neutral';
  return <span className={styles.actionPill} data-variant={variant}>{action}</span>;
}

type ProductTablePanelProps = {
  products: MdProduct[];
  totalCount: number;
  isReal: boolean;
  savedAt: string | null;
};

function ProductTablePanel({ products, totalCount, isReal, savedAt }: ProductTablePanelProps) {
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
              <th className={styles.th}>品番</th>
              <th className={styles.th}>商品名</th>
              <th className={styles.th}>カテゴリ</th>
              <th className={styles.th}>発売日</th>
              <th className={styles.th}>SKU数</th>
              <th className={styles.th}>EC在庫</th>
              <th className={styles.th}>直近売上</th>
              <th className={styles.th}>消化率</th>
              <th className={styles.th}>ステータス</th>
              <th className={styles.th}>次アクション</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={10}>該当する商品がありません</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.productNo} className={styles.tr}>
                  <td className={styles.td}>
                    <span className={styles.productNo}>{p.productNo}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.productName}>{p.productName}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.categoryBadge}>{p.category}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.dateCell}>{p.releaseDate ?? '—'}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.numCell}>{p.skuCount ?? '—'}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.naCell}>準備中</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.naCell}>準備中</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.naCell}>準備中</span>
                  </td>
                  <td className={styles.td}>
                    <StatusPill status={p.status} />
                  </td>
                  <td className={styles.td}>
                    <ActionPill action={p.nextAction} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

// ── Main component ────────────────────────────────────────────────────────

type ProductsTabProps = {
  products?: MdProduct[];
  savedAt?: string | null;
  onClearProducts?: () => void;
};

export function ProductsTab({ products = [], savedAt = null, onClearProducts }: ProductsTabProps) {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');

  const isReal = products.length > 0;
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

  return (
    <div className={styles.root}>
      <DashboardHeader
        isReal={isReal}
        savedAt={savedAt}
        filteredProducts={filtered}
        totalCount={activeData.length}
        onClearProducts={onClearProducts ?? (() => {})}
      />
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
        />
      </div>
      <NextPhaseCard />
    </div>
  );
}
