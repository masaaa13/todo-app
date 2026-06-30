import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { MdProduct, MdVariation, WishlistItem } from '../types/md';
import styles from './WishlistTab.module.css';

type Props = {
  products?: MdProduct[];
  variations: MdVariation[];
};

type Conditions = {
  category: string;
  priority: string;
  status: string;
  releaseMonth: string;
  color: string;
  size: string;
  excludeNos: string;
  limit: string;
};

// ── Types ─────────────────────────────────────────────────────────────────────

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

const WISHLIST_STORAGE_KEY = 'ecTodo.wishlistColumns';

const DEFAULT_CONDITIONS: Conditions = {
  category: '',
  priority: '',
  status: '',
  releaseMonth: '',
  color: '',
  size: '',
  excludeNos: '',
  limit: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toWishlistItems(variations: MdVariation[], products: import('../types/md').MdProduct[]): WishlistItem[] {
  const productMap = new Map(products.map((p) => [p.productNo, p]));
  return variations.map((v) => {
    const product = productMap.get(v.productNo);
    let priority: WishlistItem['priority'];
    let reason: string;
    let suggestedAction: string;

    if (v.status === '素材未取得') {
      priority = '中';
      reason = '商品情報の補完確認が必要';
      suggestedAction = '補完内容を確認';
    } else if (v.status === '補完未取得') {
      priority = '中';
      reason = '商品情報の補完確認が必要';
      suggestedAction = '補完内容を確認';
    } else if (v.category === 'PANTS') {
      priority = '中';
      reason = 'ボトムスカテゴリ候補';
      suggestedAction = '在庫・売上連携後に判断';
    } else if (v.category === 'TOPS') {
      priority = '中';
      reason = 'トップスカテゴリ候補';
      suggestedAction = '在庫・売上連携後に判断';
    } else {
      priority = '低';
      reason = '在庫・売上連携後に判定予定';
      suggestedAction = '在庫・売上連携後に判断';
    }

    return {
      productNo: v.productNo,
      productName: v.productName ?? v.productNo,
      skuCode: v.skuCode,
      color: v.color,
      size: v.size,
      category: v.category ?? '',
      releaseDate: v.releaseDate,
      status: v.status ?? 'FutureShop取込済み',
      reason,
      priority,
      suggestedAction,
      imageUrl: v.imageUrl,
      actualStock: v.actualStock,
      availableStock: v.availableStock,
      stockType: v.stockType,
      preorderStock: v.preorderStock,
      plannedStock: v.plannedStock,
      // product-level fields joined from MdProduct
      visible: product?.visible ?? undefined,
      hasPreorder: product?.hasPreorder ?? undefined,
      hasPlannedStock: product?.hasPlannedStock ?? undefined,
      productUrl: v.productUrl ?? product?.productUrl ?? undefined,
      wishlistAddedAt: v.wishlistAddedAt,
      wishlistRequestedQty: v.wishlistRequestedQty,
      wishlistStockBefore: v.wishlistStockBefore,
      wishlistStockAfter: v.wishlistStockAfter,
      wishlistSalesAfter7d: v.wishlistSalesAfter7d,
      wishlistSalesAfter14d: v.wishlistSalesAfter14d,
      wishlistEffect: v.wishlistEffect,
    };
  });
}

function parseExcludeNos(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function applyConditions(items: WishlistItem[], cond: Conditions): WishlistItem[] {
  const excludeSet = parseExcludeNos(cond.excludeNos);
  let result = items;

  if (cond.category)     result = result.filter((i) => i.category === cond.category);
  if (cond.priority)     result = result.filter((i) => i.priority === cond.priority);
  if (cond.status)       result = result.filter((i) => i.status === cond.status);
  if (cond.releaseMonth) result = result.filter((i) => i.releaseDate?.startsWith(cond.releaseMonth));
  if (cond.color)        result = result.filter((i) => i.color === cond.color);
  if (cond.size)         result = result.filter((i) => i.size === cond.size);
  if (excludeSet.size > 0) result = result.filter((i) => !excludeSet.has(i.productNo));
  if (cond.limit)         result = result.slice(0, Number(cond.limit));

  return result;
}

function exportCsv(items: WishlistItem[]) {
  const BOM = '﻿';
  const header = '優先度,品番,商品名,SKU,カラー,サイズ,カテゴリ,発売日,理由,推奨アクション';
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
  const rows = items.map((it) =>
    [
      it.priority,
      it.productNo,
      it.productName,
      it.skuCode.replaceAll('_', ''),
      it.color ?? '',
      it.size ?? '',
      it.category,
      it.releaseDate ?? '',
      it.reason,
      it.suggestedAction,
    ]
      .map(escape)
      .join(',')
  );
  const csv = BOM + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wishlist.csv';
  a.click();
  URL.revokeObjectURL(url);
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

// ── Pills ─────────────────────────────────────────────────────────────────────

function PriorityPill({ priority }: { priority: WishlistItem['priority'] }) {
  const variant = priority === '高' ? 'high' : priority === '中' ? 'mid' : 'low';
  return (
    <span className={styles.priorityPill} data-variant={variant}>
      {priority}
    </span>
  );
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

function fmtNum(v: number | null | undefined): string {
  return v != null ? String(v) : '準備中';
}

function fmtEffect(v: WishlistItem['wishlistEffect']): string {
  return v ?? '未判定';
}

function fmtVisible(v: boolean | undefined | null): string {
  if (v === true) return '公開中';
  if (v === false) return '非公開';
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

function fmtStockType(v: WishlistItem['stockType']): string {
  if (v == null) return '準備中';
  const map: Record<NonNullable<typeof v>, string> = {
    actual:   '実在庫',
    preorder: '予約在庫',
    planned:  '予定在庫',
    mixed:    '複合',
    unknown:  '未判定',
  };
  return map[v];
}

// ── Column definitions ────────────────────────────────────────────────────────

const WISHLIST_COLUMNS: TableColumn<WishlistItem>[] = [
  { key: 'priority',             label: '優先度',         defaultVisible: true,  defaultWidth: 70,  sortable: true, sortValue: (i) => i.priority, render: (i) => <PriorityPill priority={i.priority} /> },
  { key: 'productNo',            label: '品番',           defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (i) => i.productNo, render: (i) => <span className={styles.productNo}>{i.productNo}</span> },
  { key: 'productName',          label: '商品名',         defaultVisible: true,  defaultWidth: 200, sortable: true, sortValue: (i) => i.productName, render: (i) => <span className={styles.productName}>{i.productName}</span> },
  { key: 'skuCode',              label: 'SKU',            defaultVisible: true,  defaultWidth: 120, sortable: true, sortValue: (i) => i.skuCode, render: (i) => <span className={styles.skuBadge}>{i.skuCode.replaceAll('_', '')}</span> },
  { key: 'color',                label: 'カラー',         defaultVisible: true,  defaultWidth: 120, sortable: true, sortValue: (i) => i.color ?? null, render: (i) => <span className={styles.colorCell}>{i.color ?? '—'}</span> },
  { key: 'size',                 label: 'サイズ',         defaultVisible: true,  defaultWidth: 70,  sortable: true, sortValue: (i) => i.size ?? null, render: (i) => <span className={styles.sizeCell}>{i.size ?? '—'}</span> },
  { key: 'category',             label: 'カテゴリ',       defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (i) => i.category, render: (i) => <span className={styles.categoryBadge}>{i.category}</span> },
  { key: 'releaseDate',          label: '発売日',         defaultVisible: true,  defaultWidth: 100, sortable: true, sortValue: (i) => i.releaseDate ?? null, render: (i) => <span className={styles.dateCell}>{i.releaseDate ?? '—'}</span> },
  { key: 'reason',               label: '理由',           defaultVisible: true,  defaultWidth: 180, render: (i) => <span className={styles.reasonCell}>{i.reason}</span> },
  { key: 'suggestedAction',      label: '推奨アクション', defaultVisible: true,  defaultWidth: 180, render: (i) => <span className={styles.actionCell}>{i.suggestedAction}</span> },
  { key: 'image',                label: '画像',           defaultVisible: false, defaultWidth: 90,  render: (i) => <ProductThumbnail imageUrl={i.imageUrl} alt={i.productName} /> },
  // 公開状態・商品情報
  { key: 'visibleStatus',        label: '公開状態',       defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (i) => i.visible ?? null, render: (i) => <span className={styles.visiblePill} data-v={i.visible === true ? 'public' : i.visible === false ? 'private' : 'unknown'}>{fmtVisible(i.visible)}</span> },
  { key: 'productUrl',           label: '商品URL',        defaultVisible: false, defaultWidth: 100, render: (i) => i.productUrl ? <a href={i.productUrl} target="_blank" rel="noopener noreferrer" className={styles.productUrlLink}>商品ページ</a> : <span className={styles.naCell}>—</span> },
  { key: 'hasPreorder',          label: '予約販売',       defaultVisible: false, defaultWidth: 90,  sortable: true, sortValue: (i) => i.hasPreorder ?? null, render: (i) => <span className={styles.naCell}>{i.hasPreorder == null ? '—' : i.hasPreorder ? 'あり' : 'なし'}</span> },
  { key: 'hasPlannedStockFlag',  label: '予定在庫(FS)',   defaultVisible: false, defaultWidth: 100, sortable: true, sortValue: (i) => i.hasPlannedStock ?? null, render: (i) => <span className={styles.naCell}>{i.hasPlannedStock == null ? '—' : i.hasPlannedStock ? 'あり' : 'なし'}</span> },
  // 在庫（EC同期）
  { key: 'stockType',      label: '在庫区分',    defaultVisible: true,  defaultWidth: 100, render: (i) => <span className={styles.stockTypeCell} data-type={i.stockType ?? 'none'}>{fmtStockType(i.stockType)}</span> },
  { key: 'actualStock',    label: '実在庫',      defaultVisible: true,  defaultWidth: 90,  sortable: true, sortValue: (i) => i.actualStock ?? null, render: (i) => <span className={styles.numCell}>{fmtNum(i.actualStock)}</span> },
  { key: 'preorderStock',  label: '予約在庫',    defaultVisible: false, defaultWidth: 90,  render: (i) => <span className={styles.numCell}>{fmtNum(i.preorderStock)}</span> },
  { key: 'plannedStock',   label: '予定在庫',    defaultVisible: false, defaultWidth: 90,  render: (i) => <span className={styles.numCell}>{fmtNum(i.plannedStock)}</span> },
  { key: 'availableStock', label: '販売可能在庫', defaultVisible: true,  defaultWidth: 110, sortable: true, sortValue: (i) => i.availableStock ?? null, render: (i) => <span className={styles.numCell}>{fmtNum(i.availableStock)}</span> },
  // 効果測定
  { key: 'wishlistAddedAt',      label: '欲しいもの追加日',  defaultVisible: false, defaultWidth: 130, render: (i) => <span className={styles.dateCell}>{i.wishlistAddedAt ?? '準備中'}</span> },
  { key: 'wishlistRequestedQty', label: '追加希望数',       defaultVisible: false, defaultWidth: 90,  render: (i) => <span className={styles.numCell}>{fmtNum(i.wishlistRequestedQty)}</span> },
  { key: 'wishlistStockBefore',  label: '追加前在庫',       defaultVisible: false, defaultWidth: 90,  render: (i) => <span className={styles.numCell}>{fmtNum(i.wishlistStockBefore)}</span> },
  { key: 'wishlistStockAfter',   label: '追加後在庫',       defaultVisible: false, defaultWidth: 90,  render: (i) => <span className={styles.numCell}>{fmtNum(i.wishlistStockAfter)}</span> },
  { key: 'wishlistSalesAfter7d', label: '追加後7日販売数',  defaultVisible: false, defaultWidth: 120, render: (i) => <span className={styles.numCell}>{fmtNum(i.wishlistSalesAfter7d)}</span> },
  { key: 'wishlistSalesAfter14d',label: '追加後14日販売数', defaultVisible: false, defaultWidth: 120, render: (i) => <span className={styles.numCell}>{fmtNum(i.wishlistSalesAfter14d)}</span> },
  { key: 'wishlistEffect',       label: '効果判定',         defaultVisible: false, defaultWidth: 90,  render: (i) => <span className={styles.effectCell} data-effect={i.wishlistEffect ?? 'none'}>{fmtEffect(i.wishlistEffect)}</span> },
];

// ── Main component ────────────────────────────────────────────────────────────

export function WishlistTab({ variations, products = [] }: Props) {
  const hasData = variations.length > 0;
  const [cond, setCond] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const [configs, setConfigs] = useState<ColumnConfig[]>(() =>
    loadColumnConfig(WISHLIST_COLUMNS, WISHLIST_STORAGE_KEY)
  );

  // Resize state
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragWidthRef = useRef(0);

  const handleChange = (newConfigs: ColumnConfig[]) => {
    setConfigs(newConfigs);
    saveColumnConfig(WISHLIST_STORAGE_KEY, newConfigs);
  };

  const showAll = () => handleChange(configs.map((c) => ({ ...c, visible: true })));
  // "初期表示に戻す" resets order, visibility, and widths all together
  const resetDefault = () => handleChange(defaultColumnConfigs(WISHLIST_COLUMNS));

  const handleWidthChange = useCallback((key: string, width: number) => {
    setConfigs((prev) => {
      const next = prev.map((c) => c.key === key ? { ...c, width } : c);
      saveColumnConfig(WISHLIST_STORAGE_KEY, next);
      return next;
    });
  }, []);

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
        handleWidthChange(k, finalWidth);
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

  const colMap = useMemo(() => new Map(WISHLIST_COLUMNS.map((c) => [c.key, c])), []);

  const visibleCols = useMemo(() =>
    configs
      .filter((c) => c.visible)
      .flatMap((c) => {
        const col = colMap.get(c.key);
        return col ? [{ config: c, col }] : [];
      }),
    [configs, colMap]
  );

  const getWidth = (config: ColumnConfig, col: TableColumn<WishlistItem>) =>
    localWidths[config.key] ?? config.width ?? col.defaultWidth ?? 100;

  // Sum of all visible column widths → sets explicit table width so fixed layout works
  const totalWidth = visibleCols.reduce((sum, { config, col }) => sum + getWidth(config, col), 0);

  const allItems = useMemo(
    () => (hasData ? toWishlistItems(variations, products) : []),
    [variations, products, hasData],
  );

  const categories = useMemo(
    () => [...new Set(variations.map((v) => v.category))].sort(),
    [variations]
  );

  const statuses = useMemo(
    () => [...new Set(variations.map((v) => v.status))].sort(),
    [variations]
  );

  const releaseMonths = useMemo(() => {
    const months = variations
      .map((v) => v.releaseDate?.slice(0, 7))
      .filter((m): m is string => !!m);
    return [...new Set(months)].sort();
  }, [variations]);

  const colors = useMemo(
    () => [...new Set(variations.map((v) => v.color).filter((c): c is string => !!c))].sort(),
    [variations]
  );

  const sizes = useMemo(
    () => [...new Set(variations.map((v) => v.size).filter((s): s is string => !!s))].sort(),
    [variations]
  );

  const filtered = useMemo(() => applyConditions(allItems, cond), [allItems, cond]);

  const sorted = useMemo(() => {
    if (!sortConfig) return filtered;
    const col = WISHLIST_COLUMNS.find((c) => c.key === sortConfig.key);
    if (!col?.sortValue) return filtered;
    const { dir } = sortConfig;
    return [...filtered].sort((a, b) => compareValues(col.sortValue!(a), col.sortValue!(b), dir));
  }, [filtered, sortConfig]);

  const highCount = filtered.filter((i) => i.priority === '高').length;
  const midCount  = filtered.filter((i) => i.priority === '中').length;
  const lowCount  = filtered.filter((i) => i.priority === '低').length;

  const kpis = [
    { label: '候補SKU数',   value: hasData ? String(filtered.length) : '—', active: hasData },
    { label: '高優先度',     value: hasData ? String(highCount) : '—',        active: hasData && highCount > 0 },
    { label: '中優先度',     value: hasData ? String(midCount) : '—',         active: hasData && midCount > 0 },
    { label: '低優先度',     value: hasData ? String(lowCount) : '—',         active: hasData && lowCount > 0 },
    { label: '店舗在庫連携', value: '未連携',                                  active: false },
    { label: '売上連携',     value: '未連携',                                  active: false },
  ];

  const set = (key: keyof Conditions) => (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) =>
    setCond((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className={styles.root}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <span className={styles.title}>欲しいものリスト</span>
            <span className={styles.subtitle}>Store Request List</span>
          </div>
          <p className={styles.desc}>バリエーションデータをもとに、店舗共有用の欲しいもの候補をSKU/カラー/サイズ単位で整理します。</p>
        </div>
        <span className={styles.statusBadge} data-variant={hasData ? 'active' : 'empty'}>
          {hasData ? 'バリエーションデータ連携中' : 'バリエーションデータ未反映'}
        </span>
      </div>

      {/* ── Disclaimer ── */}
      <div className={styles.disclaimer}>
        ⚠️ 現在は商品一覧のバリエーションデータをもとにした仮の候補表示です。店舗在庫・EC在庫・売上データ連携後に、SKU/カラー/サイズ単位の判定ロジックを追加予定です。
      </div>

      {/* ── KPI row ── */}
      <div className={styles.kpiRow}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.kpiCard} data-active={k.active || undefined}>
            <span className={styles.kpiValue}>{k.value}</span>
            <span className={styles.kpiLabel}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* ── Main 2-column ── */}
      <div className={styles.mainLayout}>

        {/* Left: condition form */}
        <div className={styles.conditionPanel}>
          <div className={styles.panelTitle}>条件設定</div>
          <p className={styles.panelDesc}>
            在庫・売上連携前の仮条件です。カテゴリ・ステータス・発売月・カラー・サイズなどで候補を絞り込みます。
          </p>
          <p className={styles.sessionNote}>現在の条件はブラウザ上の一時設定です。リロードすると初期状態に戻ります。</p>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>カテゴリ</label>
            <select className={styles.filterSelect} value={cond.category} onChange={set('category')} disabled={!hasData}>
              <option value=''>全て</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>優先度</label>
            <select className={styles.filterSelect} value={cond.priority} onChange={set('priority')} disabled={!hasData}>
              <option value=''>全て</option>
              <option value='高'>高</option>
              <option value='中'>中</option>
              <option value='低'>低</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>ステータス</label>
            <select className={styles.filterSelect} value={cond.status} onChange={set('status')} disabled={!hasData}>
              <option value=''>全て</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>発売月</label>
            <select className={styles.filterSelect} value={cond.releaseMonth} onChange={set('releaseMonth')} disabled={!hasData}>
              <option value=''>全て</option>
              {releaseMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>カラー</label>
            <select className={styles.filterSelect} value={cond.color} onChange={set('color')} disabled={!hasData}>
              <option value=''>全て</option>
              {colors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>サイズ</label>
            <select className={styles.filterSelect} value={cond.size} onChange={set('size')} disabled={!hasData}>
              <option value=''>全て</option>
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>除外品番</label>
            <p className={styles.filterHint}>除外したい品番を改行またはカンマ区切りで入力してください。</p>
            <textarea
              className={styles.filterTextarea}
              value={cond.excludeNos}
              onChange={set('excludeNos')}
              disabled={!hasData}
              placeholder={'1266610\n1266702,1266809'}
              rows={3}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>表示件数</label>
            <select className={styles.filterSelect} value={cond.limit} onChange={set('limit')} disabled={!hasData}>
              <option value=''>全件</option>
              <option value='10'>10件</option>
              <option value='20'>20件</option>
              <option value='50'>50件</option>
            </select>
          </div>

          <div className={styles.conditionDivider} />

          {hasData && (
            <div className={styles.countSummary}>
              表示中 {filtered.length}件 / 全{allItems.length}件
            </div>
          )}

          <button
            className={styles.resetBtn}
            onClick={() => setCond(DEFAULT_CONDITIONS)}
            disabled={!hasData}
          >
            条件をリセット
          </button>
        </div>

        {/* Right: table panel */}
        <div className={styles.tablePanel}>
          <div className={styles.tablePanelHeader}>
            <p className={styles.tableNote} data-real={hasData || undefined}>
              {hasData
                ? `表示中 ${sorted.length}件 / 全${allItems.length}件（仮判定）`
                : '商品登録CSVタブで商品データを取り込み、「商品一覧へ反映」を押すと候補が表示されます'}
            </p>
            <div className={styles.tablePanelBtns}>
              <ColumnSelector
                configs={configs}
                columns={WISHLIST_COLUMNS}
                onChange={handleChange}
                onShowAll={showAll}
                onReset={resetDefault}
              />
              <button
                className={styles.csvBtn}
                onClick={() => exportCsv(sorted)}
                disabled={sorted.length === 0}
              >
                表示中{sorted.length}件をCSV出力
              </button>
            </div>
          </div>

          {!hasData ? (
            <div className={styles.emptyGuide}>
              <p>商品登録CSVタブで商品データを取り込み、「商品一覧へ反映」を押すと、バリエーション別の欲しいもの候補を表示できます。</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className={styles.emptyGuide}>
              <p>条件に一致する候補がありません。条件を変更してください。</p>
            </div>
          ) : (
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
                            onClick={col.sortable ? () => handleSort(config.key) : undefined}
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
                  {sorted.map((item) => (
                    <tr key={`${item.productNo}-${item.skuCode}`} className={styles.tr}>
                      {visibleCols.map(({ config, col }) => (
                        <td key={config.key} className={styles.td}>{col.render(item)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Next phase card ── */}
      <div className={styles.nextPhaseCard}>
        <div className={styles.nextPhaseHeading}>次フェーズで追加予定</div>
        <ul className={styles.nextPhaseList}>
          {[
            'futureshop APIからEC在庫を取得',
            '店舗在庫データを取込（SKU/カラー/サイズ単位）',
            '直近売上を連携（SKU別集計）',
            '消化率を計算',
            '欲しいもの候補を自動判定（在庫・売上ベース）',
            '店舗共有用CSV/xlsxを出力',
            '条件設定画面で判定条件を変更',
          ].map((item) => (
            <li key={item} className={styles.nextPhaseItem}>
              <span className={styles.nextPhaseIcon}>→</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}
