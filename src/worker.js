import { DurableObject } from 'cloudflare:workers';

// Counts open WebSocket connections (hibernation API) and broadcasts the number to every visitor.
export class VisitorCounter extends DurableObject {
  weekId() { return Math.floor((Date.now() - 4 * 86400000) / (7 * 86400000)); } // weeks start on Monday (UTC)
  async weekly(visitorId) {
    const prefix = `v:${this.weekId()}:`;
    if (visitorId) await this.ctx.storage.put(prefix + visitorId, 1);
    return (await this.ctx.storage.list({ prefix })).size;
  }
  async broadcast(exclude) {
    const sockets = this.ctx.getWebSockets().filter(ws => ws !== exclude);
    const message = JSON.stringify({ live: sockets.length, week: await this.weekly() });
    for (const ws of sockets) { try { ws.send(message); } catch {} }
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const id = new URL(request.url).searchParams.get('vid') || '';
    if (/^[A-Za-z0-9-]{8,64}$/.test(id)) await this.weekly(id);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    await this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage() {}
  async webSocketClose(ws) { ws.close(); await this.broadcast(ws); }
  async webSocketError(ws) { await this.broadcast(ws); }
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/visitors' && env.VISITORS) {
      return env.VISITORS.get(env.VISITORS.idFromName('global')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
