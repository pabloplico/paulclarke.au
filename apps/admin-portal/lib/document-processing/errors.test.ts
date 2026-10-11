import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermanentProcessingError, ProcessingError, TransientProcessingError } from './errors';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProcessingError', () => {
  it('TC-301 — happy path: constructs with all fields', () => {
    const err = new ProcessingError('file corrupt', 'CORRUPT_FILE', true, 'parse');
    expect(err.message).toBe('file corrupt');
    expect(err.code).toBe('CORRUPT_FILE');
    expect(err.permanent).toBe(true);
    expect(err.stage).toBe('parse');
    expect(err.name).toBe('ProcessingError');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ProcessingError).toBe(true);
  });

  it('TC-302 — happy path: constructs without optional stage', () => {
    const err = new ProcessingError('bad input', 'BAD_INPUT', false);
    expect(err.stage).toBeUndefined();
  });

  it('TC-303 — happy path: toJSON returns correct shape', () => {
    const err = new ProcessingError('bad input', 'BAD_INPUT', false, 'validate');
    expect(err.toJSON()).toEqual({
      code: 'BAD_INPUT',
      message: 'bad input',
      permanent: false,
      stage: 'validate',
    });
  });

  it('TC-304 — boundary condition: toJSON with undefined stage includes stage: undefined', () => {
    const err = new ProcessingError('msg', 'CODE', true);
    const json = err.toJSON();
    expect(json.stage).toBeUndefined();
    expect('stage' in json).toBe(true);
  });

  it('TC-305 — happy path: is serializable via JSON.stringify', () => {
    const err = new ProcessingError('msg', 'CODE', true, 'extract');
    const parsed = JSON.parse(JSON.stringify(err.toJSON()));
    expect(parsed).toEqual({ code: 'CODE', message: 'msg', permanent: true, stage: 'extract' });
  });

  it('TC-306 — boundary condition: permanent field is the exact boolean true, not truthy', () => {
    const err = new ProcessingError('msg', 'C', true, 'x');
    expect(err.permanent === true).toBe(true);
    expect(typeof err.permanent).toBe('boolean');
  });
});

describe('PermanentProcessingError', () => {
  it('TC-307 — happy path: permanent is always true', () => {
    const err = new PermanentProcessingError('unsupported type', 'UNSUPPORTED_TYPE', 'extract');
    expect(err.permanent).toBe(true);
    expect(err.name).toBe('PermanentProcessingError');
    expect(err.code).toBe('UNSUPPORTED_TYPE');
    expect(err.stage).toBe('extract');
    expect(err.message).toBe('unsupported type');
  });

  it('TC-308 — happy path: instanceof chain', () => {
    const err = new PermanentProcessingError('msg', 'CODE');
    expect(err instanceof PermanentProcessingError).toBe(true);
    expect(err instanceof ProcessingError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('TC-309 — happy path: constructs without stage', () => {
    const err = new PermanentProcessingError('msg', 'CODE');
    expect(err.stage).toBeUndefined();
  });

  it('TC-310 — happy path: toJSON reflects permanent: true', () => {
    const err = new PermanentProcessingError('corrupt', 'CORRUPT', 'parse');
    expect(err.toJSON()).toEqual({
      code: 'CORRUPT',
      message: 'corrupt',
      permanent: true,
      stage: 'parse',
    });
  });

  it("TC-311 — boundary condition: name is 'PermanentProcessingError', NOT 'ProcessingError'", () => {
    const err = new PermanentProcessingError('msg', 'C');
    expect(err.name).toBe('PermanentProcessingError');
    expect(err.name).not.toBe('ProcessingError');
  });
});

describe('TransientProcessingError', () => {
  it('TC-312 — happy path: permanent is always false', () => {
    const err = new TransientProcessingError('rate limit', 'RATE_LIMIT', 'embed');
    expect(err.permanent).toBe(false);
    expect(err.name).toBe('TransientProcessingError');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.stage).toBe('embed');
    expect(err.message).toBe('rate limit');
  });

  it('TC-313 — happy path: instanceof chain', () => {
    const err = new TransientProcessingError('timeout', 'TIMEOUT');
    expect(err instanceof TransientProcessingError).toBe(true);
    expect(err instanceof ProcessingError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('TC-314 — happy path: constructs without stage', () => {
    const err = new TransientProcessingError('msg', 'CODE');
    expect(err.stage).toBeUndefined();
  });

  it('TC-315 — happy path: toJSON reflects permanent: false', () => {
    const err = new TransientProcessingError('timeout', 'TIMEOUT', 'route');
    expect(err.toJSON()).toEqual({
      code: 'TIMEOUT',
      message: 'timeout',
      permanent: false,
      stage: 'route',
    });
  });

  it("TC-316 — boundary condition: name is 'TransientProcessingError', NOT 'ProcessingError'", () => {
    const err = new TransientProcessingError('msg', 'C');
    expect(err.name).toBe('TransientProcessingError');
  });
});

describe('Error discrimination by permanent field', () => {
  it('TC-317 — happy path: worker can discriminate retry policy using permanent flag', () => {
    const perm = new PermanentProcessingError('unsupported type', 'UNSUPPORTED_TYPE');
    const trans = new TransientProcessingError('rate limit', 'RATE_LIMIT');
    expect(perm.permanent).toBe(true);
    expect(trans.permanent).toBe(false);
  });

  it('TC-318 — boundary condition: two error types are not interchangeable via instanceof', () => {
    const perm = new PermanentProcessingError('msg', 'C');
    const trans = new TransientProcessingError('msg', 'C');
    expect(perm instanceof TransientProcessingError).toBe(false);
    expect(trans instanceof PermanentProcessingError).toBe(false);
  });
});
