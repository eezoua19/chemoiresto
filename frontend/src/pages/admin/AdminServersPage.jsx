import { useCallback, useEffect, useState } from 'react';
import { Users, Plus, Pencil, Trash2, KeyRound, Activity } from 'lucide-react';
import { userApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
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
import { formatDateTime, formatMoney, initials } from '../../utils/format';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  role: 'SERVER',
  status: 'ACTIVE',
};

export default function AdminServersPage() {
  const { user: currentUser, restaurant } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [activity, setActivity] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await userApi.list());
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

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || '',
      password: '',
      role: user.role,
      status: user.status,
    });
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        role: form.role,
        status: form.status,
      };

      if (editing) {
        await userApi.update(editing.id, payload);
        toast.success('Compte mis à jour');
      } else {
        await userApi.create({ ...payload, password: form.password });
        toast.success('Compte créé');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setSaving(true);
    try {
      await userApi.resetPassword(passwordTarget.id, newPassword);
      toast.success(`Mot de passe de ${passwordTarget.firstName} réinitialisé`);
      setPasswordTarget(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const response = await userApi.remove(deleteTarget.id);
      toast.success(response.message);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const showActivity = async (user) => {
    try {
      setActivity(await userApi.activity(user.id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const currency = restaurant?.currency || 'FCFA';

  return (
    <div>
      <PageHeader
        title="Serveuses et administrateurs"
        subtitle={`${users.length} compte(s)`}
        icon={Users}
        action={
          <Button icon={Plus} onClick={openCreate}>
            Nouveau compte
          </Button>
        }
      />

      {users.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Aucun compte" description="Créez le compte de vos serveuses." />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-ink-700 text-left text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                <th className="px-4 py-3 font-semibold">Personne</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Rôle</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Dernière connexion</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-ink-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-xs font-bold text-brand-700 dark:text-brand-300">
                        {initials(user.fullName)}
                      </span>
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-ink-50">{user.fullName}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{user.orderCount} commande(s)</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-700 dark:text-ink-200">{user.email}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">{user.phone || '-'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        user.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700 dark:text-indigo-400' : 'bg-sky-100 text-sky-700 dark:text-sky-400'
                      }`}
                    >
                      {user.role === 'ADMIN' ? 'Administrateur' : 'Serveuse'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        user.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-700 dark:text-emerald-400'
                          : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      {user.status === 'ACTIVE' ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Jamais'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => showActivity(user)}
                        className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700"
                        aria-label="Activité"
                      >
                        <Activity size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasswordTarget(user)}
                        className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700"
                        aria-label="Réinitialiser le mot de passe"
                      >
                        <KeyRound size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700"
                        aria-label="Modifier"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(user)}
                        disabled={user.id === currentUser?.id}
                        className="rounded-lg p-2 text-ink-400 dark:text-ink-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ------------------------- Formulaire -------------------------- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier le compte' : 'Nouveau compte'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form="user-form" loading={saving}>
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" required>
              <Input
                required
                minLength={2}
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
            </Field>
            <Field label="Nom" required>
              <Input
                required
                minLength={2}
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" required>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field label="Téléphone">
              <Input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+225 07 00 00 00 00"
              />
            </Field>
          </div>

          {!editing && (
            <Field label="Mot de passe" required hint="8 caractères minimum">
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rôle" hint="Une serveuse n'accède jamais à l'administration">
              <Select
                value={form.role}
                disabled={editing?.id === currentUser?.id}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                <option value="SERVER">Serveuse</option>
                <option value="ADMIN">Administrateur</option>
              </Select>
            </Field>

            <Field label="Statut">
              <Select
                value={form.status}
                disabled={editing?.id === currentUser?.id}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="ACTIVE">Actif</option>
                <option value="INACTIVE">Désactivé</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>

      {/* -------------------- Reinitialisation du mdp ------------------ */}
      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => {
          setPasswordTarget(null);
          setNewPassword('');
        }}
        title="Réinitialiser le mot de passe"
        subtitle={passwordTarget?.fullName}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPasswordTarget(null);
                setNewPassword('');
              }}
            >
              Annuler
            </Button>
            <Button onClick={resetPassword} loading={saving} disabled={newPassword.length < 8}>
              Réinitialiser
            </Button>
          </>
        }
      >
        <Field label="Nouveau mot de passe" required hint="8 caractères minimum">
          <Input
            type="text"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Nouveau mot de passe"
          />
        </Field>
        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
          Communiquez ce mot de passe à la personne concernée. Il remplace immédiatement l&apos;ancien.
        </p>
      </Modal>

      {/* -------------------------- Activite --------------------------- */}
      <Modal
        open={Boolean(activity)}
        onClose={() => setActivity(null)}
        title={activity ? `Activité de ${activity.user.fullName}` : ''}
      >
        {activity && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-ink-50 dark:bg-ink-900 p-3 text-center">
                <p className="text-xs text-ink-500 dark:text-ink-400">Aujourd&apos;hui</p>
                <p className="text-lg font-bold text-ink-900 dark:text-ink-50">{activity.stats.ordersToday}</p>
              </div>
              <div className="rounded-xl bg-ink-50 dark:bg-ink-900 p-3 text-center">
                <p className="text-xs text-ink-500 dark:text-ink-400">Ce mois</p>
                <p className="text-lg font-bold text-ink-900 dark:text-ink-50">{activity.stats.ordersThisMonth}</p>
              </div>
              <div className="rounded-xl bg-ink-50 dark:bg-ink-900 p-3 text-center">
                <p className="text-xs text-ink-500 dark:text-ink-400">CA du mois</p>
                <p className="text-lg font-bold text-ink-900 dark:text-ink-50">
                  {formatMoney(activity.stats.revenueThisMonth, currency)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-ink-900 dark:text-ink-50">Dernières commandes</h3>
              {activity.recentOrders.length === 0 ? (
                <p className="rounded-xl bg-ink-50 dark:bg-ink-900 px-4 py-6 text-center text-sm text-ink-500 dark:text-ink-400">
                  Aucune commande traitée
                </p>
              ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-700">
                  {activity.recentOrders.map((order) => (
                    <li key={order.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p className="font-medium text-ink-900 dark:text-ink-50">{order.orderNumber}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          {order.tableNumber ? `Table ${order.tableNumber}` : 'À emporter'} -{' '}
                          {formatDateTime(order.createdAt)}
                        </p>
                      </div>
                      <span className="font-semibold text-ink-700 dark:text-ink-200">
                        {formatMoney(order.total, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Supprimer le compte"
        message={
          deleteTarget
            ? `Supprimer le compte de ${deleteTarget.fullName} ? S'il a déjà traité des commandes, il sera simplement désactivé pour préserver l'historique.`
            : ''
        }
        confirmLabel="Supprimer"
        loading={saving}
      />
    </div>
  );
}
