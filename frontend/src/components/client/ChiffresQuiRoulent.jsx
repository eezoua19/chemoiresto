import { useEffect, useState } from 'react';

const CHIFFRES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Un chiffre qui roule à la verticale, comme un compteur mécanique.
 *
 * Le rouleau porte les dix chiffres empilés ; on le déplace de la hauteur
 * qu'il faut. Une seule transformation, aucune reflow : dix chiffres ne
 * coûtent pas plus cher qu'un seul.
 */
function Rouleau({ valeur }) {
  return (
    <span className="relative inline-block h-[1.15em] w-[0.62em] overflow-hidden align-bottom">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-500"
        style={{
          transform: `translateY(-${Number(valeur) * 1.15}em)`,
          transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.3, 1)',
        }}
      >
        {CHIFFRES.map((chiffre) => (
          <span key={chiffre} className="flex h-[1.15em] items-center justify-center">
            {chiffre}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Un montant dont les chiffres défilent quand il change.
 *
 * Tout ce qui n'est pas un chiffre — espaces, « FCFA » — reste immobile :
 * seul ce qui change bouge, et le montant reste lisible pendant qu'il roule.
 *
 * La première valeur ne roule pas : à l'ouverture, un prix qui se met en place
 * tout seul ressemble à un bug d'affichage, pas à une animation.
 */
export default function ChiffresQuiRoulent({ valeur, className = '' }) {
  const texte = String(valeur ?? '');
  const [pret, setPret] = useState(false);

  useEffect(() => {
    // Un souffle avant d'armer : le temps que la première valeur soit posée.
    const minuteur = setTimeout(() => setPret(true), 60);
    return () => clearTimeout(minuteur);
  }, []);

  if (!pret) return <span className={className}>{texte}</span>;

  return (
    <span className={className}>
      {/* Le rouleau porte les dix chiffres : lu tel quel, un lecteur d'ecran
          annoncerait « zero un deux trois... ». On lui donne le montant, et on
          lui cache la mecanique. */}
      <span className="sr-only">{texte}</span>

      <span aria-hidden className="inline-flex items-baseline">
      {texte.split('').map((caractere, index) =>
        /\d/.test(caractere) ? (
          // eslint-disable-next-line react/no-array-index-key -- la position EST l'identite du rouleau
          <Rouleau key={index} valeur={caractere} />
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index} className={caractere === ' ' ? 'w-[0.28em]' : ''}>
            {caractere === ' ' ? '' : caractere}
          </span>
        )
      )}
      </span>
    </span>
  );
}
