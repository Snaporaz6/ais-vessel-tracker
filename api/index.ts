import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Previene crash su promise rejection non gestite (Express 4 non cattura i throw async)
process.on('unhandledRejection', (reason) => {
  console.log(JSON.stringify({ event: 'unhandled_rejection', error: String(reason) }));
});

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppError } from '../shared/errors.js';
import { API_PORT, RATE_LIMIT_RPM } from '../shared/config.js';

import searchRouter from './routes/search.js';
import vesselRouter from './routes/vessel.js';
import trackRouter from './routes/track.js';
import liveRouter from './routes/live.js';
import portcallsRouter from './routes/portcalls.js';
import anomaliesRouter from './routes/anomalies.js';

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_RPM,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// Routes
app.use('/api/search', searchRouter);
app.use('/api/vessel', vesselRouter);
app.use('/api/vessel', trackRouter);
app.use('/api/map/live', liveRouter);
app.use('/api/vessel', portcallsRouter);
app.use('/api/vessel', anomaliesRouter);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.log(JSON.stringify({ event: 'api_error', error: message }));
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env['API_PORT']) || API_PORT;

app.listen(port, () => {
  console.log(JSON.stringify({ event: 'api_started', port }));
});
