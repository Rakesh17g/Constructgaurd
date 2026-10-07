const http = require('http');
const https = require('https');

http.get('http://localhost:5173/models/ppe-yolo26n.onnx', (res) => {
    console.log(`Localhost Status: ${res.statusCode}`);
    console.log(`Localhost Content-Type: ${res.headers['content-type']}`);
}).on('error', (e) => console.error(e));

https.get('https://site-sentinel-lake.vercel.app/models/ppe-yolo26n.onnx', (res) => {
    console.log(`Vercel Status: ${res.statusCode}`);
    console.log(`Vercel Content-Type: ${res.headers['content-type']}`);
}).on('error', (e) => console.error(e));
