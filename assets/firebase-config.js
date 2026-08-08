// ==========================================================================
// Configuration Firebase — Les Cabots de Fernelmont
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCrn4MGvxOUl2b3s5U2zlIBoQhQYgiEgQE",
  authDomain: "cabots-de-fernelmont.firebaseapp.com",
  projectId: "cabots-de-fernelmont",
  storageBucket: "cabots-de-fernelmont.firebasestorage.app",
  messagingSenderId: "680710286763",
  appId: "1:680710286763:web:d29e4044df967e51be36ee"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, orderBy,
  serverTimestamp
};

// Les identifiants membres/admin ne sont pas de vraies adresses e-mail.
// On les transforme en "faux e-mail" pour pouvoir utiliser
// l'authentification Firebase par e-mail/mot de passe avec un simple
// identifiant (ex: "Katia" -> "katia@membres.cabots-de-fernelmont.local").
export function identifiantVersEmail(identifiant) {
  return identifiant.trim().toLowerCase() + "@membres.cabots-de-fernelmont.local";
}
