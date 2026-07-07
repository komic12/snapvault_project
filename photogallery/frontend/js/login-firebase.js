import { updateUserLogin } from './firebase-db.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/module/index.js';

const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');
if (token) {
    window.location.href = user.role === 'admin' ? '/admin' : '/dashboard';
}

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function showError(message) {
    document.getElementById('alert-container').innerHTML = `
    <div class="alert alert-error"><i class="fas fa-exclamation-circle"></i> ${message}</div>
  `;
}

function resetButton() {
    const btn = document.getElementById('login-btn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
}

async function backendLoginByPassword(email, password) {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    return data;
}

async function handleLogin(event) {
    event.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    document.getElementById('alert-container').innerHTML = '';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;



    try {
        // Use Firebase client auth
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const firebaseUser = credential.user;
        const idToken = await firebaseUser.getIdToken();

        // notify backend and fetch profile
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebaseIdToken: idToken })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Login failed');

        await updateUserLogin(firebaseUser.uid, firebaseUser.email);
        localStorage.setItem('token', idToken);
        localStorage.setItem('user', JSON.stringify(data.user));

        if (data.user.role === 'admin') window.location.href = '/admin';
        else window.location.href = '/dashboard';
        return;
    } catch (e) {
        console.warn('Firebase sign-in failed:', e && e.message);
    }
} catch (err) {
    console.error('Login error:', err);
    showError(err.message || 'Login failed.');
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
document.getElementById('login-form').addEventListener('submit', handleLogin);