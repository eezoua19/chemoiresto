import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/** Bouton bascule clair/sombre, a placer dans les en-tetes/barres laterales. */
export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`rounded-xl p-2 text-ink-600 dark:text-ink-300 transition hover:bg-ink-100 dark:hover:bg-ink-700 ${className}`}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
