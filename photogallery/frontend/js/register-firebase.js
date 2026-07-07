import { auth } from './firebase-config.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { saveUserProfile } from './firebase-db.js';

const token = localStorage.getItem('token');
if (token) {
    window.location.href = '/dashboard';
}

function showError(message) {
    document.getElementById('alert-container').innerHTML = `
    <div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> ${message}</div>
  `;
}

function resetButton() {
    const btn = document.getElementById('register-btn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
}

async function registerWithFirebase(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

async function backendRegister(firebaseIdToken, payload, password) {
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...payload, password, firebaseIdToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed.');
    return data;
}

async function handleRegister(event) {
    event.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
    document.getElementById('alert-container').innerHTML = '';

    const payload = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        bio: document.getElementById('bio').value
    };
    const password = document.getElementById('password').value;

    let firebaseUser;
    try {
        firebaseUser = await registerWithFirebase(payload.email, password);
        await saveUserProfile(firebaseUser.uid, {
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            bio: payload.bio,
            role: 'photographer'
        });
        const firebaseIdToken = await firebaseUser.getIdToken();
        const data = await backendRegister(firebaseIdToken, payload, password);

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/dashboard';
    } catch (err) {
        if (firebaseUser) {
            try { await firebaseUser.delete(); } catch (_) {}
        }
        showError(err.message);
        resetButton();
    }
}

function togglePassword(id, btn) {
    const input = document.getElementById(id);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

window.togglePassword = togglePassword;
document.getElementById('register-form').addEventListener('submit', handleRegister);