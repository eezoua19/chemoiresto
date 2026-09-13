import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Marque brièvement ce qui vient d'arriver.
 *
 * Le son sonne, la voix parle, l'alerte glisse — mais dans une liste de douze
 * commandes, rien ne dit LAQUELLE est nouvelle. Un surlignage qui s'efface tout
 * seul le dit, sans rien ajouter à lire.
 */
export default function useNouveautes(duree = 1800) {
  const [ids, setIds] = useState(() => new Set());
  const minuteurs = useRef(new Map());

  const marquer = useCallback(
    (id) => {
      if (id === undefined || id === null) return;

      setIds((actuels) => new Set(actuels).add(id));

      // Une commande modifiee juste apres son arrivee ne doit pas etre
      // surlignee deux fois : on repart du dernier signal.
      const precedent = minuteurs.current.get(id);
      if (precedent) clearTimeout(precedent);

      minuteurs.current.set(
        id,
        setTimeout(() => {
          minuteurs.current.delete(id);
          setIds((actuels) => {
            const suite = new Set(actuels);
            suite.delete(id);
            return suite;
          });
        }, duree)
      );
    },
    [duree]
  );

  useEffect(() => {
    const enCours = minuteurs.current;
    return () => {
      enCours.forEach((minuteur) => clearTimeout(minuteur));
      enCours.clear();
    };
  }, []);

  const estNouveau = useCallback((id) => ids.has(id), [ids]);

  return { marquer, estNouveau };
}
