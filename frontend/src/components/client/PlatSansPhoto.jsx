/**
 * Ce qu'on affiche quand un plat n'a pas encore sa photo.
 *
 * Une assiette dressée, dessinée au trait : plus honnête qu'une photo de
 * banque d'images — qui promettrait un plat qui n'est pas celui servi — et
 * plus digne qu'une icône générique. La carte reste présentable en attendant
 * que le patron sorte son téléphone.
 *
 * Deux dessins, pas un seul mis à l'échelle : à 44 pixels, les couverts et la
 * vapeur se mélangent en une tache. Le petit format garde l'assiette seule,
 * traits plus épais et plus contrastés ; le grand format peut se permettre le
 * décor. Le budget de détail suit la taille.
 *
 * Le tout en SVG dans le code : aucune requête réseau, quelques centaines
 * d'octets, et le dessin prend la couleur du restaurant.
 */

/** L'assiette et ce qu'il y a dedans : le motif commun aux deux formats. */
function Assiette({ trait, opacite }) {
  return (
    <>
      <circle cx="24" cy="26" r="15" stroke="currentColor" strokeWidth={trait} opacity={opacite} />
      <circle
        cx="24"
        cy="26"
        r="10"
        stroke="currentColor"
        strokeWidth={trait}
        opacity={opacite * 0.6}
      />
      {/* La garniture : un monticule et deux grains, ça suffit à lire « plat ». */}
      <path
        d="M17.5 27.5c0-2.6 2.1-4.6 4.7-4.6 1.3 0 2.5.5 3.3 1.4.8-.6 1.8-1 2.9-1 2.4 0 4.3 1.9 4.3 4.2"
        stroke="currentColor"
        strokeWidth={trait}
        strokeLinecap="round"
        opacity={opacite * 1.3}
      />
      <circle cx="21" cy="30" r="1.4" fill="currentColor" opacity={opacite} />
      <circle cx="27" cy="30.5" r="1.1" fill="currentColor" opacity={opacite * 0.8} />
    </>
  );
}

export default function PlatSansPhoto({ taille = 'md', className = '' }) {
  const petit = taille === 'sm';

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-amber-50 ${className}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className={petit ? 'h-14 w-14' : 'h-28 w-28'}
        style={{ color: 'var(--brand)' }}
      >
        {petit ? (
          // Traits plus épais et plus soutenus : réduit, un trait fin disparaît.
          <Assiette trait={2.4} opacite={0.5} />
        ) : (
          <>
            <Assiette trait={1.8} opacite={0.4} />

            {/* La vapeur : le seul détail animé, lent et discret. */}
            <g className="animate-vapeur">
              <path
                d="M21 9c0 1.8 1.8 2.2 1.8 4S21 16.6 21 16.6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.4"
              />
              <path
                d="M27 9c0 1.8 1.8 2.2 1.8 4S27 16.6 27 16.6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.4"
              />
            </g>

            {/* Les couverts encadrent l'assiette sans la toucher. */}
            <path
              d="M6 14v5.5a2.2 2.2 0 0 0 2.2 2.2V38M6 14v4M8.2 14v4M10.4 14v5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.35"
            />
            <path
              d="M40 14c1.7 0 2.6 2.2 2.6 4.8s-.9 4.4-2.6 4.4V38"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.35"
            />
          </>
        )}
      </svg>
    </div>
  );
}
