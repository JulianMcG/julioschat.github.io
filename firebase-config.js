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
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Function to update Firestore security rules
async function updateFirestoreRules() {
    const rules = `
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
    
    try {
        // Note: This is just for reference. You need to update these rules in the Firebase Console
        console.log('Please update your Firestore security rules in the Firebase Console with:');
        console.log(rules);
    } catch (error) {
        console.error('Error updating rules:', error);
    }
}

// Call this function when the app starts
updateFirestoreRules(); 
