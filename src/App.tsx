import { useState } from 'react';
import { useTasks } from './hooks/useTasks';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { FilterTabs } from './components/FilterTabs';
import { SearchBar } from './components/SearchBar';
import { sortTasks } from './utils/taskSort';
import { applyFilter, applySearch } from './utils/taskFilter';
import type { FilterType } from './types/filter';
import type { SortType } from './types/sort';
import styles from './App.module.css';

function App() {
  const { tasks, loading, error, addTask, toggleTask, deleteTask, editTask, clearCompleted } = useTasks();
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('dueDate');
  const [search, setSearch] = useState('');

  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;

  const displayTasks = applySearch(applyFilter(sortTasks(tasks, sortBy), filter), search);

  return (
    <div className={styles.wrapper}>
      <main className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>ToDoアプリ</h1>
            {tasks.length > 0 && (
              <span className={styles.badge} aria-label={`未完了 ${activeCount} 件`}>
                {activeCount} 件未完了
              </span>
            )}
          </div>
          <SearchBar value={search} onChange={setSearch} />
        </header>

        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        {loading ? (
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
        )}
      </main>
    </div>
  );
}

export default App;
