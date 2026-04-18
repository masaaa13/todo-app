import type { Product } from '../types/product';
import type { ProductSchedule, ScheduleEvent, EventType } from '../types/schedule';
import { EVENT_TYPE_LABELS } from '../types/schedule';

export function deriveEventsFromProduct(product: Product): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];

  const push = (date: string | null, eventType: EventType, label: string) => {
    if (!date) return;
    events.push({
      key: `${product.id}-${eventType}`,
      date,
      eventType,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      title: `${label}: ${product.name}`,
      done: false,
      source: 'product_field',
    });
  };

  const releaseType: EventType = product.category === 'collab' ? 'collab_launch' : 'new_release';
  push(product.releaseDate,      releaseType,          product.category === 'collab' ? 'コラボ公開' : '新商品発売');
  push(product.launchDate,       'new_release',        '公開');
  push(product.reservationStart, 'reservation_start',  '予約開始');
  push(product.reservationEnd,   'reservation_end',    '予約終了');

  return events;
}

export function manualToEvent(schedule: ProductSchedule, products: Product[]): ScheduleEvent {
  const product = products.find((p) => p.id === schedule.productId);
  return {
    key: `manual-${schedule.id}`,
    date: schedule.scheduledAt,
    eventType: schedule.eventType,
    productId: schedule.productId,
    productName: product?.name ?? null,
    productSku: product?.sku ?? null,
    title: schedule.title ?? EVENT_TYPE_LABELS[schedule.eventType],
    done: schedule.done,
    source: 'manual',
    scheduleId: schedule.id,
  };
}

export function combineAndSortEvents(products: Product[], schedules: ProductSchedule[]): ScheduleEvent[] {
  const derived = products.flatMap(deriveEventsFromProduct);
  const manual = schedules.map((s) => manualToEvent(s, products));
  return [...derived, ...manual].sort((a, b) => a.date.localeCompare(b.date));
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatScheduleDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const dow = weekdays[d.getDay()];
  const year = d.getFullYear();
  const thisYear = new Date().getFullYear();
  return year !== thisYear
    ? `${year}年${month}月${day}日（${dow}）`
    : `${month}月${day}日（${dow}）`;
}
