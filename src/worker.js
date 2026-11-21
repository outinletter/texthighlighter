import { DurableObject } from 'cloudflare:workers';

// Counts open WebSocket connections (hibernation API) and broadcasts the number to every visitor.
export class VisitorCounter extends DurableObject {
  broadcast(exclude) {
    const sockets = this.ctx.getWebSockets().filter(ws => ws !== exclude);
    const count = String(sockets.length);
    for (const ws of sockets) { try { ws.send(count); } catch {} }
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage() {}
  webSocketClose(ws) { ws.close(); this.broadcast(ws); }
  webSocketError(ws) { this.broadcast(ws); }
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/visitors' && env.VISITORS) {
      return env.VISITORS.get(env.VISITORS.idFromName('global')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
