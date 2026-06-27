import styles from './BudgetTab.module.css';

const MONTHLY_BUDGET_TARGET = 30_000_000;

type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  variant?: 'default' | 'warn' | 'ok' | 'disabled';
};

function KpiCard({ label, value, sub, variant = 'default' }: KpiCardProps) {
  return (
    <div className={styles.kpiCard} data-variant={variant}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

type BreakdownRowProps = {
  label: string;
  value: string;
  badge?: string;
};

function BreakdownRow({ label, value, badge }: BreakdownRowProps) {
  return (
    <div className={styles.breakdownRow}>
      <span className={styles.breakdownLabel}>{label}</span>
      {badge && <span className={styles.breakdownBadge}>{badge}</span>}
      <span className={styles.breakdownValue}>{value}</span>
    </div>
  );
}

type ApiItemProps = {
  label: string;
  status: 'planned' | 'later';
};

function ApiItem({ label, status }: ApiItemProps) {
  return (
    <div className={styles.apiItem} data-status={status}>
      <span className={styles.apiDot} />
      <span className={styles.apiLabel}>{label}</span>
      <span className={styles.apiStatus}>{status === 'planned' ? '連携予定' : '後回し'}</span>
    </div>
  );
}

export function BudgetTab() {
  const budgetFmt = `¥${(MONTHLY_BUDGET_TARGET / 10_000).toLocaleString()}万円`;

  return (
    <div className={styles.root}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <span className={styles.title}>予算管理</span>
            <span className={styles.subtitle}>Budget Dashboard</span>
          </div>
          <p className={styles.desc}>
            現在は予算管理ダッシュボードの土台です。在庫API・受注API連携後に、売上進捗、品番別売上、コラボ別売上、タイムセール効果、欲しいもの追加後の効果を自動集計します。
          </p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.targetBadge}>月商目標 {budgetFmt}</span>
          <span className={styles.statusBadge}>API未連携</span>
        </div>
      </div>

      {/* KPI カード */}
      <div className={styles.kpiGrid}>
        <KpiCard label="月予算"       value={budgetFmt}  variant="ok" />
        <KpiCard label="月累計売上"   value="未連携"      variant="disabled" sub="受注API連携後に表示" />
        <KpiCard label="予算進捗率"   value="未連携"      variant="disabled" sub="受注API連携後に表示" />
        <KpiCard label="着地予測"     value="未連携"      variant="disabled" sub="受注API連携後に表示" />
        <KpiCard label="不足額"       value="未連携"      variant="disabled" sub="受注API連携後に表示" />
        <KpiCard label="残日数"       value="未連携"      variant="disabled" sub="今月の残り日数" />
        <KpiCard label="必要日販"     value="未連携"      variant="disabled" sub="受注API連携後に表示" />
        <KpiCard label="昨対"         value="未連携"      variant="disabled" sub="受注API連携後に表示" />
      </div>

      {/* 売上内訳 */}
      <Section title="売上内訳">
        <p className={styles.sectionNote}>受注API連携後に販売区分ごとの売上を集計します。</p>
        <div className={styles.breakdownList}>
          <BreakdownRow label="通常商品"   value="準備中" badge="normal" />
          <BreakdownRow label="コラボ"     value="準備中" badge="collab" />
          <BreakdownRow label="セール"     value="準備中" badge="sale" />
          <BreakdownRow label="タイムセール" value="準備中" badge="timesale" />
          <BreakdownRow label="予約"       value="準備中" badge="preorder" />
          <BreakdownRow label="予定在庫"   value="準備中" badge="planned" />
        </div>
      </Section>

      {/* 品番別売上ランキング */}
      <Section title="品番別売上ランキング">
        <div className={styles.prepareBox}>
          <span className={styles.prepareIcon}>📊</span>
          <span className={styles.prepareText}>受注API連携後に品番別売上ランキングを表示します。</span>
        </div>
      </Section>

      {/* コラボ別売上 */}
      <Section title="コラボ別売上">
        <div className={styles.prepareBox}>
          <span className={styles.prepareIcon}>🎀</span>
          <span className={styles.prepareText}>コラボ商品フラグ（isCollaboration / collaborationName）と受注API連携後に集計します。</span>
        </div>
      </Section>

      {/* タイムセール効果 */}
      <Section title="タイムセール効果">
        <div className={styles.prepareBox}>
          <span className={styles.prepareIcon}>⚡</span>
          <span className={styles.prepareText}>タイムセール対象フラグ（isTimeSaleTarget）と受注API連携後に効果を計測します。</span>
        </div>
      </Section>

      {/* 欲しいもの追加後の効果 */}
      <Section title="欲しいもの追加後の効果">
        <div className={styles.prepareBox}>
          <span className={styles.prepareIcon}>📋</span>
          <span className={styles.prepareText}>欲しいものリストへの追加日・追加前後の在庫・販売数を記録し、追加効果を測定します。</span>
        </div>
      </Section>

      {/* API連携予定 */}
      <Section title="API連携予定">
        <p className={styles.sectionNote}>分析・判断用として読み取り系APIを優先して連携予定です。</p>
        <div className={styles.apiList}>
          <ApiItem label="在庫検索API"    status="planned" />
          <ApiItem label="受注検索API"    status="planned" />
          <ApiItem label="受注取得API"    status="planned" />
          <ApiItem label="商品検索API"    status="planned" />
          <ApiItem label="在庫更新API"    status="later" />
          <ApiItem label="発送API"        status="later" />
          <ApiItem label="入金API"        status="later" />
          <ApiItem label="受注ステータス変更API" status="later" />
          <ApiItem label="会員系API"      status="later" />
          <ApiItem label="ポイント系API"  status="later" />
          <ApiItem label="実店舗系API"    status="later" />
        </div>
      </Section>

    </div>
  );
}
