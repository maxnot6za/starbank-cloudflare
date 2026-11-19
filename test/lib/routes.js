// ตัดทรัพยากรภายนอกตอนทดสอบด้วยเบราว์เซอร์ (ฟอนต์/รูปจาก CDN) ให้เร็วและไม่พึ่งเน็ต
// qrcode-generator ใช้จริงจาก node_modules เพราะหน้าเด็ก/ผู้ปกครองเรียกใช้
const path = require('path');
const PNG1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
module.exports = async function routes(p) {
  // สรุปสัปดาห์เด้งเองช่วงอาทิตย์ 17:00–อังคาร → ปิดในเทสต์อื่น (ui-weekly เปิดเองผ่านตั้งค่า)
  await p.addInitScript(() => { try { var t = new Date(Date.now() + 7 * 3600000), d = t.getUTCDay(), b = (d === 0 && t.getUTCHours() >= 17) ? 0 : (d === 0 ? 7 : d); localStorage.setItem('sb_week_seen', new Date(t.getTime() - b * 86400000).toISOString().slice(0, 10)); } catch (e) {} });
  await p.addInitScript(() => { try { if (localStorage.getItem('sb_ui2') === null) localStorage.setItem('sb_ui2', '0'); } catch (e) {} });
  await p.route('**/cdn.jsdelivr.net/**', r => {
    const u = r.request().url();
    if (u.includes('qrcode-generator')) return r.fulfill({ path: path.join(__dirname, '../node_modules/qrcode-generator/qrcode.js'), contentType: 'application/javascript' });
    if (/\.(svg)(\?|$)/.test(u)) return r.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', contentType: 'image/svg+xml' });
    return r.fulfill({ body: PNG1x1, contentType: 'image/png' });
  });
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.route('**/fonts.gstatic.com/**', r => r.abort());
};
// เทสต์ที่ผูกกับเนื้อหา "มีอะไรใหม่" รุ่นเก่า: ตัดรุ่นที่ใหม่กว่า maxV ออกจากหน้าเว็บ (เฉพาะในเทสต์)
module.exports.pinNews = async function pinNews(p, maxV) {
  await p.route(u => new URL(u).pathname === '/', async r => {
    const res = await r.fetch(); let body = await res.text();
    // ตัดเวอร์ชันที่ใหม่กว่า maxV ทิ้ง (กี่เวอร์ชันก็ได้) ให้เทสต์เก่าเห็นมีอะไรใหม่เหมือนตอนเขียน
    const head = 'var WHATS_NEW = [\n', i = body.indexOf(head);
    if (i >= 0) {
      let j = i + head.length, m;
      const re = /  \{ v: (\d+),/g; re.lastIndex = j;
      while ((m = re.exec(body)) && m.index === j && +m[1] > maxV) {
        const next = body.indexOf('\n  { v: ', m.index + 1); if (next < 0) break; j = next + 1; re.lastIndex = j;
      }
      body = body.slice(0, i + head.length) + body.slice(j);
    }
    return r.fulfill({ response: res, body });
  });
};
