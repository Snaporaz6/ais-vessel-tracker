import WebSocket from 'ws';
import { MEDITERRANEAN_BBOX } from '../shared/config.js';
import { AISConnectionError } from '../shared/errors.js';

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;

/** Callback per messaggi ricevuti */
type MessageHandler = (raw: string) => void;

/**
 * Crea e gestisce la connessione WebSocket ad aisstream.io.
 * Riconnette automaticamente in caso di errore.
 */
export function connectAISStream(onMessage: MessageHandler): void {
  const apiKey = process.env['AISSTREAM_API_KEY'];
  if (!apiKey) {
    throw new AISConnectionError('Missing AISSTREAM_API_KEY');
  }

  let reconnectDelay = RECONNECT_DELAY_MS;

  function connect(): void {
    console.log(JSON.stringify({ event: 'ws_connecting', url: AISSTREAM_URL }));

    const ws = new WebSocket(AISSTREAM_URL, {
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
    });

    ws.on('open', () => {
      console.log(JSON.stringify({ event: 'ws_connected' }));
      reconnectDelay = RECONNECT_DELAY_MS;

      // Subscribe con filtro bbox Mediterraneo
      // N.B. aisstream.io usa "Apikey" (non "APIKey") e formato [lon, lat] (non [lat, lon])
      const subscribeMsg = {
        Apikey: apiKey,
        BoundingBoxes: [
          [
            [MEDITERRANEAN_BBOX.lonMin, MEDITERRANEAN_BBOX.latMin],
            [MEDITERRANEAN_BBOX.lonMax, MEDITERRANEAN_BBOX.latMax],
          ],
        ],
      };

      ws.send(JSON.stringify(subscribeMsg));
      console.log(JSON.stringify({ event: 'ws_subscribed', bbox: MEDITERRANEAN_BBOX }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      const raw = data.toString();
      onMessage(raw);
    });

    ws.on('error', (err: Error) => {
      console.log(JSON.stringify({ event: 'ws_error', error: err.message }));
    });

    ws.on('close', (code: number, reason: Buffer) => {
      console.log(JSON.stringify({
        event: 'ws_closed',
        code,
        reason: reason.toString(),
        reconnect_in_ms: reconnectDelay,
      }));

      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        connect();
      }, reconnectDelay);
    });
  }

  connect();
}
