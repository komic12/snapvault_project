require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { initSupabase } = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.locals.baseUrl = BASE_URL;

// Security & middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/gallery', require('./routes/gallery'));

initSupabase();

// Serve gallery page for share links
app.get('/gallery/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/gallery.html'));
});

// Serve Supabase config for client (populated from environment)
app.get('/supabase-config.js', (req, res) => {
    res.type('application/javascript');
    const url = process.env.SUPABASE_URL || '';
    const anon = process.env.SUPABASE_ANON_KEY || '';
    res.send(`window.SUPABASE_URL = ${JSON.stringify(url)}; window.SUPABASE_ANON_KEY = ${JSON.stringify(anon)};`);
});

// Serve frontend pages
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/login.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// 30-day reminder check (runs every hour)
setInterval(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oldFolders = db.prepare(`
    SELECT f.*, u.email as photographer_email, u.name as photographer_name
    FROM folders f JOIN users u ON f.photographer_id = u.id
    WHERE f.is_deleted = 0 AND f.reminder_sent = 0
    AND f.created_at < ? 
    AND (SELECT COUNT(*) FROM images WHERE folder_id = f.id AND is_downloaded = 0) > 0
  `).all(thirtyDaysAgo);

    for (const folder of oldFolders) {
        console.log(`[REMINDER] Folder "${folder.client_name}" (ID: ${folder.id}) by ${folder.photographer_name} has undownloaded images older than 30 days.`);
        db.prepare('UPDATE folders SET reminder_sent = 1 WHERE id = ?').run(folder.id);
    }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`\n🚀 PhotoGallery Server running at ${BASE_URL}`);
    console.log(`📸 Photographer Login: ${BASE_URL}/login`);
    console.log(`🔑 Admin Login: admin@photogallery.com / admin123\n`);
});