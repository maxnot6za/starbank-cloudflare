// รันทดสอบทั้งหมด: node run.js  ·  ข้ามเทสต์ที่ช้า (นาฬิกาปลุก ~65 วิ, UI สองเครื่อง): node run.js --quick
const { spawnSync } = require('child_process');
const quick = process.argv.includes('--quick');
const files = ['api.test.js', 'page.test.js', 'password.test.js', 'sprites.test.js', 'shop.test.js', ...(quick ? [] : ['urgent.test.js', 'ui-urgent.test.js', 'ui-shop.test.js', 'ui-tree.test.js', 'theme.test.js', 'ui-stage.test.js'])];
const failed = [];
for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  const r = spawnSync(process.execPath, [__dirname + '/' + f], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
console.log('\n' + (failed.length ? '✗ ไม่ผ่าน: ' + failed.join(', ') : '✓ ผ่านทุกไฟล์'));
process.exit(failed.length ? 1 : 0);
