const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { verifyFirebaseToken, firebaseInitialized } = require('../firebase-admin');

const JWT_SECRET = process.env.JWT_SECRET || 'photogallery_secret_2024';

function normalizeEmail(value) {
    return (value || '').trim().toLowerCase();
}

function getUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail);
}

function createLocalUser(name, email, password, phone, bio) {
    const normalizedEmail = normalizeEmail(email);
    const existing = getUserByEmail(normalizedEmail);
    if (existing) return existing;

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
        'INSERT INTO users (name, email, password, phone, bio) VALUES (?, ?, ?, ?, ?)'
    ).run(name, normalizedEmail, hash, phone || null, bio || null);

    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

// Register
router.post('/register', async(req, res) => {
    const { name, email, password, phone, bio } = req.body;
    // If Firebase ID token provided, verify and return Firebase-based profile (no local mapping)
    const firebaseIdToken = req.body.firebaseIdToken || null;
    if (firebaseIdToken) {
        if (!firebaseInitialized) return res.status(500).json({ error: 'Firebase not configured on server.' });
        try {
            const decoded = await verifyFirebaseToken(firebaseIdToken);
            const profile = {
                id: decoded.uid,
                uid: decoded.uid,
                email: decoded.email,
                name: decoded.name || decoded.email || null,
                role: decoded.role || decoded.claims && decoded.claims.role || 'user'
            };
            return res.json({ token: firebaseIdToken, user: profile });
        } catch (e) {
            return res.status(401).json({ error: 'Invalid Firebase token.' });
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
        if (!firebaseInitialized) return res.status(500).json({ error: 'Firebase not configured on server.' });
        try {
            const decoded = await verifyFirebaseToken(firebaseIdToken);
            const profile = {
                id: decoded.uid,
                uid: decoded.uid,
                email: decoded.email,
                name: decoded.name || decoded.email || null,
                role: decoded.role || decoded.claims && decoded.claims.role || 'user'
            };
            return res.json({ token: firebaseIdToken, user: profile });
        } catch (e) {
            return res.status(401).json({ error: 'Invalid Firebase token.' });
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