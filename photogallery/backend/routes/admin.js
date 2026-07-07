const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken, requireAdmin);

// Get all photographers
router.get('/photographers', (req, res) => {
  const photographers = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
      COUNT(DISTINCT f.id) as total_folders,
      COUNT(DISTINCT i.id) as total_images,
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(DISTINCT r.id) as total_ratings
    FROM users u
    LEFT JOIN folders f ON f.photographer_id = u.id AND f.is_deleted = 0
    LEFT JOIN images i ON i.folder_id = f.id
    LEFT JOIN ratings r ON r.photographer_id = u.id
    WHERE u.role = 'photographer'
    GROUP BY u.id
    ORDER BY avg_rating DESC, total_images DESC
  `).all();
  res.json(photographers);
});

// Toggle photographer status
router.patch('/photographers/:id/toggle', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'photographer');
  if (!user) return res.status(404).json({ error: 'Photographer not found.' });
  const newStatus = user.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
  res.json({ message: `Photographer ${newStatus ? 'enabled' : 'disabled'} successfully.`, is_active: newStatus });
});

// Send email to specific photographer
router.post('/photographers/:id/email', async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'photographer');
  if (!user) return res.status(404).json({ error: 'Photographer not found.' });

  try {
    // Using ethereal for demo (replace with real SMTP in production)
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    const info = await transporter.sendMail({
      from: '"PhotoGallery Admin" <admin@photogallery.com>',
      to: user.email,
      subject,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Message from Admin</h2><p>${message}</p></div>`
    });
    res.json({ message: 'Email sent successfully.', preview: nodemailer.getTestMessageUrl(info) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// Send email to all photographers
router.post('/email-all', async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });

  const photographers = db.prepare("SELECT email FROM users WHERE role = 'photographer' AND is_active = 1").all();
  if (photographers.length === 0) return res.status(404).json({ error: 'No active photographers found.' });

  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    const emails = photographers.map(p => p.email).join(', ');
    const info = await transporter.sendMail({
      from: '"PhotoGallery Admin" <admin@photogallery.com>',
      to: emails,
      subject,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Message from Admin</h2><p>${message}</p></div>`
    });
    res.json({ message: `Email sent to ${photographers.length} photographers.`, preview: nodemailer.getTestMessageUrl(info) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// Admin overview stats
router.get('/stats', (req, res) => {
  const totalPhotographers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'photographer'").get();
  const activePhotographers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'photographer' AND is_active = 1").get();
  const totalFolders = db.prepare("SELECT COUNT(*) as count FROM folders WHERE is_deleted = 0").get();
  const totalImages = db.prepare("SELECT COUNT(*) as count FROM images").get();
  const totalDownloads = db.prepare("SELECT COUNT(*) as count FROM download_logs").get();
  const avgRating = db.prepare("SELECT AVG(rating) as avg FROM ratings").get();

  // Top photographers
  const topPhotographers = db.prepare(`
    SELECT u.id, u.name, u.email,
      COUNT(DISTINCT f.id) as total_folders,
      COUNT(DISTINCT i.id) as total_images,
      ROUND(AVG(r.rating), 1) as avg_rating
    FROM users u
    LEFT JOIN folders f ON f.photographer_id = u.id AND f.is_deleted = 0
    LEFT JOIN images i ON i.folder_id = f.id
    LEFT JOIN ratings r ON r.photographer_id = u.id
    WHERE u.role = 'photographer'
    GROUP BY u.id
    ORDER BY avg_rating DESC, total_images DESC
    LIMIT 5
  `).all();

  // Monthly photos (last 12 months)
  const monthlyPhotos = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM images
    WHERE created_at >= date('now', '-12 months')
    GROUP BY month ORDER BY month ASC
  `).all();

  // Daily photos (last 30 days)
  const dailyPhotos = db.prepare(`
    SELECT strftime('%Y-%m-%d', created_at) as day, COUNT(*) as count
    FROM images
    WHERE created_at >= date('now', '-30 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // Yearly photos (last 5 years)
  const yearlyPhotos = db.prepare(`
    SELECT strftime('%Y', created_at) as year, COUNT(*) as count
    FROM images
    WHERE created_at >= date('now', '-5 years')
    GROUP BY year ORDER BY year ASC
  `).all();

  res.json({
    totalPhotographers: totalPhotographers.count,
    activePhotographers: activePhotographers.count,
    totalFolders: totalFolders.count,
    totalImages: totalImages.count,
    totalDownloads: totalDownloads.count,
    avgRating: avgRating.avg ? parseFloat(avgRating.avg).toFixed(1) : 0,
    topPhotographers,
    monthlyPhotos,
    dailyPhotos,
    yearlyPhotos
  });
});

// Get all ratings
router.get('/ratings', (req, res) => {
  const ratings = db.prepare(`
    SELECT r.*, u.name as photographer_name, f.client_name
    FROM ratings r
    JOIN users u ON r.photographer_id = u.id
    JOIN folders f ON r.folder_id = f.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(ratings);
});

module.exports = router;
