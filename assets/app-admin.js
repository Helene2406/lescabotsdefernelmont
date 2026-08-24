import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
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
  const mDoc = await getDoc(doc(db, 'membres', user.uid));
  if (!mDoc.exists() || mDoc.data().role !== 'admin') {
    window.location.href = 'connexion.html';
    return;
  }
  document.getElementById('adminNom').textContent = mDoc.data().nomMaitre || 'Katia';
  chargerGroupes();
  chargerMembres().then(() => { chargerConversations(); chargerAnniversaires(); });
  chargerCeSoir();
  afficherMeteoDuJour();
  chargerTarifs();
  chargerRdv();
  chargerArticles();
  chargerVideosAdmin();
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
        <button class="btn-sm" onclick="window.editerGroupe('${g.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerGroupe('${g.id}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('btnAjouterGroupe').addEventListener('click', () => ouvrirModalGroupe());

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
        <div class="data-title">${escapeHtml(m.nomMaitre)} — ${escapeHtml(m.chien?.nom || '')}</div>
        <div class="data-sub">${groupe ? escapeHtml(groupe.nom) : 'Sans groupe'} · ${badgeAbo} ${badgeCotis}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerMembre('${m.id}')">Fiche</button>
        <button class="btn-sm danger" onclick="window.archiverMembre('${m.id}')">Archiver</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('btnAjouterMembre').addEventListener('click', () => ouvrirModalMembre());

window.editerMembre = (id) => {
  const m = currentMembres.find(x => x.id === id);
  ouvrirModalMembre(m);
};

window.archiverMembre = async (id) => {
  if (!confirm('Archiver ce membre ? Il ne pourra plus se connecter mais ses données seront conservées.')) return;
  await updateDoc(doc(db, 'membres', id), { archive: true });
  chargerMembres();
};

function ouvrirModalMembre(membre) {
  const isEdit = !!membre;
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>${isEdit ? 'Fiche membre' : 'Ajouter un membre'}</h3>
        ${!isEdit ? `
        <div class="form-grid">
          <div class="field"><label>Identifiant</label><input id="mm-identifiant" placeholder="ex: Sarah.m"></div>
          <div class="field"><label>Mot de passe initial</label><input id="mm-mdp" placeholder="min. 6 caractères"></div>
        </div>` : ''}
        <div class="field"><label>Nom du maître</label><input id="mm-nomMaitre" value="${isEdit ? escapeAttr(membre.nomMaitre) : ''}"></div>
        <div class="field"><label>GSM</label><input id="mm-gsm" value="${isEdit ? escapeAttr(membre.gsm||'') : ''}" placeholder="ex: 0032 4XX XX XX XX"></div>
        <div class="field"><label>Date d'anniversaire</label><input type="date" id="mm-anniversaire" value="${isEdit ? (membre.dateAnniversaire||'') : ''}"></div>
        <div class="form-grid">
          <div class="field"><label>Nom du chien</label><input id="mm-chienNom" value="${isEdit ? escapeAttr(membre.chien?.nom||'') : ''}"></div>
          <div class="field"><label>Race</label><input id="mm-chienRace" value="${isEdit ? escapeAttr(membre.chien?.race||'') : ''}"></div>
          <div class="field"><label>Date de naissance</label><input type="date" id="mm-chienNaissance" value="${isEdit ? (membre.chien?.naissance||'') : ''}"></div>
          <div class="field"><label>Sexe</label>
            <select id="mm-chienSexe">
              <option value="male" ${isEdit && membre.chien?.sexe==='male' ? 'selected':''}>Mâle</option>
              <option value="femelle" ${isEdit && membre.chien?.sexe==='femelle' ? 'selected':''}>Femelle</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Groupe par défaut</label><select id="mm-groupe"></select></div>
        <div class="form-grid">
          <div class="field"><label>Cours restants (abonnement)</label><input type="number" id="mm-coursRestants" value="${isEdit ? (membre.coursRestants ?? 11) : 11}"></div>
          <div class="field"><label>Abonnement payé</label>
            <select id="mm-aboPaye">
              <option value="oui" ${isEdit && membre.abonnementPaye ? 'selected':''}>Oui</option>
              <option value="non" ${isEdit && !membre.abonnementPaye ? 'selected':''}>Non</option>
            </select>
          </div>
          <div class="field"><label>Cotisation annuelle payée</label>
            <select id="mm-cotisPaye">
              <option value="oui" ${isEdit && membre.cotisationPayee ? 'selected':''}>Oui</option>
              <option value="non" ${isEdit && !membre.cotisationPayee ? 'selected':''}>Non</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="mm-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  remplirSelectGroupes();
  if (isEdit && membre.groupeId) document.getElementById('mm-groupe').value = membre.groupeId;

  document.getElementById('mm-save').addEventListener('click', async () => {
    const data = {
      nomMaitre: document.getElementById('mm-nomMaitre').value.trim(),
      gsm: document.getElementById('mm-gsm').value.trim(),
      dateAnniversaire: document.getElementById('mm-anniversaire').value,
      chien: {
        nom: document.getElementById('mm-chienNom').value.trim(),
        race: document.getElementById('mm-chienRace').value.trim(),
        naissance: document.getElementById('mm-chienNaissance').value,
        sexe: document.getElementById('mm-chienSexe').value
      },
      groupeId: document.getElementById('mm-groupe').value || null,
      coursRestants: parseInt(document.getElementById('mm-coursRestants').value, 10) || 0,
      abonnementPaye: document.getElementById('mm-aboPaye').value === 'oui',
      cotisationPayee: document.getElementById('mm-cotisPaye').value === 'oui'
    };
    if (!data.nomMaitre) { alert('Merci d\'indiquer le nom du maître.'); return; }

    if (isEdit) {
      await updateDoc(doc(db, 'membres', membre.id), data);
      window.fermerModal();
      chargerMembres().then(() => chargerAnniversaires());
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
          identifiant,
          role: 'membre',
          archive: false,
          dateInscription: serverTimestamp()
        });
        await signOutSecondary(secondaryAuth);
        window.fermerModal();
        chargerMembres().then(() => chargerAnniversaires());
      } catch (err) {
        alert("Impossible de créer ce membre : " + (err.code === 'auth/email-already-in-use' ? 'cet identifiant existe déjà.' : err.message));
      }
    }
  });
}

// ==========================================================================
// CE SOIR — cours du jour, météo, maintien / annulation
// ==========================================================================
async function chargerCeSoir() {
  const jourAujourdhui = JOURS[new Date().getDay()];
  const dateISO = new Date().toISOString().slice(0, 10);
  const wrap = document.getElementById('listeCeSoir');

  const groupesDuJour = currentGroupes.filter(g => g.jour === jourAujourdhui);
  if (groupesDuJour.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun cours prévu aujourd\'hui.</div>';
    return;
  }

  const annulSnap = await getDocs(collection(db, 'annulations'));
  const annulations = {};
  annulSnap.forEach(d => { annulations[d.id] = d.data(); });

  const lignes = await Promise.all(groupesDuJour.map(async (g) => {
    const cle = `${g.id}_${dateISO}`;
    const annule = annulations[cle];
    const nbMembres = currentMembres.filter(m => m.groupeId === g.id).length;
    const m = await meteoPour(dateISO, g.heureDebut);
    const alerte = alerteMeteo(m);

    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(g.nom)} — ${g.heureDebut}–${g.heureFin}</div>
        <div class="data-sub">
          ${nbMembres} chiens inscrits
          ${annule ? `<span class="badge badge-danger">Annulé — ${escapeHtml(annule.motif)}</span>` : `<span class="badge badge-ok">Maintenu</span>`}
          ${m ? `<span class="badge badge-neutral">${iconeCode(m.code)} ${m.temperature}°C · pluie ${m.pluie}%</span>` : ''}
        </div>
        ${alerte && !annule ? `<div class="banner-alert" style="margin-top:8px; padding:8px 12px; ${alerte.niveau==='danger' ? 'background:#FBEAEA;border-color:#E3B4B4;color:#8A2E2E;' : ''}">⚠️ ${alerte.texte} — pense à vérifier si le cours doit être maintenu.</div>` : ''}
      </div>
      <div class="data-actions">
        ${annule
          ? `<button class="btn-sm" onclick="window.reactiverCours('${g.id}','${dateISO}')">Réactiver</button>`
          : `<button class="btn-sm danger" onclick="window.annulerCours('${g.id}','${dateISO}')">Annuler ce cours</button>`}
      </div>
    </div>`;
  }));

  wrap.innerHTML = lignes.join('');
}

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
// TARIFS
// ==========================================================================
async function chargerTarifs() {
  const configDoc = await getDoc(doc(db, 'tarifs', 'config'));
  const data = configDoc.exists() ? configDoc.data() : { abonnement: 80, coursUnite: 8, cotisation: 75, individuel: 85 };
  document.getElementById('tf-abonnement').value = data.abonnement;
  document.getElementById('tf-coursUnite').value = data.coursUnite;
  document.getElementById('tf-cotisation').value = data.cotisation;
  document.getElementById('tf-individuel').value = data.individuel;

  const extraSnap = await getDocs(collection(db, 'tarifs_extra'));
  const wrap = document.getElementById('listeTarifsExtra');
  if (extraSnap.empty) {
    wrap.innerHTML = '<div class="empty-state">Aucun tarif supplémentaire.</div>';
  } else {
    const lignes = [];
    extraSnap.forEach(d => {
      const t = d.data();
      lignes.push(`
      <div class="data-row">
        <div class="data-main">
          <div class="data-title">${escapeHtml(t.nom)}</div>
          <div class="data-sub">${Number(t.prix).toFixed(2)} € TTC</div>
        </div>
        <div class="data-actions">
          <button class="btn-sm danger" onclick="window.supprimerTarifExtra('${d.id}')">Supprimer</button>
        </div>
      </div>`);
    });
    wrap.innerHTML = lignes.join('');
  }
}

document.getElementById('btnSauverTarifs').addEventListener('click', async () => {
  await setDoc(doc(db, 'tarifs', 'config'), {
    abonnement: parseFloat(document.getElementById('tf-abonnement').value) || 0,
    coursUnite: parseFloat(document.getElementById('tf-coursUnite').value) || 0,
    cotisation: parseFloat(document.getElementById('tf-cotisation').value) || 0,
    individuel: parseFloat(document.getElementById('tf-individuel').value) || 0
  });
  alert('Tarifs enregistrés.');
});

document.getElementById('btnAjouterTarifExtra').addEventListener('click', () => {
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h3>Ajouter un tarif</h3>
        <div class="field"><label>Nom du tarif</label><input id="te-nom" placeholder="ex: Toilettage"></div>
        <div class="field"><label>Prix TTC (€)</label><input type="number" step="0.01" id="te-prix"></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="te-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('te-save').addEventListener('click', async () => {
    const nom = document.getElementById('te-nom').value.trim();
    const prix = parseFloat(document.getElementById('te-prix').value);
    if (!nom || isNaN(prix)) { alert('Merci de remplir le nom et le prix.'); return; }
    await addDoc(collection(db, 'tarifs_extra'), { nom, prix });
    window.fermerModal();
    chargerTarifs();
  });
});

window.supprimerTarifExtra = async (id) => {
  if (!confirm('Supprimer ce tarif ?')) return;
  await deleteDoc(doc(db, 'tarifs_extra', id));
  chargerTarifs();
};

// ==========================================================================
// RDV
// ==========================================================================
async function chargerRdv() {
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
    reponsesParRdv[r.rdvId].push(r);
  });

  wrap.innerHTML = rdvs.map(rdv => {
    const reponses = reponsesParRdv[rdv.id] || [];
    const presents = reponses.filter(r => r.statut === 'present');
    const payes = presents.filter(r => r.paye).length;
    const dateLabel = rdv.date ? new Date(rdv.date + 'T00:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(rdv.titre)}</div>
        <div class="data-sub">${dateLabel} ${rdv.heure || ''} · ${escapeHtml(rdv.lieu || '')} · ${escapeHtml(rdv.modalite || '')}</div>
        <div class="data-sub"><span class="badge badge-ok">${presents.length} présent(s)</span> <span class="badge badge-neutral">${payes}/${presents.length} payé(s)</span></div>
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
        <div class="field"><label>Modalité</label><input id="rd-modalite" placeholder="ex: 15€/pers, à régler sur place"></div>
        <div class="modal-actions">
          <button class="btn-sm" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="rd-save">Créer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('rd-save').addEventListener('click', async () => {
    const titre = document.getElementById('rd-titre').value.trim();
    const date = document.getElementById('rd-date').value;
    if (!titre || !date) { alert('Merci de renseigner au moins un titre et une date.'); return; }
    await addDoc(collection(db, 'rdv'), {
      titre, date,
      heure: document.getElementById('rd-heure').value,
      lieu: document.getElementById('rd-lieu').value.trim(),
      modalite: document.getElementById('rd-modalite').value.trim(),
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
