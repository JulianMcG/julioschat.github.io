// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCZi9tD_IVmq9Ehwdvoc53v8Xv0Gc6uED8",
    authDomain: "julios-chat.firebaseapp.com",
    projectId: "julios-chat",
    storageBucket: "julios-chat.firebasestorage.app",
    messagingSenderId: "1070916729297",
    appId: "1:1070916729297:web:6b0dd896d400dd123788f0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
console.log("Firebase initialized successfully");

// Export Firebase services
export { 
    auth, 
    db,
    storage,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    ref,
    uploadBytes,
    getDownloadURL
};

// Security rules for Firestore
const securityRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{message} {
      allow read: if request.auth != null && 
        (request.auth.uid in resource.data.participants);
      allow create: if request.auth != null && 
        request.auth.uid in request.resource.data.participants;
      allow update: if request.auth != null && 
        request.auth.uid in resource.data.participants &&
        (
          // Allow updating reactions
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions', 'lastUpdated'])) ||
          // Allow updating other fields if they haven't changed
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly([]))
        );
    }
    match /users/{user} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
      allow list: if request.auth != null;
      allow query: if request.auth != null;
    }
    match /typing/{typingId} {
      allow read: if request.auth != null && 
        (request.auth.uid == resource.data.userId || 
         request.auth.uid == resource.data.otherUserId);
      allow write: if request.auth != null && 
        (request.auth.uid == request.resource.data.userId || 
         request.auth.uid == request.resource.data.otherUserId);
    }
  }
}
`;

// Log security rules for reference
console.log('Please update your Firestore security rules in the Firebase Console with:');
console.log(securityRules); 
