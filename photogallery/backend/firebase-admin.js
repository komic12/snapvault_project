const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
let firebaseInitialized = false;

function loadServiceAccount() {
    const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    const envServiceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (envServiceAccount) {
        return JSON.parse(envServiceAccount);
    }

    if (envServiceAccountBase64) {
        const decoded = Buffer.from(envServiceAccountBase64, 'base64').toString('utf8');
        return JSON.parse(decoded);
    }

    const googleCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (googleCredentialsPath && fs.existsSync(googleCredentialsPath)) {
        return require(googleCredentialsPath);
    }

    if (fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
        return require(FIREBASE_SERVICE_ACCOUNT_PATH);
    }

    return null;
}

try {
    const serviceAccount = loadServiceAccount();

    if (serviceAccount) {
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        firebaseInitialized = true;
        console.log(`✅ Firebase admin initialized from ${serviceAccount.project_id || FIREBASE_SERVICE_ACCOUNT_PATH}`);
    } else {
        console.warn('⚠️ Firebase admin credentials were not provided. Auth verification will be unavailable until they are configured.');
    }
} catch (err) {
    console.error('❌ Firebase admin failed to initialize:', err.message);
    console.warn('Firebase auth will remain disabled until credentials are configured.');
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