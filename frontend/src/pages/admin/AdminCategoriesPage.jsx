import { useCallback, useEffect, useState } from 'react';
import { Tags, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { categoryApi } from '../../services/endpoints';
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
  Skeleton,
  Toggle,
} from '../../components/ui';

const EMPTY = { name: '', icon: '', isActive: true };

export default function AdminCategoriesPage() {
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCategories(await categoryApi.list());
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

  const openEdit = (category) => {
    setEditing(category);
    setForm({ name: category.name, icon: category.icon || '', isActive: category.isActive });
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        isActive: form.isActive,
      };
      if (editing) {
        await categoryApi.update(editing.id, payload);
        toast.success('Catégorie mise à jour');
      } else {
        await categoryApi.create(payload);
        toast.success('Catégorie créée');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await categoryApi.remove(deleteTarget.id);
      toast.success('Catégorie supprimée');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  /** Deplace une catégorie et persiste immédiatement le nouvel ordre. */
  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;

    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);

    try {
      await categoryApi.reorder(next.map((category, position) => ({ id: category.id, sortOrder: position })));
    } catch (err) {
      toast.error(err.message);
      await load();
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

  return (
    <div>
      <PageHeader
        title="Catégories"
        subtitle="Organisent le menu affiche au client"
        icon={Tags}
        action={
          <Button icon={Plus} onClick={openCreate}>
            Nouvelle catégorie
          </Button>
        }
      />

      <Card>
        {categories.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Aucune catégorie"
            description="Créez des catégories (Entrées, Plats, Boissons...) pour organiser votre carte."
            action={<Button onClick={openCreate}>Créer une catégorie</Button>}
          />
        ) : (
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {categories.map((category, index) => (
              <li
                key={category.id}
                className="animate-entree flex items-center gap-3 px-4 py-3"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <div className="flex flex-col gap-0.5 text-ink-300">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded p-0.5 transition hover:bg-ink-100 dark:hover:bg-ink-700 hover:text-ink-600 disabled:opacity-30"
                    aria-label="Monter"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === categories.length - 1}
                    className="rounded p-0.5 transition hover:bg-ink-100 dark:hover:bg-ink-700 hover:text-ink-600 disabled:opacity-30"
                    aria-label="Descendre"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink-900 dark:text-ink-50">{category.name}</h3>
                    {!category.isActive && (
                      <span className="badge bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400">Désactivée</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {category.productCount} produit(s)
                    {category.icon && ` - icône : ${category.icon}`}
                  </p>
                </div>

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(category)}
                    className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700 hover:text-ink-800"
                    aria-label="Modifier"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(category)}
                    className="rounded-lg p-2 text-ink-400 dark:text-ink-500 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" form="category-form" loading={saving}>
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={submit} className="space-y-4">
          <Field label="Nom" required>
            <Input
              required
              minLength={2}
              maxLength={60}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex : Grillades"
            />
          </Field>

          <Field label="Icône" hint="Nom d'une icône Lucide (facultatif). Ex : Flame, CupSoda">
            <Input
              maxLength={40}
              value={form.icon}
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
              placeholder="Flame"
            />
          </Field>

          <Toggle
            checked={form.isActive}
            onChange={(value) => setForm({ ...form, isActive: value })}
            label="Catégorie active"
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Supprimer la catégorie"
        message={
          deleteTarget
            ? `Supprimer la catégorie "${deleteTarget.name}" ? La suppression est refusée si des produits l'utilisent encore.`
            : ''
        }
        confirmLabel="Supprimer"
        loading={saving}
      />
    </div>
  );
}
