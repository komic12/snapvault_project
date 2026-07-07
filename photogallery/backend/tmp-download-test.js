const http = require('http');

(async() => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwibmFtZSI6IkFuZ2F6YSIsImVtYWlsIjoiYW5nYXphY29kZUBnbWFpbC5jb20iLCJyb2xlIjoicGhvdG9ncmFwaGVyIiwiaWF0IjoxNzgzNDI3Njg0LCJleHAiOjE3ODQwMzI0ODR9.IkC4pGlHgFjD6RiuNNdc2QHmcmKslV4T-dMOZACeoOA';
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/folders/1/images/1',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
    };

    const res = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = [];
            res.on('data', (chunk) => data.push(Buffer.from(chunk)));
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(data) }));
        });
        req.on('error', reject);
        req.end();
    });

    console.log(JSON.stringify({ statusCode: res.statusCode, headers: res.headers, bodyLength: res.body.length, bodyPreview: res.body.slice(0, 80).toString('hex') }, null, 2));
})().catch((err) => {
    console.error(err);
    process.exit(1);
});