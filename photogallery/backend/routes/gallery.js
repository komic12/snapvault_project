const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../database');
const { downloadFile, isSupabaseEnabled } = require('../supabase');

const useSupabaseStorage = isSupabaseEnabled();

// Get gallery by share token (public)
router.get('/:token', (req, res) => {
    const folder = db.prepare(`
    SELECT f.*, u.name as photographer_name, u.email as photographer_email, u.bio as photographer_bio, u.avatar as photographer_avatar
    FROM folders f
    JOIN users u ON f.photographer_id = u.id
    WHERE f.share_token = ? AND f.is_deleted = 0
  `).get(req.params.token);

    if (!folder) return res.status(404).json({ error: 'Gallery not found or has been removed.' });

    const images = db.prepare('SELECT id, filename, original_name, file_size, is_downloaded, created_at FROM images WHERE folder_id = ? ORDER BY created_at ASC').all(folder.id)
        .map(image => ({
            ...image,
            url: useSupabaseStorage ? `/api/gallery/${req.params.token}/image/${image.id}` : `/uploads/${folder.id}/${image.filename}`
        }));
    const rating = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM ratings WHERE folder_id = ?').get(folder.id);

    res.json({
        ...folder,
        images,
        avgRating: rating.avg ? parseFloat(rating.avg).toFixed(1) : null,
        ratingCount: rating.count
    });
});

// Download single image
router.get('/:token/image/:imageId', async(req, res) => {
    const folder = db.prepare('SELECT * FROM folders WHERE share_token = ? AND is_deleted = 0').get(req.params.token);
    if (!folder) return res.status(404).json({ error: 'Gallery not found.' });

    const image = db.prepare('SELECT * FROM images WHERE id = ? AND folder_id = ?').get(req.params.imageId, folder.id);
    if (!image) return res.status(404).json({ error: 'Image not found.' });

    if (useSupabaseStorage) {
        try {
            const stream = await downloadFile(`${folder.id}/${image.filename}`);
            res.type(path.extname(image.original_name) || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${image.original_name}"`);
            // Mark as downloaded before streaming the response
            db.prepare('UPDATE images SET is_downloaded = 1, downloaded_at = CURRENT_TIMESTAMP WHERE id = ?').run(image.id);
            db.prepare('INSERT INTO download_logs (folder_id, image_id) VALUES (?, ?)').run(folder.id, image.id);
            db.prepare('UPDATE folders SET last_download_at = CURRENT_TIMESTAMP WHERE id = ?').run(folder.id);
            checkAndAutoDelete(folder.id);
            return stream.pipe(res);
        } catch (err) {
            console.error('Supabase gallery download error:', err);
            return res.status(500).json({ error: 'Failed to download image.' });
        }
    }

    const filePath = path.join(__dirname, '../uploads', folder.id.toString(), image.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image file not found.' });

    // Mark as downloaded
    db.prepare('UPDATE images SET is_downloaded = 1, downloaded_at = CURRENT_TIMESTAMP WHERE id = ?').run(image.id);
    db.prepare('INSERT INTO download_logs (folder_id, image_id) VALUES (?, ?)').run(folder.id, image.id);
    db.prepare('UPDATE folders SET last_download_at = CURRENT_TIMESTAMP WHERE id = ?').run(folder.id);

    // Check if all images downloaded - auto delete folder
    checkAndAutoDelete(folder.id);

    res.setHeader('Content-Disposition', `inline; filename="${image.original_name}"`);
    res.sendFile(filePath);
});

// Download all images as ZIP
router.get('/:token/download-all', (req, res) => {
    const folder = db.prepare('SELECT * FROM folders WHERE share_token = ? AND is_deleted = 0').get(req.params.token);
    if (!folder) return res.status(404).json({ error: 'Gallery not found.' });

    const images = db.prepare('SELECT * FROM images WHERE folder_id = ?').all(folder.id);
    if (images.length === 0) return res.status(404).json({ error: 'No images in this gallery.' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folder.client_name}_photos.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const image of images) {
        const filePath = path.join(__dirname, '../uploads', folder.id.toString(), image.filename);
        if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: image.original_name });
        }
    }

    archive.finalize();

    archive.on('end', () => {
        // Mark all as downloaded
        db.prepare('UPDATE images SET is_downloaded = 1, downloaded_at = CURRENT_TIMESTAMP WHERE folder_id = ?').run(folder.id);
        db.prepare('UPDATE folders SET last_download_at = CURRENT_TIMESTAMP WHERE id = ?').run(folder.id);
        for (const img of images) {
            db.prepare('INSERT INTO download_logs (folder_id, image_id) VALUES (?, ?)').run(folder.id, img.id);
        }
        checkAndAutoDelete(folder.id);
    });
});

// Submit rating
router.post('/:token/rate', (req, res) => {
    const { rating, review, client_name } = req.body;
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }
    const folder = db.prepare('SELECT * FROM folders WHERE share_token = ? AND is_deleted = 0').get(req.params.token);
    if (!folder) return res.status(404).json({ error: 'Gallery not found.' });

    // Check if already rated
    const existing = db.prepare('SELECT id FROM ratings WHERE folder_id = ?').get(folder.id);
    if (existing) return res.status(409).json({ error: 'This gallery has already been rated.' });

    db.prepare(
        'INSERT INTO ratings (photographer_id, folder_id, client_name, rating, review) VALUES (?, ?, ?, ?, ?)'
    ).run(folder.photographer_id, folder.id, client_name || folder.client_name, rating, review || null);

    res.json({ message: 'Thank you for your rating!' });
});

function checkAndAutoDelete(folderId) {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
    if (!folder) return;
    const total = db.prepare('SELECT COUNT(*) as count FROM images WHERE folder_id = ?').get(folderId).count;
    const downloaded = db.prepare('SELECT COUNT(*) as count FROM images WHERE folder_id = ? AND is_downloaded = 1').get(folderId).count;

    if (total > 0 && total === downloaded) {
        // All downloaded - auto delete files
        const images = db.prepare('SELECT * FROM images WHERE folder_id = ?').all(folderId);
        for (const img of images) {
            const filePath = path.join(__dirname, '../uploads', folderId.toString(), img.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        const folderDir = path.join(__dirname, '../uploads', folderId.toString());
        if (fs.existsSync(folderDir)) {
            try { fs.rmdirSync(folderDir); } catch (e) {}
        }
        db.prepare('UPDATE folders SET is_deleted = 1 WHERE id = ?').run(folderId);
    }
}

module.exports = router;