import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD3hjahzQyzZPFcDMZ4WujHFivhzSDw88o",
  authDomain: "stellarrite-e0272.firebaseapp.com",
  projectId: "stellarrite-e0272",
  storageBucket: "stellarrite-e0272.firebasestorage.app",
  messagingSenderId: "239363758311",
  appId: "1:239363758311:web:749a01cef1630c5013aa42"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

signInAnonymously(auth).catch((error) => {
  console.error("Anonymous sign-in failed:", error.code, error.message);
});

let currentUser = null;
const authReadyCallbacks = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    console.log("Signed in anonymously. UID:", user.uid);
    authReadyCallbacks.forEach((cb) => cb(user));
    authReadyCallbacks.length = 0;
  }
});

function getCurrentUser() {
  return currentUser;
}

function onAuthReady(callback) {
  if (currentUser) {
    callback(currentUser);
  } else {
    authReadyCallbacks.push(callback);
  }
}

export { app, auth, db, getCurrentUser, onAuthReady };