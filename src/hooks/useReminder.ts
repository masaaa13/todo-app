import { useEffect, useRef } from 'react';
import type { Task } from '../types/task';
import { sendReminderNotification, getNotificationPermission } from '../utils/notificationUtils';

const POLL_INTERVAL = 30_000;

export function useReminder(tasks: Task[]): void {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function check() {
      if (getNotificationPermission() !== 'granted') return;
      const now = Date.now();

      for (const task of tasks) {
        if (task.completed) continue;
        if (task.dueAt === null || task.reminderOffsetMinutes === null) continue;

        const dueMs = new Date(task.dueAt).getTime();
        const fireAt = dueMs - task.reminderOffsetMinutes * 60_000;
        const key = `${task.id}-${task.reminderOffsetMinutes}`;

        if (now >= fireAt && now < fireAt + POLL_INTERVAL && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          sendReminderNotification(task);
        }
      }
    }

    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [tasks]);
}
