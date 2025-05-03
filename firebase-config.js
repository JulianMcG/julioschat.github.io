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