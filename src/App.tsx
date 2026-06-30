import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useTasks } from './hooks/useTasks';
import { useReminder } from './hooks/useReminder';
import type { AppTab } from './components/AppTabs';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { FilterTabs } from './components/FilterTabs';
import { SearchBar } from './components/SearchBar';
import { ProductsTab } from './components/ProductsTab';
import { WishlistTab } from './components/WishlistTab';
import { BudgetTab } from './components/BudgetTab';
import { ScheduleTab } from './components/ScheduleTab';
import { InventoryTab } from './components/InventoryTab';
import { ImportTab } from './components/ImportTab';
import { LoginGate, loadAuth, clearAuth } from './components/LoginGate';
import { sortTasks } from './utils/taskSort';
import { applyFilter, applySearch } from './utils/taskFilter';
import type { FilterType } from './types/filter';
import type { SortType } from './types/sort';
import type { MdProduct, MdVariation } from './types/md';

export type StockSyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'success'; skuCount: number; productCount: number }
  | { state: 'error'; message: string };

export type SalesSyncStatus =
  | { state: 'idle' }
  | { state: 'syncing'; page: number }
  | { state: 'success'; orderCount: number; lineCount: number; totalSalesQty: number; totalSalesAmount: number; skuCount: number; productCount: number; cancelledOrders: number; pageCount: number; paginationStatus: 'complete' | 'limit_reached' }
  | { state: 'error'; message: string };

export type FsUpdateStatus =
  | { state: 'idle' }
  | { state: 'syncing'; done: number; total: number }
  | { state: 'success'; targetCount: number; updatedProducts: number; unchangedProducts: number; updatedSkus: number }
  | { state: 'error'; message: string };

import styles from './App.module.css';

const MD_PRODUCTS_KEY   = 'ecTodo.mdProducts';
const MD_VARIATIONS_KEY = 'ecTodo.mdVariations';

function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    const domError = error as DOMException;
    const isQuotaError =
      domError?.name === 'QuotaExceededError' ||
      domError?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      domError?.code === 22 ||
      domError?.code === 1014;

    console.warn(
      isQuotaError
        ? `localStorage quota exceeded: ${key}. Data will remain in memory for this session.`
        : `localStorage save failed: ${key}`,
      error,
    );

    return false;
  }
}

const MD_FS_SYNC_AT_KEY = 'ecTodo.lastFsSyncAt';

function normalizeProductNos(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => String(v ?? '').trim())
        .filter((v) => /^\d{7}$/.test(v)),
    ),
  );
}


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

function loadMdProductsFromStorage(): { products: MdProduct[]; savedAt: string | null } {
  try {
    const raw = localStorage.getItem(MD_PRODUCTS_KEY);
    if (!raw) return { products: [], savedAt: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.products)) return { products: [], savedAt: null };
    return { products: parsed.products, savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null };
  } catch {
    return { products: [], savedAt: null };
  }
}

function loadMdVariationsFromStorage(): { variations: MdVariation[]; savedAt: string | null } {
  try {
    const raw = localStorage.getItem(MD_VARIATIONS_KEY);
    if (!raw) return { variations: [], savedAt: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.variations)) return { variations: [], savedAt: null };
    return { variations: parsed.variations, savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null };
  } catch {
    return { variations: [], savedAt: null };
  }
}

const NAV_ITEMS: { tab: AppTab; icon: string; label: string }[] = [
  { tab: 'products',  icon: '📦', label: '商品一覧' },
  { tab: 'wishlist',  icon: '📋', label: '欲しいものリスト' },
  { tab: 'budget',    icon: '💰', label: '予算管理' },
  { tab: 'import',    icon: '⬇',  label: '商品登録CSV' },
  { tab: 'inventory', icon: '📊', label: '在庫候補' },
  { tab: 'schedules', icon: '🗓', label: 'スケジュール' },
  { tab: 'tasks',     icon: '✓',  label: 'タスク' },
];

function App() {
  const { user } = useAuth();
  const { tasks, loading, error, addTask, toggleTask, deleteTask, editTask, clearCompleted } = useTasks(user);

  const [loggedIn, setLoggedIn] = useState<boolean>(() => loadAuth() !== null);
  const [activeTab, setActiveTab] = useState<AppTab>('products');
  const [mdProducts, setMdProducts] = useState<MdProduct[]>([]);
  const [mdProductsSavedAt, setMdProductsSavedAt] = useState<string | null>(null);
  const [mdVariations, setMdVariations] = useState<MdVariation[]>([]);
  const [syncStatus, setSyncStatus] = useState<StockSyncStatus>({ state: 'idle' });
  const [salesSyncStatus, setSalesSyncStatus] = useState<SalesSyncStatus>({ state: 'idle' });
  const [fsUpdateStatus, setFsUpdateStatus] = useState<FsUpdateStatus>({ state: 'idle' });
  const [lastFsSyncAt, setLastFsSyncAt] = useState<string | null>(() => {
    try { return localStorage.getItem(MD_FS_SYNC_AT_KEY); } catch { return null; }
  });
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('dueDate');
  const [search, setSearch] = useState('');

  useReminder(tasks);

  useEffect(() => {
    const { products, savedAt } = loadMdProductsFromStorage();
    if (products.length > 0) {
      setMdProducts(products);
      setMdProductsSavedAt(savedAt);
    }
    const { variations } = loadMdVariationsFromStorage();
    if (variations.length > 0) {
      setMdVariations(variations);
    }
  }, []);

  const clearMdProductsStorage = useCallback(() => {
    localStorage.removeItem(MD_PRODUCTS_KEY);
    localStorage.removeItem(MD_VARIATIONS_KEY);
    setMdProducts([]);
    setMdProductsSavedAt(null);
    setMdVariations([]);
    setSyncStatus({ state: 'idle' });
    setSalesSyncStatus({ state: 'idle' });
  }, []);

  const syncStocks = useCallback(async () => {
    if (mdVariations.length === 0) return;
    setSyncStatus({ state: 'syncing' });

    const productNos = normalizeProductNos(mdVariations.map((v) => v.productNo));
    const CHUNK_SIZE = 100;
    const allStock: Record<string, number> = {};

    try {
      for (let i = 0; i < productNos.length; i += CHUNK_SIZE) {
        const chunk = productNos.slice(i, i + CHUNK_SIZE);
        if (i > 0) await new Promise<void>((r) => setTimeout(r, 1100));

        const res = await fetch('/api/check-stock', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ productNos: chunk }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as { ok?: boolean; stock?: Record<string, number> };
        if (!data.ok) throw new Error('API returned ok=false');
        Object.assign(allStock, data.stock ?? {});
      }

      const updatedVariations = mdVariations.map((v) => {
        const normalSku = v.skuCode.replaceAll('_', '');
        if (!Object.prototype.hasOwnProperty.call(allStock, normalSku)) return v;
        const stock = allStock[normalSku];
        return { ...v, actualStock: stock, availableStock: stock, stockType: 'actual' as const };
      });

      const stockByProduct: Record<string, number> = {};
      for (const v of updatedVariations) {
        if (v.actualStock != null) {
          stockByProduct[v.productNo] = (stockByProduct[v.productNo] ?? 0) + v.actualStock;
        }
      }

      const updatedProducts = mdProducts.map((p) => {
        if (!Object.prototype.hasOwnProperty.call(stockByProduct, p.productNo)) return p;
        const stock = stockByProduct[p.productNo];
        return { ...p, actualStock: stock, availableStock: stock, stockType: 'actual' as const };
      });

      const now = new Date().toISOString();
      safeSetLocalStorage(MD_PRODUCTS_KEY, JSON.stringify({ products: updatedProducts, savedAt: mdProductsSavedAt ?? now }));
      // バリエーションは容量が大きいため localStorage には保存しない
    // safeSetLocalStorage(MD_VARIATIONS_KEY, JSON.stringify({ variations: updatedVariations, savedAt: now }));

      setMdVariations(updatedVariations);
      setMdProducts(updatedProducts);
      setSyncStatus({
        state:        'success',
        skuCount:     Object.keys(allStock).length,
        productCount: Object.keys(stockByProduct).length,
      });
    } catch (err) {
      setSyncStatus({ state: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [mdVariations, mdProducts, mdProductsSavedAt]);

  const syncSales = useCallback(async (dateFrom: string, dateTo: string) => {
    if (mdProducts.length === 0) return;

    type PageData = {
      ok?: boolean;
      orderCount?: number;
      lineCount?: number;
      totalSalesQty?: number;
      totalSalesAmount?: number;
      nextUrl?: string | null;
      skuSales?: { skuCode: string; salesQty: number; salesAmount: number }[];
      productSales?: { productNo: string; salesQty: number; salesAmount: number }[];
      excluded?: { cancelledOrders?: number };
    };

    const MAX_PAGES = 20;
    const skuMap  = new Map<string, { skuCode: string; salesQty: number; salesAmount: number }>();
    const prodMap = new Map<string, { productNo: string; salesQty: number; salesAmount: number }>();
    let accOrderCount  = 0;
    let accLineCount   = 0;
    let accSalesQty    = 0;
    let accSalesAmount = 0;
    let accCancelled   = 0;
    let cursor: string | null = null;
    let pageCount = 0;
    let paginationStatus: 'complete' | 'limit_reached' = 'complete';

    setSalesSyncStatus({ state: 'syncing', page: 1 });

    try {
      while (pageCount < MAX_PAGES) {
        const body: Record<string, string> = {
          orderDateStart: `${dateFrom}T00:00:00`,
          orderDateEnd:   `${dateTo}T23:59:59`,
        };
        if (cursor) body.cursor = cursor;

        const res = await fetch('/api/check-orders', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as PageData;
        if (!data.ok) throw new Error('API returned ok=false');

        pageCount++;
        accOrderCount  += data.orderCount  ?? 0;
        accLineCount   += data.lineCount   ?? 0;
        accSalesQty    += data.totalSalesQty    ?? 0;
        accSalesAmount += data.totalSalesAmount ?? 0;
        accCancelled   += data.excluded?.cancelledOrders ?? 0;

        for (const s of (data.skuSales ?? [])) {
          const prev = skuMap.get(s.skuCode);
          if (prev) { prev.salesQty += s.salesQty; prev.salesAmount += s.salesAmount; }
          else { skuMap.set(s.skuCode, { skuCode: s.skuCode, salesQty: s.salesQty, salesAmount: s.salesAmount }); }
        }
        for (const p of (data.productSales ?? [])) {
          const prev = prodMap.get(p.productNo);
          if (prev) { prev.salesQty += p.salesQty; prev.salesAmount += p.salesAmount; }
          else { prodMap.set(p.productNo, { productNo: p.productNo, salesQty: p.salesQty, salesAmount: p.salesAmount }); }
        }

        if (!data.nextUrl) { paginationStatus = 'complete'; break; }

        let nextCursor: string | null = null;
        try { nextCursor = new URL(data.nextUrl).searchParams.get('cursor'); } catch { /* invalid URL */ }
        if (!nextCursor) { paginationStatus = 'complete'; break; }

        if (pageCount >= MAX_PAGES) { paginationStatus = 'limit_reached'; break; }

        cursor = nextCursor;
        setSalesSyncStatus({ state: 'syncing', page: pageCount + 1 });
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      }

      const productSalesMap = new Map(Array.from(prodMap.values()).map((p) => [p.productNo, p]));
      const skuSalesMap     = new Map(Array.from(skuMap.values()).map((s) => [s.skuCode, s]));

      const updatedProducts = mdProducts.map((p) => {
        const sales = productSalesMap.get(p.productNo);
        if (!sales) return p;
        return { ...p, salesQty30d: sales.salesQty, salesAmount30d: sales.salesAmount, monthlySalesQty: sales.salesQty, monthlySalesAmount: sales.salesAmount };
      });
      const updatedVariations = mdVariations.map((v) => {
        const normalSku = v.skuCode.replaceAll('_', '');
        const sales = skuSalesMap.get(normalSku);
        if (!sales) return v;
        return { ...v, salesQty30d: sales.salesQty, salesAmount30d: sales.salesAmount, monthlySalesQty: sales.salesQty, monthlySalesAmount: sales.salesAmount };
      });

      const now = new Date().toISOString();
      safeSetLocalStorage(MD_PRODUCTS_KEY, JSON.stringify({ products: updatedProducts, savedAt: mdProductsSavedAt ?? now }));
      // バリエーションは容量が大きいため localStorage には保存しない
    // safeSetLocalStorage(MD_VARIATIONS_KEY, JSON.stringify({ variations: updatedVariations, savedAt: now }));
      setMdProducts(updatedProducts);
      setMdVariations(updatedVariations);
      setSalesSyncStatus({
        state:            'success',
        orderCount:       accOrderCount,
        lineCount:        accLineCount,
        totalSalesQty:    accSalesQty,
        totalSalesAmount: accSalesAmount,
        skuCount:         skuMap.size,
        productCount:     prodMap.size,
        cancelledOrders:  accCancelled,
        pageCount,
        paginationStatus,
      });
    } catch (err) {
      setSalesSyncStatus({ state: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [mdProducts, mdVariations, mdProductsSavedAt]);

  const updateFsProducts = useCallback(async () => {
    if (mdProducts.length === 0) return;
    const productNos = normalizeProductNos(mdProducts.map((p) => p.productNo));
    const CHUNK = 50;
    const total = productNos.length;
    setFsUpdateStatus({ state: 'syncing', done: 0, total });

    type VpsVariation = {
      skuCode: string; colorBranchNo: string; colorName: string;
      sizeBranchNo: string; sizeName: string; janCode: string;
      stockCount: number | null; price?: number | null;
    };
    type VpsProduct = {
      productNo: string; url: string; uri: string; name: string;
      unitPrice: number | string;
      visible: boolean | string | null; imageUrl: string;
      variations: VpsVariation[];
      hasPreorder: boolean; hasPlannedStock: boolean;
    };
    type VpsResponse = { ok: boolean; products: VpsProduct[] };

    function normalizeVisibleLocal(v: unknown): boolean | undefined {
      if (v === true  || v === 'true')  return true;
      if (v === false || v === 'false') return false;
      return undefined;
    }

    const allFsProducts: VpsProduct[] = [];
    try {
      for (let i = 0; i < productNos.length; i += CHUNK) {
        if (i > 0) await new Promise<void>((r) => setTimeout(r, 1100));
        const chunk = productNos.slice(i, i + CHUNK);
        const res = await fetch('/api/check-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productNos: chunk, types: ['variation', 'image', 'preorder', 'plannedStock'] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as VpsResponse;
        if (!data.ok) throw new Error('VPS returned ok=false');
        allFsProducts.push(...(data.products ?? []));
        setFsUpdateStatus({ state: 'syncing', done: Math.min(i + CHUNK, total), total });
      }

      const fsMap = new Map(allFsProducts.map((p) => [p.productNo, p]));

      let updatedProducts = 0;
      let unchangedProducts = 0;
      let updatedSkus = 0;

      const newProducts = mdProducts.map((p) => {
        const fp = fsMap.get(p.productNo);
        if (!fp) { unchangedProducts++; return p; }
        const patch: Partial<MdProduct> = {};
        const incoming: Partial<MdProduct> = {
          productName: fp.name,
          imageUrl: fp.imageUrl || undefined,
          price: isNaN(Number(fp.unitPrice)) ? null : Number(fp.unitPrice),
          productUrl: fp.uri,
          productUrlCode: fp.url,
          visible: normalizeVisibleLocal(fp.visible),
          hasPreorder: fp.hasPreorder,
          hasPlannedStock: fp.hasPlannedStock,
          importSource: 'futureshop',
          skuCount: fp.variations.length,
        };
        let changed = false;
        for (const key of FS_PRODUCT_UPDATE_KEYS) {
          const n = (incoming as Record<string, unknown>)[key];
          if (n === undefined) continue;
          if ((p as Record<string, unknown>)[key] !== n) {
            (patch as Record<string, unknown>)[key] = n;
            changed = true;
          }
        }
        if (changed) { updatedProducts++; return { ...p, ...patch }; }
        unchangedProducts++;
        return p;
      });

      const fsVarMap = new Map<string, VpsProduct>();
      for (const fp of allFsProducts) {
        for (const v of fp.variations ?? []) {
          fsVarMap.set(`${fp.productNo}__${v.skuCode}`, fp);
        }
      }
      const fsVarDetailMap = new Map<string, VpsVariation>();
      for (const fp of allFsProducts) {
        for (const v of fp.variations ?? []) {
          fsVarDetailMap.set(`${fp.productNo}__${v.skuCode}`, v);
        }
      }

      const newVariations = mdVariations.map((v) => {
        const key = `${v.productNo}__${v.skuCode}`;
        const fv  = fsVarDetailMap.get(key);
        const fp  = fsVarMap.get(key);
        if (!fv || !fp) return v;
        const varPrice = fv.price != null ? Number(fv.price) : (isNaN(Number(fp.unitPrice)) ? null : Number(fp.unitPrice));
        const incoming: Partial<MdVariation> = {
          productName:   fp.name,
          colorBranchNo: fv.colorBranchNo || undefined,
          colorName:     fv.colorName     || undefined,
          sizeBranchNo:  fv.sizeBranchNo  || undefined,
          sizeName:      fv.sizeName      || undefined,
          janCode:       fv.janCode       || undefined,
          price:         isNaN(varPrice ?? NaN) ? null : varPrice,
          productUrl:    fp.uri,
          imageUrl:      fp.imageUrl || undefined,
          visible:       normalizeVisibleLocal(fp.visible),
          hasPreorder:   fp.hasPreorder,
          hasPlannedStock: fp.hasPlannedStock,
        };
        const patch: Partial<MdVariation> = {};
        let changed = false;
        for (const k of FS_VARIATION_UPDATE_KEYS) {
          const n = (incoming as Record<string, unknown>)[k];
          if (n === undefined) continue;
          if ((v as Record<string, unknown>)[k] !== n) {
            (patch as Record<string, unknown>)[k] = n;
            changed = true;
          }
        }
        if (changed) { updatedSkus++; return { ...v, ...patch }; }
        return v;
      });

      const now = new Date().toISOString();
      safeSetLocalStorage(MD_PRODUCTS_KEY, JSON.stringify({ products: newProducts, savedAt: mdProductsSavedAt ?? now }));
      // バリエーションは容量が大きいため localStorage には保存しない
    // safeSetLocalStorage(MD_VARIATIONS_KEY, JSON.stringify({ variations: newVariations, savedAt: now }));
      safeSetLocalStorage(MD_FS_SYNC_AT_KEY, now);
      setMdProducts(newProducts);
      setMdVariations(newVariations);
      setLastFsSyncAt(now);
      setFsUpdateStatus({ state: 'success', targetCount: total, updatedProducts, unchangedProducts, updatedSkus });
    } catch (err) {
      setFsUpdateStatus({ state: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [mdProducts, mdVariations, mdProductsSavedAt]);

  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;
  const displayTasks = applySearch(applyFilter(sortTasks(tasks, sortBy), filter), search);

  if (!loggedIn) {
    return <LoginGate onLogin={() => setLoggedIn(true)} />;
  }

  const handleLogout = () => {
    clearAuth();
    setLoggedIn(false);
  };

  return (
    <div className={styles.appShell}>

      {/* ── Top bar ── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.appTitle}>EC ToDo</span>
          <span className={styles.appDivider}>|</span>
          <span className={styles.appSubtitle}>Candy Stripper MD Tool</span>
          <span className={styles.appDesc}>商品登録CSV・商品一覧・MD判断をまとめる社内ツール</span>
        </div>
        <div className={styles.topBarRight}>
          <span className={styles.topBadge}>Local / Browser storage</span>
          <span className={`${styles.topBadge} ${styles.topBadgeDim}`}>Supabase disabled</span>
          <span className={styles.topBadge}>Logged in</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>ログアウト</button>
        </div>
      </header>

      {/* ── App body = sidebar + main ── */}
      <div className={styles.appBody}>

        {/* Side nav */}
        <nav className={styles.sideNav} aria-label="メインナビゲーション">
          {NAV_ITEMS.map(({ tab, icon, label }) => (
            <button
              key={tab}
              className={styles.navItem}
              data-active={activeTab === tab || undefined}
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.navLabel}>{label}</span>
              {tab === 'tasks' && activeCount > 0 && (
                <span className={styles.navBadge}>{activeCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className={styles.mainArea}>
          {error && <div className={styles.errorBanner} role="alert">{error}</div>}

          {/* Products: full width, no inner wrapper */}
          {activeTab === 'products' && (
            <ProductsTab
              products={mdProducts}
              variations={mdVariations}
              savedAt={mdProductsSavedAt}
              onClearProducts={clearMdProductsStorage}
              onSyncStocks={syncStocks}
              syncStatus={syncStatus}
              onSyncSales={syncSales}
              salesSyncStatus={salesSyncStatus}
              onUpdateFsProducts={updateFsProducts}
              fsUpdateStatus={fsUpdateStatus}
              lastFsSyncAt={lastFsSyncAt}
            />
          )}

          {/* Wishlist: full width, no inner wrapper */}
          {activeTab === 'wishlist' && (
            <WishlistTab products={mdProducts} variations={mdVariations} />
          )}

          {/* Budget: standard width */}
          {activeTab === 'budget' && (
            <div className={styles.standardWrap}>
              <BudgetTab />
            </div>
          )}

          {/* All other tabs: centered standard width */}
          {activeTab !== 'products' && activeTab !== 'wishlist' && activeTab !== 'budget' && (
            <div className={styles.standardWrap}>

              {/* Tasks */}
              {activeTab === 'tasks' && (
                loading ? (
                  <div className={styles.loading}>読み込み中...</div>
                ) : (
                  <div className={styles.taskCard}>
                    <SearchBar value={search} onChange={setSearch} />
                    <TaskForm onAdd={addTask} />
                    <FilterTabs
                      current={filter}
                      onChange={setFilter}
                      counts={{ all: tasks.length, active: activeCount, done: doneCount }}
                      sortBy={sortBy}
                      onSortChange={setSortBy}
                    />
                    <TaskList
                      tasks={displayTasks}
                      filter={filter}
                      totalCount={tasks.length}
                      searchQuery={search}
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      onEdit={editTask}
                    />
                    {tasks.length > 0 && (
                      <footer className={styles.footer}>
                        <span className={styles.footerStats}>
                          {doneCount > 0 ? `${doneCount} 件完了` : 'まだ完了したタスクはありません'}
                        </span>
                        <button
                          className={styles.clearButton}
                          onClick={clearCompleted}
                          disabled={doneCount === 0}
                        >
                          完了済みを削除
                        </button>
                      </footer>
                    )}
                  </div>
                )
              )}

              {activeTab === 'schedules' && <ScheduleTab user={user} />}
              {activeTab === 'inventory' && <InventoryTab user={user} />}
              {activeTab === 'import' && (
                <ImportTab
                  user={user}
                  onSendToProducts={(products, variations) => {
                    const now = new Date().toISOString();
                    safeSetLocalStorage(MD_PRODUCTS_KEY, JSON.stringify({ products, savedAt: now }));
                    // バリエーションは容量が大きいため localStorage には保存しない
          // safeSetLocalStorage(MD_VARIATIONS_KEY, JSON.stringify({ variations, savedAt: now }));
                    setMdProducts(products);
                    setMdProductsSavedAt(now);
                    setMdVariations(variations);
                  }}
                />
              )}
            </div>
          )}
        </main>

      </div>
    </div>
  );
}

export default App;
