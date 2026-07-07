import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyDUlVBL3oyWUeGJGDrmaUgxnYQKfHgJKlE",
    authDomain: "snap-vault-7a35c.firebaseapp.com",
    databaseURL: "https://snap-vault-7a35c-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "snap-vault-7a35c",
    storageBucket: "snap-vault-7a35c.firebasestorage.app",
    messagingSenderId: "760389099400",
    appId: "1:760389099400:web:65b22c4f20fcfc0254a43d",
    measurementId: "G-K6V2XXV2V1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (e) {
    // Analytics may fail in non-browser or restricted environments
}
export { app, analytics };