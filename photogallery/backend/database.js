const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function getDatabasePath() {
    const configuredPath = process.env.SQLITE_DB_PATH || process.env.DB_PATH;
    if (configuredPath) return configuredPath;

    const persistentDir = process.env.RENDER_DISK_PATH;
    if (persistentDir) return path.join(persistentDir, 'gallery.db');

    return path.join(__dirname, 'gallery.db');
}

const dbPath = getDatabasePath();
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// Insert default admin if not exists
const bcrypt = require('bcryptjs');
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
    INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)
  `).run('Administrator', 'admin@photogallery.com', hash, 'admin');
    console.log('Default admin created: admin@photogallery.com / admin123');
}

const seededEmail = (process.env.SEED_USER_EMAIL || 'angazacode@gmail.com').toLowerCase();
const seededPassword = process.env.SEED_USER_PASSWORD || '1054komic';
const seededName = process.env.SEED_USER_NAME || 'Angaza';
const seededUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1').get(seededEmail);
if (!seededUser) {
    const hash = bcrypt.hashSync(seededPassword, 10);
    db.prepare(`
    INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)
  `).run(seededName, seededEmail, hash, 'user');
    console.log(`Seeded user created: ${seededEmail}`);
}

module.exports = db;