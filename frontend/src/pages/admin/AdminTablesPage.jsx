import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table2, Plus, Pencil, Trash2, QrCode, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { tableApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';

const EMPTY = { number: '', label: '', capacity: '4', status: 'ACTIVE' };

export default function AdminTablesPage() {
  const toast = useToast();

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [regenerateTarget, setRegenerateTarget] = useState(null);
  const [qrTable, setQrTable] = useState(null);
  const [statusBusy, setStatusBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTables(await tableApi.list());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (table) => {
    setEditing(table);
    setForm({
      number: table.number,
      label: table.label || '',
      capacity: String(table.capacity),
      status: table.status,
    });
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        number: form.number.trim(),
        label: form.label.trim() || null,
        capacity: Number(form.capacity),
        status: form.status,
      };
      if (editing) {
        await tableApi.update(editing.id, payload);
        toast.success('Table mise à jour');
      } else {
        await tableApi.create(payload);
        toast.success('Table créée avec son QR Code');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (table) => {
    setStatusBusy(table.id);
    try {
      const updated = await tableApi.toggleStatus(table.id);
      setTables((current) => current.map((t) => (t.id === updated.id ? updated : t)));
      toast.success(updated.status === 'ACTIVE' ? 'Table activée' : 'Table désactivée');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStatusBusy(null);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await tableApi.remove(deleteTarget.id);
      toast.success('Table supprimée');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setSaving(true);
    try {
      const result = await tableApi.regenerateQRCode(regenerateTarget.id);
      toast.warning('Nouveau QR Code généré : réimprimez celui de la table');
      setRegenerateTarget(null);
      await load();
      setQrTable({ ...regenerateTarget, qrCode: result.qrCode, token: result.table.token });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (table) => {
    try {
      await navigator.clipboard.writeText(table.menuUrl);
      toast.success('Lien copié dans le presse-papiers');
    } catch {
      toast.error('Copie impossible : copiez le lien manuellement');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Tables"
        subtitle={`${tables.length} table(s) - chaque table possède un QR Code unique`}
        icon={Table2}
        action={
          <>
            <Link to="/admin/qrcodes" className="btn-secondary">
              <QrCode size={16} /> Imprimer les QR Codes
            </Link>
            <Button icon={Plus} onClick={openCreate}>
              Nouvelle table
            </Button>
          </>
        }
      />

      {tables.length === 0 ? (
        <Card>
          <EmptyState
            icon={Table2}
            title="Aucune table"
            description="Créez vos tables : chacune recevra automatiquement un QR Code unique à poser dessus."
            action={<Button onClick={openCreate}>Créer une table</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table, index) => (
            <Card
              key={table.id}
              className="animate-entree p-4"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">Table {table.number}</h3>
                    <span
                      className={`badge ${
                        table.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-700 dark:text-emerald-400'
                          : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      {table.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {table.label || 'Sans libellé'} - {table.capacity} places
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400 dark:text-ink-500">{table.orderCount} commande(s)</p>
                </div>

                {table.qrCode && (
                  <button
                    type="button"
                    onClick={() => setQrTable(table)}
                    className="shrink-0 rounded-lg border border-ink-200 dark:border-ink-700 p-1 transition hover:border-brand-300"
                    aria-label="Voir le QR Code"
                  >
                    <img src={table.qrCode.dataUrl} alt="" className="h-14 w-14" />
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Button variant="secondary" className="text-xs" onClick={() => setQrTable(table)}>
                  <QrCode size={14} /> QR Code
                </Button>
                <Button variant="secondary" className="text-xs" onClick={() => copyLink(table)}>
                  <Copy size={14} /> Lien
                </Button>
                <button
                  type="button"
                  onClick={() => toggleStatus(table)}
                  disabled={statusBusy === table.id}
                  className="btn-ghost text-xs disabled:opacity-50"
                >
                  {statusBusy === table.id
                    ? '...'
                    : table.status === 'ACTIVE'
                      ? 'Désactiver'
                      : 'Activer'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(table)}
                  className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700"
                  aria-label="Modifier"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(table)}
                  className="rounded-lg p-2 text-ink-400 dark:text-ink-500 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Supprimer"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---------------------- Formulaire table ---------------------- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Modifier la table ${editing.number}` : 'Nouvelle table'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form="table-form" loading={saving}>
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }
      >
        <form id="table-form" onSubmit={submit} className="space-y-4">
          <Field label="Numéro de table" required hint="Ex : 01, 02, Terrasse 1">
            <Input
              required
              maxLength={20}
              value={form.number}
              onChange={(event) => setForm({ ...form, number: event.target.value })}
              placeholder="01"
            />
          </Field>

          <Field label="Libellé">
            <Input
              maxLength={60}
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              placeholder="Terrasse côté jardin"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacité">
              <Input
                type="number"
                min="1"
                max="50"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </Field>

            <Field label="Statut">
              <Select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>

          {!editing && (
            <p className="rounded-xl bg-sky-50 dark:bg-sky-900/20 px-4 py-3 text-xs text-sky-800 dark:text-sky-300">
              Le QR Code de la table est généré automatiquement à la creation.
            </p>
          )}
        </form>
      </Modal>

      {/* ------------------------ QR Code detail ---------------------- */}
      <Modal
        open={Boolean(qrTable)}
        onClose={() => setQrTable(null)}
        title={qrTable ? `QR Code - Table ${qrTable.number}` : ''}
        size="sm"
        footer={
          qrTable && (
            <>
              <Button
                variant="ghost"
                className="text-amber-700 dark:text-amber-400 hover:bg-amber-50"
                icon={RefreshCw}
                onClick={() => {
                  setRegenerateTarget(qrTable);
                  setQrTable(null);
                }}
              >
                Régénérer
              </Button>
              <a
                href={qrTable.qrCode?.dataUrl}
                download={`qr-table-${qrTable.number}.png`}
                className="btn-primary"
              >
                Télécharger
              </a>
            </>
          )
        }
      >
        {qrTable && (
          <div className="text-center">
            {qrTable.qrCode ? (
              <img
                src={qrTable.qrCode.dataUrl}
                alt={`QR Code table ${qrTable.number}`}
                className="mx-auto h-56 w-56"
              />
            ) : (
              <p className="text-sm text-ink-500 dark:text-ink-400">Aucun QR Code généré</p>
            )}

            <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">Scannez pour consulter le menu</p>

            <a
              href={qrTable.menuUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 break-all text-xs font-medium text-brand-600 hover:underline"
            >
              {qrTable.menuUrl} <ExternalLink size={12} className="shrink-0" />
            </a>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Supprimer la table"
        message={
          deleteTarget
            ? `Supprimer la table ${deleteTarget.number} ? Si elle possède un historique de commandes, désactivez-la plutot.`
            : ''
        }
        confirmLabel="Supprimer"
        loading={saving}
      />

      <ConfirmDialog
        open={Boolean(regenerateTarget)}
        onClose={() => setRegenerateTarget(null)}
        onConfirm={regenerate}
        title="Régénérer le QR Code"
        message={
          regenerateTarget
            ? `Un nouveau lien sera généré pour la table ${regenerateTarget.number}. L'ancien QR Code imprimé cessera immédiatement de fonctionner : vous devrez le remplacer sur la table.`
            : ''
        }
        confirmLabel="Régénérer"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
