const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const JWT_SECRET = process.env.JWT_SECRET || 'photogallery_secret_2024';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key') {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    const queryToken = req.query && req.query.token;
    if (!token && queryToken) {
        token = queryToken;
    }
    if (!token) {
        console.log(`Auth failed: no token. authHeader=${authHeader}, queryToken=${queryToken}, url=${req.originalUrl}`);
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        // Try Supabase token verification if configured
        if (supabaseAdmin) {
            try {
                const { data, error } = await supabaseAdmin.auth.getUser(token);
                if (!error && data && data.user) {
                    const u = data.user;
                    req.user = {
                        id: u.id,
                        email: u.email,
                        role: (u.user_metadata && u.user_metadata.role) || 'user',
                        supabase: true
                    };
                    return next();
                }
            } catch (e) {
                console.log('Supabase token verify error', e && e.message);
            }
        }
        console.log(`Auth failed: invalid token. token=${token}, err=${err.message}`);
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

function requirePhotographer(req, res, next) {
    if (req.user.role !== 'photographer') {
        return res.status(403).json({ error: 'Photographer access required.' });
    }
    next();
}

module.exports = { authenticateToken, requireAdmin, requirePhotographer };