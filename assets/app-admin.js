import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where,
  serverTimestamp, identifiantVersEmail
} from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth as getAuthSecondary, createUserWithEmailAndPassword, signOut as signOutSecondary }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

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
  chargerMembres();
  chargerCeSoir();
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
      chargerMembres();
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
        chargerMembres();
      } catch (err) {
        alert("Impossible de créer ce membre : " + (err.code === 'auth/email-already-in-use' ? 'cet identifiant existe déjà.' : err.message));
      }
    }
  });
}

// ==========================================================================
// CE SOIR — cours du jour, maintien / annulation
// ==========================================================================
async function chargerCeSoir() {
  await Promise.all([]); // groupes déjà chargés via chargerGroupes()
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

  wrap.innerHTML = groupesDuJour.map(g => {
    const cle = `${g.id}_${dateISO}`;
    const annule = annulations[cle];
    const nbMembres = currentMembres.filter(m => m.groupeId === g.id).length;
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(g.nom)} — ${g.heureDebut}–${g.heureFin}</div>
        <div class="data-sub">
          ${nbMembres} chiens inscrits
          ${annule ? `<span class="badge badge-danger">Annulé — ${escapeHtml(annule.motif)}</span>` : `<span class="badge badge-ok">Maintenu</span>`}
        </div>
      </div>
      <div class="data-actions">
        ${annule
          ? `<button class="btn-sm" onclick="window.reactiverCours('${g.id}','${dateISO}')">Réactiver</button>`
          : `<button class="btn-sm danger" onclick="window.annulerCours('${g.id}','${dateISO}')">Annuler ce cours</button>`}
      </div>
    </div>`;
  }).join('');
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
