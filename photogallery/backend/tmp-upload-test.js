const fs = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');

(async() => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwibmFtZSI6IkFuZ2F6YSIsImVtYWlsIjoiYW5nYXphY29kZUBnbWFpbC5jb20iLCJyb2xlIjoicGhvdG9ncmFwaGVyIiwiaWF0IjoxNzgzNDI3Njg0LCJleHAiOjE3ODQwMzI0ODR9.IkC4pGlHgFjD6RiuNNdc2QHmcmKslV4T-dMOZACeoOA';
    const folderId = 1;
    const filePath = path.join(__dirname, 'uploads', 'test-upload.png');
    fs.writeFileSync(filePath, Buffer.from('fake png bytes', 'utf8'));

    const boundary = randomUUID();
    const fileName = 'test-upload.png';
    const contentType = 'image/png';
    const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`),
        fs.readFileSync(filePath),
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/folders/${folderId}/images`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': payload.length
        }
    };

    const uploadRes = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });

    console.log('UPLOAD_RESULT', JSON.stringify(uploadRes, null, 2));

    const listRes = await new Promise((resolve, reject) => {
        const req = http.get({ hostname: 'localhost', port: 3000, path: `/api/folders/${folderId}`, headers: { Authorization: `Bearer ${token}` } }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
    });
    console.log('FOLDER_LIST', listRes.body);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});