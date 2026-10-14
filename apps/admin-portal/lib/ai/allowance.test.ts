import { describe, expect, it } from 'vitest';
import { aiBudgetResponse } from './allowance';
import { AiBudgetError } from './guard';

describe('aiBudgetResponse', () => {
  it('turns a refused AI call into a 429 with the reason', async () => {
    const res = aiBudgetResponse(new AiBudgetError('The daily budget is spent.'));
    expect(res?.status).toBe(429);
    expect(await res?.json()).toEqual({ error: 'The daily budget is spent.' });
  });

  it('leaves other errors to the route', () => {
    expect(aiBudgetResponse(new Error('network'))).toBeNull();
  });
});
