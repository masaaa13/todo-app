import type { User } from '@supabase/supabase-js';
import type { PushStatus } from '../hooks/usePushSubscription';
import { VAPID_PUBLIC_KEY } from '../lib/pushSubscription';
import styles from './NotificationSettings.module.css';

type Props = {
  pushStatus: PushStatus;
  pushLoading: boolean;
  user: User | null;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
};

const PUSH_STATUS_LABEL: Record<PushStatus, string> = {
  unsupported: '非対応',
  denied:      'ブロック中',
  prompt:      '未設定',
  subscribed:  '有効',
};

export function NotificationSettings({ pushStatus, pushLoading, user, onSubscribe, onUnsubscribe }: Props) {
  const vapidReady = Boolean(VAPID_PUBLIC_KEY);

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <span className={styles.label}>Push通知</span>
        <span className={styles.badge} data-status={pushStatus}>
          {PUSH_STATUS_LABEL[pushStatus]}
        </span>
        {pushStatus === 'prompt' && vapidReady && (
          <button className={styles.action} onClick={onSubscribe} disabled={pushLoading}>
            許可する
          </button>
        )}
        {pushStatus === 'subscribed' && (
          <button className={styles.actionDanger} onClick={onUnsubscribe} disabled={pushLoading}>
            解除
          </button>
        )}
        {pushStatus === 'denied' && (
          <span className={styles.hint}>ブラウザ設定から許可に変更できます</span>
        )}
        {pushStatus === 'prompt' && !vapidReady && (
          <span className={styles.hint}>VAPID_PUBLIC_KEY 未設定</span>
        )}
      </div>
      {user?.email && (
        <div className={styles.row}>
          <span className={styles.label}>Emailフォールバック</span>
          <span className={styles.email}>{user.email}</span>
        </div>
      )}
    </div>
  );
}
