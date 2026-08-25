import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, getDocAvecReessai, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where,
  serverTimestamp, identifiantVersEmail
} from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth as getAuthSecondary, createUserWithEmailAndPassword, signOut as signOutSecondary }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { meteoActuelle, meteoPour, alerteMeteo, iconeCode } from "./meteo.js";

const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const JOURS_MAJ = { lundi:"Lundi", mardi:"Mardi", mercredi:"Mercredi", jeudi:"Jeudi", vendredi:"Vendredi", samedi:"Samedi", dimanche:"Dimanche" };

let currentGroupes = [];
let currentMembres = [];

// ---------- Garde d'accès ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'connexion.html'; return; }
  const mDoc = await getDocAvecReessai(doc(db, 'membres', user.uid));
  if (!mDoc.exists() || mDoc.data().role !== 'admin') {
    window.location.href = 'connexion.html';
    return;
  }
  document.getElementById('adminNom').textContent = mDoc.data().nomMaitre || 'Katia';
  await chargerGroupes();
  await chargerMembres();
  await chargerServices();
  await traiterAbsencesAutomatiques();
  chargerConversations();
  chargerAnniversaires();
  chargerCotisationsARenouveler();
  chargerAbonnementsARenouveler(); chargerVaccinsARappeler();
  chargerCeSoir();
  afficherMeteoDuJour();
  chargerRdv();
  chargerArticles();
  chargerVideosAdmin();
  chargerBoutiqueAdmin();
  console.log('%c🍓 Un petit jardin secret pour toi, Katia...', 'color:#C0392B; font-size:13px;');
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = 'connexion.html'));

// ---------- Onglets ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// ==========================================================================
// MÉTÉO DU JOUR (bandeau)
// ==========================================================================
async function afficherMeteoDuJour() {
  const zone = document.getElementById('meteoDuJour');
  const m = await meteoActuelle();
  if (!m) { zone.innerHTML = ''; return; }
  const dateLabel = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  zone.innerHTML = `
    <div class="banner-alert" style="background:#EFF3F6; border-color:#D4DAE0; color:var(--navy-dark); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <span>${iconeCode(m.code)} Andenne — ${m.description}, ${m.temperature}°C</span>
      <span style="text-transform:capitalize;">${dateLabel}</span>
    </div>`;
}

// ==========================================================================
// GROUPES
// ==========================================================================
async function chargerGroupes() {
  const snap = await getDocs(collection(db, 'groupes'));
  currentGroupes = [];
  snap.forEach(d => currentGroupes.push({ id: d.id, ...d.data() }));
  renderGroupes();
  remplirSelectGroupes();
}

function renderGroupes() {
  const wrap = document.getElementById('listeGroupes');
  if (currentGroupes.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun groupe créé pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = currentGroupes.map(g => {
    const nbMembres = currentMembres.filter(m => m.groupeId === g.id).length;
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(g.nom)}</div>
        <div class="data-sub">${JOURS_MAJ[g.jour] || g.jour} · ${g.heureDebut}–${g.heureFin} · ${nbMembres}/${g.participantsMax} chiens</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.voirMembresGroupe('${g.id}')">Membres (${nbMembres})</button>
        <button class="btn-sm" onclick="window.editerGroupe('${g.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerGroupe('${g.id}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('btnAjouterGroupe').addEventListener('click', () => ouvrirModalGroupe());

window.voirMembresGroupe = (groupeId) => {
  const groupe = currentGroupes.find(g => g.id === groupeId);
  const membresDuGroupe = currentMembres.filter(m => m.groupeId === groupeId);

  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>${escapeHtml(groupe?.nom || '')} — ${membresDuGroupe.length} membre(s)</h3>
        <div class="data-list">
          ${membresDuGroupe.length === 0
            ? '<div class="empty-state">Aucun membre dans ce groupe pour l\'instant.</div>'
            : membresDuGroupe.map(m => `
              <div class="data-row">
                <div class="data-main">
                  <div class="data-title">${escapeHtml(m.nomMaitre)}${nomsChiensActifs(m) ? ' — ' + escapeHtml(nomsChiensActifs(m)) : ''}</div>
                  <div class="data-sub">${m.gsm ? `<a href="tel:${escapeAttr(m.gsm)}">${escapeHtml(m.gsm)}</a>` : ''}</div>
                </div>
                <div class="data-actions">
                  <button class="btn-sm" onclick="window.fermerModal(); window.editerMembre('${m.id}')">Fiche</button>
                </div>
              </div>`).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Fermer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
};

document.getElementById('btnImportGroupes').addEventListener('click', () => ouvrirModalImportGroupes());

function ouvrirModalImportGroupes() {
  const exemplePreRempli =
    'Groupe 01;lundi;18:30;19:30;8\n' +
    'Groupe 02;lundi;19:45;20:45;8\n' +
    'Groupe 03;mardi;18:45;19:45;8\n' +
    'Groupe 04;mercredi;18:30;19:30;8';

  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box" style="max-width:560px;">
        <h3>Import groupé de groupes</h3>
        <p style="color:var(--slate); font-size:0.85rem; margin-bottom:12px;">
          Une ligne par groupe, format : <strong>Nom;jour;heureDébut;heureFin;maxChiens</strong><br>
          Jours en minuscules : lundi, mardi, mercredi, jeudi, vendredi, samedi.
        </p>
        <div class="field">
          <textarea id="ig-texte" rows="8" style="resize:vertical; font-family:monospace; font-size:0.85rem;">${exemplePreRempli}</textarea>
        </div>
        <div id="ig-resultat" style="font-size:0.85rem; color:var(--slate);"></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="ig-save">Importer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;

  document.getElementById('ig-save').addEventListener('click', async () => {
    const lignes = document.getElementById('ig-texte').value.split('\n').map(l => l.trim()).filter(l => l);
    const joursValides = ['lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    let succes = 0, erreurs = [];

    for (const ligne of lignes) {
      const parts = ligne.split(';').map(p => p.trim());
      if (parts.length < 4) { erreurs.push(`Ligne ignorée (format incomplet) : "${ligne}"`); continue; }
      const [nom, jour, heureDebut, heureFin, max] = parts;
      if (!nom || !joursValides.includes(jour.toLowerCase()) || !heureDebut || !heureFin) {
        erreurs.push(`Ligne ignorée (jour ou champ invalide) : "${ligne}"`);
        continue;
      }
      try {
        await addDoc(collection(db, 'groupes'), {
          nom,
          jour: jour.toLowerCase(),
          heureDebut,
          heureFin,
          participantsMax: parseInt(max, 10) || 8
        });
        succes++;
      } catch (e) {
        erreurs.push(`Erreur pour "${nom}" : ${e.message}`);
      }
    }

    document.getElementById('ig-resultat').innerHTML =
      `<strong>${succes} groupe(s) importé(s).</strong>` +
      (erreurs.length ? '<br>' + erreurs.map(e => escapeHtml(e)).join('<br>') : '');

    chargerGroupes();
  });
}

window.editerGroupe = (id) => {
  const g = currentGroupes.find(x => x.id === id);
  ouvrirModalGroupe(g);
};

window.supprimerGroupe = async (id) => {
  if (!confirm('Supprimer ce groupe ?')) return;
  await deleteDoc(doc(db, 'groupes', id));
  chargerGroupes();
};

function ouvrirModalGroupe(groupe) {
  const isEdit = !!groupe;
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>${isEdit ? 'Modifier le groupe' : 'Ajouter un groupe'}</h3>
        <div class="field"><label>Nom du groupe</label><input id="mg-nom" value="${isEdit ? escapeAttr(groupe.nom) : ''}"></div>
        <div class="form-grid">
          <div class="field"><label>Jour</label>
            <select id="mg-jour">
              ${JOURS.filter(j=>j!=='dimanche').map(j => `<option value="${j}" ${isEdit && groupe.jour===j ? 'selected':''}>${JOURS_MAJ[j]}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Nombre de chiens max</label><input type="number" id="mg-max" min="1" value="${isEdit ? groupe.participantsMax : 8}"></div>
          <div class="field"><label>Heure de début</label><input type="time" id="mg-debut" value="${isEdit ? groupe.heureDebut : '18:00'}"></div>
          <div class="field"><label>Heure de fin</label><input type="time" id="mg-fin" value="${isEdit ? groupe.heureFin : '19:00'}"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="mg-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('mg-save').addEventListener('click', async () => {
    const data = {
      nom: document.getElementById('mg-nom').value.trim(),
      jour: document.getElementById('mg-jour').value,
      heureDebut: document.getElementById('mg-debut').value,
      heureFin: document.getElementById('mg-fin').value,
      participantsMax: parseInt(document.getElementById('mg-max').value, 10) || 8
    };
    if (!data.nom) { alert('Merci d\'indiquer un nom de groupe.'); return; }
    if (isEdit) {
      await updateDoc(doc(db, 'groupes', groupe.id), data);
    } else {
      await addDoc(collection(db, 'groupes'), data);
    }
    window.fermerModal();
    chargerGroupes();
  });
}

window.fermerModal = () => { document.getElementById('modalZone').innerHTML = ''; };

function remplirSelectGroupes() {
  const sel = document.getElementById('mm-groupe');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Aucun groupe par défaut —</option>' +
    currentGroupes.map(g => `<option value="${g.id}">${escapeHtml(g.nom)} (${JOURS_MAJ[g.jour]} ${g.heureDebut})</option>`).join('');
}

// ==========================================================================
// MEMBRES
// ==========================================================================
async function chargerMembres() {
  const snap = await getDocs(query(collection(db, 'membres'), where('role', '==', 'membre')));
  currentMembres = [];
  snap.forEach(d => { if (!d.data().archive) currentMembres.push({ id: d.id, ...d.data() }); });
  renderMembres();
  renderGroupes();
}

function nomsChiensActifs(membre) {
  const actifs = (membre.chiens || []).filter(c => !c.archive);
  return actifs.map(c => c.nom).filter(Boolean).join(', ');
}

function renderMembres() {
  const wrap = document.getElementById('listeMembres');
  if (currentMembres.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun membre pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = currentMembres.map(m => {
    const groupe = currentGroupes.find(g => g.id === m.groupeId);
    const badgeAbo = m.abonnementPaye
      ? `<span class="badge badge-ok">${m.coursRestants ?? 0} cours restants</span>`
      : `<span class="badge badge-danger">Abonnement non payé</span>`;
    const badgeCotis = m.cotisationPayee
      ? `<span class="badge badge-ok">Cotisation à jour</span>`
      : `<span class="badge badge-warn">Cotisation à régler</span>`;
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(m.nomMaitre)}${nomsChiensActifs(m) ? ' — ' + escapeHtml(nomsChiensActifs(m)) : ''}</div>
        <div class="data-sub">${groupe ? escapeHtml(groupe.nom) : 'Sans groupe'} · ${badgeAbo} ${badgeCotis}</div>
        <div class="data-sub">${m.gsm ? `<a href="tel:${escapeAttr(m.gsm)}">${escapeHtml(m.gsm)}</a>` : ''} ${m.email ? `· <a href="mailto:${escapeAttr(m.email)}">${escapeHtml(m.email)}</a>` : ''}</div>
        <div class="data-sub">Identifiant : <strong>${escapeHtml(m.identifiant || '—')}</strong>${m.motDePasseInitial ? ` · Mot de passe : <strong>${escapeHtml(m.motDePasseInitial)}</strong>` : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerMembre('${m.id}')">Fiche</button>
        <button class="btn-sm danger" onclick="window.archiverMembre('${m.id}')">Archiver</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('btnAjouterMembre').addEventListener('click', () => ouvrirModalMembre());

document.getElementById('btnImportMembres').addEventListener('click', () => ouvrirModalImportMembres());

function ouvrirModalImportMembres() {
  const exemplePreRempli =
    'Jacqueline;jacqueline.h;dams123;Groupe 03\n' +
    'Junior;junior.b;kalou123;Groupe 03\n' +
    'Claire;claire.g;crush123;Groupe 03\n' +
    'Frédéric;frederic.m;moka123;Groupe 03\n' +
    'Johnny;johnny.d;freya123;Groupe 03\n' +
    'Camille;camille.d;pizco123;Groupe 03\n' +
    'Céline;celine.p;charly123;Groupe 03';

  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box" style="max-width:560px;">
        <h3>Import groupé de membres</h3>
        <p style="color:var(--slate); font-size:0.85rem; margin-bottom:12px;">
          Une ligne par membre, format : <strong>NomMaître;identifiant;motDePasse;NomDuGroupe</strong><br>
          Le nom du groupe doit correspondre exactement à un groupe déjà créé (sinon le membre est créé sans groupe).
          Le reste de la fiche (chien, abonnement...) pourra être complété ensuite via "Fiche".
        </p>
        <div class="field">
          <textarea id="im-texte" rows="9" style="resize:vertical; font-family:monospace; font-size:0.85rem;">${exemplePreRempli}</textarea>
        </div>
        <div id="im-resultat" style="font-size:0.85rem; color:var(--slate); white-space:pre-line;"></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="im-save">Importer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;

  document.getElementById('im-save').addEventListener('click', async () => {
    const btn = document.getElementById('im-save');
    btn.disabled = true;
    const resultZone = document.getElementById('im-resultat');
    const lignes = document.getElementById('im-texte').value.split('\n').map(l => l.trim()).filter(l => l);
    let succes = 0, erreurs = [];

    for (const ligne of lignes) {
      const parts = ligne.split(';').map(p => p.trim());
      if (parts.length < 3) { erreurs.push(`Ligne ignorée (format incomplet) : "${ligne}"`); continue; }
      const [nomMaitre, identifiantBrut, mdp, nomGroupe] = parts;
      if (!nomMaitre || !identifiantBrut || !mdp || mdp.length < 6) {
        erreurs.push(`Ligne ignorée (identifiant/mot de passe invalide, 6 caractères min.) : "${ligne}"`);
        continue;
      }
      const identifiant = identifiantBrut.charAt(0).toUpperCase() + identifiantBrut.slice(1);
      const groupe = nomGroupe ? currentGroupes.find(g => g.nom.toLowerCase() === nomGroupe.toLowerCase()) : null;

      resultZone.textContent = `Import en cours... (${succes + erreurs.length + 1}/${lignes.length})`;

      const email = identifiantVersEmail(identifiant);
      const secondaryApp = initializeApp(auth.app.options, 'import-' + Date.now() + '-' + Math.random());
      const secondaryAuth = getAuthSecondary(secondaryApp);
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, mdp);
        await setDoc(doc(db, 'membres', cred.user.uid), {
          nomMaitre, identifiant, motDePasseInitial: mdp, role: 'membre', archive: false,
          gsm: '', dateAnniversaire: '',
          chiens: [],
          groupeId: groupe ? groupe.id : null,
          coursRestants: 11, abonnementPaye: false, cotisationPayee: false,
          dateInscription: serverTimestamp()
        });
        await signOutSecondary(secondaryAuth);
        succes++;
      } catch (e) {
        erreurs.push(`"${nomMaitre}" (${identifiant}) : ${e.code === 'auth/email-already-in-use' ? 'identifiant déjà utilisé' : e.message}`);
      }
    }

    resultZone.textContent = `${succes} membre(s) importé(s) avec succès.` + (erreurs.length ? '\n' + erreurs.join('\n') : '');
    btn.disabled = false;
    chargerMembres().then(() => { chargerConversations(); chargerAnniversaires(); chargerCotisationsARenouveler(); chargerAbonnementsARenouveler(); chargerVaccinsARappeler(); });
  });
}

window.editerMembre = (id) => {
  const m = currentMembres.find(x => x.id === id);
  ouvrirModalMembre(m);
};

window.archiverMembre = async (id) => {
  if (!confirm('Archiver ce membre ? Il ne pourra plus se connecter mais ses données seront conservées.')) return;
  await updateDoc(doc(db, 'membres', id), { archive: true });
  chargerMembres().then(() => { chargerConversations(); chargerAnniversaires(); chargerCotisationsARenouveler(); chargerAbonnementsARenouveler(); chargerVaccinsARappeler(); });
};

function optionsMarqueVaccin(valeurActuelle) {
  return ['', 'Eurican', 'Versican', 'Nobivac', 'Autres'].map(m =>
    `<option value="${m}" ${valeurActuelle === m ? 'selected' : ''}>${m || '—'}</option>`
  ).join('');
}

function ouvrirModalMembre(membre) {
  const isEdit = !!membre;
  const rc = membre?.assuranceRC || {};
  const chiens = (membre?.chiens || []).filter(c => !c.archive);
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box" style="max-width:560px;">
        <h3>${isEdit ? 'Fiche membre' : 'Ajouter un membre'}</h3>
        ${!isEdit ? `
        <div class="form-grid">
          <div class="field"><label>Identifiant</label><input id="mm-identifiant" placeholder="ex: Sarah.m"></div>
          <div class="field"><label>Mot de passe initial</label><input id="mm-mdp" placeholder="min. 6 caractères"></div>
        </div>` : `
        <div class="form-grid">
          <div class="field"><label>Identifiant</label><input value="${escapeAttr(membre.identifiant||'')}" disabled style="background:var(--paper-warm);"></div>
          <div class="field"><label>Mot de passe (pour référence)</label><input id="mm-mdpRef" value="${escapeAttr(membre.motDePasseInitial||'')}" placeholder="renseigne-le si tu le connais"></div>
        </div>`}

        <h3 style="margin-top:18px;">Coordonnées</h3>
        <div class="field"><label>Nom du maître</label><input id="mm-nomMaitre" value="${isEdit ? escapeAttr(membre.nomMaitre) : ''}"></div>
        <div class="form-grid">
          <div class="field"><label>GSM</label><input id="mm-gsm" value="${isEdit ? escapeAttr(membre.gsm||'') : ''}" placeholder="ex: 0032 4XX XX XX XX"></div>
          <div class="field"><label>E-mail</label><input type="email" id="mm-email" value="${isEdit ? escapeAttr(membre.email||'') : ''}" placeholder="ex: nom@exemple.be"></div>
        </div>
        <div class="field"><label>Adresse postale</label><input id="mm-adresse" value="${isEdit ? escapeAttr(membre.adressePostale||'') : ''}" placeholder="rue, numéro, code postal, ville"></div>
        <div class="field"><label>Date d'anniversaire</label><input type="date" id="mm-anniversaire" value="${isEdit ? (membre.dateAnniversaire||'') : ''}"></div>

        <h3 style="margin-top:18px;">Assurance RC familiale</h3>
        <div class="form-grid">
          <div class="field"><label>Compagnie</label><input id="mm-rcCompagnie" value="${escapeAttr(rc.compagnie||'')}"></div>
          <div class="field"><label>N° de police</label><input id="mm-rcNumero" value="${escapeAttr(rc.numeroPolice||'')}"></div>
          <div class="field"><label>Échéance (mois/année)</label><input type="month" id="mm-rcEcheance" value="${rc.dateEcheance||''}"></div>
        </div>

        <h3 style="margin-top:18px;">Chien(s)</h3>
        <div id="mm-listeChiens">
          ${isEdit ? renderListeChiensAdmin(membre) : '<p style="color:var(--slate); font-size:0.85rem;">Enregistre d\'abord le membre, tu pourras ajouter son/ses chien(s) juste après.</p>'}
        </div>
        ${isEdit ? `<button class="btn-sm" type="button" onclick="window.ouvrirModalChien('${membre.id}', null)">+ Ajouter un chien</button>` : ''}

        <h3 style="margin-top:18px;">Groupe &amp; abonnement</h3>
        <div class="field"><label>Groupe par défaut</label><select id="mm-groupe"></select></div>
        <div class="form-grid">
          <div class="field"><label>Cours restants (abonnement)</label><input type="number" id="mm-coursRestants" value="${isEdit ? (membre.coursRestants ?? 11) : 11}"></div>
          <div class="field"><label>Abonnement payé</label>
            <select id="mm-aboPaye">
              <option value="oui" ${isEdit && membre.abonnementPaye ? 'selected':''}>Oui</option>
              <option value="non" ${isEdit && !membre.abonnementPaye ? 'selected':''}>Non</option>
            </select>
          </div>
        </div>

        <h3 style="margin-top:18px;">Cotisation annuelle du club</h3>
        <div class="form-grid">
          <div class="field"><label>Date d'échéance</label><input type="date" id="mm-cotisEcheance" value="${membre?.cotisationDateEcheance||''}"></div>
          <div class="field"><label>Payée</label>
            <select id="mm-cotisPaye">
              <option value="oui" ${isEdit && membre.cotisationPayee ? 'selected':''}>Oui</option>
              <option value="non" ${isEdit && !membre.cotisationPayee ? 'selected':''}>Non</option>
            </select>
          </div>
        </div>
        ${isEdit && membre.cotisationRenouvellement ? `<p style="font-size:0.85rem; color:var(--slate);">Réponse du membre au renouvellement : <strong>${membre.cotisationRenouvellement === 'oui' ? 'Oui, elle/il souhaite renouveler' : 'Non, elle/il ne souhaite pas renouveler'}</strong></p>` : ''}

        ${isEdit ? `
        <h3 style="margin-top:18px;">Paiements</h3>
        <button class="btn-sm" type="button" onclick="window.ouvrirModalPaiement('${membre.id}')">+ Enregistrer un paiement</button>
        <div id="mm-historiquePaiements" style="margin-top:10px;"><div class="empty-state">Chargement...</div></div>
        ` : ''}

        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="mm-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  remplirSelectGroupes();
  if (isEdit && membre.groupeId) document.getElementById('mm-groupe').value = membre.groupeId;
  if (isEdit) chargerHistoriquePaiements(membre.id);

  document.getElementById('mm-save').addEventListener('click', async () => {
    const btnSave = document.getElementById('mm-save');
    btnSave.disabled = true;
    btnSave.textContent = 'Enregistrement...';

    const data = {
      nomMaitre: document.getElementById('mm-nomMaitre').value.trim(),
      gsm: document.getElementById('mm-gsm').value.trim(),
      email: document.getElementById('mm-email').value.trim(),
      adressePostale: document.getElementById('mm-adresse').value.trim(),
      dateAnniversaire: document.getElementById('mm-anniversaire').value,
      assuranceRC: {
        compagnie: document.getElementById('mm-rcCompagnie').value.trim(),
        numeroPolice: document.getElementById('mm-rcNumero').value.trim(),
        dateEcheance: document.getElementById('mm-rcEcheance').value
      },
      groupeId: document.getElementById('mm-groupe').value || null,
      coursRestants: parseInt(document.getElementById('mm-coursRestants').value, 10) || 0,
      abonnementPaye: document.getElementById('mm-aboPaye').value === 'oui',
      cotisationPayee: document.getElementById('mm-cotisPaye').value === 'oui',
      cotisationDateEcheance: document.getElementById('mm-cotisEcheance').value
    };
    if (isEdit) {
      data.motDePasseInitial = document.getElementById('mm-mdpRef').value.trim();
    }
    if (!data.nomMaitre) { alert('Merci d\'indiquer le nom du maître.'); btnSave.disabled = false; btnSave.textContent = 'Enregistrer'; return; }

    if (isEdit) {
      await updateDoc(doc(db, 'membres', membre.id), data);
      window.fermerModal();
      chargerMembres().then(() => { chargerConversations(); chargerAnniversaires(); chargerCotisationsARenouveler(); chargerAbonnementsARenouveler(); chargerVaccinsARappeler(); });
    } else {
      let identifiant = document.getElementById('mm-identifiant').value.trim();
      const mdp = document.getElementById('mm-mdp').value;
      if (!identifiant || !mdp || mdp.length < 6) {
        alert('Identifiant et mot de passe (6 caractères min.) obligatoires.');
        return;
      }
      identifiant = identifiant.charAt(0).toUpperCase() + identifiant.slice(1);
      const email = identifiantVersEmail(identifiant);

      // Création via une instance Firebase secondaire pour ne pas
      // déconnecter la session admin en cours.
      const secondaryApp = initializeApp(auth.app.options, 'secondaire-' + Date.now());
      const secondaryAuth = getAuthSecondary(secondaryApp);
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, mdp);
        await setDoc(doc(db, 'membres', cred.user.uid), {
          ...data,
          chiens: [],
          identifiant,
          motDePasseInitial: mdp,
          role: 'membre',
          archive: false,
          dateInscription: serverTimestamp()
        });
        await signOutSecondary(secondaryAuth);
        window.fermerModal();
        chargerMembres().then(() => { chargerConversations(); chargerAnniversaires(); chargerCotisationsARenouveler(); chargerAbonnementsARenouveler(); chargerVaccinsARappeler(); });
      } catch (err) {
        alert("Impossible de créer ce membre : " + (err.code === 'auth/email-already-in-use' ? 'cet identifiant existe déjà.' : err.message));
        btnSave.disabled = false;
        btnSave.textContent = 'Enregistrer';
      }
    }
  });
}

// ==========================================================================
// CHIENS (tableau chiens[] sur le membre — plusieurs chiens possibles,
// avec archivage individuel, ex: décès puis nouveau chien)
// ==========================================================================
function renderListeChiensAdmin(membre) {
  const chiens = (membre.chiens || []).filter(c => !c.archive);
  if (chiens.length === 0) return '<p style="color:var(--slate); font-size:0.85rem;">Aucun chien enregistré pour l\'instant.</p>';
  return chiens.map(c => `
    <div class="dog-card">
      <div class="dog-card-head">
        <div>
          <div class="dog-title">${escapeHtml(c.nom || 'Sans nom')} ${c.race ? '— ' + escapeHtml(c.race) : ''}</div>
          <div class="dog-sub">${c.pedigree ? 'Pedigree · ' : ''}${c.puce ? 'Puce ' + escapeHtml(c.puce) : 'Puce non renseignée'}</div>
        </div>
        <div class="data-actions">
          <button class="btn-sm" type="button" onclick="window.ouvrirModalChien('${membre.id}', '${c.id}')">Modifier</button>
          <button class="btn-sm danger" type="button" onclick="window.archiverChien('${membre.id}', '${c.id}')">Archiver</button>
        </div>
      </div>
    </div>`).join('');
}

window.ouvrirModalChien = (membreId, chienId) => {
  const membre = currentMembres.find(m => m.id === membreId);
  const chien = chienId ? (membre.chiens || []).find(c => c.id === chienId) : null;
  const v = chien?.vaccins || {};

  const html = `
    <div class="modal-overlay" id="modalOverlayChien">
      <div class="modal-box" style="max-width:520px;">
        <h3>${chien ? 'Modifier le chien' : 'Ajouter un chien'}</h3>
        <div class="form-grid">
          <div class="field"><label>Nom du chien</label><input id="mc-nom" value="${chien ? escapeAttr(chien.nom||'') : ''}"></div>
          <div class="field"><label>Race</label><input id="mc-race" value="${chien ? escapeAttr(chien.race||'') : ''}"></div>
          <div class="field"><label>Date de naissance</label><input type="date" id="mc-naissance" value="${chien ? (chien.naissance||'') : ''}"></div>
          <div class="field"><label>Sexe</label>
            <select id="mc-sexe">
              <option value="male" ${chien?.sexe==='male' ? 'selected':''}>Mâle</option>
              <option value="femelle" ${chien?.sexe==='femelle' ? 'selected':''}>Femelle</option>
            </select>
          </div>
          <div class="field"><label>Castré / Stérilisée</label>
            <select id="mc-sterilise">
              <option value="non" ${!chien?.sterilise ? 'selected':''}>Non</option>
              <option value="oui" ${chien?.sterilise ? 'selected':''}>Oui</option>
            </select>
          </div>
          <div class="field"><label>Date (si oui)</label><input type="date" id="mc-dateSterilisation" value="${chien ? (chien.dateSterilisation||'') : ''}"></div>
          <div class="field"><label>N° de puce</label><input id="mc-puce" value="${chien ? escapeAttr(chien.puce||'') : ''}"></div>
          <div class="field"><label>N° de passeport</label><input id="mc-passeport" value="${chien ? escapeAttr(chien.passeport||'') : ''}"></div>
          <div class="field"><label>Pedigree</label>
            <select id="mc-pedigree">
              <option value="non" ${!chien?.pedigree ? 'selected':''}>Non</option>
              <option value="oui" ${chien?.pedigree ? 'selected':''}>Oui</option>
            </select>
          </div>
        </div>

        <h3 style="margin-top:16px;">Vaccins</h3>
        <div class="form-grid">
          <div class="field"><label>Leptospirose — marque</label><select id="mc-vaxLepto-marque">${optionsMarqueVaccin(v.leptospirose?.marque)}</select></div>
          <div class="field"><label>Leptospirose — date</label><input type="date" id="mc-vaxLepto-date" value="${v.leptospirose?.date||''}"></div>
          <div class="field"><label>Parvovirose — marque</label><select id="mc-vaxParvo-marque">${optionsMarqueVaccin(v.parvovirose?.marque)}</select></div>
          <div class="field"><label>Parvovirose — date</label><input type="date" id="mc-vaxParvo-date" value="${v.parvovirose?.date||''}"></div>
          <div class="field"><label>Toux du chenil — marque</label><select id="mc-vaxToux-marque">${optionsMarqueVaccin(v.touxChenils?.marque)}</select></div>
          <div class="field"><label>Toux du chenil — date</label><input type="date" id="mc-vaxToux-date" value="${v.touxChenils?.date||''}"></div>
          <div class="field"><label>Rage — date</label><input type="date" id="mc-vaxRage-date" value="${v.rage?.date||''}"></div>
        </div>

        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="document.getElementById('modalOverlayChien').remove()">Annuler</button>
          <button class="btn-sm primary" type="button" id="mc-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('mc-save').addEventListener('click', async () => {
    const nouveauChien = {
      id: chien ? chien.id : 'chien-' + Date.now(),
      nom: document.getElementById('mc-nom').value.trim(),
      race: document.getElementById('mc-race').value.trim(),
      naissance: document.getElementById('mc-naissance').value,
      sexe: document.getElementById('mc-sexe').value,
      sterilise: document.getElementById('mc-sterilise').value === 'oui',
      dateSterilisation: document.getElementById('mc-dateSterilisation').value,
      puce: document.getElementById('mc-puce').value.trim(),
      passeport: document.getElementById('mc-passeport').value.trim(),
      pedigree: document.getElementById('mc-pedigree').value === 'oui',
      archive: false,
      vaccins: {
        leptospirose: { marque: document.getElementById('mc-vaxLepto-marque').value, date: document.getElementById('mc-vaxLepto-date').value },
        parvovirose: { marque: document.getElementById('mc-vaxParvo-marque').value, date: document.getElementById('mc-vaxParvo-date').value },
        touxChenils: { marque: document.getElementById('mc-vaxToux-marque').value, date: document.getElementById('mc-vaxToux-date').value },
        rage: { date: document.getElementById('mc-vaxRage-date').value }
      }
    };
    if (!nouveauChien.nom) { alert('Merci d\'indiquer le nom du chien.'); return; }

    const chiensActuels = membre.chiens || [];
    const nouveauxChiens = chien
      ? chiensActuels.map(c => c.id === chien.id ? nouveauChien : c)
      : [...chiensActuels, nouveauChien];

    await updateDoc(doc(db, 'membres', membreId), { chiens: nouveauxChiens });
    membre.chiens = nouveauxChiens;
    document.getElementById('modalOverlayChien').remove();
    ouvrirModalMembre(membre);
  });
};

window.archiverChien = async (membreId, chienId) => {
  if (!confirm('Archiver ce chien ? (par ex. en cas de décès) Ses données seront conservées mais il n\'apparaîtra plus comme actif.')) return;
  const membre = currentMembres.find(m => m.id === membreId);
  const nouveauxChiens = (membre.chiens || []).map(c => c.id === chienId ? { ...c, archive: true } : c);
  await updateDoc(doc(db, 'membres', membreId), { chiens: nouveauxChiens });
  membre.chiens = nouveauxChiens;
  ouvrirModalMembre(membre);
};

// ==========================================================================
// PAIEMENTS — historique par membre, enregistrement manuel par l'admin
// ==========================================================================
async function chargerHistoriquePaiements(membreId) {
  const zone = document.getElementById('mm-historiquePaiements');
  if (!zone) return;
  const snap = await getDocs(query(collection(db, 'paiements'), where('membreId', '==', membreId)));
  const paiements = [];
  snap.forEach(d => paiements.push({ id: d.id, ...d.data() }));
  paiements.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (paiements.length === 0) {
    zone.innerHTML = '<div class="empty-state">Aucun paiement enregistré.</div>';
    return;
  }
  zone.innerHTML = paiements.map(p => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(p.type)} — ${Number(p.montant).toFixed(2)} € TTC</div>
        <div class="data-sub">${p.date || ''}${p.note ? ' · ' + escapeHtml(p.note) : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm danger" onclick="window.supprimerPaiement('${p.id}', '${membreId}')">Supprimer</button>
      </div>
    </div>`).join('');
}

window.ouvrirModalPaiement = (membreId) => {
  const html = `
    <div class="modal-overlay" id="modalOverlayPaiement">
      <div class="modal-box">
        <h3>Enregistrer un paiement</h3>
        <div class="field"><label>Type</label>
          <select id="pay-type">
            <option value="Cotisation">Cotisation</option>
            <option value="Abonnement">Abonnement</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
        <div class="form-grid">
          <div class="field"><label>Montant (€ TTC)</label><input type="number" step="0.01" id="pay-montant"></div>
          <div class="field"><label>Date</label><input type="date" id="pay-date" value="${new Date().toISOString().slice(0,10)}"></div>
        </div>
        <div class="field"><label>Note (optionnel)</label><input id="pay-note" placeholder="ex: viré le 12/03"></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="document.getElementById('modalOverlayPaiement').remove()">Annuler</button>
          <button class="btn-sm primary" type="button" id="pay-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('pay-save').addEventListener('click', async () => {
    const montant = parseFloat(document.getElementById('pay-montant').value);
    if (isNaN(montant)) { alert('Merci d\'indiquer un montant.'); return; }
    await addDoc(collection(db, 'paiements'), {
      membreId,
      type: document.getElementById('pay-type').value,
      montant,
      date: document.getElementById('pay-date').value,
      note: document.getElementById('pay-note').value.trim(),
      createdAt: serverTimestamp()
    });
    document.getElementById('modalOverlayPaiement').remove();
    chargerHistoriquePaiements(membreId);
  });
};

window.supprimerPaiement = async (paiementId, membreId) => {
  if (!confirm('Supprimer ce paiement de l\'historique ?')) return;
  await deleteDoc(doc(db, 'paiements', paiementId));
  chargerHistoriquePaiements(membreId);
};

// ==========================================================================
// CE SOIR — cours du jour, météo, maintien / annulation
// ==========================================================================
async function chargerCeSoir() {
  const wrap = document.getElementById('listeCeSoir');
  try {

  // Construit la liste des occurrences de cours sur les 7 prochains jours
  // (aujourd'hui inclus), en fonction du jour récurrent de chaque groupe.
  const occurrences = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const jour = JOURS[d.getDay()];
    const dateISO = d.toISOString().slice(0, 10);
    currentGroupes.filter(g => g.jour === jour).forEach(g => occurrences.push({ date: d, dateISO, groupe: g }));
  }

  if (occurrences.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun cours prévu cette semaine.</div>';
    return;
  }

  const annulSnap = await getDocs(collection(db, 'annulations'));
  const annulations = {};
  annulSnap.forEach(d => { annulations[d.id] = d.data(); });

  const presSnap = await getDocs(collection(db, 'presences'));
  const presencesParCle = {};
  presSnap.forEach(d => {
    const p = d.data();
    const cle = `${p.groupeId}_${p.dateISO}`;
    if (!presencesParCle[cle]) presencesParCle[cle] = { present: 0, absent: 0 };
    presencesParCle[cle][p.statut === 'present' ? 'present' : 'absent']++;
  });

  const MIN_PARTICIPANTS = 4;
  const aujourdhuiISO = new Date().toISOString().slice(0, 10);

  const lignes = await Promise.all(occurrences.map(async ({ date, dateISO, groupe: g }) => {
    const cle = `${g.id}_${dateISO}`;
    const annule = annulations[cle];
    const nbMembres = currentMembres.filter(m => m.groupeId === g.id).length;
    const presencesJour = presencesParCle[cle] || { present: 0, absent: 0 };
    const pasAssez = !annule && presencesJour.present < MIN_PARTICIPANTS;
    let m = null;
    try { m = await meteoPour(dateISO, g.heureDebut); } catch (e) { m = null; }
    const alerte = alerteMeteo(m);
    const dateLabel = date.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    const estAujourdhui = dateISO === aujourdhuiISO;

    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${estAujourdhui ? "Ce soir — " : ""}${capitalize(dateLabel)} — ${escapeHtml(g.nom)} (${g.heureDebut}–${g.heureFin})</div>
        <div class="data-sub">
          ${nbMembres} chiens inscrits · <strong>${presencesJour.present}</strong> confirmé(s) présent(s)${presencesJour.absent ? `, ${presencesJour.absent} absent(s)` : ''}
          ${annule ? `<span class="badge badge-danger">Annulé — ${escapeHtml(annule.motif)}</span>` : `<span class="badge badge-ok">Maintenu</span>`}
          ${m ? `<span class="badge badge-neutral">${iconeCode(m.code)} ${m.temperature}°C · pluie ${m.pluie}%</span>` : ''}
        </div>
        ${alerte && !annule ? `<div class="banner-alert" style="margin-top:8px; padding:8px 12px; ${alerte.niveau==='danger' ? 'background:#FBEAEA;border-color:#E3B4B4;color:#8A2E2E;' : ''}">⚠️ ${alerte.texte} — pense à vérifier si le cours doit être maintenu.</div>` : ''}
        ${pasAssez ? `<div class="banner-alert" style="margin-top:8px; padding:8px 12px; background:#FBEAEA;border-color:#E3B4B4;color:#8A2E2E;">⚠️ Seulement ${presencesJour.present} confirmation(s) sur les ${MIN_PARTICIPANTS} minimum requises — le cours devra être annulé faute de participants si ça n'évolue pas.</div>` : ''}
      </div>
      <div class="data-actions">
        ${annule
          ? `<button class="btn-sm" onclick="window.reactiverCours('${g.id}','${dateISO}')">Réactiver</button>`
          : `<button class="btn-sm danger" onclick="window.annulerCours('${g.id}','${dateISO}')">Annuler ce cours</button>`}
      </div>
    </div>`;
  }));

  wrap.innerHTML = lignes.join('');

  } catch (err) {
    wrap.innerHTML = `<div class="banner-alert" style="background:#FBEAEA; border-color:#E3B4B4; color:#8A2E2E;">Erreur : ${escapeHtml(err.code || '')} — ${escapeHtml(err.message || String(err))}</div>`;
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

window.annulerCours = async (groupeId, dateISO) => {
  const motif = prompt('Motif de l\'annulation (pluie / chaleur / pas assez de participants) :');
  if (!motif) return;
  await setDoc(doc(db, 'annulations', `${groupeId}_${dateISO}`), {
    motif, annulePar: 'admin', dateAnnulation: serverTimestamp()
  });
  chargerCeSoir();
};

window.reactiverCours = async (groupeId, dateISO) => {
  await deleteDoc(doc(db, 'annulations', `${groupeId}_${dateISO}`));
  chargerCeSoir();
};

// ---------- Utils ----------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ==========================================================================
// SERVICES (remplace l'ancien "Tarifs" — catégories libres, prix ou texte)
// ==========================================================================
const SERVICES_PAR_DEFAUT = [
  { categorie: 'Éducation canine', nom: 'Cours collectif', prix: 70, prixTexte: '', unite: 'les 11 cours (10 + 1 gratuit)', conditions: '', prixFutur: null, dateFutur: '' },
  { categorie: 'Éducation canine', nom: 'Cours individuel', prix: 8, prixTexte: '', unite: 'par cours', conditions: '', prixFutur: null, dateFutur: '' },
  { categorie: 'Éducation canine', nom: 'Cotisation annuelle', prix: 70, prixTexte: '', unite: 'par an', conditions: '', prixFutur: 75, dateFutur: '2027-01-01' },
  { categorie: 'Éducation canine', nom: 'Séance de comportement individuelle', prix: 60, prixTexte: '', unite: 'par heure', conditions: '', prixFutur: null, dateFutur: '' },
  { categorie: 'Pension canine', nom: 'Pension canine', prix: 22, prixTexte: '', unite: 'par jour', conditions: "Sous réserve d'acceptation par Katia. Le chien doit obligatoirement être castré ou stérilisé. Arrivée à partir de 14h, départ avant 12h.", prixFutur: null, dateFutur: '' },
  { categorie: 'Toilettage', nom: 'Toilettage pendant la pension', prix: null, prixTexte: 'Sur devis', unite: '', conditions: '', prixFutur: null, dateFutur: '' },
  { categorie: 'Toilettage', nom: 'Toilettage à la demande', prix: null, prixTexte: '40 à 60 €', unite: 'tarif sur devis', conditions: '', prixFutur: null, dateFutur: '' }
];

let currentServices = [];

async function chargerServices() {
  const snap = await getDocs(collection(db, 'services'));
  currentServices = [];
  snap.forEach(d => currentServices.push({ id: d.id, ...d.data() }));
  renderServicesAdmin();
}

function libellePrix(s) {
  if (s.prixTexte) return s.prixTexte;
  if (typeof s.prix === 'number') return `${s.prix.toFixed(2)} €${s.unite ? ' — ' + s.unite : ''}`;
  return '—';
}

function renderServicesAdmin() {
  const wrap = document.getElementById('listeServices');
  if (currentServices.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun service pour l\'instant. Clique sur "Initialiser les services par défaut" ou ajoute-les un par un.</div>';
    return;
  }
  const categories = [...new Set(currentServices.map(s => s.categorie || 'Autres'))];
  wrap.innerHTML = categories.map(cat => `
    <h3 style="margin-top:18px;">${escapeHtml(cat)}</h3>
    <div class="data-list">
      ${currentServices.filter(s => (s.categorie || 'Autres') === cat).map(s => `
        <div class="data-row">
          <div class="data-main">
            <div class="data-title">${escapeHtml(s.nom)}</div>
            <div class="data-sub">${libellePrix(s)}${s.prixFutur ? ` <span class="badge badge-warn">${Number(s.prixFutur).toFixed(2)} € à partir du ${s.dateFutur}</span>` : ''}</div>
            ${s.conditions ? `<div class="data-sub">${escapeHtml(s.conditions)}</div>` : ''}
          </div>
          <div class="data-actions">
            <button class="btn-sm" onclick="window.editerService('${s.id}')">Modifier</button>
            <button class="btn-sm danger" onclick="window.supprimerService('${s.id}')">Supprimer</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

document.getElementById('btnAjouterService').addEventListener('click', () => ouvrirModalService());

window.editerService = (id) => {
  const s = currentServices.find(x => x.id === id);
  ouvrirModalService(s);
};

window.supprimerService = async (id) => {
  if (!confirm('Supprimer ce service ?')) return;
  await deleteDoc(doc(db, 'services', id));
  chargerServices();
};

function ouvrirModalService(service) {
  const isEdit = !!service;
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>${isEdit ? 'Modifier le service' : 'Ajouter un service'}</h3>
        <div class="form-grid">
          <div class="field"><label>Catégorie</label><input id="sv-categorie" value="${isEdit ? escapeAttr(service.categorie||'') : ''}" placeholder="ex: Éducation canine, Pension canine, Toilettage" list="sv-categories-list"></div>
          <datalist id="sv-categories-list">
            ${[...new Set(currentServices.map(s => s.categorie))].map(c => `<option value="${escapeAttr(c)}">`).join('')}
          </datalist>
          <div class="field"><label>Nom du service</label><input id="sv-nom" value="${isEdit ? escapeAttr(service.nom||'') : ''}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Prix TTC (€, laisser vide si "sur devis")</label><input type="number" step="0.01" id="sv-prix" value="${isEdit && service.prix != null ? service.prix : ''}"></div>
          <div class="field"><label>Ou texte libre (ex: "40 à 60 €")</label><input id="sv-prixTexte" value="${isEdit ? escapeAttr(service.prixTexte||'') : ''}"></div>
        </div>
        <div class="field"><label>Unité / précision (ex: "par jour", "par heure")</label><input id="sv-unite" value="${isEdit ? escapeAttr(service.unite||'') : ''}"></div>
        <div class="field"><label>Conditions particulières (optionnel)</label><textarea id="sv-conditions" rows="2" style="resize:vertical;">${isEdit ? escapeHtml(service.conditions||'') : ''}</textarea></div>
        <div class="form-grid">
          <div class="field"><label>Prix futur (optionnel)</label><input type="number" step="0.01" id="sv-prixFutur" value="${isEdit && service.prixFutur != null ? service.prixFutur : ''}"></div>
          <div class="field"><label>À partir du</label><input type="date" id="sv-dateFutur" value="${isEdit ? (service.dateFutur||'') : ''}"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="sv-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('sv-save').addEventListener('click', async () => {
    const nom = document.getElementById('sv-nom').value.trim();
    const categorie = document.getElementById('sv-categorie').value.trim();
    if (!nom || !categorie) { alert('Merci d\'indiquer une catégorie et un nom.'); return; }
    const prixVal = document.getElementById('sv-prix').value;
    const prixFuturVal = document.getElementById('sv-prixFutur').value;
    const data = {
      categorie, nom,
      prix: prixVal === '' ? null : parseFloat(prixVal),
      prixTexte: document.getElementById('sv-prixTexte').value.trim(),
      unite: document.getElementById('sv-unite').value.trim(),
      conditions: document.getElementById('sv-conditions').value.trim(),
      prixFutur: prixFuturVal === '' ? null : parseFloat(prixFuturVal),
      dateFutur: document.getElementById('sv-dateFutur').value
    };
    if (isEdit) {
      await updateDoc(doc(db, 'services', service.id), data);
    } else {
      await addDoc(collection(db, 'services'), data);
    }
    window.fermerModal();
    chargerServices();
  });
}

document.getElementById('btnInitServices').addEventListener('click', async () => {
  if (currentServices.length > 0 && !confirm('Des services existent déjà. Ajouter quand même les services par défaut (sans toucher aux existants) ?')) return;
  try {
    for (const s of SERVICES_PAR_DEFAUT) {
      await addDoc(collection(db, 'services'), s);
    }
    chargerServices();
  } catch (err) {
    alert('Erreur lors de la création des services : ' + (err.code || '') + ' — ' + (err.message || err));
  }
});

// ==========================================================================
// RDV — destinataires ciblés, prix par personne, suivi de paiement
// ==========================================================================

async function chargerIban() {
  const paramDoc = await getDoc(doc(db, 'parametres', 'bancaire'));
  document.getElementById('rdv-iban').value = paramDoc.exists() ? (paramDoc.data().iban || '') : '';
}

document.getElementById('btnSauverIban').addEventListener('click', async () => {
  await setDoc(doc(db, 'parametres', 'bancaire'), { iban: document.getElementById('rdv-iban').value.trim() });
  alert('IBAN enregistré.');
});

function libelleDestinataires(rdv) {
  if (!rdv.destinataires || rdv.destinataires.type === 'tous') return 'Tous les membres';
  if (rdv.destinataires.type === 'groupe') {
    const g = currentGroupes.find(g => g.id === rdv.destinataires.groupeId);
    return 'Groupe : ' + (g ? g.nom : '—');
  }
  const noms = (rdv.destinataires.membreIds || []).map(id => currentMembres.find(m => m.id === id)?.nomMaitre).filter(Boolean);
  return 'Membres : ' + (noms.join(', ') || '—');
}

async function chargerRdv() {
  await chargerIban();
  const snap = await getDocs(collection(db, 'rdv'));
  const rdvs = [];
  snap.forEach(d => rdvs.push({ id: d.id, ...d.data() }));
  rdvs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const wrap = document.getElementById('listeRdv');
  if (rdvs.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun RDV créé pour l\'instant.</div>';
    return;
  }

  const reponsesSnap = await getDocs(collection(db, 'rdv_reponses'));
  const reponsesParRdv = {};
  reponsesSnap.forEach(d => {
    const r = d.data();
    if (!reponsesParRdv[r.rdvId]) reponsesParRdv[r.rdvId] = [];
    reponsesParRdv[r.rdvId].push({ id: d.id, ...r });
  });

  wrap.innerHTML = rdvs.map(rdv => {
    const reponses = reponsesParRdv[rdv.id] || [];
    const presents = reponses.filter(r => r.statut === 'present');
    const totalPersonnes = presents.reduce((s, r) => s + (r.nombrePersonnes || 1), 0);
    const totalDu = presents.reduce((s, r) => s + (r.montant || 0), 0);
    const payes = presents.filter(r => r.paye).length;
    const valides = presents.filter(r => r.paiementValide).length;
    const dateLabel = rdv.date ? new Date(rdv.date + 'T00:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    const detailPresents = presents.map(r => {
      const m = currentMembres.find(mm => mm.id === r.uid);
      return `
      <div class="data-row">
        <div class="data-main">
          <div class="data-title">${escapeHtml(m?.nomMaitre || '?')} ${r.nombrePersonnes > 1 ? `(${r.nombrePersonnes} pers.)` : ''}</div>
          <div class="data-sub">
            ${rdv.prixParPersonne ? `${Number(r.montant||0).toFixed(2)} € dû` : ''}
            ${r.paye ? '<span class="badge badge-ok">A indiqué avoir payé</span>' : '<span class="badge badge-neutral">Pas encore payé</span>'}
            ${r.paiementValide ? '<span class="badge badge-ok">Paiement validé</span>' : ''}
          </div>
        </div>
        <div class="data-actions">
          ${!r.paiementValide ? `<button class="btn-sm primary" onclick="window.validerPaiementRdv('${r.id}', '${rdv.id}')">Valider le paiement</button>` : ''}
        </div>
      </div>`;
    }).join('');

    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(rdv.titre)}</div>
        <div class="data-sub">${dateLabel} ${rdv.heure || ''} · ${escapeHtml(rdv.lieu || '')} · ${escapeHtml(rdv.modalite || '')}</div>
        <div class="data-sub">${escapeHtml(libelleDestinataires(rdv))}${rdv.prixParPersonne ? ` · ${Number(rdv.prixParPersonne).toFixed(2)} €/pers.` : ''}</div>
        <div class="data-sub">
          <span class="badge badge-ok">${presents.length} réponse(s) présent · ${totalPersonnes} pers.</span>
          ${rdv.prixParPersonne ? `<span class="badge badge-neutral">${totalDu.toFixed(2)} € attendus</span> <span class="badge badge-neutral">${valides}/${presents.length} paiements validés</span>` : ''}
        </div>
        ${presents.length ? `<div style="margin-top:10px;">${detailPresents}</div>` : ''}
      </div>
      <div class="data-actions">
        <button class="btn-sm danger" onclick="window.supprimerRdv('${rdv.id}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('btnAjouterRdv').addEventListener('click', () => {
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>Créer un RDV</h3>
        <div class="field"><label>Titre</label><input id="rd-titre" placeholder="ex: Repas du club"></div>
        <div class="form-grid">
          <div class="field"><label>Date</label><input type="date" id="rd-date"></div>
          <div class="field"><label>Heure</label><input type="time" id="rd-heure"></div>
        </div>
        <div class="field"><label>Lieu</label><input id="rd-lieu"></div>
        <div class="field"><label>Modalité (info libre, optionnel)</label><input id="rd-modalite" placeholder="ex: Chacun ramène un plat"></div>
        <div class="field"><label>Prix par personne (€ TTC, laisser vide si gratuit)</label><input type="number" step="0.01" id="rd-prix"></div>

        <div class="field"><label>Destinataires</label>
          <select id="rd-destinatairesType">
            <option value="tous">Tous les membres</option>
            <option value="groupe">Un groupe</option>
            <option value="individuel">Membres spécifiques</option>
          </select>
        </div>
        <div class="field hidden" id="rd-groupeWrap">
          <label>Groupe</label>
          <select id="rd-groupe">${currentGroupes.map(g => `<option value="${g.id}">${escapeHtml(g.nom)}</option>`).join('')}</select>
        </div>
        <div class="field hidden" id="rd-membresWrap">
          <label>Membres invités</label>
          <div class="membre-check-list">
            ${currentMembres.map(m => `
              <label class="membre-check-row">
                <input type="checkbox" class="rd-membre-check" value="${m.id}">
                <span>${escapeHtml(m.nomMaitre)}</span>
              </label>`).join('')}
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="rd-save">Créer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;

  document.getElementById('rd-destinatairesType').addEventListener('change', (e) => {
    document.getElementById('rd-groupeWrap').classList.toggle('hidden', e.target.value !== 'groupe');
    document.getElementById('rd-membresWrap').classList.toggle('hidden', e.target.value !== 'individuel');
  });

  document.getElementById('rd-save').addEventListener('click', async () => {
    const titre = document.getElementById('rd-titre').value.trim();
    const date = document.getElementById('rd-date').value;
    if (!titre || !date) { alert('Merci de renseigner au moins un titre et une date.'); return; }

    const typeDest = document.getElementById('rd-destinatairesType').value;
    let destinataires = { type: typeDest, groupeId: null, membreIds: [] };
    if (typeDest === 'groupe') destinataires.groupeId = document.getElementById('rd-groupe').value;
    if (typeDest === 'individuel') {
      destinataires.membreIds = [...document.querySelectorAll('.rd-membre-check:checked')].map(c => c.value);
    }

    const prixVal = document.getElementById('rd-prix').value;

    await addDoc(collection(db, 'rdv'), {
      titre, date,
      heure: document.getElementById('rd-heure').value,
      lieu: document.getElementById('rd-lieu').value.trim(),
      modalite: document.getElementById('rd-modalite').value.trim(),
      prixParPersonne: prixVal === '' ? null : parseFloat(prixVal),
      destinataires,
      dateCreation: serverTimestamp()
    });
    window.fermerModal();
    chargerRdv();
  });
});

window.supprimerRdv = async (id) => {
  if (!confirm('Supprimer ce RDV ? Les réponses des membres seront aussi supprimées.')) return;
  await deleteDoc(doc(db, 'rdv', id));
  chargerRdv();
};

window.validerPaiementRdv = async (reponseId, rdvId) => {
  await updateDoc(doc(db, 'rdv_reponses', reponseId), { paiementValide: true });
  chargerRdv();
};

// ==========================================================================
// MESSAGES (chat admin <-> membre)
// ==========================================================================
let conversationOuverte = null;

async function chargerConversations() {
  const snap = await getDocs(collection(db, 'conversations'));
  const convs = {};
  snap.forEach(d => { convs[d.id] = d.data(); });

  const wrap = document.getElementById('listeConversations');
  const membresAvecConv = currentMembres.filter(m => convs[m.id]);
  const autresMembres = currentMembres.filter(m => !convs[m.id]);
  const ordonne = [...membresAvecConv.sort((a, b) => (convs[b.id]?.dateDernierMessage || '').localeCompare(convs[a.id]?.dateDernierMessage || '')), ...autresMembres];

  let unReadTotal = 0;

  if (ordonne.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun membre pour l\'instant.</div>';
  } else {
    wrap.innerHTML = ordonne.map(m => {
      const c = convs[m.id];
      const nonLu = c?.nonLuAdmin;
      if (nonLu) unReadTotal++;
      return `
      <div class="data-row" style="cursor:pointer;" onclick="window.ouvrirConversation('${m.id}')">
        <div class="data-main">
          <div class="data-title">${escapeHtml(m.nomMaitre)} ${nonLu ? '<span class="badge badge-danger">Nouveau</span>' : ''}</div>
          <div class="data-sub">${c?.dernierMessage ? escapeHtml(c.dernierMessage).slice(0, 60) : 'Aucun message pour l\'instant'}</div>
        </div>
        <div class="data-actions"><button class="btn-sm">Ouvrir</button></div>
      </div>`;
    }).join('');
  }

  const tabBtn = document.getElementById('tabMessagesBtn');
  tabBtn.classList.toggle('has-unread', unReadTotal > 0);
}

window.ouvrirConversation = async (uid) => {
  conversationOuverte = uid;
  const membre = currentMembres.find(m => m.id === uid);
  const msgsSnap = await getDocs(collection(db, 'conversations', uid, 'messages'));
  const msgs = [];
  msgsSnap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
  msgs.sort((a, b) => (a.dateEnvoi || '').localeCompare(b.dateEnvoi || ''));

  // Marquer comme lus les messages envoyés par le membre
  await Promise.all(msgs.filter(m => m.expediteur === 'membre' && !m.lu).map(m =>
    updateDoc(doc(db, 'conversations', uid, 'messages', m.id), { lu: true })
  ));
  await setDoc(doc(db, 'conversations', uid), { nonLuAdmin: false }, { merge: true });

  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box" style="max-width:520px;">
        <h3>${escapeHtml(membre?.nomMaitre || '')}</h3>
        <div class="chat-thread" id="chatThread">
          ${msgs.map(m => bulleMessage(m, 'admin')).join('') || '<div class="empty-state">Aucun message.</div>'}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInputAdmin" placeholder="Écrire un message...">
          <button class="btn-sm primary" id="chatSendAdmin">Envoyer</button>
        </div>
        <div class="modal-actions"><button class="btn-sm" onclick="window.fermerModal()">Fermer</button></div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('chatThread').scrollTop = 999999;

  document.getElementById('chatSendAdmin').addEventListener('click', () => envoyerMessageAdmin(uid));
  document.getElementById('chatInputAdmin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') envoyerMessageAdmin(uid);
  });

  chargerConversations();
};

async function envoyerMessageAdmin(uid) {
  const input = document.getElementById('chatInputAdmin');
  const texte = input.value.trim();
  if (!texte) return;
  input.value = '';
  const maintenant = new Date().toISOString();
  await addDoc(collection(db, 'conversations', uid, 'messages'), {
    texte, expediteur: 'admin', dateEnvoi: maintenant, lu: false
  });
  await setDoc(doc(db, 'conversations', uid), {
    dernierMessage: texte, dateDernierMessage: maintenant, nonLuMembre: true
  }, { merge: true });
  window.ouvrirConversation(uid);
}

document.getElementById('btnMessageGroupe').addEventListener('click', () => {
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>Écrire à un groupe ou à tous les membres</h3>
        <div class="field"><label>Destinataires</label>
          <select id="bc-cible">
            <option value="tous">Tous les membres</option>
            ${currentGroupes.map(g => `<option value="${g.id}">${escapeHtml(g.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Message</label><textarea id="bc-texte" rows="4" style="resize:vertical;"></textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="bc-save">Envoyer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('bc-save').addEventListener('click', async () => {
    const cible = document.getElementById('bc-cible').value;
    const texte = document.getElementById('bc-texte').value.trim();
    if (!texte) { alert('Merci d\'écrire un message.'); return; }
    const destinataires = cible === 'tous' ? currentMembres : currentMembres.filter(m => m.groupeId === cible);
    const maintenant = new Date().toISOString();
    await Promise.all(destinataires.map(async (m) => {
      await addDoc(collection(db, 'conversations', m.id, 'messages'), {
        texte, expediteur: 'admin', dateEnvoi: maintenant, lu: false
      });
      await setDoc(doc(db, 'conversations', m.id), {
        dernierMessage: texte, dateDernierMessage: maintenant, nonLuMembre: true
      }, { merge: true });
    }));
    window.fermerModal();
    alert(`Message envoyé à ${destinataires.length} membre(s).`);
    chargerConversations();
  });
});

function bulleMessage(m, pointDeVue) {
  const estMoi = m.expediteur === pointDeVue;
  const heure = m.dateEnvoi ? new Date(m.dateEnvoi).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
  const coche = estMoi ? `<span class="chat-check ${m.lu ? 'lu' : ''}">${m.lu ? '✓✓' : '✓'}</span>` : '';
  return `
    <div class="chat-bubble ${estMoi ? 'moi' : 'autre'}">
      ${escapeHtml(m.texte)}
      <div class="chat-meta">${heure} ${coche}</div>
    </div>`;
}

// ==========================================================================
// BLOG (articles publics)
// ==========================================================================
async function chargerArticles() {
  const snap = await getDocs(collection(db, 'articles'));
  const articles = [];
  snap.forEach(d => articles.push({ id: d.id, ...d.data() }));
  articles.sort((a, b) => (b.datePublication || '').localeCompare(a.datePublication || ''));

  const wrap = document.getElementById('listeArticles');
  if (articles.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun article pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = articles.map(a => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(a.titre)}</div>
        <div class="data-sub">${a.datePublication || ''} · ${escapeHtml((a.contenu || '').slice(0, 80))}${(a.contenu||'').length > 80 ? '…' : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerArticle('${a.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerArticle('${a.id}')">Supprimer</button>
      </div>
    </div>`).join('');
}

document.getElementById('btnAjouterArticle').addEventListener('click', () => ouvrirModalArticle());

window.editerArticle = async (id) => {
  const d = await getDoc(doc(db, 'articles', id));
  ouvrirModalArticle({ id, ...d.data() });
};

window.supprimerArticle = async (id) => {
  if (!confirm('Supprimer cet article ?')) return;
  await deleteDoc(doc(db, 'articles', id));
  chargerArticles();
};

function ouvrirModalArticle(article) {
  const isEdit = !!article;
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box" style="max-width:520px;">
        <h3>${isEdit ? 'Modifier l\'article' : 'Nouvel article'}</h3>
        <div class="field"><label>Titre</label><input id="ar-titre" value="${isEdit ? escapeAttr(article.titre) : ''}"></div>
        <div class="field"><label>Image (URL, optionnel)</label><input id="ar-image" value="${isEdit ? escapeAttr(article.image||'') : ''}" placeholder="https://..."></div>
        <div class="field"><label>Contenu</label><textarea id="ar-contenu" rows="7" style="resize:vertical;">${isEdit ? escapeHtml(article.contenu) : ''}</textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="ar-save">${isEdit ? 'Enregistrer' : 'Publier'}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('ar-save').addEventListener('click', async () => {
    const titre = document.getElementById('ar-titre').value.trim();
    const contenu = document.getElementById('ar-contenu').value.trim();
    if (!titre || !contenu) { alert('Merci de remplir le titre et le contenu.'); return; }
    const data = {
      titre, contenu,
      image: document.getElementById('ar-image').value.trim(),
      datePublication: isEdit ? article.datePublication : new Date().toISOString().slice(0, 10)
    };
    if (isEdit) {
      await updateDoc(doc(db, 'articles', article.id), data);
    } else {
      await addDoc(collection(db, 'articles'), data);
    }
    window.fermerModal();
    chargerArticles();
  });
}

// ==========================================================================
// VIDÉOS D'APPRENTISSAGE
// ==========================================================================
async function chargerVideosAdmin() {
  const snap = await getDocs(collection(db, 'videos'));
  const videos = [];
  snap.forEach(d => videos.push({ id: d.id, ...d.data() }));

  const wrap = document.getElementById('listeVideos');
  if (videos.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune vidéo pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = videos.map(v => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(v.titre)}</div>
        <div class="data-sub">${escapeHtml((v.texte || '').slice(0, 80))}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerVideo('${v.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerVideo('${v.id}')">Supprimer</button>
      </div>
    </div>`).join('');
}

document.getElementById('btnAjouterVideo').addEventListener('click', () => ouvrirModalVideo());

window.editerVideo = async (id) => {
  const d = await getDoc(doc(db, 'videos', id));
  ouvrirModalVideo({ id, ...d.data() });
};

window.supprimerVideo = async (id) => {
  if (!confirm('Supprimer cette vidéo ?')) return;
  await deleteDoc(doc(db, 'videos', id));
  chargerVideosAdmin();
};

function ouvrirModalVideo(video) {
  const isEdit = !!video;
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box" style="max-width:520px;">
        <h3>${isEdit ? 'Modifier la vidéo' : 'Ajouter une vidéo'}</h3>
        <div class="field"><label>Titre (ex: Apprendre "assis")</label><input id="vd-titre" value="${isEdit ? escapeAttr(video.titre) : ''}"></div>
        <div class="field"><label>Lien vidéo (YouTube)</label><input id="vd-url" value="${isEdit ? escapeAttr(video.url||'') : ''}" placeholder="https://www.youtube.com/watch?v=..."></div>
        <div class="field"><label>Texte explicatif</label><textarea id="vd-texte" rows="5" style="resize:vertical;">${isEdit ? escapeHtml(video.texte||'') : ''}</textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="vd-save">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('vd-save').addEventListener('click', async () => {
    const titre = document.getElementById('vd-titre').value.trim();
    const url = document.getElementById('vd-url').value.trim();
    if (!titre || !url) { alert('Merci de remplir le titre et le lien vidéo.'); return; }
    const data = { titre, url, texte: document.getElementById('vd-texte').value.trim() };
    if (isEdit) {
      await updateDoc(doc(db, 'videos', video.id), data);
    } else {
      await addDoc(collection(db, 'videos'), data);
    }
    window.fermerModal();
    chargerVideosAdmin();
  });
}

// ==========================================================================
// ANNIVERSAIRES — rappel des anniversaires proches (7 jours)
// ==========================================================================
async function chargerAnniversaires() {
  const zone = document.getElementById('anniversairesDuJour');
  if (!zone) return;
  const aujourdhui = new Date();
  const dansUneSemaine = new Date();
  dansUneSemaine.setDate(aujourdhui.getDate() + 7);

  const proches = currentMembres.filter(m => {
    if (!m.dateAnniversaire) return false;
    const parts = m.dateAnniversaire.split('-').map(Number);
    const mois = parts[1], jour = parts[2];
    let candidate = new Date(aujourdhui.getFullYear(), mois - 1, jour);
    const debutJourAuj = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
    if (candidate < debutJourAuj) {
      candidate = new Date(aujourdhui.getFullYear() + 1, mois - 1, jour);
    }
    return candidate <= dansUneSemaine;
  });

  if (proches.length === 0) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <div class="banner-alert">
      🎂 Anniversaire${proches.length > 1 ? 's' : ''} à venir : ${proches.map(m => {
        const parts = m.dateAnniversaire.split('-').map(Number);
        return `${escapeHtml(m.nomMaitre)} (${parts[2]}/${parts[1]})`;
      }).join(', ')}
    </div>`;
}

// ==========================================================================
// COTISATIONS — rappel des échéances proches (30 jours) ou dépassées
// ==========================================================================
async function chargerCotisationsARenouveler() {
  const zone = document.getElementById('cotisationsARenouveler');
  if (!zone) return;
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  const dans30Jours = new Date(aujourdhui); dans30Jours.setDate(aujourdhui.getDate() + 30);

  const concernes = currentMembres.filter(m => {
    if (!m.cotisationDateEcheance) return false;
    const echeance = new Date(m.cotisationDateEcheance + 'T00:00:00');
    return echeance <= dans30Jours;
  });

  if (concernes.length === 0) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <div class="banner-alert">
      💳 Cotisation${concernes.length > 1 ? 's' : ''} à renouveler bientôt : ${concernes.map(m => {
        const echeance = new Date(m.cotisationDateEcheance + 'T00:00:00');
        const enRetard = echeance < aujourdhui;
        const reponse = m.cotisationRenouvellement === 'oui' ? ' (a dit oui — facture 70€ TTC possible)'
          : m.cotisationRenouvellement === 'non' ? ' (a dit non)' : ' (pas encore répondu)';
        return `${escapeHtml(m.nomMaitre)}${enRetard ? ' — échue' : ''}${reponse}`;
      }).join(', ')}
    </div>`;
}

// ==========================================================================
// ABONNEMENTS — rappel quand il reste peu de cours
// ==========================================================================
async function chargerAbonnementsARenouveler() {
  const zone = document.getElementById('abonnementsARenouveler');
  if (!zone) return;

  const concernes = currentMembres.filter(m => (m.coursRestants ?? 0) <= 2);
  if (concernes.length === 0) { zone.innerHTML = ''; return; }

  const serviceAbonnement = currentServices.find(s => s.nom === 'Cours collectif') || {};
  const prixAbonnement = typeof serviceAbonnement.prix === 'number' ? serviceAbonnement.prix : 70;

  zone.innerHTML = `
    <div class="banner-alert">
      📚 Abonnement${concernes.length > 1 ? 's' : ''} bientôt épuisé${concernes.length > 1 ? 's' : ''} : ${concernes.map(m => {
        const epuise = (m.coursRestants ?? 0) <= 0;
        const reponse = m.abonnementRenouvellement === 'oui' ? ` (a dit oui — facture ${prixAbonnement.toFixed(2)}€ TTC pour 11 cours possible)`
          : m.abonnementRenouvellement === 'non' ? ' (a dit non)' : ' (pas encore répondu)';
        return `${escapeHtml(m.nomMaitre)} — ${m.coursRestants ?? 0} cours restant(s)${epuise ? ', épuisé' : ''}${reponse}`;
      }).join(', ')}
    </div>`;
}


// ==========================================================================
// ABSENCES AUTOMATIQUES — traite les réponses manquantes après le délai de
// 24h (créées côté membre) : décompte le cours de l'abonnement, une seule
// fois par absence (seul l'admin a le droit d'écriture sur coursRestants).
// ==========================================================================
async function traiterAbsencesAutomatiques() {
  const presSnap = await getDocs(query(collection(db, 'presences'), where('statut', '==', 'absent-auto')));
  const aTraiter = [];
  presSnap.forEach(d => {
    const p = d.data();
    if (!p.compteAbonnement) aTraiter.push({ id: d.id, ...p });
  });
  if (aTraiter.length === 0) return;

  for (const p of aTraiter) {
    const membre = currentMembres.find(m => m.id === p.uid);
    if (membre) {
      const nouveauSolde = Math.max(0, (membre.coursRestants ?? 0) - 1);
      await updateDoc(doc(db, 'membres', p.uid), { coursRestants: nouveauSolde });
      membre.coursRestants = nouveauSolde;
    }
    await updateDoc(doc(db, 'presences', p.id), { compteAbonnement: true });
  }
  renderMembres();
}

// ==========================================================================
// VACCINS — rappel des échéances (30 jours) ou retards, calculées à 1 an
// après la date de dernière vaccination indiquée.
// ==========================================================================
const LABELS_VACCINS = { leptospirose: 'Leptospirose', parvovirose: 'Parvovirose', touxChenils: 'Toux du chenil', rage: 'Rage' };

function calculerEcheancesVaccins(chien) {
  const v = chien.vaccins || {};
  const resultats = [];
  Object.keys(LABELS_VACCINS).forEach(cle => {
    const date = v[cle]?.date;
    if (!date) return;
    const echeance = new Date(date + 'T00:00:00');
    echeance.setFullYear(echeance.getFullYear() + 1);
    resultats.push({ vaccin: LABELS_VACCINS[cle], echeance });
  });
  return resultats;
}

async function chargerVaccinsARappeler() {
  const zone = document.getElementById('vaccinsARappeler');
  if (!zone) return;
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  const dans30Jours = new Date(aujourdhui); dans30Jours.setDate(aujourdhui.getDate() + 30);

  const lignes = [];
  currentMembres.forEach(m => {
    (m.chiens || []).filter(c => !c.archive).forEach(c => {
      calculerEcheancesVaccins(c).forEach(({ vaccin, echeance }) => {
        if (echeance <= dans30Jours) {
          const enRetard = echeance < aujourdhui;
          lignes.push(`${escapeHtml(c.nom)} (${escapeHtml(m.nomMaitre)}) — ${vaccin}${enRetard ? ' en retard' : ' à renouveler bientôt'}`);
        }
      });
    });
  });

  if (lignes.length === 0) { zone.innerHTML = ''; return; }
  zone.innerHTML = `<div class="banner-alert">💉 Vaccins à surveiller : ${lignes.join(', ')}</div>`;
}

// ==========================================================================
// BOUTIQUE — articles, stock, commandes (validation = décompte du stock)
// ==========================================================================
const ARTICLES_DE_BASE = [
  { nom: 'Laisse en cuir', prix: 0, stock: 0, actif: true },
  { nom: 'Collier en cuir', prix: 0, stock: 0, actif: true },
  { nom: 'Collier Torquatus', prix: 0, stock: 0, actif: true },
  { nom: 'Bonbon dressage BBQ', prix: 0, stock: 0, actif: true },
  { nom: 'Grosse boîte de bonbons os', prix: 0, stock: 0, actif: true }
];

let currentArticlesBoutique = [];

async function chargerBoutiqueAdmin() {
  const snap = await getDocs(collection(db, 'articles_boutique'));
  currentArticlesBoutique = [];
  snap.forEach(d => currentArticlesBoutique.push({ id: d.id, ...d.data() }));
  renderArticlesBoutiqueAdmin();
  await chargerCommandesAdmin();
}

function renderArticlesBoutiqueAdmin() {
  const wrap = document.getElementById('listeArticlesBoutique');
  if (currentArticlesBoutique.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun article pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = currentArticlesBoutique.map(a => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(a.nom)} ${!a.actif ? '<span class="badge badge-neutral">Masqué</span>' : ''}</div>
        <div class="data-sub">${Number(a.prix).toFixed(2)} € TTC · <span class="${a.stock <= 0 ? 'badge badge-danger' : 'badge badge-ok'}">${a.stock} en stock</span></div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerArticleBoutique('${a.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerArticleBoutique('${a.id}')">Supprimer</button>
      </div>
    </div>`).join('');
}

document.getElementById('btnAjouterArticleBoutique').addEventListener('click', () => ouvrirModalArticleBoutique());

window.editerArticleBoutique = (id) => {
  const a = currentArticlesBoutique.find(x => x.id === id);
  ouvrirModalArticleBoutique(a);
};

window.supprimerArticleBoutique = async (id) => {
  if (!confirm('Supprimer cet article ?')) return;
  await deleteDoc(doc(db, 'articles_boutique', id));
  chargerBoutiqueAdmin();
};

function ouvrirModalArticleBoutique(article) {
  const isEdit = !!article;
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>${isEdit ? 'Modifier l\'article' : 'Ajouter un article'}</h3>
        <div class="field"><label>Nom</label><input id="ab-nom" value="${isEdit ? escapeAttr(article.nom) : ''}"></div>
        <div class="form-grid">
          <div class="field"><label>Prix TTC (€)</label><input type="number" step="0.01" id="ab-prix" value="${isEdit ? article.prix : ''}"></div>
          <div class="field"><label>Stock</label><input type="number" id="ab-stock" value="${isEdit ? article.stock : 0}"></div>
        </div>
        <div class="field"><label>Visible dans la boutique</label>
          <select id="ab-actif">
            <option value="oui" ${!isEdit || article.actif ? 'selected' : ''}>Oui</option>
            <option value="non" ${isEdit && !article.actif ? 'selected' : ''}>Non</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="ab-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('ab-save').addEventListener('click', async () => {
    const nom = document.getElementById('ab-nom').value.trim();
    const prix = parseFloat(document.getElementById('ab-prix').value);
    const stock = parseInt(document.getElementById('ab-stock').value, 10);
    if (!nom || isNaN(prix) || isNaN(stock)) { alert('Merci de remplir nom, prix et stock.'); return; }
    const data = { nom, prix, stock, actif: document.getElementById('ab-actif').value === 'oui' };
    if (isEdit) {
      await updateDoc(doc(db, 'articles_boutique', article.id), data);
    } else {
      await addDoc(collection(db, 'articles_boutique'), data);
    }
    window.fermerModal();
    chargerBoutiqueAdmin();
  });
}

document.getElementById('btnInitArticles').addEventListener('click', async () => {
  if (currentArticlesBoutique.length > 0 && !confirm('Ajouter les articles de base en plus des existants (prix et stock à 0, à compléter) ?')) return;
  try {
    for (const a of ARTICLES_DE_BASE) {
      await addDoc(collection(db, 'articles_boutique'), a);
    }
    chargerBoutiqueAdmin();
  } catch (err) {
    alert('Erreur lors de la création des articles : ' + (err.code || '') + ' — ' + (err.message || err));
  }
});

async function chargerCommandesAdmin() {
  const snap = await getDocs(collection(db, 'commandes'));
  const commandes = [];
  snap.forEach(d => commandes.push({ id: d.id, ...d.data() }));
  commandes.sort((a, b) => (b.dateCreation?.toMillis?.() || 0) - (a.dateCreation?.toMillis?.() || 0));

  const wrap = document.getElementById('listeCommandes');
  if (commandes.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune commande pour l\'instant.</div>';
    return;
  }

  wrap.innerHTML = commandes.map(c => {
    const membre = currentMembres.find(m => m.id === c.membreId);
    const detailLignes = (c.lignes || []).map(l => `${l.quantite} × ${escapeHtml(l.nom)}`).join(', ');
    const badgeStatut = c.statut === 'validee' ? '<span class="badge badge-ok">Validée</span>'
      : c.statut === 'annulee' ? '<span class="badge badge-danger">Annulée</span>'
      : '<span class="badge badge-warn">En attente</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(membre?.nomMaitre || '?')} — ${Number(c.total).toFixed(2)} € TTC ${badgeStatut}</div>
        <div class="data-sub">${detailLignes}</div>
        ${c.numeroFacture ? `<div class="data-sub">N° facture compta : <strong>${escapeHtml(c.numeroFacture)}</strong></div>` : ''}
        ${c.statut === 'validee' ? `
          <div class="form-grid" style="margin-top:8px; max-width:320px;">
            <div class="field"><label>N° de facture compta</label><input id="fact-${c.id}" value="${escapeAttr(c.numeroFacture||'')}" placeholder="ex: FA2026-042"></div>
          </div>
          <button class="btn-sm" onclick="window.enregistrerNumeroFacture('${c.id}')">Enregistrer le n°</button>
        ` : ''}
      </div>
      <div class="data-actions">
        ${c.statut === 'en_attente' ? `
          <button class="btn-sm primary" onclick="window.validerCommande('${c.id}')">Valider (décompte le stock)</button>
          <button class="btn-sm danger" onclick="window.annulerCommande('${c.id}')">Annuler</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

window.validerCommande = async (commandeId) => {
  const commande = (await getDoc(doc(db, 'commandes', commandeId))).data();
  for (const ligne of commande.lignes || []) {
    const article = currentArticlesBoutique.find(a => a.id === ligne.articleId);
    if (article) {
      const nouveauStock = Math.max(0, article.stock - ligne.quantite);
      await updateDoc(doc(db, 'articles_boutique', ligne.articleId), { stock: nouveauStock });
    }
  }
  await updateDoc(doc(db, 'commandes', commandeId), { statut: 'validee', dateValidation: serverTimestamp() });
  chargerBoutiqueAdmin();
};

window.annulerCommande = async (commandeId) => {
  if (!confirm('Annuler cette commande ? Le stock ne sera pas touché.')) return;
  await updateDoc(doc(db, 'commandes', commandeId), { statut: 'annulee' });
  chargerCommandesAdmin();
};

window.enregistrerNumeroFacture = async (commandeId) => {
  const numero = document.getElementById('fact-' + commandeId).value.trim();
  await updateDoc(doc(db, 'commandes', commandeId), { numeroFacture: numero });
  alert('N° de facture enregistré.');
};

// ==========================================================================
// Filet de sécurité : si une zone reste bloquée sur "..." après un moment,
// c'est qu'un chargement a échoué silencieusement — on le dit clairement
// plutôt que de laisser croire que quelque chose va encore arriver.
// ==========================================================================
setTimeout(() => {
  document.querySelectorAll('.empty-state').forEach(el => {
    if (el.textContent.trim() === '...') {
      el.textContent = 'Page vide — une erreur a peut-être empêché le chargement. Recharge la page (Ctrl+F5).';
    }
  });
}, 7000);
