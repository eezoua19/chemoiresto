import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RefreshCw, ScanLine, History } from 'lucide-react';
// Chargé seulement quand on ouvre le scanner : jsQR pèse ~50 Ko compressés, et
// le client qui consulte le menu sur sa data n'a aucune raison de les payer.
const QrScanner = lazy(() => import('../components/subscriptions/QrScanner'));
import { subscriptionApi } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, ErrorState, Footer, Select, Skeleton } from '../components/ui';
import { formatDateTime, formatShortDate } from '../utils/format';
import { ETATS, TYPES_UTILISATION, echeance, etatDe } from '../utils/subscription';

/**
 * Écran de vérification, ouvert par le scan du QR Code d'un ticket.
 *
 * Consulter ne consomme rien : le personnel lit l'état, puis enregistre le
 * passage d'un geste explicite. Sans cette séparation, un ticket scanné deux
 * fois par mégarde compterait deux passages.
 */
export default function SubscriptionCheckPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [type, setType] = useState('REPAS');
  const [saving, setSaving] = useState(false);
  const [justeEnregistre, setJusteEnregistre] = useState(false);
  const [scannerOuvert, setScannerOuvert] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await subscriptionApi.verify(token);
      setState({ loading: false, error: null, data });
      document.title = `${data.stateLabel} - CHEMOIRESTO`;
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const enregistrerPassage = async () => {
    setSaving(true);
    try {
      const data = await subscriptionApi.use(token, { type });
      setState({ loading: false, error: null, data: { found: true, ...data } });
      setJusteEnregistre(true);
      toast.success(`Passage enregistré pour ${data.fullName}`);
    } catch (error) {
      toast.error(error.message);
      // L'état a pu changer entre le scan et la validation : on relit.
      load();
    } finally {
      setSaving(false);
    }
  };

  const retour = user?.role === 'ADMIN' ? '/admin/abonnements' : '/serveuse/abonnements';

  // Enchaîner les clients sans repasser par la liste : un scan, un verdict,
  // le suivant. Le rappel reste stable pour ne pas relancer la caméra.
  const surDetection = useCallback(
    (jeton) => {
      setScannerOuvert(false);
      setJusteEnregistre(false);
      navigate(`/abonnement/${jeton}`, { replace: true });
    },
    [navigate]
  );

  if (state.loading) {
    return (
      <div className="mx-auto min-h-screen max-w-lg space-y-4 bg-ink-50 px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
        <div className="w-full max-w-sm">
          <ErrorState
            message={state.error.message}
            onRetry={load}
            isNetwork={state.error.isNetwork}
          />
        </div>
      </div>
    );
  }

  const abonnement = state.data;
  const etat = etatDe(abonnement);
  const introuvable = !abonnement.found;

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={retour}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft size={16} /> Retour aux abonnements
          </Link>
          <Button variant="secondary" icon={ScanLine} onClick={() => setScannerOuvert(true)}>
            Scanner le suivant
          </Button>
        </div>

        {/* --------------------- Le verdict, en grand --------------------- */}
        <div className={`mt-5 rounded-3xl border-2 p-6 text-center ${etat.bloc}`}>
          <p className="text-2xl font-extrabold leading-tight sm:text-3xl">
            {introuvable ? ETATS.INTROUVABLE.label : etat.label}
          </p>
          {!introuvable && <p className="mt-1 text-sm font-medium">{echeance(abonnement)}</p>}
        </div>

        {introuvable ? (
          <div className="card mt-4 p-5 text-center">
            <p className="text-sm text-ink-600">
              Ce QR Code ne correspond à aucun abonnement de ce restaurant. Vérifiez le ticket, ou
              cherchez l&apos;abonné par son nom ou son téléphone.
            </p>
            <Link to={retour} className="btn-primary mt-4 inline-flex">
              <ScanLine size={16} /> Chercher un abonné
            </Link>
          </div>
        ) : (
          <>
            {/* ------------------------ La fiche ------------------------ */}
            <div className="card mt-4 p-5">
              <h1 className="text-xl font-bold text-ink-900">{abonnement.fullName}</h1>
              <p className="font-mono text-sm text-ink-500">{abonnement.number}</p>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-ink-500">Formule</dt>
                <dd className="text-right font-semibold text-ink-900">{abonnement.planLabel}</dd>
                <dt className="text-ink-500">Téléphone</dt>
                <dd className="text-right font-semibold text-ink-900">
                  <a href={`tel:${abonnement.phone}`} className="text-brand-700 hover:underline">
                    {abonnement.phone}
                  </a>
                </dd>
                <dt className="text-ink-500">Valable jusqu&apos;au</dt>
                <dd className="text-right font-semibold text-ink-900">
                  {formatShortDate(abonnement.endDate)}
                </dd>
                <dt className="text-ink-500">Passages</dt>
                <dd className="text-right font-semibold text-ink-900">{abonnement.usageCount ?? 0}</dd>
              </dl>
            </div>

            {/* -------------------- Enregistrer le passage -------------------- */}
            <div className="card mt-4 p-5">
              {abonnement.isUsable ? (
                <>
                  {justeEnregistre && (
                    <p className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                      <CheckCircle2 size={16} /> Passage enregistré
                    </p>
                  )}
                  <label className="label" htmlFor="type-utilisation">
                    Type d&apos;utilisation
                  </label>
                  <Select
                    id="type-utilisation"
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                  >
                    {TYPES_UTILISATION.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    className="mt-3 w-full"
                    icon={CheckCircle2}
                    loading={saving}
                    onClick={enregistrerPassage}
                  >
                    {justeEnregistre ? 'Enregistrer un autre passage' : 'Enregistrer le passage'}
                  </Button>
                  <p className="mt-2 text-center text-xs text-ink-500">
                    Le scan seul ne compte pas : c&apos;est ce bouton qui enregistre.
                  </p>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-semibold text-ink-800">
                    Aucun passage ne peut être enregistré.
                  </p>
                  <p className="mt-1 text-sm text-ink-600">
                    {abonnement.state === 'EXPIRE' &&
                      "L'abonnement est arrivé à expiration. L'administration peut le renouveler."}
                    {abonnement.state === 'SUSPENDU' &&
                      "L'abonnement est suspendu par l'administration."}
                    {abonnement.state === 'INACTIF' && "L'abonnement a été désactivé."}
                    {abonnement.state === 'PAS_COMMENCE' &&
                      `L'abonnement ne commence que le ${formatShortDate(abonnement.startDate)}.`}
                  </p>
                  <Button variant="secondary" icon={RefreshCw} className="mt-4" onClick={load}>
                    Vérifier à nouveau
                  </Button>
                </div>
              )}
            </div>

            {/* ------------------------ Historique ------------------------ */}
            {abonnement.usages && abonnement.usages.length > 0 && (
              <div className="card mt-4">
                <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3">
                  <History size={16} className="text-ink-500" />
                  <h2 className="text-sm font-bold text-ink-900">Derniers passages</h2>
                </div>
                <div className="max-h-72 divide-y divide-ink-100 overflow-y-auto">
                  {abonnement.usages.map((passage) => (
                    <div key={passage.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 text-xs">
                      <span className="font-semibold text-ink-800">{passage.type}</span>
                      <span className="text-ink-600">{formatDateTime(passage.createdAt)}</span>
                      {passage.order && (
                        <span className="font-mono text-ink-500">{passage.order.orderNumber}</span>
                      )}
                      {passage.user && <span className="text-ink-400">par {passage.user.fullName}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {scannerOuvert && (
        <Suspense fallback={null}>
          <QrScanner open onClose={() => setScannerOuvert(false)} onDetect={surDetection} />
        </Suspense>
      )}

      <Footer />
    </div>
  );
}
