// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let app;
let auth;
let db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

// Export Firebase services
export { auth, db };

// Security rules for Firestore
const securityRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{message} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
    match /users/{user} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == user;
    }
  }
}
`;

// Log security rules for reference
console.log('Please update your Firestore security rules in the Firebase Console with:');
console.log(securityRules); 
