import { getDatabase, ref, set, update, push } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';
import { app } from './firebase-config.js';

const database = getDatabase(app);

export async function saveUserProfile(uid, profile) {
    if (!uid) throw new Error('Firebase UID is required to save profile.');
    const userRef = ref(database, `users/${uid}`);
    await set(userRef, {
        ...profile,
        updatedAt: Date.now()
    });
}

export async function updateUserLogin(uid, email) {
    if (!uid) throw new Error('Firebase UID is required to log login event.');
    const loginRef = ref(database, `userLogins/${uid}`);
    await push(loginRef, {
        email: email || null,
        timestamp: Date.now()
    });
}

export async function updateLastSeen(uid) {
    if (!uid) throw new Error('Firebase UID is required to update last seen.');
    const userRef = ref(database, `users/${uid}`);
    await update(userRef, {
        lastSeen: Date.now()
    });
}