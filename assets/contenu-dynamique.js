// ==========================================================================
// CONTENU DYNAMIQUE — remplace les textes des pages publiques par la
// version modifiée par l'admin si elle existe (collection Firestore
// 'contenu_site'), sinon garde le texte par défaut déjà présent dans le
// HTML. Lecture seule, publique, aucune connexion requise.
// ==========================================================================
import { db, collection, getDocs } from "./firebase-config.js";

(async () => {
  try {
    const snap = await getDocs(collection(db, 'contenu_site'));
    snap.forEach(d => {
      const el = document.querySelector(`[data-contenu-id="${d.id}"]`);
      if (el && d.data().texte) {
        el.textContent = d.data().texte;
      }
    });
  } catch (e) {
    // En cas d'erreur (hors ligne, etc.), on garde simplement le texte par défaut du HTML.
  }
})();
