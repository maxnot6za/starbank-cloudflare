// ศูนย์กลางสัญญาณของแต่ละครอบครัว (Durable Object 1 ตัวต่อ 1 ครอบครัว)
// เก็บแค่การเชื่อมต่อของหน้าจอที่เปิดอยู่ ไม่เก็บข้อมูลใด ๆ
// ใช้ WebSocket แบบ hibernation: ตอนเงียบไม่กินโควตา, 'ping' ตอบ 'pong' อัตโนมัติโดยไม่ต้องปลุก
export class FamilyHub {
  constructor(state) {
    this.state = state;
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
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
      const msg = JSON.stringify({ type: 'changed', from, at: Date.now() });
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(msg); } catch (e) {}
      }
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  webSocketMessage() {}
  webSocketClose(ws, code, reason) { try { ws.close(code, reason); } catch (e) {} }
  webSocketError(ws) { try { ws.close(1011, 'error'); } catch (e) {} }
}
