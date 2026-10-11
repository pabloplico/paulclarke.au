/**
 * Base class for document processing errors with classification.
 */
export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly permanent: boolean,
    public readonly stage?: string
  ) {
    super(message);
    this.name = 'ProcessingError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      permanent: this.permanent,
      stage: this.stage,
    };
  }
}

/**
 * Error that will not resolve on retry (unsupported file type, corrupt file, invalid input).
 * Worker should discard the job immediately.
 */
export class PermanentProcessingError extends ProcessingError {
  constructor(message: string, code: string, stage?: string) {
    super(message, code, true, stage);
    this.name = 'PermanentProcessingError';
  }
}

/**
 * Error that may resolve on retry (network timeout, rate limit, temporary service outage).
 * Worker should allow BullMQ retry logic.
 */
export class TransientProcessingError extends ProcessingError {
  constructor(message: string, code: string, stage?: string) {
    super(message, code, false, stage);
    this.name = 'TransientProcessingError';
  }
}
