const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyFirebaseToken } = require('../firebase-admin');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'photogallery_secret_2024';

// Register
router.post('/register', async(req, res) => {
    const { name, email, password, phone, bio, firebaseIdToken } = req.body;

    if (firebaseIdToken) {
        try {
            const decodedToken = await verifyFirebaseToken(firebaseIdToken);
            const firebaseEmail = decodedToken.email;
            if (!firebaseEmail) {
                return res.status(400).json({ error: 'Firebase token did not include an email address.' });
            }
            const registerEmail = email || firebaseEmail;
            if (registerEmail !== firebaseEmail) {
                return res.status(400).json({ error: 'Email must match Firebase authenticated account.' });
            }
            const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(registerEmail);
            if (existing) {
                return res.status(409).json({ error: 'Email already registered.' });
            }
            if (!password) {
                return res.status(400).json({ error: 'Password is required for registration.' });
            }

            const displayName = name || decodedToken.name || 'Photographer';
            const hash = bcrypt.hashSync(password, 10);
            const result = db.prepare(
                'INSERT INTO users (name, email, password, phone, bio) VALUES (?, ?, ?, ?, ?)'
            ).run(displayName, registerEmail, hash, phone || null, bio || null);

            const token = jwt.sign({ id: result.lastInsertRowid, name: displayName, email: registerEmail, role: 'photographer' },
                JWT_SECRET, { expiresIn: '7d' }
            );
            return res.json({ token, user: { id: result.lastInsertRowid, name: displayName, email: registerEmail, role: 'photographer' } });
        } catch (err) {
            return res.status(401).json({ error: 'Invalid Firebase token.' });
        }
    }

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return res.status(409).json({ error: 'Email already registered.' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
        'INSERT INTO users (name, email, password, phone, bio) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, hash, phone || null, bio || null);

    const token = jwt.sign({ id: result.lastInsertRowid, name, email, role: 'photographer' },
        JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: result.lastInsertRowid, name, email, role: 'photographer' } });
});

// Login
router.post('/login', async(req, res) => {
    const { email, password, firebaseIdToken } = req.body;

    if (firebaseIdToken) {
        try {
            const decodedToken = await verifyFirebaseToken(firebaseIdToken);
            const firebaseEmail = decodedToken.email;
            if (!firebaseEmail) {
                return res.status(400).json({ error: 'Firebase token did not include an email address.' });
            }

            const user = db.prepare('SELECT * FROM users WHERE email = ?').get(firebaseEmail);
            if (!user) return res.status(401).json({ error: 'User not found. Please register first.' });
            if (!user.is_active) return res.status(403).json({ error: 'Your account has been disabled. Contact admin.' });

            const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role },
                JWT_SECRET, { expiresIn: '7d' }
            );
            return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        } catch (err) {
            console.error('Firebase login verification failed:', err.message || err);
            return res.status(403).json({ error: 'Invalid Firebase token.' });
        }
    }

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Your account has been disabled. Contact admin.' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role },
        JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Get current user profile
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, phone, bio, avatar, is_active, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

module.exports = router;