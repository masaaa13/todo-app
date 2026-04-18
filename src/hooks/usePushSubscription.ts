import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { isPushSupported, registerServiceWorker, subscribeToPush, VAPID_PUBLIC_KEY } from '../lib/pushSubscription';

export type PushStatus = 'unsupported' | 'denied' | 'prompt' | 'subscribed';

export function usePushSubscription(user: User | null) {
  const [status, setStatus] = useState<PushStatus>('prompt');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }

    navigator.serviceWorker.register('/sw.js').then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        setStatus(sub ? 'subscribed' : 'prompt');
      })
    );
  }, [user?.id]);

  const subscribe = async () => {
    if (!user || !supabase || !VAPID_PUBLIC_KEY) return;
    setLoading(true);
    try {
      const reg = await registerServiceWorker();
      const sub = await subscribeToPush(reg);
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await supabase.from('push_subscriptions').upsert(
        { user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: 'endpoint' }
      );
      setStatus('subscribed');
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('prompt');
    } finally {
      setLoading(false);
    }
  };

  return { status, loading, subscribe, unsubscribe };
}
