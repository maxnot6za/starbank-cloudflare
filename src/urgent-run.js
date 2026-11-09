// ภารกิจด่วน: งานที่นาฬิกาปลุกของครอบครัว (FamilyHub) เรียก — ปิดที่หมดเวลา + ส่งเตือนใกล้หมดเวลา
import { Store, ConflictError } from './store.js';
import { createCore } from './core.js';
import { notifyApp } from './push.js';

export async function runUrgentSweep(env, familyId, origin) {
  for (let attempt = 0; ; attempt++) {
    const store = new Store(env.DB);
    const S = { store, outbox: [], webAppUrl: origin + '/', events: [] };
    try {
      await store.load({ familyIds: [String(familyId)] }, { fn: 'urgentSweep' });
      const core = createCore(S);
      const next = core.urgentSweep(String(familyId));
      await store.flush();
      if (S.events.length) await notifyApp(env, origin, S.events).catch(e => console.log('urgent push error', e));
      return { next, changed: store.touched.size > 0 };
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      throw e;
    }
  }
}
