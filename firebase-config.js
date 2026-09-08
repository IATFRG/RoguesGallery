import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAADySfbhcyTrgByTZxFZcU0YRM25-FOE4",
  authDomain: "rogue-gallery-directory.firebaseapp.com",
  projectId: "rogue-gallery-directory",
  storageBucket: "rogue-gallery-directory.firebasestorage.app",
  messagingSenderId: "84900947724",
  appId: "1:84900947724:web:f51afce9693ef2582ccb29"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
