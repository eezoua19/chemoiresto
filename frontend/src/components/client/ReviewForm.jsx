import { useState } from 'react';
import { Star } from 'lucide-react';
import { reviewApi } from '../../services/endpoints';
import { Button } from '../ui';

/**
 * Formulaire d'avis proposé une fois la commande servie.
 * `review` non-null : déjà déposé, on affiche simplement le remerciement.
 */
export default function ReviewForm({ trackingToken, review, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (review) {
    return (
      <div className="rounded-2xl bg-ink-50 p-4 text-center">
        <div className="flex justify-center gap-1 text-amber-400">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={18} fill={n <= review.rating ? 'currentColor' : 'none'} />
          ))}
        </div>
        <p className="mt-1 text-sm font-medium text-ink-900">Merci pour votre avis !</p>
      </div>
    );
  }

  const submit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await reviewApi.create({ trackingToken, rating, comment: comment.trim() || undefined });
      onSubmitted({ rating: created.rating, comment: created.comment });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-ink-50 p-4">
      <p className="text-sm font-semibold text-ink-900">Votre avis compte</p>
      <div className="mt-2 flex justify-center gap-1.5 py-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-1 text-amber-400 transition"
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          >
            <Star size={26} fill={n <= (hover || rating) ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea
            className="input"
            rows={2}
            maxLength={1000}
            placeholder="Un commentaire (facultatif)"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <Button onClick={submit} loading={submitting} className="mt-2 w-full">
            Envoyer mon avis
          </Button>
        </>
      )}
    </div>
  );
}
