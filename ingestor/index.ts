import 'dotenv/config';
import { connectAISStream } from './ws-client.js';
import { parseAISMessage } from './parser.js';
import { shouldAcceptPosition } from './filter.js';
import { initDB, bufferPosition, upsertVessel } from './db-writer.js';
import { initAnomalyDetector, checkAnomalies, saveAnomalies } from './anomaly-detector.js';

/** Contatori per logging periodico */
let stats = { received: 0, accepted: 0, filtered: 0, static: 0, anomalies: 0 };

function logStats(): void {
  console.log(JSON.stringify({ event: 'ingestor_stats', ...stats }));
  stats = { received: 0, accepted: 0, filtered: 0, static: 0, anomalies: 0 };
}

/** Entry point ingestor */
function main(): void {
  console.log(JSON.stringify({ event: 'ingestor_starting' }));

  initDB();
  initAnomalyDetector();

  // Log stats ogni 60 secondi
  setInterval(logStats, 60_000).unref();

  connectAISStream((raw: string) => {
    stats.received++;

    const result = parseAISMessage(raw);
    if (!result) return;

    if (result.type === 'position') {
      if (shouldAcceptPosition(result.position)) {
        stats.accepted++;
        bufferPosition(result.position);

        // Anomaly detection su ogni posizione accettata
        const anomalies = checkAnomalies(result.position);
        if (anomalies.length > 0) {
          stats.anomalies += anomalies.length;
          void saveAnomalies(result.position.mmsi, anomalies);
        }
      } else {
        stats.filtered++;
      }
    } else if (result.type === 'static') {
      stats.static++;
      void upsertVessel(result.vessel);
    }
  });
}

main();
