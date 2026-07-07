import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/module/index.js';

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

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function registerWithSupabase(email, password, metadata = {}) {
    if (!supabase) return { mode: 'disabled' };
    // Try sign up
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    if (error) {
        // If email already exists, attempt sign-in to get token
        if (error.message && error.message.toLowerCase().includes('already')) {
            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
            if (!signInErr && signInData && signInData.session) return { mode: 'login', session: signInData.session };
            return { mode: 'exists' };
        }
        throw error;
    }
    // On successful sign up, data.user may be available but session may require email confirm
    return { mode: 'register', data };
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

    try {
        // Try Supabase registration/sign-in first
        if (supabase) {
            try {
                const result = await registerWithSupabase(payload.email, password, { name: payload.name, role: 'photographer' });
                if (result.mode === 'register') {
                    // Not guaranteed to have session (email confirm flows). Attempt sign-in to obtain token.
                    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: payload.email, password });
                    if (signInErr) throw signInErr;
                    const accessToken = signInData.session ? .access_token;
                    const data = await backendRegister(accessToken, payload, password);
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = '/dashboard';
                    return;
                } else if (result.mode === 'login') {
                    const accessToken = result.session.access_token;
                    const data = await backendRegister(accessToken, payload, password);
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = '/dashboard';
                    return;
                } else if (result.mode === 'exists') {
                    // User exists but could not sign in via supabase (wrong password); fall back to backend-only
                }
            } catch (e) {
                console.warn('Supabase registration failed, falling back to backend', e && e.message);
            }
        }

        const data = await backendRegister(null, payload, password);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/dashboard';
    } catch (err) {
        showError(err.message || (err.error && err.error.message) || 'Registration failed.');
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