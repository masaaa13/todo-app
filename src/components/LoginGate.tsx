import { useState } from 'react';
import styles from './LoginGate.module.css';

const AUTH_KEY = 'ecTodo.auth';

export type AuthState = {
  authenticated: boolean;
  loggedInAt: string;
};

export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.authenticated === true ? (parsed as AuthState) : null;
  } catch {
    return null;
  }
}

export function saveAuth() {
  const state: AuthState = { authenticated: true, loggedInAt: new Date().toISOString() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

type Props = {
  onLogin: () => void;
};

export function LoginGate({ onLogin }: Props) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const expectedId = import.meta.env.VITE_EC_TODO_LOGIN_ID as string | undefined;
  const expectedPw = import.meta.env.VITE_EC_TODO_LOGIN_PASSWORD as string | undefined;
  const isConfigured = !!expectedId && !!expectedPw;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigured) return;
    if (id === expectedId && password === expectedPw) {
      saveAuth();
      onLogin();
    } else {
      setError('IDまたはパスワードが違います。');
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <span className={styles.logoTitle}>EC ToDo</span>
          <span className={styles.logoDivider}>|</span>
          <span className={styles.logoSub}>Candy Stripper MD Tool</span>
        </div>

        {!isConfigured ? (
          <div className={styles.configError}>
            ログイン設定が未設定です。環境変数を確認してください。
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor='login-id'>ID</label>
              <input
                id='login-id'
                type='text'
                className={styles.input}
                value={id}
                onChange={(e) => { setId(e.target.value); setError(''); }}
                autoComplete='username'
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor='login-password'>パスワード</label>
              <input
                id='login-password'
                type='password'
                className={styles.input}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete='current-password'
                required
              />
            </div>
            {error && <div className={styles.error} role='alert'>{error}</div>}
            <button type='submit' className={styles.submitBtn}>ログイン</button>
          </form>
        )}
      </div>
    </div>
  );
}
