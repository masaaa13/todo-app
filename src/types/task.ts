import type { Priority } from './priority';

export type Task = {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TaskInput = {
  text: string;
  priority: Priority;
  dueDate: string | null;
};
