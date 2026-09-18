import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { setupApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { Button, Card, CardHeader } from '../ui';

const APPARENCE = {
  bloquant: {
    icone: XCircle,
    puce: 'bg-red-100 text-red-700 dark:text-red-400',
    cadre: 'border-red-200 dark:border-red-900/50 bg-red-50/60',
  },
  attention: {
    icone: AlertTriangle,
    puce: 'bg-amber-100 text-amber-800 dark:text-amber-300',
    cadre: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50',
  },
  info: {
    icone: Info,
    puce: 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300',
    cadre: 'border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800',
  },
};

/**
 * Contrôle de mise en service.
 *
 * Ce ne sont pas des erreurs techniques : l'application tourne. Ce sont des
 * oublis de configuration — un menu du jour jamais publié, des tables laissées
 * hors service — et ils ont ceci de vicieux qu'ils sont invisibles depuis le
 * bureau. C'est le client, QR Code en main, qui les découvre.
 *
 * La carte ne s'affiche que lorsqu'il y a quelque chose à corriger. Le jour où
 * tout est en ordre, elle se réduit à une ligne verte : un tableau de bord qui
 * alerte en permanence finit par n'alerter de rien.
 */
export default function MiseEnService() {
  const toast = useToast();
  const [donnees, setDonnees] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setDonnees(await setupApi.controles());
    } catch {
      // Un contrôle qui échoue ne doit pas abîmer le tableau de bord.
      setDonnees(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activerLesTables = async () => {
    setBusy('tables');
    try {
      const resultat = await setupApi.activerLesTables();
      toast.success(resultat.message);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  };

  if (!donnees) return null;

  const aCorriger = donnees.checks.filter((controle) => !controle.ok && controle.niveau !== 'info');
  const { summary } = donnees;

  // Tout est en ordre : une ligne, et on passe à autre chose.
  if (aCorriger.length === 0) {
    return (
      <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 px-4 py-3">
        <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
          Tout est prêt pour le service.
        </p>
        <button
          type="button"
          onClick={load}
          className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          Revérifier
        </button>
      </div>
    );
  }

  return (
    <Card
      className={`mb-5 ${summary.blocking > 0 ? 'border-red-200 dark:border-red-900/50' : 'border-amber-200 dark:border-amber-900/50'}`}
    >
      <CardHeader
        title={
          summary.blocking > 0
            ? 'Un client ne peut pas commander maintenant'
            : 'Quelques points à régler'
        }
        subtitle={
          summary.blocking > 0
            ? `${summary.blocking} point${summary.blocking > 1 ? 's' : ''} bloquant${
                summary.blocking > 1 ? 's' : ''
              }${summary.warnings > 0 ? `, ${summary.warnings} à surveiller` : ''}`
            : `${summary.warnings} point${summary.warnings > 1 ? 's' : ''} à surveiller`
        }
        action={
          <Button variant="ghost" icon={RefreshCw} onClick={load}>
            Revérifier
          </Button>
        }
      />

      <div className="space-y-2 p-4 pt-0">
        {aCorriger.map((controle) => {
          const apparence = APPARENCE[controle.niveau] || APPARENCE.info;
          const Icone = apparence.icone;

          return (
            <div
              key={controle.id}
              className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 ${apparence.cadre}`}
            >
              <span className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${apparence.puce}`}>
                <Icone size={16} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{controle.titre}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{controle.detail}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Le seul geste qu'on peut faire sans rien demander de plus. */}
                {controle.id === 'tables_actives' && controle.cibles?.length > 0 && (
                  <Button onClick={activerLesTables} loading={busy === 'tables'}>
                    Tout remettre en service
                  </Button>
                )}

                {controle.action && (
                  <Link
                    to={controle.action.route}
                    className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {controle.action.label}
                    <ChevronRight size={15} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
