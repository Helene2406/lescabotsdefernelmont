import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, getDocAvecReessai, setDoc, getDocs, collection, addDoc, updateDoc, query, orderBy, where, serverTimestamp
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

  chargerServicesMembre();
  chargerRdv();
  chargerChat();
  afficherAlerteMessage();
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
  chargerHistoriquePaiementsMembre();
  chargerBoutiqueMembre();
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
  const dateLabel = echeance.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });

  const infoDate = `<p style="font-size:0.85rem; color:var(--slate); margin:0 0 8px;">Vous êtes en ordre de cotisation jusqu'au <strong>${dateLabel}</strong>.</p>`;

  if (echeance > dansUnMois) { zone.innerHTML = infoDate; return; }

  if (membreData.cotisationRenouvellement) {
    zone.innerHTML = infoDate + `<div class="banner-alert">Cotisation jusqu'au ${dateLabel} — vous avez indiqué : <strong>${membreData.cotisationRenouvellement === 'oui' ? 'je souhaite renouveler' : 'je ne souhaite pas renouveler'}</strong>. Katia s'en occupe.</div>`;
    return;
  }

  zone.innerHTML = infoDate + `
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
function libellePrixMembre(s) {
  if (s.prixTexte) return s.prixTexte;
  if (typeof s.prix === 'number') return `${s.prix.toFixed(2)} €${s.unite ? ' — ' + s.unite : ''}`;
  return '—';
}

async function chargerServicesMembre() {
  const wrap = document.getElementById('zoneServices');
  const snap = await getDocs(collection(db, 'services'));
  const services = [];
  snap.forEach(d => services.push(d.data()));

  if (services.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun service publié pour l\'instant.</div>';
    return;
  }

  const categories = [...new Set(services.map(s => s.categorie || 'Autres'))];
  wrap.innerHTML = categories.map(cat => `
    <h3 style="margin-top:14px;">${escapeHtml(cat)}</h3>
    <div class="data-list">
      ${services.filter(s => (s.categorie || 'Autres') === cat).map(s => `
        <div class="data-row">
          <div class="data-main">
            <div class="data-title">${escapeHtml(s.nom)}</div>
            ${s.conditions ? `<div class="data-sub">${escapeHtml(s.conditions)}</div>` : ''}
          </div>
          <div class="data-actions">
            <span class="badge badge-neutral">${libellePrixMembre(s)}</span>
            ${s.prixFutur ? `<span class="badge badge-warn">${Number(s.prixFutur).toFixed(2)} € dès le ${s.dateFutur}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`).join('') + '<p style="color:var(--slate); font-size:0.8rem; margin-top:10px;">Prix TTC, TVA 21% incluse.</p>';
}

// ==========================================================================
// RDV — filtré par destinataires, prix par personne, paiement par virement
// ==========================================================================
function estInviteAuRdv(rdv) {
  if (!rdv.destinataires || rdv.destinataires.type === 'tous') return true;
  if (rdv.destinataires.type === 'groupe') return rdv.destinataires.groupeId === membreData.groupeId;
  if (rdv.destinataires.type === 'individuel') return (rdv.destinataires.membreIds || []).includes(membreUid);
  return false;
}

async function chargerRdv() {
  const snap = await getDocs(collection(db, 'rdv'));
  let rdvs = [];
  snap.forEach(d => rdvs.push({ id: d.id, ...d.data() }));
  rdvs = rdvs.filter(estInviteAuRdv);
  rdvs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const wrap = document.getElementById('zoneRdv');
  if (rdvs.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun RDV prévu pour l\'instant.</div>';
    return;
  }

  const paramDoc = await getDoc(doc(db, 'parametres', 'bancaire'));
  const iban = paramDoc.exists() ? (paramDoc.data().iban || '') : '';

  const reponseSnap = await getDocs(collection(db, 'rdv_reponses'));
  const mesReponses = {};
  reponseSnap.forEach(d => {
    const r = d.data();
    if (r.uid === membreUid) mesReponses[r.rdvId] = { id: d.id, ...r };
  });

  const nomChien = (membreData.chiens || []).find(c => !c.archive)?.nom || '';

  wrap.innerHTML = rdvs.map(rdv => {
    const dateLabel = rdv.date ? new Date(rdv.date + 'T00:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const maReponse = mesReponses[rdv.id];
    let statutHtml;

    if (maReponse) {
      if (maReponse.statut === 'present') {
        const communication = `${rdv.titre} ${nomChien} ${rdv.date}`;
        statutHtml = `<span class="badge badge-ok">Vous serez présent(e)${maReponse.nombrePersonnes > 1 ? ` (${maReponse.nombrePersonnes} pers.)` : ''}</span>`;
        if (rdv.prixParPersonne) {
          statutHtml += `
            <div class="banner-alert" style="margin-top:8px;">
              Montant à payer : <strong>${Number(maReponse.montant || 0).toFixed(2)} €</strong><br>
              ${iban ? `Virement sur : <strong>${escapeHtml(iban)}</strong><br>` : ''}
              Communication : <strong>${escapeHtml(communication)}</strong>
              <div class="presence-btns" style="margin-top:8px;">
                ${maReponse.paye
                  ? '<span class="badge badge-ok">Vous avez indiqué avoir payé</span>' + (maReponse.paiementValide ? ' <span class="badge badge-ok">Validé par Katia</span>' : ' <span class="badge badge-warn">En attente de validation</span>')
                  : `<button class="btn-sm primary" onclick="window.signalerPaiementRdv('${maReponse.id}')">J'ai payé</button>`}
              </div>
            </div>`;
        }
      } else {
        statutHtml = '<span class="badge badge-neutral">Absence signalée</span>';
      }
    } else {
      statutHtml = `
        <div class="field" style="max-width:160px;">
          <label>Nombre de personnes</label>
          <input type="number" min="1" value="1" id="rd-nb-${rdv.id}" style="width:100%;">
        </div>
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
        ${rdv.prixParPersonne ? `<div class="data-sub">${Number(rdv.prixParPersonne).toFixed(2)} € / personne</div>` : ''}
        <div style="margin-top:8px;">${statutHtml}</div>
      </div>
    </div>`;
  }).join('');
}

window.repondreRdv = async (rdvId, statut) => {
  const rdv = (await getDoc(doc(db, 'rdv', rdvId))).data();
  const nombrePersonnes = statut === 'present' ? (parseInt(document.getElementById('rd-nb-' + rdvId)?.value, 10) || 1) : 1;
  const montant = rdv.prixParPersonne ? rdv.prixParPersonne * nombrePersonnes : 0;
  const cle = `${rdvId}_${membreUid}`;
  await setDoc(doc(db, 'rdv_reponses', cle), {
    rdvId, uid: membreUid, statut, nombrePersonnes, montant, paye: false, paiementValide: false,
    dateReponse: new Date().toISOString()
  });
  chargerRdv();
};

window.signalerPaiementRdv = async (reponseId) => {
  await updateDoc(doc(db, 'rdv_reponses', reponseId), { paye: true });
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
}

async function marquerChatLu() {
  const msgsSnap = await getDocs(collection(db, 'conversations', membreUid, 'messages'));
  const nonLus = [];
  msgsSnap.forEach(d => {
    const m = d.data();
    if (m.expediteur === 'admin' && !m.lu) nonLus.push(d.id);
  });
  if (nonLus.length > 0) {
    await Promise.all(nonLus.map(id => updateDoc(doc(db, 'conversations', membreUid, 'messages', id), { lu: true })));
    await setDoc(doc(db, 'conversations', membreUid), { nonLuMembre: false }, { merge: true });
  }
  document.getElementById('zoneAlerteMessage').innerHTML = '';
  chargerChat();
}

async function afficherAlerteMessage() {
  const convDoc = await getDoc(doc(db, 'conversations', membreUid));
  const zone = document.getElementById('zoneAlerteMessage');
  if (convDoc.exists() && convDoc.data().nonLuMembre) {
    zone.innerHTML = `
      <div class="alerte-message" onclick="window.ouvrirMessagesEtLire()">
        💬 Vous avez un nouveau message de Katia — cliquez pour le lire
      </div>`;
  } else {
    zone.innerHTML = '';
  }
}

window.ouvrirMessagesEtLire = () => {
  const toggle = document.querySelector('.panel-toggle[data-target="panelMessages"]');
  const body = document.getElementById('panelMessages');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    toggle.classList.add('open');
  }
  body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  marquerChatLu();
};

window.marquerMessagesLusDepuisAccordeon = () => marquerChatLu();

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
  wrap.innerHTML = chiens.map(c => {
    const alertesVaccins = alerteVaccinsChien(c);
    return `
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
      ${alertesVaccins.length ? `<div class="banner-alert" style="margin-top:10px; padding:8px 12px;">💉 ${alertesVaccins.join(', ')}</div>` : ''}
    </div>`;
  }).join('');
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

// ==========================================================================
// HISTORIQUE DE MES PAIEMENTS (lecture seule)
// ==========================================================================
async function chargerHistoriquePaiementsMembre() {
  const zone = document.getElementById('zonePaiements');
  const snap = await getDocs(query(collection(db, 'paiements'), where('membreId', '==', membreUid)));
  const paiements = [];
  snap.forEach(d => paiements.push(d.data()));
  paiements.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (paiements.length === 0) {
    zone.innerHTML = '<div class="empty-state">Aucun paiement enregistré pour l\'instant.</div>';
    return;
  }
  zone.innerHTML = paiements.map(p => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(p.type)} — ${Number(p.montant).toFixed(2)} € TTC</div>
        <div class="data-sub">${p.date || ''}${p.note ? ' · ' + escapeHtml(p.note) : ''}</div>
      </div>
    </div>`).join('');
}

// ==========================================================================
// VACCINS — échéances calculées à 1 an après la dernière date indiquée
// ==========================================================================
const LABELS_VACCINS_MEMBRE = { leptospirose: 'Leptospirose', parvovirose: 'Parvovirose', touxChenils: 'Toux du chenil', rage: 'Rage' };

function alerteVaccinsChien(chien) {
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  const dans30Jours = new Date(aujourdhui); dans30Jours.setDate(aujourdhui.getDate() + 30);
  const v = chien.vaccins || {};
  const alertes = [];
  Object.keys(LABELS_VACCINS_MEMBRE).forEach(cle => {
    const date = v[cle]?.date;
    if (!date) return;
    const echeance = new Date(date + 'T00:00:00');
    echeance.setFullYear(echeance.getFullYear() + 1);
    if (echeance <= dans30Jours) {
      const enRetard = echeance < aujourdhui;
      alertes.push(`${LABELS_VACCINS_MEMBRE[cle]}${enRetard ? ' en retard' : ' à renouveler bientôt'}`);
    }
  });
  return alertes;
}

// ==========================================================================
// BOUTIQUE — panier local puis commande à valider par l'admin
// ==========================================================================
let panierLocal = [];

async function chargerBoutiqueMembre() {
  const wrap = document.getElementById('zoneArticlesBoutique');
  try {
    const snap = await getDocs(query(collection(db, 'articles_boutique'), where('actif', '==', true)));
    const articles = [];
    snap.forEach(d => articles.push({ id: d.id, ...d.data() }));

    if (articles.length === 0) {
      wrap.innerHTML = '<div class="empty-state">Aucun article disponible pour l\'instant.</div>';
    } else {
      wrap.innerHTML = articles.map(a => `
        <div class="data-row">
          <div class="data-main">
            <div class="data-title">${escapeHtml(a.nom)}</div>
            <div class="data-sub">${Number(a.prix).toFixed(2)} € TTC · ${a.stock > 0 ? `${a.stock} en stock` : '<span class="badge badge-danger">Rupture de stock</span>'}</div>
          </div>
          <div class="data-actions">
            <button class="btn-sm primary" ${a.stock <= 0 ? 'disabled' : ''} onclick="window.ajouterAuPanier('${a.id}', '${escapeHtml(a.nom)}', ${a.prix}, ${a.stock})">Ajouter au panier</button>
          </div>
        </div>`).join('');
    }
  } catch (err) {
    wrap.innerHTML = `<div class="banner-alert" style="background:#FBEAEA; border-color:#E3B4B4; color:#8A2E2E;">Erreur : ${escapeHtml(err.code || '')} — ${escapeHtml(err.message || String(err))}</div>`;
    return;
  }

  afficherPanier();
  chargerMesCommandes();
}

window.ajouterAuPanier = (articleId, nom, prix, stock) => {
  const existant = panierLocal.find(l => l.articleId === articleId);
  if (existant) {
    if (existant.quantite >= stock) { alert('Stock insuffisant.'); return; }
    existant.quantite++;
  } else {
    panierLocal.push({ articleId, nom, prix, quantite: 1 });
  }
  afficherPanier();
};

window.retirerDuPanier = (articleId) => {
  panierLocal = panierLocal.filter(l => l.articleId !== articleId);
  afficherPanier();
};

function afficherPanier() {
  const wrap = document.getElementById('zonePanier');
  const totalEl = document.getElementById('panierTotal');
  if (panierLocal.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Panier vide.</div>';
    totalEl.textContent = '';
    return;
  }
  wrap.innerHTML = panierLocal.map(l => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${l.quantite} × ${escapeHtml(l.nom)}</div>
        <div class="data-sub">${(l.prix * l.quantite).toFixed(2)} € TTC</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm danger" onclick="window.retirerDuPanier('${l.articleId}')">Retirer</button>
      </div>
    </div>`).join('');
  const total = panierLocal.reduce((s, l) => s + l.prix * l.quantite, 0);
  totalEl.textContent = `Total : ${total.toFixed(2)} € TTC`;
}

document.getElementById('btnValiderPanier').addEventListener('click', async () => {
  if (panierLocal.length === 0) { alert('Votre panier est vide.'); return; }
  const total = panierLocal.reduce((s, l) => s + l.prix * l.quantite, 0);
  await addDoc(collection(db, 'commandes'), {
    membreId: membreUid,
    lignes: panierLocal.map(l => ({ articleId: l.articleId, nom: l.nom, prixUnitaire: l.prix, quantite: l.quantite })),
    total,
    statut: 'en_attente',
    dateCreation: serverTimestamp()
  });
  panierLocal = [];
  afficherPanier();
  alert('Commande envoyée à Katia pour validation.');
  chargerMesCommandes();
});

async function chargerMesCommandes() {
  const snap = await getDocs(query(collection(db, 'commandes'), where('membreId', '==', membreUid)));
  const commandes = [];
  snap.forEach(d => commandes.push({ id: d.id, ...d.data() }));
  commandes.sort((a, b) => (b.dateCreation?.toMillis?.() || 0) - (a.dateCreation?.toMillis?.() || 0));

  const wrap = document.getElementById('zoneMesCommandes');
  if (commandes.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune commande pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = commandes.map(c => {
    const detail = (c.lignes || []).map(l => `${l.quantite} × ${escapeHtml(l.nom)}`).join(', ');
    const badge = c.statut === 'validee' ? '<span class="badge badge-ok">Validée</span>'
      : c.statut === 'annulee' ? '<span class="badge badge-danger">Annulée</span>'
      : '<span class="badge badge-warn">En attente</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${Number(c.total).toFixed(2)} € TTC ${badge}</div>
        <div class="data-sub">${detail}</div>
      </div>
    </div>`;
  }).join('');
}

// ==========================================================================
// Filet de sécurité : si une zone reste bloquée sur "..." après un moment,
// c'est qu'un chargement a échoué silencieusement — on le dit clairement.
// ==========================================================================
setTimeout(() => {
  document.querySelectorAll('.empty-state').forEach(el => {
    if (el.textContent.trim() === '...') {
      el.textContent = 'Page vide — une erreur a peut-être empêché le chargement. Recharge la page (Ctrl+F5).';
    }
  });
}, 7000);
