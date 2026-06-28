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
  | { state: 'syncing' }
  | { state: 'success'; orderCount: number; lineCount: number; totalSalesQty: number; totalSalesAmount: number; skuCount: number; productCount: number; cancelledOrders: number; hasNextUrl: boolean }
  | { state: 'error'; message: string };
import styles from './App.module.css';

const MD_PRODUCTS_KEY   = 'ecTodo.mdProducts';
const MD_VARIATIONS_KEY = 'ecTodo.mdVariations';

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

    const productNos = Array.from(new Set(mdVariations.map((v) => v.productNo)));
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
      localStorage.setItem(MD_PRODUCTS_KEY, JSON.stringify({ products: updatedProducts, savedAt: mdProductsSavedAt ?? now }));
      localStorage.setItem(MD_VARIATIONS_KEY, JSON.stringify({ variations: updatedVariations, savedAt: now }));

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
    setSalesSyncStatus({ state: 'syncing' });
    try {
      const res = await fetch('/api/check-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDateStart: `${dateFrom}T00:00:00`,
          orderDateEnd:   `${dateTo}T23:59:59`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
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
      if (!data.ok) throw new Error('API returned ok=false');

      const productSalesMap = new Map(
        (data.productSales ?? []).map((p) => [p.productNo, p]),
      );
      const skuSalesMap = new Map(
        (data.skuSales ?? []).map((s) => [s.skuCode, s]),
      );

      const updatedProducts = mdProducts.map((p) => {
        const sales = productSalesMap.get(p.productNo);
        if (!sales) return p;
        return {
          ...p,
          salesQty30d:        sales.salesQty,
          salesAmount30d:     sales.salesAmount,
          monthlySalesQty:    sales.salesQty,
          monthlySalesAmount: sales.salesAmount,
        };
      });

      const updatedVariations = mdVariations.map((v) => {
        const normalSku = v.skuCode.replaceAll('_', '');
        const sales = skuSalesMap.get(normalSku);
        if (!sales) return v;
        return {
          ...v,
          salesQty30d:        sales.salesQty,
          salesAmount30d:     sales.salesAmount,
          monthlySalesQty:    sales.salesQty,
          monthlySalesAmount: sales.salesAmount,
        };
      });

      const now = new Date().toISOString();
      localStorage.setItem(MD_PRODUCTS_KEY, JSON.stringify({ products: updatedProducts, savedAt: mdProductsSavedAt ?? now }));
      localStorage.setItem(MD_VARIATIONS_KEY, JSON.stringify({ variations: updatedVariations, savedAt: now }));

      setMdProducts(updatedProducts);
      setMdVariations(updatedVariations);
      setSalesSyncStatus({
        state:        'success',
        orderCount:   data.orderCount   ?? 0,
        lineCount:    data.lineCount    ?? 0,
        totalSalesQty:    data.totalSalesQty    ?? 0,
        totalSalesAmount: data.totalSalesAmount ?? 0,
        skuCount:     (data.skuSales    ?? []).length,
        productCount: (data.productSales ?? []).length,
        cancelledOrders: data.excluded?.cancelledOrders ?? 0,
        hasNextUrl:   !!data.nextUrl,
      });
    } catch (err) {
      setSalesSyncStatus({
        state:   'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
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
                    localStorage.setItem(MD_PRODUCTS_KEY, JSON.stringify({ products, savedAt: now }));
                    localStorage.setItem(MD_VARIATIONS_KEY, JSON.stringify({ variations, savedAt: now }));
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
