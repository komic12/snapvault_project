# SnapVault — Photographer Gallery Platform

A full-stack client gallery & workflow management platform for photographers.

## Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT (JSON Web Tokens)
- **Other**: QRCode.js, Archiver (ZIP), Multer (file uploads), Chart.js

## Features

### Photographer
- Register & Login
- Create client galleries (named folders)
- Upload photos (drag & drop, multi-file)
- Share gallery via unique link or QR code
- View download progress per gallery
- Dashboard with analytics charts
- Auto-delete reminder after 30 days

### Client
- Access gallery via shared link (no login needed)
- View photos in beautiful grid layout
- Lightbox viewer with navigation
- Download individual photos or all as ZIP
- Rate photographer (1-5 stars) with review
- Auto-cleanup: files deleted after all downloaded

### Admin
- View all photographers with stats
- Enable/Disable photographer accounts
- Send email to specific photographer or all
- View platform-wide analytics (daily/monthly/yearly)
- Charts: photo delivery trends, top performers
- View all client ratings

## Setup & Run

```bash
cd backend
npm install
node server.js
```

Server runs at: http://localhost:3000

## Default Admin
- Email: admin@photogallery.com
- Password: admin123

## Project Structure
```
photogallery/
├── backend/
│   ├── routes/
│   │   ├── auth.js       # Login, Register
│   │   ├── folders.js    # Gallery management
│   │   ├── gallery.js    # Public client access
│   │   └── admin.js      # Admin panel
│   ├── middleware/
│   │   └── auth.js       # JWT middleware
│   ├── uploads/          # Uploaded images
│   ├── database.js       # SQLite setup
│   ├── server.js         # Main entry point
│   └── gallery.db        # SQLite database
└── frontend/
    ├── index.html        # Landing page
    ├── css/
    │   └── style.css     # Global styles
    └── pages/
        ├── login.html    # Login page
        ├── register.html # Register page
        ├── dashboard.html # Photographer dashboard
        ├── gallery.html  # Client gallery (public)
        └── admin.html    # Admin dashboard
```
