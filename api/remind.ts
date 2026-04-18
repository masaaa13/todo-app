import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import nodemailer from 'nodemailer';

// Service role client bypasses RLS — only used server-side
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

type TaskRow = {
  id: string;
  text: string;
  user_id: string;
  due_at: string;
  reminder_offset_minutes: number;
};

type PushSubRow = { endpoint: string; p256dh: string; auth: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: tasks, error } = await supabase.rpc('get_due_reminders');
  if (error) return res.status(500).json({ error: error.message });
  if (!tasks || (tasks as TaskRow[]).length === 0) return res.json({ sent: 0 });

  let sent = 0;

  for (const task of tasks as TaskRow[]) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', task.user_id);

    const payload = JSON.stringify({
      title: 'ToDoリマインダー',
      body: task.text,
      tag: `reminder-${task.id}`,
    });

    let pushSent = false;

    if (subs && subs.length > 0 && process.env.VAPID_PUBLIC_KEY) {
      for (const sub of subs as PushSubRow[]) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          pushSent = true;
        } catch {
          // Expired or invalid subscription — remove it
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }

    // Email fallback when push is unavailable
    if (!pushSent && mailer) {
      const { data: userData } = await supabase.auth.admin.getUserById(task.user_id);
      const email = userData?.user?.email;
      if (email) {
        try {
          await mailer.sendMail({
            from: process.env.SMTP_FROM,
            to: email,
            subject: `リマインダー: ${task.text}`,
            text: `タスク「${task.text}」の期限が近づいています。\n期限: ${new Date(task.due_at).toLocaleString('ja-JP')}`,
          });
        } catch { /* email failed — continue */ }
      }
    }

    // Mark reminded (idempotency guard)
    await supabase
      .from('tasks')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('id', task.id);

    sent++;
  }

  return res.json({ sent });
}
