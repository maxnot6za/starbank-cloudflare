// ตัดทรัพยากรภายนอกตอนทดสอบด้วยเบราว์เซอร์ (ฟอนต์/รูปจาก CDN) ให้เร็วและไม่พึ่งเน็ต
// qrcode-generator ใช้จริงจาก node_modules เพราะหน้าเด็ก/ผู้ปกครองเรียกใช้
const path = require('path');
const PNG1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
module.exports = async function routes(p) {
  await p.route('**/cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    if (u.includes('qrcode-generator')) return r.fulfill({ path: path.join(__dirname, '../node_modules/qrcode-generator/qrcode.js'), contentType: 'application/javascript' });
    if (/\.(svg)(\?|$)/.test(u)) return r.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', contentType: 'image/svg+xml' });
    return r.fulfill({ body: PNG1x1, contentType: 'image/png' });
  });
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.route('**/fonts.gstatic.com/**', r => r.abort());
};
