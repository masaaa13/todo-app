import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useInventoryCandidates } from '../hooks/useInventoryCandidates';
import { useReserveStock } from '../hooks/useReserveStock';
import { useProducts } from '../hooks/useProducts';
import type { InventoryCandidate, InventoryCandidateInput, CandidatePriority, CandidateStatus } from '../types/inventoryCandidate';
import {
  CANDIDATE_PRIORITIES, CANDIDATE_PRIORITY_LABELS,
  CANDIDATE_STATUSES, CANDIDATE_STATUS_LABELS,
} from '../types/inventoryCandidate';
import { STOCK_TYPE_LABELS } from '../types/reserveStock';
import styles from './InventoryTab.module.css';

// ── Candidate form ────────────────────────────────────────────────────────

type CandidateFormState = {
  productId: string;
  priority: CandidatePriority;
  status: CandidateStatus;
  reason: string;
  comment: string;
};

const EMPTY_CANDIDATE: CandidateFormState = {
  productId: '', priority: 'medium', status: 'B', reason: '', comment: '',
};

type CandidateFormProps = {
  initial: CandidateFormState;
  products: ReturnType<typeof useProducts>['products'];
  onSubmit: (input: InventoryCandidateInput) => void;
  onCancel: () => void;
  submitLabel: string;
};

function CandidateForm({ initial, products, onSubmit, onCancel, submitLabel }: CandidateFormProps) {
  const [f, setF] = useState<CandidateFormState>(initial);
  const set = <K extends keyof CandidateFormState>(k: K, v: CandidateFormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const selectedProduct = products.find((p) => p.id === f.productId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      productId: f.productId || null,
      productName: selectedProduct?.name ?? null,
      productSku: selectedProduct?.sku ?? null,
      priority: f.priority,
      status: f.status,
      reason: f.reason.trim() || null,
      comment: f.comment.trim() || null,
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>関連商品</label>
          <select className={styles.select} value={f.productId} onChange={(e) => set('productId', e.target.value)}>
            <option value="">（商品を選択）</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} {p.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>優先度</label>
          <select className={styles.select} value={f.priority} onChange={(e) => set('priority', e.target.value as CandidatePriority)}>
            {CANDIDATE_PRIORITIES.map((p) => (
              <option key={p} value={p}>{CANDIDATE_PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>判定ステータス</label>
          <select className={styles.select} value={f.status} onChange={(e) => set('status', e.target.value as CandidateStatus)}>
            {CANDIDATE_STATUSES.map((s) => (
              <option key={s} value={s}>{CANDIDATE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.fieldLabel}>候補理由</label>
          <input className={styles.input} value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="追加在庫を検討する理由" />
        </div>
        <div className={`${styles.formField} ${styles.fullWidth}`}>
          <label className={styles.fieldLabel}>コメント</label>
          <input className={styles.input} value={f.comment} onChange={(e) => set('comment', e.target.value)} placeholder="詳細・補足" />
        </div>
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn}>{submitLabel}</button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>キャンセル</button>
      </div>
    </form>
  );
}

function candidateToForm(c: InventoryCandidate): CandidateFormState {
  return {
    productId: c.productId ?? '',
    priority: c.priority,
    status: c.status,
    reason: c.reason ?? '',
    comment: c.comment ?? '',
  };
}

// ── Main component ────────────────────────────────────────────────────────

type InventoryTabProps = { user: User | null };

export function InventoryTab({ user }: InventoryTabProps) {
  const { products } = useProducts(user);
  const { candidates, addCandidate, updateCandidate, deleteCandidate } = useInventoryCandidates(user);
  const { stocks, updateStock } = useReserveStock(user);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<InventoryCandidate | null>(null);

  const switchPendingStocks = stocks.filter(
    (s) => s.switchPending && !s.futureshopCompletedDate && s.futureshopRequired
  );

  const handleAdd = (input: InventoryCandidateInput) => {
    addCandidate(input);
    setShowAddForm(false);
  };

  const handleEdit = (input: InventoryCandidateInput) => {
    if (!editingCandidate) return;
    updateCandidate(editingCandidate.id, input);
    setEditingCandidate(null);
  };

  return (
    <div>
      {/* ── Section 1: 在庫追加候補 ── */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionTitle}>在庫追加候補</span>
          <span className={styles.count}>{candidates.length}</span>
        </div>
        <button className={styles.addBtn} onClick={() => { setShowAddForm((v) => !v); setEditingCandidate(null); }}>
          {showAddForm ? 'キャンセル' : '+ 候補を追加'}
        </button>
      </div>

      {showAddForm && !editingCandidate && (
        <CandidateForm
          initial={EMPTY_CANDIDATE}
          products={products}
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
          submitLabel="追加"
        />
      )}

      {candidates.length === 0 && !showAddForm ? (
        <div className={styles.empty}>在庫追加候補がありません</div>
      ) : (
        <ul className={styles.candidateList}>
          {candidates.map((c) => (
            <li key={c.id} className={styles.candidateCard}>
              {editingCandidate?.id === c.id ? (
                <CandidateForm
                  initial={candidateToForm(c)}
                  products={products}
                  onSubmit={handleEdit}
                  onCancel={() => setEditingCandidate(null)}
                  submitLabel="保存"
                />
              ) : (
                <>
                  <div className={styles.candidateHeader}>
                    <div className={styles.candidateMeta}>
                      <span className={styles.priorityBadge} data-priority={c.priority}>
                        {CANDIDATE_PRIORITY_LABELS[c.priority]}
                      </span>
                      <span className={styles.statusBadge} data-status={c.status}>
                        {CANDIDATE_STATUS_LABELS[c.status]}
                      </span>
                      {c.productSku && <span className={styles.sku}>{c.productSku}</span>}
                      {c.productName && <span className={styles.productName}>{c.productName}</span>}
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.editSmallBtn} onClick={() => { setEditingCandidate(c); setShowAddForm(false); }}>編集</button>
                      <button className={styles.deleteSmallBtn} onClick={() => deleteCandidate(c.id)}>削除</button>
                    </div>
                  </div>
                  {c.reason && <p className={styles.reason}>理由: {c.reason}</p>}
                  {c.comment && <p className={styles.comment}>{c.comment}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Section 2: 切替待ち在庫 ── */}
      <div className={styles.switchSection}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionTitle}>futureshop 切替待ち</span>
          {switchPendingStocks.length > 0 && (
            <span className={styles.alertCount}>{switchPendingStocks.length}</span>
          )}
        </div>

        {switchPendingStocks.length === 0 ? (
          <div className={styles.emptySmall}>切替待ちの在庫はありません</div>
        ) : (
          <ul className={styles.switchList}>
            {switchPendingStocks.map((s) => {
              const product = products.find((p) => p.id === s.productId);
              return (
                <li key={s.id} className={styles.switchCard}>
                  <div className={styles.switchMain}>
                    <span className={styles.stockTypeBadge} data-type={s.stockType}>
                      {STOCK_TYPE_LABELS[s.stockType]}
                    </span>
                    {product && (
                      <>
                        <span className={styles.sku}>{product.sku}</span>
                        <span className={styles.productName}>{product.name}</span>
                      </>
                    )}
                    {s.quantity != null && <span className={styles.qty}>{s.quantity}個</span>}
                    {s.deliveryDate && <span className={styles.dateTag}>納期: {s.deliveryDate}</span>}
                    {s.futureshopPlannedDate && (
                      <span className={styles.dateTag}>反映予定: {s.futureshopPlannedDate}</span>
                    )}
                  </div>
                  <button
                    className={styles.doneBtn}
                    onClick={() => updateStock(s.id, {
                      futureshopCompletedDate: new Date().toISOString().slice(0, 10),
                      switchPending: false,
                    })}
                  >
                    反映完了
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
