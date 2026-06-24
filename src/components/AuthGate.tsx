import { useState } from 'react';
import styles from './AuthGate.module.css';

type Props = {
  onSignIn: (email: string) => Promise<{ error: unknown } | undefined>;
  authError?: string | null;
};

function classifyAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') return '送信に失敗しました。もう一度お試しください。';
  const msg = (error as { message?: string }).message ?? '';
  if (!msg) return '送信に失敗しました。もう一度お試しください。';
  if (msg === 'Failed to fetch' || msg.toLowerCase().includes('failed to fetch')) {
    return `Supabaseに接続できません。VITE_SUPABASE_URL、ネットワーク、Supabaseプロジェクト状態を確認してください。`;
  }
  if (msg.toLowerCase().includes('redirect')) {
    return `Supabase Auth の Redirect URLs に ${window.location.origin} を追加してください。`;
  }
  return msg;
}

export function AuthGate({ onSignIn, authError }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    authError === 'otp_expired' ? 'ログインリンクの有効期限が切れました。もう一度メールアドレスを入力してください。' : null
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const result = await onSignIn(email.trim());
    if (result?.error) {
      setError(classifyAuthError(result.error));
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.icon}>✉️</div>
          <h1 className={styles.title}>メールをご確認ください</h1>
          <p className={styles.desc}>
            <strong>{email}</strong> にログインリンクを送信しました。
            メール内のリンクをクリックするとアプリが開きます。
          </p>
          <button className={styles.retry} onClick={() => setSent(false)}>
            別のアドレスで試す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>ToDoアプリ</h1>
        <p className={styles.desc}>
          メールアドレスを入力してください。ログイン用のリンクをお送りします。
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            aria-label="メールアドレス"
          />
          <button className={styles.button} type="submit" disabled={loading || !email.trim()}>
            {loading ? '送信中...' : 'ログインリンクを送信'}
          </button>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>
  );
}
