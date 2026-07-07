const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db = require('../database');
const { authenticateToken, requirePhotographer } = require('../middleware/auth');
const { uploadFile, downloadFile, deleteFile, isSupabaseEnabled, createSignedUrl } = require('../supabase');

const useSupabaseStorage = isSupabaseEnabled();

// Multer config
const storage = useSupabaseStorage ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads', req.params.folderId || 'temp');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only image files are allowed.'));
    }
});

// Create folder
router.post('/', authenticateToken, requirePhotographer, (req, res) => {
    const { client_name, client_email } = req.body;
    if (!client_name) return res.status(400).json({ error: 'Client name is required.' });
    const token = uuidv4();
    const result = db.prepare(
        'INSERT INTO folders (photographer_id, client_name, client_email, share_token) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, client_name, client_email || null, token);

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(result.lastInsertRowid);
    res.json(folder);
});

async function buildCoverImageUrl(folderId, coverImage) {
    if (!coverImage) return null;
    if (!useSupabaseStorage) return `/uploads/${folderId}/${coverImage}`;
    const row = db.prepare('SELECT id FROM images WHERE folder_id = ? AND filename = ?').get(folderId, coverImage);
    if (!row) return null;
    try {
        return await createSignedUrl(`${folderId}/${coverImage}`);
    } catch (err) {
        console.error('Failed to create signed URL for cover image:', err.message || err);
        return `/api/folders/${folderId}/images/${row.id}`;
    }
}

// Debug query parser
router.get('/debug-query', (req, res) => {
    res.json({ query: req.query, authHeader: req.headers['authorization'] || null, originalUrl: req.originalUrl });
});

// Get all folders for photographer
router.get('/', authenticateToken, requirePhotographer, async(req, res) => {
    const folders = db.prepare(`
    SELECT f.*, 
      (SELECT COUNT(*) FROM images WHERE folder_id = f.id) as total_images,
      (SELECT COUNT(*) FROM images WHERE folder_id = f.id AND is_downloaded = 1) as downloaded_images
    FROM folders f
    WHERE f.photographer_id = ? AND f.is_deleted = 0
    ORDER BY f.created_at DESC
  `).all(req.user.id);

    const formatted = await Promise.all(folders.map(async folder => ({
        ...folder,
        cover_image_url: await buildCoverImageUrl(folder.id, folder.cover_image)
    })));

    res.json(formatted);
});

// Get single folder
router.get('/:id', authenticateToken, requirePhotographer, async(req, res) => {
    const folder = db.prepare(`
    SELECT f.*, 
      (SELECT COUNT(*) FROM images WHERE folder_id = f.id) as total_images,
      (SELECT COUNT(*) FROM images WHERE folder_id = f.id AND is_downloaded = 1) as downloaded_images
    FROM folders f WHERE f.id = ? AND f.photographer_id = ?
  `).get(req.params.id, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });

    const images = await Promise.all(db.prepare('SELECT * FROM images WHERE folder_id = ? ORDER BY created_at ASC').all(req.params.id)
        .map(async image => ({
            ...image,
            url: useSupabaseStorage ? await createSignedUrl(`${req.params.id}/${image.filename}`) : `/uploads/${req.params.id}/${image.filename}`
        })));
    const cover_image_url = await buildCoverImageUrl(folder.id, folder.cover_image);
    res.json({...folder, cover_image_url, images });
});

// Get authenticated image content (local or Supabase)
router.get('/:folderId/images/:imageId', authenticateToken, requirePhotographer, async(req, res) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND photographer_id = ?').get(req.params.folderId, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });

    const image = db.prepare('SELECT * FROM images WHERE id = ? AND folder_id = ?').get(req.params.imageId, req.params.folderId);
    if (!image) return res.status(404).json({ error: 'Image not found.' });

    if (useSupabaseStorage) {
        try {
            const stream = await downloadFile(`${req.params.folderId}/${image.filename}`);
            res.type(path.extname(image.original_name) || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${image.original_name}"`);
            stream.pipe(res);
        } catch (err) {
            console.error('Supabase image proxy error:', err);
            res.status(500).json({ error: 'Failed to load image.' });
        }
        return;
    }

    const filePath = path.join(__dirname, '../uploads', req.params.folderId, image.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image file not found.' });
    res.sendFile(filePath);
});

// Upload images to folder
router.post('/:folderId/images', authenticateToken, requirePhotographer, (req, res, next) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND photographer_id = ?').get(req.params.folderId, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    next();
}, upload.array('images', 50), async(req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded.' });
    }

    // Ensure each file has a unique filename in memory storage mode
    req.files.forEach(file => {
        if (!file.filename) {
            file.filename = uuidv4() + path.extname(file.originalname);
        }
    });

    if (useSupabaseStorage) {
        try {
            for (const file of req.files) {
                if (!file.buffer) {
                    console.error('Upload failed: file buffer missing for', file.originalname);
                    return res.status(500).json({ error: 'Uploaded file data is unavailable.' });
                }
                console.log(`Uploading file to Supabase: ${req.params.folderId}/${file.filename} (${file.originalname})`);
                await uploadFile(`${req.params.folderId}/${file.filename}`, file.buffer, file.mimetype);
                console.log(`Supabase upload complete: ${req.params.folderId}/${file.filename}`);
            }
        } catch (err) {
            console.error('Supabase upload error:', err);
            return res.status(500).json({ error: err.message || 'Failed to upload images to Supabase. Check backend logs for details.' });
        }
    }

    const insertImage = db.prepare(
        'INSERT INTO images (folder_id, filename, original_name, file_size) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((files) => {
        for (const file of files) {
            insertImage.run(req.params.folderId, file.filename, file.originalname, file.size);
        }
    });
    insertMany(req.files);

    // Set cover image if not set
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.folderId);
    if (!folder.cover_image && req.files.length > 0) {
        db.prepare('UPDATE folders SET cover_image = ? WHERE id = ?').run(req.files[0].filename, req.params.folderId);
    }

    res.json({ message: `${req.files.length} image(s) uploaded successfully.`, count: req.files.length });
});

// Delete image
router.delete('/:folderId/images/:imageId', authenticateToken, requirePhotographer, async(req, res) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND photographer_id = ?').get(req.params.folderId, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });

    const image = db.prepare('SELECT * FROM images WHERE id = ? AND folder_id = ?').get(req.params.imageId, req.params.folderId);
    if (!image) return res.status(404).json({ error: 'Image not found.' });

    if (useSupabaseStorage) {
        try {
            await deleteFile(`${req.params.folderId}/${image.filename}`);
        } catch (err) {
            console.error('Supabase delete file error:', err);
        }
    } else {
        const filePath = path.join(__dirname, '../uploads', req.params.folderId, image.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM images WHERE id = ?').run(req.params.imageId);
    res.json({ message: 'Image deleted.' });
});

// Generate QR code for folder
router.get('/:id/qrcode', authenticateToken, requirePhotographer, async(req, res) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND photographer_id = ?').get(req.params.id, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const shareUrl = `${baseUrl}/gallery/${folder.share_token}`;
    try {
        const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 300, margin: 2 });
        res.json({ qr: qrDataUrl, url: shareUrl });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code.' });
    }
});

// Delete folder
router.delete('/:id', authenticateToken, requirePhotographer, async(req, res) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND photographer_id = ?').get(req.params.id, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });

    // Delete all image files
    const images = db.prepare('SELECT * FROM images WHERE folder_id = ?').all(req.params.id);
    if (useSupabaseStorage) {
        for (const img of images) {
            try {
                await deleteFile(`${req.params.id}/${img.filename}`);
            } catch (err) {
                console.error('Supabase delete file error:', err);
            }
        }
    } else {
        for (const img of images) {
            const filePath = path.join(__dirname, '../uploads', req.params.id.toString(), img.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        const folderDir = path.join(__dirname, '../uploads', req.params.id.toString());
        if (fs.existsSync(folderDir)) fs.rmdirSync(folderDir, { recursive: true });
    }

    db.prepare('DELETE FROM images WHERE folder_id = ?').run(req.params.id);
    db.prepare('UPDATE folders SET is_deleted = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Folder deleted successfully.' });
});

// Get photographer stats
router.get('/stats/overview', authenticateToken, requirePhotographer, (req, res) => {
    const totalFolders = db.prepare('SELECT COUNT(*) as count FROM folders WHERE photographer_id = ? AND is_deleted = 0').get(req.user.id);
    const totalImages = db.prepare(`
    SELECT COUNT(*) as count FROM images i 
    JOIN folders f ON i.folder_id = f.id 
    WHERE f.photographer_id = ? AND f.is_deleted = 0
  `).get(req.user.id);
    const avgRating = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM ratings WHERE photographer_id = ?').get(req.user.id);

    // Monthly data for chart (last 12 months)
    const monthlyData = db.prepare(`
    SELECT strftime('%Y-%m', f.created_at) as month, COUNT(i.id) as photos
    FROM folders f
    LEFT JOIN images i ON i.folder_id = f.id
    WHERE f.photographer_id = ? AND f.created_at >= date('now', '-12 months')
    GROUP BY month ORDER BY month ASC
  `).all(req.user.id);

    res.json({
        totalFolders: totalFolders.count,
        totalImages: totalImages.count,
        avgRating: avgRating.avg ? parseFloat(avgRating.avg).toFixed(1) : 0,
        totalRatings: avgRating.count,
        monthlyData
    });
});

module.exports = router;