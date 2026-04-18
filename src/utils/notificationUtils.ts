import type { Task } from '../types/task';

export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return Notification.requestPermission();
}

export function sendReminderNotification(task: Task): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  new Notification('ToDoリマインダー', {
    body: task.text,
    icon: '/favicon.ico',
    tag: `reminder-${task.id}`,
  });
}
