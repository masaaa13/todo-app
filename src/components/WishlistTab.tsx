import { useState, useMemo } from 'react';
import type { MdProduct, WishlistItem } from '../types/md';
import styles from './WishlistTab.module.css';

type Props = {
  products: MdProduct[];
};

type Conditions = {
  category: string;
  priority: string;
  status: string;
  releaseMonth: string;
  excludeNos: string;
  limit: string;
};

const DEFAULT_CONDITIONS: Conditions = {
  category: '',
  priority: '',
  status: '',
  releaseMonth: '',
  excludeNos: '',
  limit: '',
};

function toWishlistItems(products: MdProduct[]): WishlistItem[] {
  return products.map((p) => {
    let priority: WishlistItem['priority'];
    let reason: string;
    let suggestedAction: string;

    if (p.status === '素材未取得') {
      priority = '中';
      reason = '商品情報の補完確認が必要';
      suggestedAction = '素材補完後に確認';
    } else if (p.status === '補完未取得') {
      priority = '中';
      reason = '商品情報の補完確認が必要';
      suggestedAction = '補完内容を確認';
    } else if (p.category === 'PANTS') {
      priority = '中';
      reason = 'ボトムスカテゴリ候補';
      suggestedAction = '在庫・売上連携後に判断';
    } else if (p.category === 'TOPS') {
      priority = '中';
      reason = 'トップスカテゴリ候補';
      suggestedAction = '在庫・売上連携後に判断';
    } else {
      priority = '低';
      reason = '在庫・売上連携後に判定予定';
      suggestedAction = '在庫・売上連携後に判断';
    }

    return {
      productNo: p.productNo,
      productName: p.productName,
      category: p.category,
      status: p.status,
      releaseDate: p.releaseDate,
      skuCount: p.skuCount,
      reason,
      priority,
      suggestedAction,
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
  if (excludeSet.size > 0) result = result.filter((i) => !excludeSet.has(i.productNo));
  if (cond.limit)         result = result.slice(0, Number(cond.limit));

  return result;
}

function exportCsv(items: WishlistItem[]) {
  const BOM = '\uFEFF';
  const header = '優先度,品番,商品名,カテゴリ,発売日,SKU数,理由,推奨アクション';
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
  const rows = items.map((it) =>
    [
      it.priority,
      it.productNo,
      it.productName,
      it.category,
      it.releaseDate ?? '',
      it.skuCount != null ? String(it.skuCount) : '',
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

type PriorityPillProps = { priority: WishlistItem['priority'] };
function PriorityPill({ priority }: PriorityPillProps) {
  const variant = priority === '高' ? 'high' : priority === '中' ? 'mid' : 'low';
  return (
    <span className={styles.priorityPill} data-variant={variant}>
      {priority}
    </span>
  );
}

export function WishlistTab({ products }: Props) {
  const hasData = products.length > 0;
  const [cond, setCond] = useState<Conditions>(DEFAULT_CONDITIONS);

  const allItems = useMemo(() => (hasData ? toWishlistItems(products) : []), [products, hasData]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products]
  );

  const statuses = useMemo(
    () => [...new Set(products.map((p) => p.status))].sort(),
    [products]
  );

  const releaseMonths = useMemo(() => {
    const months = products
      .map((p) => p.releaseDate?.slice(0, 7))
      .filter((m): m is string => !!m);
    return [...new Set(months)].sort();
  }, [products]);

  const filtered = useMemo(() => applyConditions(allItems, cond), [allItems, cond]);

  const highCount = filtered.filter((i) => i.priority === '高').length;
  const midCount  = filtered.filter((i) => i.priority === '中').length;
  const lowCount  = filtered.filter((i) => i.priority === '低').length;

  const kpis = [
    { label: '候補商品数',   value: hasData ? String(filtered.length) : '—', active: hasData },
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
          <p className={styles.desc}>商品一覧データをもとに、店舗共有用の欲しいもの候補を整理します。</p>
        </div>
        <span className={styles.statusBadge} data-variant={hasData ? 'active' : 'empty'}>
          {hasData ? '商品一覧データ連携中' : '商品一覧データ未反映'}
        </span>
      </div>

      {/* ── Disclaimer ── */}
      <div className={styles.disclaimer}>
        ⚠️ 現在は商品一覧データをもとにした仮の候補表示です。店舗在庫・EC在庫・売上データ連携後に判定ロジックを追加予定です。
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
            在庫・売上連携前の仮条件です。現在は商品一覧データのカテゴリ・ステータス・発売月などで候補を絞り込みます。
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
                ? `表示中 ${filtered.length}件 / 全${allItems.length}件（仮判定）`
                : '商品一覧データを取り込むと候補が表示されます'}
            </p>
            <button
              className={styles.csvBtn}
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
            >
              表示中{filtered.length}件をCSV出力
            </button>
          </div>

          {!hasData ? (
            <div className={styles.emptyGuide}>
              <p>商品登録CSVタブで商品データを取り込み、「商品一覧へ反映」を押すと、欲しいもの候補を表示できます。</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyGuide}>
              <p>条件に一致する候補がありません。条件を変更してください。</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {['優先度', '品番', '商品名', 'カテゴリ', '発売日', 'SKU数', '理由', '推奨アクション'].map((h) => (
                      <th key={h} className={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.productNo} className={styles.tr}>
                      <td className={styles.td}><PriorityPill priority={item.priority} /></td>
                      <td className={styles.td}><span className={styles.productNo}>{item.productNo}</span></td>
                      <td className={styles.td}><span className={styles.productName}>{item.productName}</span></td>
                      <td className={styles.td}><span className={styles.categoryBadge}>{item.category}</span></td>
                      <td className={styles.td}><span className={styles.dateCell}>{item.releaseDate ?? '—'}</span></td>
                      <td className={styles.td}><span className={styles.numCell}>{item.skuCount ?? '—'}</span></td>
                      <td className={styles.td}><span className={styles.reasonCell}>{item.reason}</span></td>
                      <td className={styles.td}><span className={styles.actionCell}>{item.suggestedAction}</span></td>
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
            '店舗在庫データを取込',
            '直近売上を連携',
            '消化率を計算',
            '欲しいもの候補を自動判定',
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
