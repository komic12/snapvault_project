const admin = require('firebase-admin');
const path = require('path');

const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
let firebaseInitialized = false;

try {
    const serviceAccount = require(FIREBASE_SERVICE_ACCOUNT_PATH);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseInitialized = true;
    console.log(`✅ Firebase admin initialized from ${FIREBASE_SERVICE_ACCOUNT_PATH}`);
} catch (err) {
    console.error('❌ Firebase admin failed to initialize:', err.message);
}

async function verifyFirebaseToken(idToken) {
    if (!idToken) throw new Error('Firebase ID token is required.');
    if (!firebaseInitialized) throw new Error('Firebase admin is not configured on the backend.');
    return admin.auth().verifyIdToken(idToken);
}

module.exports = {
    admin,
    firebaseInitialized,
    verifyFirebaseToken,
};