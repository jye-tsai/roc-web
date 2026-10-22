/* ROC 連線轉接器（Cloudflare Worker）
   瀏覽器不能直接開 telnet（TCP），由這支 Worker 把 WebSocket 轉成 TCP 連到 MUD 站台。
   - 只連固定的站台（MUD_HOST:MUD_PORT），不能拿來連別的地方
   - 只接受 ALLOW_ORIGIN 裡列的網站來源（逗號分隔） */
import { connect } from 'cloudflare:sockets';

export default {
  async fetch(req, env) {
    const host = env.MUD_HOST || 'roc.csie.org';
    const port = +(env.MUD_PORT || 5555);
    if (req.headers.get('Upgrade') !== 'websocket')
      return new Response('ROC relay → ' + host + ':' + port + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });

    const allow = (env.ALLOW_ORIGIN || 'https://jye-tsai.github.io,http://localhost:8765').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    if (allow.length && !allow.includes(origin)) return new Response('origin not allowed', { status: 403 });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    let sock;
    try { sock = connect({ hostname: host, port }); }
    catch (e) { server.close(1011, 'connect failed'); return new Response(null, { status: 101, webSocket: client }); }
    const writer = sock.writable.getWriter();
    const close = (code, why) => { try { server.close(code, why); } catch (e) {} try { sock.close(); } catch (e) {} };

    /* 瀏覽器 → MUD：原樣轉送位元組 */
    server.addEventListener('message', e => {
      const data = typeof e.data === 'string' ? new TextEncoder().encode(e.data) : new Uint8Array(e.data);
      writer.write(data).catch(() => close(1011, 'write failed'));
    });
    server.addEventListener('close', () => close(1000, 'client closed'));
    server.addEventListener('error', () => close(1011, 'client error'));

    /* MUD → 瀏覽器 */
    (async () => {
      const reader = sock.readable.getReader();
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; server.send(value); } }
      catch (e) {}
      close(1000, 'mud closed');
    })();

    return new Response(null, { status: 101, webSocket: client });
  }
};
