import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, getDocAvecReessai, setDoc, getDocs, collection, addDoc, updateDoc, query, orderBy
} from "./firebase-config.js";
import { meteoPour, alerteMeteo, iconeCode } from "./meteo.js";

const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const JOURS_MAJ = { lundi:"Lundi", mardi:"Mardi", mercredi:"Mercredi", jeudi:"Jeudi", vendredi:"Vendredi", samedi:"Samedi", dimanche:"Dimanche" };

let membreData = null;
let membreUid = null;
let groupeData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'connexion.html'; return; }
  const mDoc = await getDocAvecReessai(doc(db, 'membres', user.uid));
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

  chargerTarifs();
  chargerRdv();
  chargerChat();
  chargerVideosMembre();
});

document.getElementById('chatSendMembre').addEventListener('click', envoyerMessageMembre);
document.getElementById('chatInputMembre').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') envoyerMessageMembre();
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = 'connexion.html'));

function nomsChiensActifs() {
  return (membreData.chiens || []).filter(c => !c.archive).map(c => c.nom).filter(Boolean).join(', ');
}

function afficherAccueil() {
  document.getElementById('membreNom').textContent = membreData.nomMaitre || '';
  document.getElementById('chienNom').textContent = nomsChiensActifs();
  const badgeAbo = membreData.abonnementPaye
    ? `<span class="badge badge-ok">${membreData.coursRestants ?? 0} cours restants</span>`
    : `<span class="badge badge-danger">Abonnement non payé</span>`;
  const badgeCotis = membreData.cotisationPayee
    ? `<span class="badge badge-ok">Cotisation à jour</span>`
    : `<span class="badge badge-warn">Cotisation à régler</span>`;
  document.getElementById('badgesAbo').innerHTML = badgeAbo + ' ' + badgeCotis;
  afficherRappelAbonnement();
  afficherRappelCotisation();
  preremplirMonProfil();
  afficherMesChiens();
}

function afficherRappelAbonnement() {
  const zone = document.getElementById('zoneAbonnementRappel');
  const reste = membreData.coursRestants ?? 0;

  if (reste > 2) { zone.innerHTML = ''; return; }

  if (reste <= 0) {
    zone.innerHTML = `<div class="banner-alert" style="background:#FBEAEA; border-color:#E3B4B4; color:#8A2E2E;">Votre abonnement est épuisé, vous ne pouvez plus vous inscrire à un cours. Contactez Katia pour renouveler.</div>`;
    return;
  }

  if (membreData.abonnementRenouvellement) {
    zone.innerHTML = `<div class="banner-alert">Il vous reste ${reste} cours — vous avez indiqué : <strong>${membreData.abonnementRenouvellement === 'oui' ? 'je souhaite renouveler' : 'je ne souhaite pas renouveler'}</strong>. Katia s'en occupe.</div>`;
    return;
  }

  zone.innerHTML = `
    <div class="banner-alert">
      Il vous reste ${reste} cours sur votre abonnement. Souhaitez-vous le renouveler (11 cours) ?
      <div class="presence-btns">
        <button class="btn-sm primary" onclick="window.repondreAbonnement('oui')">Oui, je renouvelle</button>
        <button class="btn-sm" onclick="window.repondreAbonnement('non')">Non, pas pour l'instant</button>
      </div>
    </div>`;
}

window.repondreAbonnement = async (reponse) => {
  await updateDoc(doc(db, 'membres', membreUid), { abonnementRenouvellement: reponse });
  membreData.abonnementRenouvellement = reponse;
  afficherRappelAbonnement();
};

function afficherRappelCotisation() {
  const zone = document.getElementById('zoneCotisation');
  if (!membreData.cotisationDateEcheance) { zone.innerHTML = ''; return; }
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  const dansUnMois = new Date(aujourdhui); dansUnMois.setMonth(aujourdhui.getMonth() + 1);
  const echeance = new Date(membreData.cotisationDateEcheance + 'T00:00:00');

  if (echeance > dansUnMois) { zone.innerHTML = ''; return; }

  const dateLabel = echeance.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });

  if (membreData.cotisationRenouvellement) {
    zone.innerHTML = `<div class="banner-alert">Cotisation jusqu'au ${dateLabel} — vous avez indiqué : <strong>${membreData.cotisationRenouvellement === 'oui' ? 'je souhaite renouveler' : 'je ne souhaite pas renouveler'}</strong>. Katia s'en occupe.</div>`;
    return;
  }

  zone.innerHTML = `
    <div class="banner-alert">
      Votre cotisation arrive à échéance le ${dateLabel}. Souhaitez-vous la renouveler ?
      <div class="presence-btns">
        <button class="btn-sm primary" onclick="window.repondreCotisation('oui')">Oui, je renouvelle</button>
        <button class="btn-sm" onclick="window.repondreCotisation('non')">Non, pas cette année</button>
      </div>
    </div>`;
}

window.repondreCotisation = async (reponse) => {
  await updateDoc(doc(db, 'membres', membreUid), { cotisationRenouvellement: reponse });
  membreData.cotisationRenouvellement = reponse;
  afficherRappelCotisation();
};

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

  const lignes = await Promise.all(dates.map(async (d) => {
    const dateISO = d.toISOString().slice(0, 10);
    const dateLabel = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    const cleAnnul = `${groupeData.id}_${dateISO}`;
    const clePres = `${groupeData.id}_${dateISO}_${membreUid}`;
    const annule = annulations[cleAnnul];
    const presence = presences[clePres];
    const m = await meteoPour(dateISO, groupeData.heureDebut);
    const alerte = alerteMeteo(m);
    const meteoBadge = m ? `<span class="badge badge-neutral">${iconeCode(m.code)} ${m.temperature}°C · pluie ${m.pluie}%</span>` : '';

    if (annule) {
      return `
      <div class="data-row">
        <div class="data-main">
          <div class="data-title">${capitalize(dateLabel)} — ${groupeData.heureDebut}</div>
          <div class="data-sub"><span class="badge badge-danger">Cours annulé — ${escapeHtml(annule.motif)}</span> ${meteoBadge}</div>
        </div>
      </div>`;
    }

    let statutHtml;
    const heureCours = new Date(`${dateISO}T${groupeData.heureDebut}:00`);
    const delaiDepasse = new Date() >= new Date(heureCours.getTime() - 24 * 60 * 60 * 1000);

    if (presence) {
      if (presence.statut === 'present') {
        statutHtml = '<span class="badge badge-ok">Présence confirmée</span>';
      } else if (presence.statut === 'absent-auto') {
        statutHtml = '<span class="badge badge-warn">Pas de réponse dans les délais — comptabilisé(e) absent(e), ce cours compte dans votre abonnement.</span>';
      } else {
        statutHtml = '<span class="badge badge-neutral">Absence signalée</span>';
      }
    } else if (delaiDepasse) {
      // Le délai de 24h avant le cours est dépassé sans réponse : absence automatique.
      await setDoc(doc(db, 'presences', clePres), {
        groupeId: groupeData.id, uid: membreUid, dateISO, statut: 'absent-auto',
        repondu: new Date().toISOString(), compteAbonnement: false
      });
      statutHtml = '<span class="badge badge-warn">Pas de réponse dans les délais — comptabilisé(e) absent(e), ce cours compte dans votre abonnement.</span>';
    } else if ((membreData.coursRestants ?? 0) <= 0) {
      statutHtml = '<span class="badge badge-danger">Abonnement épuisé — contactez Katia</span>';
    } else {
      statutHtml = `
        <div class="presence-btns">
          <button class="btn-sm primary" onclick="window.repondrePresence('${dateISO}','present')">Je serai présent</button>
          <button class="btn-sm" onclick="window.repondrePresence('${dateISO}','absent')">Je serai absent</button>
        </div>
        <p style="font-size:0.76rem; color:var(--slate-light); margin-top:4px;">À confirmer au plus tard 24h avant le cours.</p>`;
    }

    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${capitalize(dateLabel)} — ${groupeData.heureDebut}</div>
        <div class="data-sub">${meteoBadge}</div>
        ${alerte ? `<div class="banner-alert" style="margin-top:8px; padding:8px 12px;">⚠️ ${alerte.texte}, une annulation est possible.</div>` : ''}
        ${statutHtml}
      </div>
    </div>`;
  }));

  wrap.innerHTML = lignes.join('');
}

window.repondrePresence = async (dateISO, statut) => {
  if (statut === 'present' && (membreData.coursRestants ?? 0) <= 0) {
    alert('Votre abonnement est épuisé. Contactez Katia pour le renouveler avant de vous inscrire à un cours.');
    return;
  }
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

// ==========================================================================
// TARIFS (lecture seule)
// ==========================================================================
async function chargerTarifs() {
  const configDoc = await getDoc(doc(db, 'tarifs', 'config'));
  const wrap = document.getElementById('zoneTarifs');
  const data = configDoc.exists() ? configDoc.data() : { abonnement: 70, coursUnite: 8, cotisation: 70, individuel: 85 };

  const lignesBase = [
    ['Abonnement (10 cours + 1 gratuit)', data.abonnement],
    ['Cours à l\'unité', data.coursUnite],
    ['Cotisation annuelle', data.cotisation],
    ['Cours individuel (1h)', data.individuel]
  ];

  const extraSnap = await getDocs(collection(db, 'tarifs_extra'));
  const lignesExtra = [];
  extraSnap.forEach(d => lignesExtra.push([d.data().nom, d.data().prix]));

  const toutes = [...lignesBase, ...lignesExtra];
  wrap.innerHTML = toutes.map(([nom, prix]) => `
    <div class="data-row">
      <div class="data-main"><div class="data-title">${escapeHtml(nom)}</div></div>
      <div class="data-actions"><span class="badge badge-neutral">${Number(prix).toFixed(2)} € TTC</span></div>
    </div>`).join('') + '<p style="color:var(--slate); font-size:0.8rem; margin-top:10px;">Tarifs TTC, TVA 21% incluse.</p>';
}

// ==========================================================================
// RDV
// ==========================================================================
async function chargerRdv() {
  const snap = await getDocs(collection(db, 'rdv'));
  const rdvs = [];
  snap.forEach(d => rdvs.push({ id: d.id, ...d.data() }));
  rdvs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const wrap = document.getElementById('zoneRdv');
  if (rdvs.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun RDV prévu pour l\'instant.</div>';
    return;
  }

  const reponseSnap = await getDocs(collection(db, 'rdv_reponses'));
  const mesReponses = {};
  reponseSnap.forEach(d => {
    const r = d.data();
    if (r.uid === membreUid) mesReponses[r.rdvId] = r;
  });

  wrap.innerHTML = rdvs.map(rdv => {
    const dateLabel = rdv.date ? new Date(rdv.date + 'T00:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const maReponse = mesReponses[rdv.id];
    let statutHtml;
    if (maReponse) {
      statutHtml = maReponse.statut === 'present'
        ? '<span class="badge badge-ok">Vous serez présent(e)</span>'
        : '<span class="badge badge-neutral">Vous avez signalé votre absence</span>';
    } else {
      statutHtml = `
        <div class="presence-btns">
          <button class="btn-sm primary" onclick="window.repondreRdv('${rdv.id}','present')">Je serai présent(e)</button>
          <button class="btn-sm" onclick="window.repondreRdv('${rdv.id}','absent')">Je ne pourrai pas venir</button>
        </div>`;
    }
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(rdv.titre)}</div>
        <div class="data-sub">${capitalize(dateLabel)} ${rdv.heure || ''} · ${escapeHtml(rdv.lieu || '')}</div>
        ${rdv.modalite ? `<div class="data-sub">${escapeHtml(rdv.modalite)}</div>` : ''}
        <div style="margin-top:8px;">${statutHtml}</div>
      </div>
    </div>`;
  }).join('');
}

window.repondreRdv = async (rdvId, statut) => {
  const cle = `${rdvId}_${membreUid}`;
  await setDoc(doc(db, 'rdv_reponses', cle), {
    rdvId, uid: membreUid, statut, paye: false,
    dateReponse: new Date().toISOString()
  });
  chargerRdv();
};

// ==========================================================================
// CHAT avec Katia
// ==========================================================================
async function chargerChat() {
  const msgsSnap = await getDocs(collection(db, 'conversations', membreUid, 'messages'));
  const msgs = [];
  msgsSnap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
  msgs.sort((a, b) => (a.dateEnvoi || '').localeCompare(b.dateEnvoi || ''));

  const wrap = document.getElementById('chatThreadMembre');
  wrap.innerHTML = msgs.map(m => bulleMessage(m)).join('') || '<div class="empty-state">Aucun message pour l\'instant. Dites bonjour à Katia !</div>';
  wrap.scrollTop = 999999;

  // Marquer comme lus les messages de l'admin
  const nonLus = msgs.filter(m => m.expediteur === 'admin' && !m.lu);
  if (nonLus.length > 0) {
    await Promise.all(nonLus.map(m => updateDoc(doc(db, 'conversations', membreUid, 'messages', m.id), { lu: true })));
    await setDoc(doc(db, 'conversations', membreUid), { nonLuMembre: false }, { merge: true });
  }
}

async function envoyerMessageMembre() {
  const input = document.getElementById('chatInputMembre');
  const texte = input.value.trim();
  if (!texte) return;
  input.value = '';
  const maintenant = new Date().toISOString();
  await addDoc(collection(db, 'conversations', membreUid, 'messages'), {
    texte, expediteur: 'membre', dateEnvoi: maintenant, lu: false
  });
  await setDoc(doc(db, 'conversations', membreUid), {
    dernierMessage: texte, dateDernierMessage: maintenant, nonLuAdmin: true
  }, { merge: true });
  chargerChat();
}

function bulleMessage(m) {
  const estMoi = m.expediteur === 'membre';
  const heure = m.dateEnvoi ? new Date(m.dateEnvoi).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
  const coche = estMoi ? `<span class="chat-check ${m.lu ? 'lu' : ''}">${m.lu ? '✓✓' : '✓'}</span>` : '';
  return `
    <div class="chat-bubble ${estMoi ? 'moi' : 'autre'}">
      ${escapeHtml(m.texte)}
      <div class="chat-meta">${heure} ${coche}</div>
    </div>`;
}

// ==========================================================================
// VIDÉOS D'APPRENTISSAGE + COMMENTAIRES
// ==========================================================================
function idYoutube(url) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function chargerVideosMembre() {
  const snap = await getDocs(collection(db, 'videos'));
  const videos = [];
  snap.forEach(d => videos.push({ id: d.id, ...d.data() }));

  const wrap = document.getElementById('zoneVideos');
  if (videos.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune vidéo pour l\'instant.</div>';
    return;
  }

  const blocs = await Promise.all(videos.map(async (v) => {
    const yid = idYoutube(v.url || '');
    const commentsSnap = await getDocs(collection(db, 'videos', v.id, 'commentaires'));
    const comments = [];
    commentsSnap.forEach(d => comments.push(d.data()));
    comments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return `
    <div class="app-panel" style="margin-bottom:0;">
      <h3>${escapeHtml(v.titre)}</h3>
      ${yid ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${yid}" title="${escapeHtml(v.titre)}" allowfullscreen></iframe></div>` : `<p><a href="${escapeHtml(v.url)}" target="_blank" rel="noopener">Voir la vidéo</a></p>`}
      ${v.texte ? `<p style="white-space:pre-wrap;">${escapeHtml(v.texte)}</p>` : ''}
      <div style="margin-top:14px;">
        <div id="comments-${v.id}">
          ${comments.map(c => `<div class="comment-item"><span class="comment-auteur">${escapeHtml(c.auteur)}</span>${escapeHtml(c.texte)}</div>`).join('') || '<p style="color:var(--slate); font-size:0.85rem;">Aucun commentaire pour l\'instant.</p>'}
        </div>
        <div class="comment-input-row">
          <input type="text" id="comment-input-${v.id}" placeholder="Ajouter un commentaire...">
          <button class="btn-sm primary" onclick="window.ajouterCommentaire('${v.id}')">Envoyer</button>
        </div>
      </div>
    </div>`;
  }));

  wrap.innerHTML = blocs.join('<div style="height:16px;"></div>');
}

window.ajouterCommentaire = async (videoId) => {
  const input = document.getElementById('comment-input-' + videoId);
  const texte = input.value.trim();
  if (!texte) return;
  input.value = '';
  await addDoc(collection(db, 'videos', videoId, 'commentaires'), {
    texte, auteur: membreData.nomMaitre || 'Membre', uid: membreUid,
    date: new Date().toISOString()
  });
  chargerVideosMembre();
};

// ==========================================================================
// MON PROFIL — le membre encode/modifie ses propres infos
// ==========================================================================
function preremplirMonProfil() {
  const rc = membreData.assuranceRC || {};

  document.getElementById('mp-gsm').value = membreData.gsm || '';
  document.getElementById('mp-email').value = membreData.email || '';
  document.getElementById('mp-adresse').value = membreData.adressePostale || '';
  document.getElementById('mp-anniversaire').value = membreData.dateAnniversaire || '';

  document.getElementById('mp-rcCompagnie').value = rc.compagnie || '';
  document.getElementById('mp-rcNumero').value = rc.numeroPolice || '';
  document.getElementById('mp-rcEcheance').value = rc.dateEcheance || '';
}

document.getElementById('mp-enregistrer').addEventListener('click', async () => {
  const btn = document.getElementById('mp-enregistrer');
  const statut = document.getElementById('mp-statut');
  btn.disabled = true;
  statut.textContent = 'Enregistrement...';

  const data = {
    gsm: document.getElementById('mp-gsm').value.trim(),
    email: document.getElementById('mp-email').value.trim(),
    adressePostale: document.getElementById('mp-adresse').value.trim(),
    dateAnniversaire: document.getElementById('mp-anniversaire').value,
    assuranceRC: {
      compagnie: document.getElementById('mp-rcCompagnie').value.trim(),
      numeroPolice: document.getElementById('mp-rcNumero').value.trim(),
      dateEcheance: document.getElementById('mp-rcEcheance').value
    }
  };

  try {
    await updateDoc(doc(db, 'membres', membreUid), data);
    membreData = { ...membreData, ...data };
    document.getElementById('membreNom').textContent = membreData.nomMaitre || '';
    statut.textContent = 'Profil enregistré ✓';
  } catch (e) {
    statut.textContent = 'Erreur : ' + e.message;
  }
  btn.disabled = false;
});

// ==========================================================================
// MES CHIENS — plusieurs chiens possibles, archivage individuel (ex: décès)
// ==========================================================================
function optionsMarqueVaccinMembre(valeurActuelle) {
  return ['', 'Eurican', 'Versican', 'Nobivac', 'Autres'].map(m =>
    `<option value="${m}" ${valeurActuelle === m ? 'selected' : ''}>${m || '—'}</option>`
  ).join('');
}

function afficherMesChiens() {
  const chiens = (membreData.chiens || []).filter(c => !c.archive);
  const wrap = document.getElementById('mc-liste');
  if (chiens.length === 0) {
    wrap.innerHTML = '<p style="color:var(--slate); font-size:0.85rem;">Aucun chien enregistré pour l\'instant.</p>';
    return;
  }
  wrap.innerHTML = chiens.map(c => `
    <div class="dog-card">
      <div class="dog-card-head">
        <div>
          <div class="dog-title">${escapeHtml(c.nom || 'Sans nom')} ${c.race ? '— ' + escapeHtml(c.race) : ''}</div>
          <div class="dog-sub">${c.pedigree ? 'Pedigree · ' : ''}${c.puce ? 'Puce ' + escapeHtml(c.puce) : 'Puce non renseignée'}</div>
        </div>
        <div class="data-actions">
          <button class="btn-sm" type="button" onclick="window.ouvrirFormChien('${c.id}')">Modifier</button>
          <button class="btn-sm danger" type="button" onclick="window.archiverMonChien('${c.id}')">Archiver</button>
        </div>
      </div>
    </div>`).join('');
}

document.getElementById('mc-ajouter').addEventListener('click', () => window.ouvrirFormChien(null));

window.ouvrirFormChien = (chienId) => {
  const chien = chienId ? (membreData.chiens || []).find(c => c.id === chienId) : null;
  const v = chien?.vaccins || {};

  const html = `
    <div class="modal-overlay" id="modalOverlayChien">
      <div class="modal-box" style="max-width:520px;">
        <h3>${chien ? 'Modifier le chien' : 'Ajouter un chien'}</h3>
        <div class="form-grid">
          <div class="field"><label>Nom du chien</label><input id="fc-nom" value="${chien ? escapeHtml(chien.nom||'') : ''}"></div>
          <div class="field"><label>Race</label><input id="fc-race" value="${chien ? escapeHtml(chien.race||'') : ''}"></div>
          <div class="field"><label>Date de naissance</label><input type="date" id="fc-naissance" value="${chien ? (chien.naissance||'') : ''}"></div>
          <div class="field"><label>Sexe</label>
            <select id="fc-sexe">
              <option value="male" ${chien?.sexe==='male' ? 'selected':''}>Mâle</option>
              <option value="femelle" ${chien?.sexe==='femelle' ? 'selected':''}>Femelle</option>
            </select>
          </div>
          <div class="field"><label>Castré / Stérilisée</label>
            <select id="fc-sterilise">
              <option value="non" ${!chien?.sterilise ? 'selected':''}>Non</option>
              <option value="oui" ${chien?.sterilise ? 'selected':''}>Oui</option>
            </select>
          </div>
          <div class="field"><label>Date (si oui)</label><input type="date" id="fc-dateSterilisation" value="${chien ? (chien.dateSterilisation||'') : ''}"></div>
          <div class="field"><label>N° de puce</label><input id="fc-puce" value="${chien ? escapeHtml(chien.puce||'') : ''}"></div>
          <div class="field"><label>N° de passeport</label><input id="fc-passeport" value="${chien ? escapeHtml(chien.passeport||'') : ''}"></div>
          <div class="field"><label>Pedigree</label>
            <select id="fc-pedigree">
              <option value="non" ${!chien?.pedigree ? 'selected':''}>Non</option>
              <option value="oui" ${chien?.pedigree ? 'selected':''}>Oui</option>
            </select>
          </div>
        </div>

        <h3 style="margin-top:16px;">Vaccins</h3>
        <div class="form-grid">
          <div class="field"><label>Leptospirose — marque</label><select id="fc-vaxLepto-marque">${optionsMarqueVaccinMembre(v.leptospirose?.marque)}</select></div>
          <div class="field"><label>Leptospirose — date</label><input type="date" id="fc-vaxLepto-date" value="${v.leptospirose?.date||''}"></div>
          <div class="field"><label>Parvovirose — marque</label><select id="fc-vaxParvo-marque">${optionsMarqueVaccinMembre(v.parvovirose?.marque)}</select></div>
          <div class="field"><label>Parvovirose — date</label><input type="date" id="fc-vaxParvo-date" value="${v.parvovirose?.date||''}"></div>
          <div class="field"><label>Toux du chenil — marque</label><select id="fc-vaxToux-marque">${optionsMarqueVaccinMembre(v.touxChenils?.marque)}</select></div>
          <div class="field"><label>Toux du chenil — date</label><input type="date" id="fc-vaxToux-date" value="${v.touxChenils?.date||''}"></div>
          <div class="field"><label>Rage — date</label><input type="date" id="fc-vaxRage-date" value="${v.rage?.date||''}"></div>
        </div>

        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="document.getElementById('modalOverlayChien').remove()">Annuler</button>
          <button class="btn-sm primary" type="button" id="fc-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('fc-save').addEventListener('click', async () => {
    const nouveauChien = {
      id: chien ? chien.id : 'chien-' + Date.now(),
      nom: document.getElementById('fc-nom').value.trim(),
      race: document.getElementById('fc-race').value.trim(),
      naissance: document.getElementById('fc-naissance').value,
      sexe: document.getElementById('fc-sexe').value,
      sterilise: document.getElementById('fc-sterilise').value === 'oui',
      dateSterilisation: document.getElementById('fc-dateSterilisation').value,
      puce: document.getElementById('fc-puce').value.trim(),
      passeport: document.getElementById('fc-passeport').value.trim(),
      pedigree: document.getElementById('fc-pedigree').value === 'oui',
      archive: false,
      vaccins: {
        leptospirose: { marque: document.getElementById('fc-vaxLepto-marque').value, date: document.getElementById('fc-vaxLepto-date').value },
        parvovirose: { marque: document.getElementById('fc-vaxParvo-marque').value, date: document.getElementById('fc-vaxParvo-date').value },
        touxChenils: { marque: document.getElementById('fc-vaxToux-marque').value, date: document.getElementById('fc-vaxToux-date').value },
        rage: { date: document.getElementById('fc-vaxRage-date').value }
      }
    };
    if (!nouveauChien.nom) { alert('Merci d\'indiquer le nom du chien.'); return; }

    const chiensActuels = membreData.chiens || [];
    const nouveauxChiens = chien
      ? chiensActuels.map(c => c.id === chien.id ? nouveauChien : c)
      : [...chiensActuels, nouveauChien];

    await updateDoc(doc(db, 'membres', membreUid), { chiens: nouveauxChiens });
    membreData.chiens = nouveauxChiens;
    document.getElementById('modalOverlayChien').remove();
    afficherMesChiens();
    document.getElementById('chienNom').textContent = nomsChiensActifs();
  });
};

window.archiverMonChien = async (chienId) => {
  if (!confirm('Archiver ce chien ? (par ex. en cas de décès) Ses informations resteront conservées.')) return;
  const nouveauxChiens = (membreData.chiens || []).map(c => c.id === chienId ? { ...c, archive: true } : c);
  await updateDoc(doc(db, 'membres', membreUid), { chiens: nouveauxChiens });
  membreData.chiens = nouveauxChiens;
  afficherMesChiens();
  document.getElementById('chienNom').textContent = nomsChiensActifs();
};
