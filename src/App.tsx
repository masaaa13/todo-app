import { useState } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { useTasks } from './hooks/useTasks';
import { useReminder } from './hooks/useReminder';
import { usePushSubscription } from './hooks/usePushSubscription';
import { AuthGate } from './components/AuthGate';
import { AppTabs } from './components/AppTabs';
import type { AppTab } from './components/AppTabs';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { FilterTabs } from './components/FilterTabs';
import { SearchBar } from './components/SearchBar';
import { NotificationSettings } from './components/NotificationSettings';
import { ProductsTab } from './components/ProductsTab';
import { ScheduleTab } from './components/ScheduleTab';
import { InventoryTab } from './components/InventoryTab';
import { sortTasks } from './utils/taskSort';
import { applyFilter, applySearch } from './utils/taskFilter';
import type { FilterType } from './types/filter';
import type { SortType } from './types/sort';
import styles from './App.module.css';

function App() {
  const { user, loading: authLoading, authError, signInWithEmail, signOut } = useAuth();
  const { tasks, loading, error, addTask, toggleTask, deleteTask, editTask, clearCompleted } = useTasks(user);
  const { status: pushStatus, loading: pushLoading, subscribe, unsubscribe } = usePushSubscription(user);

  const [activeTab, setActiveTab] = useState<AppTab>('tasks');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('dueDate');
  const [search, setSearch] = useState('');

  useReminder(tasks);

  if (authLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.loadingFull}>読み込み中...</div>
      </div>
    );
  }

  if (isSupabaseConfigured && !user) {
    return <AuthGate onSignIn={signInWithEmail} authError={authError} />;
  }

  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;
  const displayTasks = applySearch(applyFilter(sortTasks(tasks, sortBy), filter), search);

  return (
    <div className={styles.wrapper}>
      <main className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>EC ToDo</h1>
            {user && (
              <div className={styles.userRow}>
                <span className={styles.userEmail}>{user.email}</span>
                <button className={styles.signOutButton} onClick={signOut}>ログアウト</button>
              </div>
            )}
          </div>
          {activeTab === 'tasks' && (
            <SearchBar value={search} onChange={setSearch} />
          )}
        </header>

        {user && (
          <NotificationSettings
            pushStatus={pushStatus}
            pushLoading={pushLoading}
            user={user}
            onSubscribe={subscribe}
            onUnsubscribe={unsubscribe}
          />
        )}

        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        <AppTabs
          current={activeTab}
          onChange={setActiveTab}
          counts={{ tasks: activeCount }}
        />

        {/* ── Tasks tab ── */}
        {activeTab === 'tasks' && (
          loading ? (
            <div className={styles.loading}>読み込み中...</div>
          ) : (
            <>
              <TaskForm onAdd={addTask} />
              <FilterTabs
                current={filter}
                onChange={setFilter}
                counts={{ all: tasks.length, active: activeCount, done: doneCount }}
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
              <TaskList
                tasks={displayTasks}
                filter={filter}
                totalCount={tasks.length}
                searchQuery={search}
                onToggle={toggleTask}
                onDelete={deleteTask}
                onEdit={editTask}
              />
              {tasks.length > 0 && (
                <footer className={styles.footer}>
                  <span className={styles.footerStats}>
                    {doneCount > 0 ? `${doneCount} 件完了` : 'まだ完了したタスクはありません'}
                  </span>
                  <button
                    className={styles.clearButton}
                    onClick={clearCompleted}
                    disabled={doneCount === 0}
                  >
                    完了済みを削除
                  </button>
                </footer>
              )}
            </>
          )
        )}

        {/* ── EC tabs ── */}
        {activeTab === 'products'  && <ProductsTab user={user} />}
        {activeTab === 'schedules' && <ScheduleTab user={user} />}
        {activeTab === 'inventory' && <InventoryTab user={user} />}
      </main>
    </div>
  );
}

export default App;
