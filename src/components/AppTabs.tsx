import styles from './AppTabs.module.css';

export type AppTab = 'tasks' | 'products' | 'inventory' | 'schedules' | 'import';

const TAB_LABELS: Record<AppTab, string> = {
  tasks:     'タスク',
  products:  '商品管理',
  inventory: '在庫候補',
  schedules: 'スケジュール',
  import:    '商品登録CSV',
};

const TABS: AppTab[] = ['tasks', 'products', 'inventory', 'schedules', 'import'];

type Props = {
  current: AppTab;
  onChange: (tab: AppTab) => void;
  counts?: Partial<Record<AppTab, number>>;
};

export function AppTabs({ current, onChange, counts }: Props) {
  return (
    <nav className={styles.nav} aria-label="メインナビゲーション">
      {TABS.map((tab) => (
        <button
          key={tab}
          className={styles.tab}
          data-active={current === tab || undefined}
          onClick={() => onChange(tab)}
          aria-current={current === tab ? 'page' : undefined}
        >
          {TAB_LABELS[tab]}
          {(counts?.[tab] ?? 0) > 0 && (
            <span className={styles.count}>{counts![tab]}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
