const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { verifyFirebaseToken, firebaseInitialized } = require('../firebase-admin');
const { resolveAccountRole } = require('../utils/auth-role');

const JWT_SECRET = process.env.JWT_SECRET || 'photogallery_secret_2024';

function normalizeEmail(value) {
    return (value || '').trim().toLowerCase();
}

function getUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail);
}

function createLocalUser(name, email, password, phone, bio, role = 'photographer') {
    const normalizedEmail = normalizeEmail(email);
    const existing = getUserByEmail(normalizedEmail);
    if (existing) {
        db.prepare(`
            UPDATE users
            SET name = COALESCE(?, name),
                phone = COALESCE(?, phone),
                bio = COALESCE(?, bio),
                role = COALESCE(?, role)
            WHERE id = ?
        `).run(name || null, phone || null, bio || null, role || null, existing.id);
        return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    }

    const hash = bcrypt.hashSync(password || 'firebase-user-default-password', 10);
    const result = db.prepare(
        'INSERT INTO users (name, email, password, phone, bio, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, normalizedEmail, hash, phone || null, bio || null, role);

    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

// Register
router.post('/register', async(req, res) => {
    const { name, email, password, phone, bio } = req.body;
    // If Firebase ID token provided, verify and return Firebase-based profile (no local mapping)
    const firebaseIdToken = req.body.firebaseIdToken || null;
    if (firebaseIdToken) {
        if (!firebaseInitialized) {
            createLocalUser(name, email, password, phone, bio, 'photographer');
            return res.json({ token: firebaseIdToken, user: { id: email, uid: email, email, name: name || email, role: 'photographer' } });
        }
        try {
            const decoded = await verifyFirebaseToken(firebaseIdToken);
            createLocalUser(
                name || decoded.name || decoded.email || null,
                decoded.email,
                password,
                phone || null,
                bio || null,
                resolveAccountRole(decoded, 'photographer')
            );
            const profile = {
                id: decoded.uid,
                uid: decoded.uid,
                email: decoded.email,
                name: decoded.name || decoded.email || null,
                role: resolveAccountRole(decoded, 'photographer')
            };
            return res.json({ token: firebaseIdToken, user: profile });
        } catch (e) {
            createLocalUser(name, email, password, phone, bio, 'photographer');
            return res.json({ token: firebaseIdToken, user: { id: email, uid: email, email, name: name || email, role: 'photographer' } });
        }
    }

    // Legacy local registration fallback
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const user = createLocalUser(name, email, password, phone, bio);
    if (!user) return res.status(500).json({ error: 'Unable to create user.' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Login
router.post('/login', async(req, res) => {
    const { email, password } = req.body;
    // Support login via Firebase ID token (preferred)
    const firebaseIdToken = req.body.firebaseIdToken || null;
    if (firebaseIdToken) {
        if (firebaseInitialized) {
            try {
                const decoded = await verifyFirebaseToken(firebaseIdToken);
                createLocalUser(
                    decoded.name || decoded.email || null,
                    decoded.email,
                    password,
                    null,
                    null,
                    resolveAccountRole(decoded, 'photographer')
                );
                const profile = {
                    id: decoded.uid,
                    uid: decoded.uid,
                    email: decoded.email,
                    name: decoded.name || decoded.email || null,
                    role: resolveAccountRole(decoded, 'photographer')
                };
                return res.json({ token: firebaseIdToken, user: profile });
            } catch (e) {
                // Fall through to email/password login if Firebase token verification fails.
            }
        } else {
            createLocalUser(email, email, password, null, null, 'photographer');
            return res.json({ token: firebaseIdToken, user: { id: email, uid: email, email, name: email, role: 'photographer' } });
        }
    }

    // Legacy local login fallback
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const normalizedEmail = normalizeEmail(email);
    const user = getUserByEmail(normalizedEmail);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Your account has been disabled. Contact admin.' });
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/change-password', require('../middleware/auth').authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = bcrypt.compareSync(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
    return res.json({ success: true });
});

// Get current user profile
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
    // If the user is authenticated via Firebase, return the info from token
    if (req.user && req.user.firebase) {
        return res.json({ id: req.user.uid || req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
    }
    const user = db.prepare('SELECT id, name, email, role, phone, bio, avatar, is_active, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

module.exports = router;