import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { useProducts } from '../hooks/useProducts';
import { useProductSchedules } from '../hooks/useProductSchedules';
import type { EventType, ProductScheduleInput } from '../types/schedule';
import { EVENT_TYPE_LABELS, EVENT_TYPES } from '../types/schedule';
import { combineAndSortEvents, todayStr, formatScheduleDate } from '../utils/scheduleUtils';
import styles from './ScheduleTab.module.css';

type Filter = 'upcoming' | 'all';

type ScheduleFormState = {
  eventType: EventType;
  scheduledAt: string;
  productId: string;
  title: string;
  notes: string;
};

const EMPTY_FORM: ScheduleFormState = {
  eventType: 'new_release',
  scheduledAt: '',
  productId: '',
  title: '',
  notes: '',
};

type ScheduleTabProps = { user: User | null };

export function ScheduleTab({ user }: ScheduleTabProps) {
  const { products } = useProducts(user);
  const { schedules, addSchedule, toggleScheduleDone, deleteSchedule } = useProductSchedules(user);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState<ScheduleFormState>(EMPTY_FORM);

  const set = <K extends keyof ScheduleFormState>(k: K, v: ScheduleFormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const allEvents = useMemo(
    () => combineAndSortEvents(products, schedules),
    [products, schedules]
  );

  const today = todayStr();
  const filteredEvents = filter === 'upcoming'
    ? allEvents.filter((e) => !e.done && e.date >= today)
    : allEvents;

  // Group by date
  const grouped = filteredEvents.reduce<Record<string, typeof filteredEvents>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();

  const handleAdd = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!f.scheduledAt) return;
    const input: ProductScheduleInput = {
      eventType: f.eventType,
      scheduledAt: f.scheduledAt,
      productId: f.productId || null,
      title: f.title.trim() || null,
      done: false,
      notes: f.notes.trim() || null,
    };
    addSchedule(input);
    setF(EMPTY_FORM);
    setShowForm(false);
  };

  const upcomingCount = allEvents.filter((e) => !e.done && e.date >= today).length;

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <button
            className={styles.filterBtn}
            data-active={filter === 'upcoming' || undefined}
            onClick={() => setFilter('upcoming')}
          >
            未来のみ {upcomingCount > 0 && <span className={styles.badge}>{upcomingCount}</span>}
          </button>
          <button
            className={styles.filterBtn}
            data-active={filter === 'all' || undefined}
            onClick={() => setFilter('all')}
          >
            すべて
          </button>
        </div>
        <button className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'キャンセル' : '+ スケジュール追加'}
        </button>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>イベント種別 *</label>
              <select className={styles.select} value={f.eventType} onChange={(e) => set('eventType', e.target.value as EventType)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>日付 *</label>
              <input className={styles.input} type="date" value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} required />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>関連商品</label>
              <select className={styles.select} value={f.productId} onChange={(e) => set('productId', e.target.value)}>
                <option value="">（なし）</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} {p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>タイトル（省略時はイベント種別名）</label>
              <input className={styles.input} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="任意のタイトル" />
            </div>
            <div className={`${styles.formField} ${styles.fullWidth}`}>
              <label className={styles.fieldLabel}>メモ</label>
              <input className={styles.input} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="備考" />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.submitBtn} disabled={!f.scheduledAt}>追加</button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>キャンセル</button>
          </div>
        </form>
      )}

      {sortedDates.length === 0 ? (
        <div className={styles.empty}>
          {filter === 'upcoming' ? '予定されたスケジュールはありません' : 'スケジュールがありません'}
        </div>
      ) : (
        <div className={styles.timeline}>
          {sortedDates.map((date) => {
            const isPast = date < today;
            return (
              <div key={date} className={styles.dateGroup} data-past={isPast || undefined}>
                <div className={styles.dateHeader}>
                  <span className={styles.dateLine} />
                  <span className={styles.dateLabel}>{formatScheduleDate(date)}</span>
                  <span className={styles.dateLine} />
                </div>
                <ul className={styles.eventList}>
                  {grouped[date].map((event) => (
                    <li
                      key={event.key}
                      className={styles.eventRow}
                      data-done={event.done || undefined}
                      data-past={isPast || undefined}
                    >
                      <div className={styles.eventLeft}>
                        {event.source === 'manual' && (
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={event.done}
                            onChange={() => event.scheduleId && toggleScheduleDone(event.scheduleId)}
                            aria-label="完了にする"
                          />
                        )}
                        {event.source === 'product_field' && (
                          <span className={styles.dot} />
                        )}
                        <span className={styles.eventTypeBadge} data-type={event.eventType}>
                          {EVENT_TYPE_LABELS[event.eventType]}
                        </span>
                        <div className={styles.eventBody}>
                          <span className={styles.eventTitle}>{event.title}</span>
                          {event.productSku && (
                            <span className={styles.eventSku}>{event.productSku}</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.eventRight}>
                        {event.source === 'product_field' && (
                          <span className={styles.derivedTag}>商品より</span>
                        )}
                        {event.source === 'manual' && event.scheduleId && (
                          <button
                            className={styles.deleteSmallBtn}
                            onClick={() => deleteSchedule(event.scheduleId!)}
                            aria-label="削除"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
