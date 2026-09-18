import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, Receipt, RefreshCw, BellOff } from 'lucide-react';
import { serviceRequestApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { SERVICE_REQUEST_STATUS } from '../../utils/constants';
import { timeAgo } from '../../utils/format';

const ICONS = { CALL_SERVER: Bell, BILL: Receipt };
const LABELS = { CALL_SERVER: 'Appelle une serveuse', BILL: 'Demande l\'addition' };

/** Demandes des clients : appels serveuse et demandes d'addition. */
export default function ServerRequestsPage() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await serviceRequestApi.list({ open: showClosed ? 'false' : 'true' }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent('service_request', load);
  useSocketEvent('service_request_updated', load);
  useSocketEvent('service_request_reminder', load);

  const advance = async (request, status) => {
    setBusy(request.id);
    try {
      await serviceRequestApi.updateStatus(request.id, status);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Demandes des clients"
        subtitle="Appels et demandes d'addition en temps réel"
        icon={BellRing}
        action={
          <>
            <Button variant="secondary" onClick={() => setShowClosed((value) => !value)}>
              {showClosed ? 'Voir les demandes en cours' : 'Voir l\'historique'}
            </Button>
            <Button variant="secondary" icon={RefreshCw} onClick={load}>
              Actualiser
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : requests.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BellOff}
            title="Aucune demande en cours"
            description="Quand un client appelle une serveuse ou demande l'addition, la demande apparaît ici avec une alerte sonore."
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {requests.map((request) => {
            const Icon = ICONS[request.type];
            const config = SERVICE_REQUEST_STATUS[request.status];
            return (
              <div key={request.id} className="card flex items-start gap-4 p-4">
                <span
                  className={`rounded-xl p-3 ${
                    request.type === 'BILL' ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-600' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'
                  }`}
                >
                  <Icon size={20} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-ink-900 dark:text-ink-50">Table {request.table?.number}</h3>
                    <span className={`badge ${config.badge}`}>{config.label}</span>
                  </div>
                  <p className="text-sm text-ink-600 dark:text-ink-300">{LABELS[request.type]}</p>
                  {request.reminderCount > 0 && (
                    <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 px-2 py-1 text-xs font-bold text-red-700 dark:text-red-400">
                      <BellRing size={13} />
                      {request.reminderCount === 1
                        ? 'La table a relancé une fois'
                        : `La table a relancé ${request.reminderCount} fois`}
                    </p>
                  )}
                  {request.message && <p className="text-xs italic text-ink-500 dark:text-ink-400">{request.message}</p>}
                  <p className="mt-1 text-xs text-ink-400 dark:text-ink-500">
                    {timeAgo(request.createdAt)}
                    {request.handledBy && ` - traitée par ${request.handledBy.fullName}`}
                  </p>

                  {config.next && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={() => advance(request, config.next)}
                        loading={busy === request.id}
                      >
                        {config.nextLabel}
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => advance(request, 'CANCELLED')}
                      >
                        Annuler
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
