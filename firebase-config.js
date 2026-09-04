// Firebase SDK Initializer Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOGrMFf2mRJxuWJPUk-1CgFEJ2GQ1GwqE",
  authDomain: "feedcoin-54c7a.firebaseapp.com",
  projectId: "feedcoin-54c7a",
  storageBucket: "feedcoin-54c7a.firebasestorage.app",
  messagingSenderId: "408433282772",
  appId: "1:408433282772:web:ed702af58f19992ecef541",
  measurementId: "G-VFJJE5FN8S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };