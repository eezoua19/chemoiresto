/**
 * Écran de chargement du menu.
 *
 * À la place de rectangles gris : l'assiette se trace toute seule, la vapeur
 * monte. Le trait est un `stroke-dasharray` animé — le tiret court le long du
 * chemin, sans qu'aucune image ne soit chargée ni qu'aucun calcul ne tourne.
 *
 * L'attente ne raccourcit pas pour autant. Mais elle cesse d'être un vide :
 * le client voit qu'on lui prépare quelque chose.
 */
export default function ChargementGourmand({ message = 'On dresse la table...' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink-50 dark:bg-ink-900 px-8">
      <svg viewBox="0 0 120 120" fill="none" className="h-36 w-36" style={{ color: 'var(--brand)' }}>
        {/* L'assiette, tracee du bord vers le centre */}
        <circle
          cx="60"
          cy="66"
          r="36"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
          strokeDasharray="226"
          className="animate-trace"
        />
        <circle
          cx="60"
          cy="66"
          r="24"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.3"
          strokeDasharray="151"
          className="animate-trace"
          style={{ animationDelay: '180ms' }}
        />

        {/* La garniture */}
        <path
          d="M44 68c0-6 5-10.5 11-10.5 3 0 5.8 1.2 7.7 3.2 1.9-1.5 4.2-2.3 6.7-2.3 5.6 0 10 4.4 10 9.7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
          strokeDasharray="60"
          className="animate-trace"
          style={{ animationDelay: '340ms' }}
        />

        {/* La vapeur, qui respire pendant tout le chargement */}
        <g className="animate-vapeur" opacity="0.5">
          <path
            d="M50 36c0 4 4 5 4 9s-4 5-4 5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M62 30c0 4 4 5 4 9s-4 5-4 5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M74 36c0 4 4 5 4 9s-4 5-4 5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      </svg>

      <p className="text-center text-sm font-medium text-ink-500 dark:text-ink-400">{message}</p>
    </div>
  );
}
