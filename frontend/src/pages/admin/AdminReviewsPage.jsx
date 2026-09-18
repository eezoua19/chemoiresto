import { useCallback, useEffect, useState } from 'react';
import { Star, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { reviewApi } from '../../services/endpoints';
import { Button, Card, EmptyState, ErrorState, NoResults, PageHeader, Select, Skeleton } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

const FILTRES = [
  { value: '', label: 'Toutes les notes' },
  { value: '5', label: '5 étoiles' },
  { value: '4', label: '4 étoiles' },
  { value: '3', label: '3 étoiles' },
  { value: '2', label: '2 étoiles' },
  { value: '1', label: '1 étoile' },
];

function Etoiles({ note }) {
  return (
    <div className="flex gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} fill={n <= note ? 'currentColor' : 'none'} />
      ))}
    </div>
  );
}

/** Avis déposés par les clients une fois leur commande servie. */
export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { page };
      if (rating) params.rating = rating;
      const result = await reviewApi.list(params);
      setReviews(result.reviews);
      setPagination(result.pagination);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [rating, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Change le filtre et revient a la page 1 dans le meme evenement (React les
  // regroupe) : deux effets separes deux rendus produiraient un aller-retour
  // visible, l'ancienne page se chargeant brievement avec le nouveau filtre.
  const changerNote = (value) => {
    setRating(value);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Avis clients"
        subtitle={pagination ? `${pagination.total} avis reçu${pagination.total > 1 ? 's' : ''}` : undefined}
        icon={Star}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={rating} onChange={(event) => changerNote(event.target.value)}>
          {FILTRES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Actualiser
        </Button>
      </div>

      {reviews.length === 0 ? (
        <Card>
          {rating ? (
            <NoResults description="Aucun avis avec cette note." />
          ) : (
            <EmptyState
              icon={Star}
              title="Aucun avis pour le moment"
              description="Les clients peuvent noter leur commande une fois servie, depuis leur page de suivi."
            />
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => (
            <div key={review.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Etoiles note={review.rating} />
                  {review.comment && <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">&laquo; {review.comment} &raquo;</p>}
                </div>
                <div className="text-right text-xs text-ink-500 dark:text-ink-400">
                  <p>{formatDateTime(review.createdAt)}</p>
                  {review.order && (
                    <p>
                      {review.order.orderNumber}
                      {review.order.table ? ` · Table ${review.order.table.number}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            icon={ChevronLeft}
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Précédent
          </Button>
          <span className="px-3 text-sm text-ink-600 dark:text-ink-300">
            Page {pagination.page} sur {pagination.pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pagination.pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Suivant <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
