import type { FilterType } from '../types/filter';
import type { SortType } from '../types/sort';
import { SORT_LABELS } from '../types/sort';
import styles from './FilterTabs.module.css';

const TABS: { label: string; value: FilterType }[] = [
  { label: 'すべて', value: 'all' },
  { label: '未完了', value: 'active' },
  { label: '完了済み', value: 'done' },
];

type Props = {
  current: FilterType;
  onChange: (filter: FilterType) => void;
  counts: { all: number; active: number; done: number };
  sortBy: SortType;
  onSortChange: (sort: SortType) => void;
};

export function FilterTabs({ current, onChange, counts, sortBy, onSortChange }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.tabs} role="tablist" aria-label="表示フィルター">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={current === tab.value}
            className={`${styles.tab} ${current === tab.value ? styles.active : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
            <span className={styles.count}>{counts[tab.value]}</span>
          </button>
        ))}
      </div>
      <select
        className={styles.sortSelect}
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortType)}
        aria-label="並び順"
      >
        {(Object.entries(SORT_LABELS) as [SortType, string][]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
