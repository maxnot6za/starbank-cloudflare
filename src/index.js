// ธนาคารดาว — Worker ทดสอบชุดแรก (ยังไม่แตะข้อมูลจริง)
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, app: 'starbank', stage: 'hello', time: new Date().toISOString() });
    }
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>ธนาคารดาว</title><body style="font-family:sans-serif;background:#EEF8F4;color:#1F3B35;display:grid;place-items:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><div style="font-size:64px">⭐</div><h1>ธนาคารดาว บน Cloudflare</h1><p>เชื่อมต่อสำเร็จ — กำลังเตรียมระบบ</p></div></body>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  },
};
