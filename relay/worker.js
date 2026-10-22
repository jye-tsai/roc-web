/* ROC 連線轉接器（Cloudflare Worker）
   瀏覽器不能直接開 telnet（TCP），由這支 Worker 把 WebSocket 轉成 TCP 連到 MUD 站台。
   - 只連固定的站台（MUD_HOST:MUD_PORT），不能拿來連別的地方
   - 只接受 ALLOW_ORIGIN 裡列的網站來源（逗號分隔） */
import { connect } from 'cloudflare:sockets';

export default {
  async fetch(req, env) {
    const host = env.MUD_HOST || 'roc.csie.org';
    const port = +(env.MUD_PORT || 5555);
    const text = t => new Response(t + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (req.headers.get('Upgrade') !== 'websocket') {
      /* 用瀏覽器打開 …workers.dev/?test：實際連一次站台，回報結果與站台送來的前幾個字 */
      if (!new URL(req.url).searchParams.has('test')) return text('ROC relay → ' + host + ':' + port + '\n加上 ?test 可以測試連線');
      try {
        const s = connect({ hostname: host, port });
        await Promise.race([s.opened, new Promise((_, no) => setTimeout(() => no(new Error('連線逾時（10 秒）')), 10000))]);
        const r = s.readable.getReader();
        const got = await Promise.race([r.read(), new Promise(ok => setTimeout(() => ok({ value: null }), 5000))]);
        try { s.close(); } catch (e) {}
        const n = got.value ? got.value.length : 0;
        return text('OK：已連上 ' + host + ':' + port + '，收到 ' + n + ' bytes' + (n ? '\n前 64 bytes（hex）：' + [...got.value.slice(0, 64)].map(b => b.toString(16).padStart(2, '0')).join(' ') : '（站台 5 秒內沒有送任何資料）'));
      } catch (e) { return text('失敗：連不到 ' + host + ':' + port + '\n原因：' + (e && e.message || e)); }
    }

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
    /* 給網頁看的狀態訊息：文字框架、開頭 \0relay: */
    const note = m => { try { server.send('\0relay:' + m); } catch (e) {} };
    sock.opened.then(() => note('已連上 ' + host + ':' + port), e => { note('連不到 ' + host + ':' + port + '：' + (e && e.message || e)); close(1011, 'connect failed'); });

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
      catch (e) { note('站台連線錯誤：' + (e && e.message || e)); }
      close(1000, 'mud closed');
    })();

    return new Response(null, { status: 101, webSocket: client });
  }
};
