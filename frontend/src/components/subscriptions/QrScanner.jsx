import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import usePresence from '../../hooks/usePresence';
import { X, CameraOff, Flashlight, Loader2, KeyRound } from 'lucide-react';
import jsQR from 'jsqr';
import { Button, Input } from '../ui';
import { jetonDuCode } from '../../utils/subscription';
import useNotificationSound from '../../hooks/useNotificationSound';

/**
 * Scanner de tickets d'abonnement, intégré à l'application.
 *
 * Jusqu'ici il fallait passer par l'appareil photo du téléphone, qui ouvre le
 * lien dans un navigateur : si ce navigateur n'a pas la session de la serveuse,
 * elle tombe sur l'écran de connexion en plein service. Ici la caméra s'ouvre
 * dans l'application, déjà connectée.
 */
export default function QrScanner({ open, onClose, onDetect }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const boucleRef = useRef(null);
  const detecteRef = useRef(false);

  const [etat, setEtat] = useState('demarrage'); // demarrage | scan | refus | indisponible
  const [message, setMessage] = useState('');
  const [torche, setTorche] = useState(false);
  const [torcheDispo, setTorcheDispo] = useState(false);
  const [saisie, setSaisie] = useState('');

  // Le plein ecran s'efface au lieu de disparaitre d'un bloc.
  const { monte, sortant } = usePresence(open, 180);

  /** Coupe la caméra pour de bon : sans ça le voyant reste allumé. */
  const arreter = useCallback(() => {
    if (boucleRef.current) {
      cancelAnimationFrame(boucleRef.current);
      boucleRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((piste) => piste.stop());
      streamRef.current = null;
    }
  }, []);

  const fermer = useCallback(() => {
    arreter();
    onClose();
  }, [arreter, onClose]);

  // Le rappel du parent passe par une référence : s'il figurait dans les
  // dépendances de l'effet, une simple re-création côté parent rouvrirait la
  // caméra en boucle au milieu du service.
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const playSound = useNotificationSound();

  const trouve = useCallback(
    (jeton) => {
      if (detecteRef.current) return;
      detecteRef.current = true;
      // Le meme retour, camera ou saisie manuelle : ce qui compte, c'est
      // qu'un ticket valide vient d'etre trouve, pas comment.
      playSound();
      arreter();
      onDetectRef.current(jeton);
    },
    [arreter, playSound]
  );

  // ------------------------------ la caméra ------------------------------

  useEffect(() => {
    if (!open) return undefined;
    detecteRef.current = false;
    setEtat('demarrage');
    setTorche(false);
    setTorcheDispo(false);

    // getUserMedia n'existe qu'en HTTPS (ou sur localhost). En production le
    // site est en HTTPS, mais autant le dire clairement si ce n'est pas le cas.
    if (!navigator.mediaDevices?.getUserMedia) {
      setEtat('indisponible');
      setMessage(
        window.isSecureContext
          ? "Cet appareil ne donne pas accès à sa caméra depuis le navigateur."
          : "La caméra n'est accessible qu'en connexion sécurisée (https)."
      );
      return undefined;
    }

    let annule = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (annule) {
          stream.getTracks().forEach((piste) => piste.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS : sinon plein écran
        await video.play();

        const piste = stream.getVideoTracks()[0];
        const capacites = piste.getCapabilities ? piste.getCapabilities() : {};
        setTorcheDispo(Boolean(capacites.torch));

        setEtat('scan');
        lire();
      } catch (error) {
        if (annule) return;
        const refus = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
        setEtat(refus ? 'refus' : 'indisponible');
        setMessage(
          refus
            ? "L'accès à la caméra a été refusé. Autorisez-le dans les réglages du navigateur, puis réessayez."
            : "Aucune caméra utilisable sur cet appareil."
        );
      }
    })();

    /** Boucle de lecture : une image sur deux suffit et ménage la batterie. */
    let alterne = false;
    function lire() {
      boucleRef.current = requestAnimationFrame(lire);
      alterne = !alterne;
      if (!alterne) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      // On travaille sur une image réduite : jsQR y est bien plus rapide, et la
      // précision reste largement suffisante pour un QR de ticket.
      const largeur = 480;
      const hauteur = Math.round((video.videoHeight / video.videoWidth) * largeur) || 480;
      canvas.width = largeur;
      canvas.height = hauteur;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, largeur, hauteur);

      const image = ctx.getImageData(0, 0, largeur, hauteur);
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'dontInvert',
      });
      if (!code) return;

      const jeton = jetonDuCode(code.data);
      if (jeton) {
        trouve(jeton);
      } else {
        setMessage("Ce code n'est pas un ticket d'abonnement CHEMOIRESTO.");
      }
    }

    return () => {
      annule = true;
      arreter();
    };
  }, [open, arreter, trouve]);

  // ------------------------------- la torche ------------------------------

  const basculerTorche = async () => {
    const piste = streamRef.current?.getVideoTracks()[0];
    if (!piste) return;
    try {
      await piste.applyConstraints({ advanced: [{ torch: !torche }] });
      setTorche((valeur) => !valeur);
    } catch {
      setTorcheDispo(false);
    }
  };

  // ------------------------------ saisie main -----------------------------

  const validerSaisie = (event) => {
    event.preventDefault();
    const jeton = jetonDuCode(saisie);
    if (!jeton) {
      setMessage("Collez l'adresse du ticket ou son jeton (32 caractères).");
      return;
    }
    trouve(jeton);
  };

  if (!monte) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-ink-900 ${
        sortant ? 'animate-fade-out' : 'animate-fade-in'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div>
          <h2 className="text-base font-bold">Scanner un ticket</h2>
          <p className="text-xs text-white/70">Placez le QR Code dans le cadre</p>
        </div>
        <div className="flex items-center gap-1">
          {torcheDispo && (
            <button
              type="button"
              onClick={basculerTorche}
              className={`rounded-xl p-2.5 transition ${torche ? 'bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-50' : 'text-white hover:bg-white/10'}`}
              aria-label={torche ? 'Éteindre la lampe' : 'Allumer la lampe'}
            >
              <Flashlight size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={fermer}
            className="rounded-xl p-2.5 text-white transition hover:bg-white/10"
            aria-label="Fermer le scanner"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* ---------------------------- la caméra ---------------------------- */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          aria-label="Vue de la caméra"
        />
        <canvas ref={canvasRef} className="hidden" />

        {etat === 'scan' && (
          <>
            {/* Cadre de visée : aide à cadrer sans masquer l'image. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-56 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/85">
              Recherche du code...
            </p>
          </>
        )}

        {etat === 'demarrage' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Ouverture de la caméra...</p>
          </div>
        )}

        {(etat === 'refus' || etat === 'indisponible') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white">
            <CameraOff size={32} className="text-white/70" />
            <p className="text-sm text-white/85">{message}</p>
          </div>
        )}
      </div>

      {/* ------------------------- secours : à la main ------------------------ */}
      <div className="bg-ink-900 px-4 pb-6 pt-4">
        {message && etat === 'scan' && (
          <p className="mb-3 rounded-xl bg-amber-500/20 px-3 py-2 text-center text-xs text-amber-100">
            {message}
          </p>
        )}

        <form onSubmit={validerSaisie} className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
            <Input
              className="pl-9"
              placeholder="Ou collez l'adresse du ticket"
              value={saisie}
              onChange={(event) => setSaisie(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Ouvrir
          </Button>
        </form>
        <p className="mt-2 text-center text-[11px] text-white/50">
          Scanner ne compte aucun passage : vous validerez à l&apos;écran suivant.
        </p>
      </div>
    </div>,
    document.body
  );
}
