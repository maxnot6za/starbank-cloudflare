// ธนาคารดาว — service worker สำหรับแจ้งเตือนเท่านั้น (ไม่เก็บแคชหน้าเว็บ)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'ธนาคารดาว', body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    data: { url: d.url || '/', subId: d.subId || '', kind: d.kind || '' },
    renotify: true,
  };
  // Android/คอม: กดอนุมัติจากแจ้งเตือนได้เลย (iPhone ไม่แสดงปุ่ม → แตะแล้วเปิดหน้ารออนุมัติ)
  if (d.kind === 'submit' && d.subId) opts.actions = [{ action: 'approve', title: '✅ อนุมัติ' }, { action: 'open', title: 'เปิดดู' }];
  if (d.nid) opts.data.nid = d.nid;
  const jobs = [self.registration.showNotification(d.title || 'ธนาคารดาว', opts).then(() => ack(d.nid, 'shown'))];
  // ตัวเลขบนไอคอนแอป = เรื่องที่รอผู้ปกครองจัดการ
  if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) {
    jobs.push((d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  e.waitUntil(Promise.all(jobs));
});

// ใบตอบรับ: บอกเซิร์ฟเวอร์ว่าแจ้งเตือนเด้งขึ้นจอเครื่องนี้แล้ว (หรือผู้ปกครองแตะแล้ว)
function ack(nid, ev) {
  if (!nid) return Promise.resolve();
  return fetch('/push/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nid, ev }) }).catch(() => {});
}

self.addEventListener('notificationclick', e => {
  const n = e.notification, data = n.data || {};
  n.close();
  ack(data.nid, 'click');
  if (e.action === 'approve' && data.subId) {
    e.waitUntil(
      fetch('/api/reviewSubmission', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ args: [data.subId, 'approved', ''] }),
      }).then(r => r.json()).then(j => self.registration.showNotification(
        j && j.ok ? '✅ อนุมัติแล้ว' : '⚠️ อนุมัติไม่สำเร็จ',
        { body: j && j.ok ? `+${j.value.starsEarned} ดาว` : ((j && j.error) || 'เปิดแอปเพื่อลองอีกครั้ง'), tag: 'done-' + data.subId, icon: '/icons/icon-192.png', data: { url: '/#approvals' } }
      )).catch(() => self.clients.openWindow('/#approvals'))
    );
    return;
  }
  const url = new URL(data.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) {
        c.postMessage({ type: 'open', url: data.url || '/' });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
