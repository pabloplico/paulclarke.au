import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Save original env
const origEnv = { ...process.env };

function mockFetch(body: string | object, ok = true, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === 'object' ? body : JSON.parse(text)),
  } as Response);
}

beforeEach(() => {
  process.env.ABN_LOOKUP_GUID = 'test-guid';
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...origEnv };
});

describe('searchAbnByName', () => {
  async function getModule() {
    // Re-import to pick up env changes (ABN_GUID is read at module level)
    vi.resetModules();
    return import('./abn-lookup');
  }

  it('returns empty array when ABN_LOOKUP_GUID is missing', async () => {
    delete process.env.ABN_LOOKUP_GUID;
    const { searchAbnByName } = await getModule();
    const result = await searchAbnByName('test');
    expect(result).toEqual([]);
  });

  it('parses JSONP response and returns active ABNs', async () => {
    const jsonpBody = `callback(${JSON.stringify({
      Names: [
        {
          Abn: '51824753556',
          AbnStatus: 'Active',
          Name: 'AUSTRALIAN TAXATION OFFICE',
          NameType: 'Main',
          State: 'ACT',
          Postcode: '2600',
          Score: 100,
        },
        {
          Abn: '00000000001',
          AbnStatus: 'Cancelled',
          Name: 'OLD COMPANY',
          NameType: 'Main',
          State: 'NSW',
          Postcode: '2000',
          Score: 80,
        },
        {
          Abn: '12345678901',
          AbnStatus: 'Active',
          Name: 'ACME PTY LTD',
          NameType: 'Main',
          State: 'VIC',
          Postcode: '3000',
          Score: 90,
        },
      ],
    })})`;
    mockFetch(jsonpBody);
    const { searchAbnByName } = await getModule();

    const results = await searchAbnByName('taxation');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      source: 'abn',
      companyName: 'AUSTRALIAN TAXATION OFFICE',
      abn: '51824753556',
      state: 'ACT',
      postcode: '2600',
      address: 'ACT 2600',
    });
    // Cancelled ABN should be filtered out
    expect(results.find((r) => r.abn === '00000000001')).toBeUndefined();
  });

  it('returns empty array when fetch fails', async () => {
    mockFetch('', false, 500);
    const { searchAbnByName } = await getModule();
    const result = await searchAbnByName('test');
    expect(result).toEqual([]);
  });

  it('returns empty array when response has no Names', async () => {
    mockFetch('callback({})');
    const { searchAbnByName } = await getModule();
    const result = await searchAbnByName('test');
    expect(result).toEqual([]);
  });

  it('returns empty array for malformed JSONP', async () => {
    mockFetch('callback(NOT VALID JSON)');
    const { searchAbnByName } = await getModule();
    const result = await searchAbnByName('test');
    expect(result).toEqual([]);
  });

  it('encodes name in URL', async () => {
    const spy = mockFetch('callback({"Names":[]})');
    const { searchAbnByName } = await getModule();
    await searchAbnByName('test & co');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('name=test%20%26%20co'));
  });
});

describe('lookupAbn', () => {
  async function getModule() {
    vi.resetModules();
    return import('./abn-lookup');
  }

  it('returns null when ABN_LOOKUP_GUID is missing', async () => {
    delete process.env.ABN_LOOKUP_GUID;
    const { lookupAbn } = await getModule();
    const result = await lookupAbn('51824753556');
    expect(result).toBeNull();
  });

  it('returns entity details for valid ABN', async () => {
    const jsonpBody = `callback(${JSON.stringify({
      Abn: '51824753556',
      AbnStatus: 'Active',
      AbnStatusEffectiveFrom: '01 Jul 1999',
      EntityName: 'AUSTRALIAN TAXATION OFFICE',
      EntityTypeName: 'Commonwealth Government Entity',
      Gst: '01 Jul 2000',
      AddressState: 'ACT',
      AddressPostcode: '2600',
      Message: '',
    })})`;
    mockFetch(jsonpBody);
    const { lookupAbn } = await getModule();

    const result = await lookupAbn('51 824 753 556');
    expect(result).toEqual({
      source: 'abn',
      companyName: 'AUSTRALIAN TAXATION OFFICE',
      abn: '51824753556',
      entityType: 'Commonwealth Government Entity',
      state: 'ACT',
      postcode: '2600',
      address: 'ACT 2600',
      gstRegistered: true,
    });
  });

  it('returns null when API returns error message', async () => {
    mockFetch(`callback(${JSON.stringify({ Message: 'Search text is not a valid ABN or ACN' })})`);
    const { lookupAbn } = await getModule();
    const result = await lookupAbn('00000000000');
    expect(result).toBeNull();
  });

  it('returns null when fetch fails', async () => {
    mockFetch('', false, 503);
    const { lookupAbn } = await getModule();
    const result = await lookupAbn('51824753556');
    expect(result).toBeNull();
  });

  it('returns null for malformed JSONP', async () => {
    mockFetch('callback({broken');
    const { lookupAbn } = await getModule();
    const result = await lookupAbn('51824753556');
    expect(result).toBeNull();
  });

  it('strips spaces from ABN in request URL', async () => {
    const spy = mockFetch(`callback(${JSON.stringify({ Message: 'not found' })})`);
    const { lookupAbn } = await getModule();
    await lookupAbn('51 824 753 556');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('abn=51824753556'));
  });

  it('detects non-GST-registered entity', async () => {
    mockFetch(
      `callback(${JSON.stringify({
        Abn: '12345678901',
        AbnStatus: 'Active',
        EntityName: 'SMALL BIZ',
        EntityTypeName: 'Individual/Sole Trader',
        Gst: '',
        AddressState: 'NSW',
        AddressPostcode: '2000',
        Message: '',
      })})`
    );
    const { lookupAbn } = await getModule();
    const result = await lookupAbn('12345678901');
    expect(result?.gstRegistered).toBe(false);
  });
});
