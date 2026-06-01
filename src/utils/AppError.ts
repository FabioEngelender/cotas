export class AppError extends Error {
  public code?: string;
  public details?: any;

  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static fromError(err: any): AppError {
    if (err instanceof AppError) return err;
    let message = 'Ocorreu um erro inesperado.';
    let code = 'UNKNOWN';
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'string') {
      message = err;
    }
    
    // Check if it's a firebase auth exception or firestore JSON-stringified error info
    try {
      if (message.trim().startsWith('{')) {
        const parsed = JSON.parse(message);
        if (parsed.error) {
          return new AppError(`Erro de permissão ou operação: ${parsed.error}`, 'FIRESTORE_ERROR', parsed);
        }
      }
    } catch (_) {}

    return new AppError(message, code, err);
  }
}
