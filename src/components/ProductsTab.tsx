import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useProducts } from '../hooks/useProducts';
import { useReserveStock } from '../hooks/useReserveStock';
import type { Product, ProductInput, ProductCategory, RegistrationStatus } from '../types/product';
import {
  PRODUCT_CATEGORIES, CATEGORY_LABELS,
  REGISTRATION_STATUSES, REGISTRATION_STATUS_LABELS,
} from '../types/product';
import type { ReserveStockInput, StockType } from '../types/reserveStock';
import { STOCK_TYPE_LABELS } from '../types/reserveStock';
import styles from './ProductsTab.module.css';

// ── Form helpers ──────────────────────────────────────────────────────────

type ProductFormState = {
  sku: string; name: string; brand: string; category: ProductCategory;
  launchDate: string; releaseDate: string; reservationStart: string; reservationEnd: string;
  futureshopStatus: RegistrationStatus; zozoStatus: RegistrationStatus; notes: string;
};

const EMPTY_PRODUCT: ProductFormState = {
  sku: '', name: '', brand: '', category: 'normal',
  launchDate: '', releaseDate: '', reservationStart: '', reservationEnd: '',
  futureshopStatus: 'pending', zozoStatus: 'pending', notes: '',
};

function formToInput(f: ProductFormState): ProductInput {
  return {
    sku: f.sku.trim(), name: f.name.trim(),
    brand: f.brand.trim() || null, category: f.category,
    launchDate: f.launchDate || null, releaseDate: f.releaseDate || null,
    reservationStart: f.reservationStart || null, reservationEnd: f.reservationEnd || null,
    futureshopStatus: f.futureshopStatus, zozoStatus: f.zozoStatus,
    notes: f.notes.trim() || null,
  };
}

function productToForm(p: Product): ProductFormState {
  return {
    sku: p.sku, name: p.name, brand: p.brand ?? '', category: p.category,
    launchDate: p.launchDate ?? '', releaseDate: p.releaseDate ?? '',
    reservationStart: p.reservationStart ?? '', reservationEnd: p.reservationEnd ?? '',
    futureshopStatus: p.futureshopStatus, zozoStatus: p.zozoStatus, notes: p.notes ?? '',
  };
}

type StockFormState = {
  stockType: StockType; quantity: string; deliveryDate: string;
  futureshopRequired: boolean; futureshopPlannedDate: string;
  futureshopCompletedDate: string; switchPending: boolean; notes: string;
};

const EMPTY_STOCK: StockFormState = {
  stockType: 'additional', quantity: '', deliveryDate: '',
  futureshopRequired: false, futureshopPlannedDate: '',
  futureshopCompletedDate: '', switchPending: false, notes: '',
};

// ── Sub-components ────────────────────────────────────────────────────────

type ProductFormProps = {
  initial: ProductFormState;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
  submitLabel: string;
};

function ProductForm({ initial, onSubmit, onCancel, submitLabel }: ProductFormProps) {
  const [f, setF] = useState<ProductFormState>(initial);
  const set = <K extends keyof ProductFormState>(k: K, v: ProductFormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.sku.trim() || !f.name.trim()) return;
    onSubmit(formToInput(f));
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>品番 *</label>
          <input className={styles.input} value={f.sku} onChange={(e) => set('sku', e.target.value)} placeholder="SKU-001" required />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>商品名 *</label>
          <input className={styles.input} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="商品名を入力" required />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>ブランド</label>
          <input className={styles.input} value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="ブランド名" />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>商品区分</label>
          <select className={styles.select} value={f.category} onChange={(e) => set('category', e.target.value as ProductCategory)}>
            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>公開日</label>
          <input className={styles.input} type="date" value={f.launchDate} onChange={(e) => set('launchDate', e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>発売日</label>
          <input className={styles.input} type="date" value={f.releaseDate} onChange={(e) => set('releaseDate', e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>予約開始日</label>
          <input className={styles.input} type="date" value={f.reservationStart} onChange={(e) => set('reservationStart', e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>予約終了日</label>
          <input className={styles.input} type="date" value={f.reservationEnd} onChange={(e) => set('reservationEnd', e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>futureshop</label>
          <select className={styles.select} value={f.futureshopStatus} onChange={(e) => set('futureshopStatus', e.target.value as RegistrationStatus)}>
            {REGISTRATION_STATUSES.map((s) => <option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>ZOZO</label>
          <select className={styles.select} value={f.zozoStatus} onChange={(e) => set('zozoStatus', e.target.value as RegistrationStatus)}>
            {REGISTRATION_STATUSES.map((s) => <option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className={`${styles.formField} ${styles.fullWidth}`}>
          <label className={styles.fieldLabel}>メモ</label>
          <textarea className={styles.textarea} value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="備考・メモ" />
        </div>
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={!f.sku.trim() || !f.name.trim()}>
          {submitLabel}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>キャンセル</button>
      </div>
    </form>
  );
}

type StockSectionProps = {
  product: Product;
  stocks: ReturnType<typeof useReserveStock>['stocks'];
  onAdd: (input: ReserveStockInput) => void;
  onUpdate: (id: string, input: Partial<ReserveStockInput>) => void;
  onDelete: (id: string) => void;
};

function ReserveStockSection({ product, stocks, onAdd, onUpdate, onDelete }: StockSectionProps) {
  const myStocks = stocks.filter((s) => s.productId === product.id);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState<StockFormState>(EMPTY_STOCK);
  const set = <K extends keyof StockFormState>(k: K, v: StockFormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      productId: product.id,
      stockType: f.stockType,
      quantity: f.quantity ? Number(f.quantity) : null,
      deliveryDate: f.deliveryDate || null,
      futureshopRequired: f.futureshopRequired,
      futureshopPlannedDate: f.futureshopPlannedDate || null,
      futureshopCompletedDate: f.futureshopCompletedDate || null,
      switchPending: f.switchPending,
      notes: f.notes.trim() || null,
    });
    setF(EMPTY_STOCK);
    setShowForm(false);
  };

  return (
    <div className={styles.stockSection}>
      <div className={styles.stockHeader}>
        <span className={styles.stockTitle}>在庫管理</span>
        <button className={styles.addSmallBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'キャンセル' : '+ 追加'}
        </button>
      </div>

      {showForm && (
        <form className={styles.stockForm} onSubmit={handleAdd}>
          <div className={styles.stockGrid}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>在庫区分</label>
              <select className={styles.select} value={f.stockType} onChange={(e) => set('stockType', e.target.value as StockType)}>
                {(['initial', 'additional'] as StockType[]).map((t) => (
                  <option key={t} value={t}>{STOCK_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>数量</label>
              <input className={styles.input} type="number" min="0" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="100" />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>納期</label>
              <input className={styles.input} type="date" value={f.deliveryDate} onChange={(e) => set('deliveryDate', e.target.value)} />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>futureshop反映予定日</label>
              <input className={styles.input} type="date" value={f.futureshopPlannedDate} onChange={(e) => set('futureshopPlannedDate', e.target.value)} disabled={!f.futureshopRequired} />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>futureshop反映完了日</label>
              <input className={styles.input} type="date" value={f.futureshopCompletedDate} onChange={(e) => set('futureshopCompletedDate', e.target.value)} disabled={!f.futureshopRequired} />
            </div>
            <div className={`${styles.formField} ${styles.checkRow}`}>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={f.futureshopRequired} onChange={(e) => set('futureshopRequired', e.target.checked)} />
                futureshop反映必要
              </label>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={f.switchPending} onChange={(e) => set('switchPending', e.target.checked)} />
                切替待ち
              </label>
            </div>
            <div className={`${styles.formField} ${styles.fullWidth}`}>
              <label className={styles.fieldLabel}>メモ</label>
              <input className={styles.input} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="備考" />
            </div>
          </div>
          <button type="submit" className={styles.submitBtn} style={{ marginTop: 8 }}>追加</button>
        </form>
      )}

      {myStocks.length === 0 && !showForm && (
        <p className={styles.emptySmall}>在庫データなし</p>
      )}

      {myStocks.map((s) => (
        <div key={s.id} className={styles.stockRow} data-switch={s.switchPending || undefined}>
          <div className={styles.stockInfo}>
            <span className={styles.stockTypeBadge} data-type={s.stockType}>
              {STOCK_TYPE_LABELS[s.stockType]}
            </span>
            {s.quantity != null && <span className={styles.stockQty}>{s.quantity}個</span>}
            {s.deliveryDate && <span className={styles.stockDate}>納期: {s.deliveryDate}</span>}
            {s.futureshopRequired && !s.futureshopCompletedDate && (
              <span className={styles.futureBadge}>futureshop要</span>
            )}
            {s.futureshopCompletedDate && (
              <span className={styles.futureDone}>futureshop完了</span>
            )}
            {s.switchPending && <span className={styles.switchBadge}>切替待ち</span>}
            {s.futureshopPlannedDate && !s.futureshopCompletedDate && (
              <span className={styles.stockDate}>反映予定: {s.futureshopPlannedDate}</span>
            )}
          </div>
          <div className={styles.stockActions}>
            {s.futureshopRequired && !s.futureshopCompletedDate && (
              <button
                className={styles.doneSmallBtn}
                onClick={() => onUpdate(s.id, { futureshopCompletedDate: new Date().toISOString().slice(0, 10), switchPending: false })}
              >
                反映完了
              </button>
            )}
            <button className={styles.deleteSmallBtn} onClick={() => onDelete(s.id)}>削除</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

type ProductsTabProps = { user: User | null };

export function ProductsTab({ user }: ProductsTabProps) {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts(user);
  const stockStore = useReserveStock(user);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = (input: ProductInput) => {
    addProduct(input);
    setShowAddForm(false);
  };

  const handleEdit = (input: ProductInput) => {
    if (!editingProduct) return;
    updateProduct(editingProduct.id, input);
    setEditingProduct(null);
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={styles.sectionTitle}>商品一覧 <span className={styles.count}>{products.length}</span></span>
        <button className={styles.addBtn} onClick={() => { setShowAddForm((v) => !v); setEditingProduct(null); }}>
          {showAddForm ? 'キャンセル' : '+ 商品を追加'}
        </button>
      </div>

      {showAddForm && !editingProduct && (
        <ProductForm
          initial={EMPTY_PRODUCT}
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
          submitLabel="追加"
        />
      )}

      {products.length === 0 && !showAddForm && (
        <div className={styles.empty}>商品が登録されていません</div>
      )}

      <ul className={styles.list}>
        {products.map((p) => (
          <li key={p.id} className={styles.productCard}>
            {editingProduct?.id === p.id ? (
              <ProductForm
                initial={productToForm(p)}
                onSubmit={handleEdit}
                onCancel={() => setEditingProduct(null)}
                submitLabel="保存"
              />
            ) : (
              <>
                <div className={styles.productHeader}>
                  <div className={styles.productMain}>
                    <span className={styles.sku}>{p.sku}</span>
                    <span className={styles.productName}>{p.name}</span>
                    <span className={styles.categoryBadge} data-category={p.category}>
                      {CATEGORY_LABELS[p.category]}
                    </span>
                  </div>
                  <div className={styles.productActions}>
                    <button
                      className={styles.expandBtn}
                      data-active={expandedId === p.id || undefined}
                      onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                      aria-label="在庫管理"
                    >
                      在庫
                    </button>
                    <button className={styles.editSmallBtn} onClick={() => { setEditingProduct(p); setShowAddForm(false); }}>編集</button>
                    <button className={styles.deleteSmallBtn} onClick={() => deleteProduct(p.id)}>削除</button>
                  </div>
                </div>

                <div className={styles.productMeta}>
                  {p.brand && <span className={styles.metaItem}>{p.brand}</span>}
                  {p.releaseDate && <span className={styles.metaItem}>発売: {p.releaseDate}</span>}
                  {p.launchDate && <span className={styles.metaItem}>公開: {p.launchDate}</span>}
                  {p.reservationStart && <span className={styles.metaItem}>予約開始: {p.reservationStart}</span>}
                  {p.reservationEnd && <span className={styles.metaItem}>予約終了: {p.reservationEnd}</span>}
                  <span className={styles.regBadge} data-status={p.futureshopStatus}>
                    FS: {REGISTRATION_STATUS_LABELS[p.futureshopStatus]}
                  </span>
                  <span className={styles.regBadge} data-status={p.zozoStatus}>
                    ZOZO: {REGISTRATION_STATUS_LABELS[p.zozoStatus]}
                  </span>
                </div>

                {p.notes && <p className={styles.productNotes}>{p.notes}</p>}

                {expandedId === p.id && (
                  <ReserveStockSection
                    product={p}
                    stocks={stockStore.stocks}
                    onAdd={stockStore.addStock}
                    onUpdate={stockStore.updateStock}
                    onDelete={stockStore.deleteStock}
                  />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
