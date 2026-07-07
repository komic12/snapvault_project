const fs = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');

(async() => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwibmFtZSI6IkFuZ2F6YSIsImVtYWlsIjoiYW5nYXphY29kZUBnbWFpbC5jb20iLCJyb2xlIjoicGhvdG9ncmFwaGVyIiwiaWF0IjoxNzgzNDI3Njg0LCJleHAiOjE3ODQwMzI0ODR9.IkC4pGlHgFjD6RiuNNdc2QHmcmKslV4T-dMOZACeoOA';
    const folderId = 1;
    const fileName = 'share-link-retest.png';
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAIAAeIhvAAAAAElFTkSuQmCC';
    const fileBuffer = Buffer.from(pngBase64, 'base64');
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, fileBuffer);

    const boundary = randomUUID();
    const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/folders/${folderId}/images`,
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': payload.length
        }
    };

    const res = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });

    console.log(JSON.stringify(res, null, 2));
})().catch((err) => {
    console.error(err);
    process.exit(1);
});