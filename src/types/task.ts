import type { Priority } from './priority';

export type Task = {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueAt: string | null;
  reminderOffsetMinutes: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TaskInput = {
  text: string;
  priority: Priority;
  dueAt: string | null;
  reminderOffsetMinutes: number | null;
};
