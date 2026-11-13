// ข้อมูลครอบครัวปลอมสำหรับทดสอบ (ห้ามใส่ข้อมูลครอบครัวจริงในไฟล์นี้ — repo เป็น public)
// ครอบครัว FAM: พ่อ (P1), แม่ (P2), ลูก (C) · ครอบครัว FAM2: อีกบ้านหนึ่ง ใช้ทดสอบว่าข้อมูลไม่ข้ามครอบครัว
// รหัสลูกเป็นตัวเลขล้วน เพื่อทดสอบว่าระบบเทียบรหัสแบบข้อความถูกต้อง
const FAM = 'fam000000001', FAM2 = 'fam000000002';
const P1 = 'a1b2c3d4e5f6', P2 = '112233445566', C = '778899001122', P3 = '9f9f9f9f9f9f';

const ROWS = {
  Families: [
    { family_id: FAM, family_name: 'ครอบครัวทดสอบ', join_code: 'TEST01', created_at: '2026-11-01T00:00:00.000Z' },
    { family_id: FAM2, family_name: 'อีกบ้านหนึ่ง', join_code: 'TEST02', created_at: '2026-11-01T00:00:00.000Z' },
  ],
  Members: [
    { member_id: P1, family_id: FAM, name: 'พ่อ', role: 'parent', avatar: '👨', line_user_id: 'Utest1', created_at: '2026-11-01T00:00:00.000Z', notify_submission: 1 },
    { member_id: P2, family_id: FAM, name: 'แม่', role: 'parent', avatar: '👩', line_user_id: 'Utest2', created_at: '2026-11-01T00:00:00.000Z', notify_submission: 1 },
    { member_id: C, family_id: FAM, name: 'ลูก', role: 'child', avatar: '🐱', created_at: '2026-11-01T00:00:00.000Z' },
    { member_id: P3, family_id: FAM2, name: 'พ่ออีกบ้าน', role: 'parent', avatar: '👨', line_user_id: 'Utest3', created_at: '2026-11-01T00:00:00.000Z', notify_submission: 1 },
  ],
  Missions: [
    { mission_id: 'm1', family_id: FAM, title: 'ทำการบ้านเสร็จ', base_stars: 3, multiplier: 1, icon: '📚', is_active: 1, created_by: P1 },
    { mission_id: 'm2', family_id: FAM, title: 'แปรงฟัน', base_stars: 1, multiplier: 1, icon: '🦷', is_active: 1, created_by: P1 },
    { mission_id: 'mx', family_id: FAM2, title: 'งานบ้านอื่น', base_stars: 50, multiplier: 1, icon: '⭐', is_active: 1, created_by: P3 },
  ],
  Rewards: [
    { reward_id: 'r1', family_id: FAM, title: 'เค้กของแม่', stars_cost: 3, type: 'physical', quantity: 5, icon: '🍰', is_active: 1, created_by: P1 },
    { reward_id: 'rx', family_id: FAM2, title: 'ของบ้านอื่น', stars_cost: 1, type: 'physical', quantity: 9, icon: '🎁', is_active: 1, created_by: P3 },
  ],
  Submissions: ['approved', 'approved', 'rejected', 'approved', 'pending', 'approved', 'approved'].map((s, i) => ({
    submission_id: 's' + i, mission_id: i % 2 ? 'm2' : 'm1', child_id: C, family_id: FAM,
    mission_title: i % 2 ? 'แปรงฟัน' : 'ทำการบ้านเสร็จ', status: s, stars_earned: s === 'approved' ? (i % 2 ? 1 : 3) : 0,
    submitted_at: `2026-11-0${(i % 6) + 1}T05:00:00.000Z`, reviewed_by: P1, reviewed_at: s === 'pending' ? '' : '2026-11-06T06:00:00.000Z',
  })),
  Redemptions: [
    { redemption_id: 'd1', reward_id: 'r1', child_id: C, family_id: FAM, reward_title: 'เค้กของแม่', stars_spent: 3, redeemed_at: '2026-11-05T10:00:00.000Z' },
  ],
};
// ยอดดาวเริ่มต้นของลูก: อนุมัติ s0(3)+s1(1)+s3(1)+s5(1)+s6(3) = 9, แลกไป 3 → 6
const START_BALANCE = 6;

async function seedFamily(db) {
  for (const [table, rows] of Object.entries(ROWS)) {
    for (const row of rows) {
      const cols = Object.keys(row);
      await db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map(c => row[c])).run();
    }
  }
  // ป๊อปอัป "มีอะไรใหม่" ไม่ให้บังเทสต์อื่น (ui-news.test.js ล้างค่านี้เอง)
  await db.prepare('UPDATE Members SET news_seen = 9999').run();
}

module.exports = { seedFamily, FAM, FAM2, P1, P2, P3, C, START_BALANCE };
