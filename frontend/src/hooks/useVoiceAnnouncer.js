import { useCallback, useEffect, useRef } from 'react';

/** Duree maximale pendant laquelle la voix se repete. */
export const DUREE_ANNONCE_MS = 30000;

/** Silence entre deux repetitions. */
const PAUSE_MS = 1500;

/**
 * Delai avant qu'un contact a l'ecran ne coupe la voix.
 *
 * Sans ce sursis, un appui deja en cours au moment ou la commande arrive
 * couperait l'annonce avant le premier mot.
 */
const SURSIS_MS = 1000;

/** Gestes qui signifient « j'ai entendu, je m'en occupe ». */
const GESTES = ['pointerdown', 'keydown', 'touchstart'];

/**
 * Annonce vocale du personnel.
 *
 * La phrase est repetee jusqu'a ce que la serveuse ferme la notification, et au
 * plus pendant 30 secondes : sans cette limite, une salle chargee se retrouve
 * avec plusieurs voix qui se superposent indefiniment.
 *
 * La synthese vocale n'est pas garantie : navigateur trop ancien, voix non
 * installee, ou lecture bloquee tant que l'utilisateur n'a pas interagi avec la
 * page. `announce` renvoie donc false dans ces cas, pour que l'appelant sache
 * que seul le signal sonore a joue.
 */
export default function useVoiceAnnouncer() {
  const repeatTimer = useRef(null);
  const cutoffTimer = useRef(null);
  const sursisTimer = useRef(null);
  const detacherGestes = useRef(null);
  const actif = useRef(false);

  const stop = useCallback(() => {
    actif.current = false;
    if (repeatTimer.current) clearTimeout(repeatTimer.current);
    if (cutoffTimer.current) clearTimeout(cutoffTimer.current);
    if (sursisTimer.current) clearTimeout(sursisTimer.current);
    repeatTimer.current = null;
    cutoffTimer.current = null;
    sursisTimer.current = null;
    if (detacherGestes.current) {
      detacherGestes.current();
      detacherGestes.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Rien a faire : l'application continue sans la voix.
    }
  }, []);

  /**
   * Le moindre geste coupe la voix : toucher l'ecran, cliquer, appuyer sur une
   * touche. La notification, elle, reste affichee - couper la voix veut dire
   * « j'ai entendu », pas « c'est traite ».
   */
  const ecouterLesGestes = useCallback(() => {
    sursisTimer.current = setTimeout(() => {
      if (!actif.current) return;
      const couper = () => stop();
      GESTES.forEach((geste) => window.addEventListener(geste, couper, { passive: true }));
      detacherGestes.current = () =>
        GESTES.forEach((geste) => window.removeEventListener(geste, couper));
    }, SURSIS_MS);
  }, [stop]);

  const announce = useCallback(
    (texte) => {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (!synth || typeof window.SpeechSynthesisUtterance !== 'function' || !texte) return false;

      stop();
      actif.current = true;

      // Filet de securite : meme si `onend` ne se declenche jamais (onglet mis en
      // veille, voix qui echoue en silence), la voix s'arrete au bout de 30 s.
      cutoffTimer.current = setTimeout(stop, DUREE_ANNONCE_MS);
      ecouterLesGestes();

      const parler = () => {
        if (!actif.current) return;

        const phrase = new SpeechSynthesisUtterance(texte);
        phrase.lang = 'fr-FR';
        phrase.rate = 0.95;
        phrase.volume = 1;

        const voixFr = synth.getVoices().find((voix) => voix.lang?.toLowerCase().startsWith('fr'));
        if (voixFr) phrase.voice = voixFr;

        const replanifier = () => {
          if (!actif.current) return;
          repeatTimer.current = setTimeout(parler, PAUSE_MS);
        };
        phrase.onend = replanifier;
        phrase.onerror = replanifier;

        try {
          synth.speak(phrase);
        } catch {
          stop();
        }
      };

      // Les voix sont chargees de maniere asynchrone au premier appel. On part
      // sur le premier des deux signaux qui arrive - jamais sur les deux, sinon
      // la phrase serait prononcee en double.
      let demarre = false;
      const demarrerUneSeuleFois = () => {
        if (demarre) return;
        demarre = true;
        parler();
      };

      if (synth.getVoices().length === 0) {
        synth.addEventListener('voiceschanged', demarrerUneSeuleFois, { once: true });
        // Si l'evenement ne vient pas, on parle avec la voix par defaut.
        repeatTimer.current = setTimeout(demarrerUneSeuleFois, 250);
      } else {
        demarrerUneSeuleFois();
      }

      return true;
    },
    [stop, ecouterLesGestes]
  );

  // Coupe la voix si la serveuse quitte la page.
  useEffect(() => stop, [stop]);

  return { announce, stop };
}
