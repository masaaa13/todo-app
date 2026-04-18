import { useState, useEffect } from 'react';
import { isNotificationSupported, getNotificationPermission, requestNotificationPermission } from '../utils/notificationUtils';
import styles from './NotificationBanner.module.css';

export function NotificationBanner() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  if (!isNotificationSupported() || permission === 'granted') return null;

  const handleRequest = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
  };

  if (permission === 'denied') {
    return (
      <div className={styles.banner} data-status="denied" role="status">
        通知がブロックされています。ブラウザの設定から許可してください。
      </div>
    );
  }

  return (
    <div className={styles.banner} data-status="prompt" role="status">
      <span>リマインダーを使うにはブラウザ通知を許可してください。</span>
      <button className={styles.button} onClick={handleRequest}>
        通知を許可する
      </button>
    </div>
  );
}
