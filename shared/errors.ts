/** Classe base per errori custom del progetto */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Risorsa non trovata (404) */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/** Input non valido (400) */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/** Errore connessione WebSocket AIS */
export class AISConnectionError extends AppError {
  constructor(message: string) {
    super(message, 'AIS_CONNECTION_ERROR', 502);
    this.name = 'AISConnectionError';
  }
}

/** Errore database */
export class DatabaseError extends AppError {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

/** Rate limit superato (429) */
export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests', 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}
