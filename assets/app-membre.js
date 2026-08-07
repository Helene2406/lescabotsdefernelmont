import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, getDocs, collection
} from "./firebase-config.js";

const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const JOURS_MAJ = { lundi:"Lundi", mardi:"Mardi", mercredi:"Mercredi", jeudi:"Jeudi", vendredi:"Vendredi", samedi:"Samedi", dimanche:"Dimanche" };

let membreData = null;
let membreUid = null;
let groupeData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'connexion.html'; return; }
  const mDoc = await getDoc(doc(db, 'membres', user.uid));
  if (!mDoc.exists() || mDoc.data().role !== 'membre') {
    window.location.href = 'connexion.html';
    return;
  }
  membreUid = user.uid;
  membreData = mDoc.data();
  afficherAccueil();

  if (membreData.groupeId) {
    const gDoc = await getDoc(doc(db, 'groupes', membreData.groupeId));
    if (gDoc.exists()) {
      groupeData = { id: gDoc.id, ...gDoc.data() };
      afficherGroupe();
      await afficherProchainsCours();
    }
  } else {
    document.getElementById('zoneGroupe').innerHTML = '<div class="empty-state">Vous n\'êtes rattaché à aucun groupe pour l\'instant. Contactez Katia.</div>';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = 'connexion.html'));

function afficherAccueil() {
  document.getElementById('membreNom').textContent = membreData.nomMaitre || '';
  document.getElementById('chienNom').textContent = membreData.chien?.nom || '';
  const badgeAbo = membreData.abonnementPaye
    ? `<span class="badge badge-ok">${membreData.coursRestants ?? 0} cours restants</span>`
    : `<span class="badge badge-danger">Abonnement non payé</span>`;
  const badgeCotis = membreData.cotisationPayee
    ? `<span class="badge badge-ok">Cotisation à jour</span>`
    : `<span class="badge badge-warn">Cotisation à régler</span>`;
  document.getElementById('badgesAbo').innerHTML = badgeAbo + ' ' + badgeCotis;
}

function afficherGroupe() {
  document.getElementById('zoneGroupe').innerHTML = `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(groupeData.nom)}</div>
        <div class="data-sub">Jour et horaire : ${JOURS_MAJ[groupeData.jour]}, ${groupeData.heureDebut}–${groupeData.heureFin}</div>
      </div>
    </div>`;
}

function prochainesOccurrences(jourGroupe, nombre) {
  const indexJour = JOURS.indexOf(jourGroupe);
  const dates = [];
  let d = new Date();
  d.setHours(0,0,0,0);
  while (dates.length < nombre) {
    if (d.getDay() === indexJour) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

async function afficherProchainsCours() {
  const dates = prochainesOccurrences(groupeData.jour, 2);
  const annulSnap = await getDocs(collection(db, 'annulations'));
  const annulations = {};
  annulSnap.forEach(d => { annulations[d.id] = d.data(); });

  const presSnap = await getDocs(collection(db, 'presences'));
  const presences = {};
  presSnap.forEach(d => { presences[d.id] = d.data(); });

  const wrap = document.getElementById('zoneCours');
  wrap.innerHTML = dates.map(d => {
    const dateISO = d.toISOString().slice(0, 10);
    const dateLabel = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    const cleAnnul = `${groupeData.id}_${dateISO}`;
    const clePres = `${groupeData.id}_${dateISO}_${membreUid}`;
    const annule = annulations[cleAnnul];
    const presence = presences[clePres];

    if (annule) {
      return `
      <div class="data-row">
        <div class="data-main">
          <div class="data-title">${capitalize(dateLabel)} — ${groupeData.heureDebut}</div>
          <div class="data-sub"><span class="badge badge-danger">Cours annulé — ${escapeHtml(annule.motif)}</span></div>
        </div>
      </div>`;
    }

    let statutHtml;
    if (presence) {
      statutHtml = presence.statut === 'present'
        ? '<span class="badge badge-ok">Présence confirmée</span>'
        : '<span class="badge badge-neutral">Absence signalée</span>';
    } else {
      statutHtml = `
        <div class="presence-btns">
          <button class="btn-sm primary" onclick="window.repondrePresence('${dateISO}','present')">Je serai présent</button>
          <button class="btn-sm" onclick="window.repondrePresence('${dateISO}','absent')">Je serai absent</button>
        </div>`;
    }

    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${capitalize(dateLabel)} — ${groupeData.heureDebut}</div>
        <div class="data-sub">${statutHtml}</div>
      </div>
    </div>`;
  }).join('');
}

window.repondrePresence = async (dateISO, statut) => {
  const cle = `${groupeData.id}_${dateISO}_${membreUid}`;
  await setDoc(doc(db, 'presences', cle), {
    groupeId: groupeData.id, uid: membreUid, dateISO, statut,
    repondu: new Date().toISOString()
  });
  afficherProchainsCours();
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
