import type { CandidateRuleSettings } from '../types/settings';
import {
  DEFAULT_CANDIDATE_RULE_SETTINGS,
  normalizeCandidateRuleSettings,
} from '../types/settings';
import styles from './SettingsTab.module.css';

type Props = {
  settings: CandidateRuleSettings;
  onChange: (settings: CandidateRuleSettings) => void;
};

type FieldProps = {
  label: string;
  value: number;
  help: string;
  onChange: (value: number) => void;
};

function NumberField({ label, value, help, onChange }: FieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={styles.input}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.help}>{help}</span>
    </label>
  );
}

export function SettingsTab({ settings, onChange }: Props) {
  const patch = (next: Partial<CandidateRuleSettings>) => {
    onChange(normalizeCandidateRuleSettings({ ...settings, ...next }));
  };

  const reset = () => {
    onChange(DEFAULT_CANDIDATE_RULE_SETTINGS);
  };

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>設定</h1>
          <p className={styles.desc}>
            MD判断に使う売れ筋候補・死に筋候補の条件を管理します。
          </p>
        </div>
        <button className={styles.resetBtn} type="button" onClick={reset}>
          初期値に戻す
        </button>
      </div>

      

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>売れ筋候補</h2>
          <NumberField
            label="在庫数"
            value={settings.hotMinStock}
            help="この数以上の在庫があるSKU/品番を対象にします。"
            onChange={(value) => patch({ hotMinStock: value })}
          />
          <NumberField
            label="期間販売数"
            value={settings.hotMinSalesQty}
            help="この数以上売れているSKU/品番を売れ筋候補にします。"
            onChange={(value) => patch({ hotMinSalesQty: value })}
          />
          <p className={styles.rulePreview}>
            条件：在庫{settings.hotMinStock}点以上・期間販売数{settings.hotMinSalesQty}点以上
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>死に筋候補</h2>
          <NumberField
            label="在庫数"
            value={settings.deadMinStock}
            help="この数以上の在庫があるSKU/品番を対象にします。"
            onChange={(value) => patch({ deadMinStock: value })}
          />
          <NumberField
            label="期間販売数"
            value={settings.deadMaxSalesQty}
            help="この数以下の販売数を死に筋候補にします。通常は0点です。"
            onChange={(value) => patch({ deadMaxSalesQty: value })}
          />
          <p className={styles.rulePreview}>
            条件：在庫{settings.deadMinStock}点以上・期間販売数{settings.deadMaxSalesQty}点以下
          </p>
        </div>
      </div>
    </section>
  );
}
