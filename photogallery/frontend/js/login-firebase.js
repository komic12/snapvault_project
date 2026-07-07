import { auth } from './firebase-config.js';
import { updateUserLogin } from './firebase-db.js';

const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');
if (token) {
    window.location.href = user.role === 'admin' ? '/admin' : '/dashboard';
}

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
        const data = await backendLoginByPassword(email, password);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        if (data.user.role === 'admin') {
            window.location.href = '/admin';
        } else {
            window.location.href = '/dashboard';
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