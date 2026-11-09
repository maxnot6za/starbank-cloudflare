// ศูนย์กลางสัญญาณของแต่ละครอบครัว (Durable Object 1 ตัวต่อ 1 ครอบครัว)
// เก็บแค่การเชื่อมต่อของหน้าจอที่เปิดอยู่ + นาฬิกาปลุกของภารกิจด่วน (ไม่เก็บข้อมูลครอบครัว)
// ใช้ WebSocket แบบ hibernation: ตอนเงียบไม่กินโควตา, 'ping' ตอบ 'pong' อัตโนมัติโดยไม่ต้องปลุก
import { runUrgentSweep } from './urgent-run.js';

export class FamilyHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  broadcast(from) {
    const msg = JSON.stringify({ type: 'changed', from: from || '', at: Date.now() });
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); } catch (e) {}
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/connect') {
      if (request.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/notify') {
      let from = '';
      try { from = String((await request.json()).from || ''); } catch (e) {}
      this.broadcast(from);
      return new Response('ok');
    }
    if (url.pathname === '/urgent-wake') {
      let b = {};
      try { b = await request.json(); } catch (e) {}
      const at = Number(b.at);
      if (!b.familyId || !(at > 0)) return new Response('bad', { status: 400 });
      await this.state.storage.put({ familyId: String(b.familyId), origin: String(b.origin || '') });
      const cur = await this.state.storage.getAlarm();
      if (!cur || at < cur) await this.state.storage.setAlarm(Math.max(at, Date.now() + 1000));
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  // ถึงเวลา: ปิดภารกิจด่วนที่หมดเวลา / เตือนเด็ก แล้วตั้งปลุกครั้งถัดไป
  async alarm() {
    const familyId = await this.state.storage.get('familyId');
    const origin = (await this.state.storage.get('origin')) || '';
    if (!familyId || !this.env || !this.env.DB) return;
    const r = await runUrgentSweep(this.env, familyId, origin);
    if (r.changed) this.broadcast('');
    if (r.next) await this.state.storage.setAlarm(Math.max(r.next, Date.now() + 1000));
  }

  webSocketMessage() {}
  webSocketClose(ws, code, reason) { try { ws.close(code, reason); } catch (e) {} }
  webSocketError(ws) { try { ws.close(1011, 'error'); } catch (e) {} }
}
