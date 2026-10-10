"use client";
// Firebase setup plus the few data helpers the pages use. Config comes from NEXT_PUBLIC_FIREBASE_* env vars.
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, getDoc, deleteDoc, updateDoc, onSnapshot, writeBatch,
} from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const configured = !!(config.apiKey && config.projectId && config.appId);

let app, auth, fs, secondaryAuth;
function init() {
  if (app || !configured || typeof window === "undefined") return;
  app = getApps().find(a => a.name === "[DEFAULT]") || initializeApp(config);
  auth = getAuth(app);
  try {
    // offline cache: the book keeps working when the restaurant's internet drops, and syncs later
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    fs = getFirestore(app); // already initialised (hot reload)
  }
}

const snapDocs = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));

/* ---------- data ---------- */
export const newId = col => { init(); return doc(collection(fs, col)).id; };
export const saveDoc = (col, id, data) => { init(); return setDoc(doc(fs, col, id), data); };
export const patchDoc = (col, id, data) => { init(); return updateDoc(doc(fs, col, id), data); };
export const removeDoc = (col, id) => { init(); return deleteDoc(doc(fs, col, id)); };
export const readDoc = async (col, id) => { init(); const s = await getDoc(doc(fs, col, id)); return s.exists() ? { ...s.data(), id: s.id } : null; };
export const watchCollection = (col, next, error) => { init(); return onSnapshot(collection(fs, col), s => next(snapDocs(s)), e => { console.warn("listener stopped:", col, e?.code); error && error(e); }); };
export const watchDoc = (col, id, next) => { init(); return onSnapshot(doc(fs, col, id), s => next(s.exists() ? { ...s.data(), id: s.id } : null), () => {}); };
export const isDenied = e => e?.code === "permission-denied";

/* ---------- auth ---------- */
export const onAuth = cb => { init(); if (!auth) { cb(null); return () => {}; } return onAuthStateChanged(auth, cb); };
export const signIn = (email, pw) => { init(); return signInWithEmailAndPassword(auth, email, pw); };
export const signUp = async (email, pw, name) => {
  init();
  const c = await createUserWithEmailAndPassword(auth, email, pw);
  if (name) await updateProfile(c.user, { displayName: name });
  return c.user;
};
export const signOut = () => { init(); return fbSignOut(auth); };
export const resetPassword = email => { init(); return sendPasswordResetEmail(auth, email); };

// The first person to sign in on a fresh project claims it as owner: one batch writes meta/setup and
// their admin profile. firestore.rules only allows this while meta/setup does not exist yet.
export async function claimOwner(user) {
  init();
  const b = writeBatch(fs);
  const at = new Date().toISOString();
  b.set(doc(fs, "meta", "setup"), { ownerUid: user.uid, createdAt: at });
  b.set(doc(fs, "users", user.uid), { name: user.displayName || user.email, email: user.email, role: "admin", active: true, perms: {}, createdAt: at });
  await b.commit();
}

// An admin creates a login for someone else. Doing that on the main auth instance would sign the
// admin out, so it runs on a second app instance which is signed out straight after.
export async function createLogin(email, pw) {
  init();
  if (!secondaryAuth) {
    const sec = getApps().find(a => a.name === "secondary") || initializeApp(config, "secondary");
    secondaryAuth = getAuth(sec);
  }
  const c = await createUserWithEmailAndPassword(secondaryAuth, email, pw);
  const uid = c.user.uid;
  await fbSignOut(secondaryAuth);
  return uid;
}

export const authMessage = e => ({
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/wrong-password": "Email or password is wrong.",
  "auth/user-not-found": "No login with that email.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
  "auth/email-already-in-use": "That email already has a login. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/network-request-failed": "No internet connection.",
}[e?.code] || "Something went wrong. Try again.");
