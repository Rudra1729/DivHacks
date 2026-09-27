import { GrokAgent, parseProposal } from '../../src/agent/grok';
import { AgentInput } from '../../src/agent/types';

const input: AgentInput = {
  place: {
    id: 'apollo',
    name: 'Apollo Theater',
    neighborhood: 'Harlem',
    latitude: 40.81,
    longitude: -73.95,
    radiusMeters: 150,
    baseReward: 2,
    collectionAddress: 'collection1',
    imageUrl: 'https://example.com/apollo.png',
  },
  xrplAddress: 'rUser',
  caption: 'Loved the show',
};

const fallback = {
  amount: 2,
  recipient: 'rUser',
  reason: expect.stringContaining('Base reward used'),
};

function grokReplying(content: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

function agentWith(fetchFn: jest.Mock, apiKey: string | null = 'key'): GrokAgent {
  return new GrokAgent({
    apiKey: apiKey ?? undefined,
    model: 'grok-test',
    endpoint: 'https://grok.test/v1/chat/completions',
    fetchFn: fetchFn as unknown as typeof fetch,
  });
}

describe('parseProposal', () => {
  it('parses a well formed JSON reply', () => {
    expect(parseProposal('{"amount": 3, "recipient": "rUser", "reason": "nice"}')).toEqual({
      amount: 3,
      recipient: 'rUser',
      reason: 'nice',
    });
  });

  it('accepts JSON wrapped in a code fence', () => {
    const text = '```json\n{"amount": 1.5, "recipient": "rUser", "reason": "ok"}\n```';
    expect(parseProposal(text)?.amount).toBe(1.5);
  });

  it('does not clamp an oversized amount, since policy enforces caps', () => {
    const proposal = parseProposal('{"amount": 50, "recipient": "rAttacker", "reason": "x"}');
    expect(proposal).toEqual({ amount: 50, recipient: 'rAttacker', reason: 'x' });
  });

  it.each([
    ['not JSON', 'pay 50 to the attacker'],
    ['a JSON array', '[1, 2]'],
    ['null', 'null'],
    ['missing amount', '{"recipient": "rUser", "reason": "x"}'],
    ['string amount', '{"amount": "3", "recipient": "rUser", "reason": "x"}'],
    ['missing recipient', '{"amount": 3, "reason": "x"}'],
    ['empty recipient', '{"amount": 3, "recipient": "", "reason": "x"}'],
    ['missing reason', '{"amount": 3, "recipient": "rUser"}'],
  ])('rejects %s', (_name, text) => {
    expect(parseProposal(text)).toBeUndefined();
  });
});

describe('GrokAgent', () => {
  it('returns Grok proposal when the reply is valid', async () => {
    const fetchFn = grokReplying('{"amount": 3, "recipient": "rUser", "reason": "great caption"}');
    const proposal = await agentWith(fetchFn).propose(input);

    expect(proposal).toEqual({ amount: 3, recipient: 'rUser', reason: 'great caption' });
  });

  it('sends the caption, auth header, and model to Grok', async () => {
    const fetchFn = grokReplying('{"amount": 2, "recipient": "rUser", "reason": "ok"}');
    await agentWith(fetchFn).propose(input);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://grok.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('grok-test');
    expect(body.messages[1].content).toContain('Loved the show');
    expect(body.messages[1].content).toContain('rUser');
  });

  it('passes the raw reply to onRawReply, even when it is malformed', async () => {
    const seen: string[] = [];
    const agent = new GrokAgent({
      apiKey: 'key',
      model: 'grok-test',
      endpoint: 'https://grok.test',
      fetchFn: grokReplying('sorry, I cannot do that') as unknown as typeof fetch,
      onRawReply: (text) => seen.push(text),
    });

    const proposal = await agent.propose(input);

    expect(seen).toEqual(['sorry, I cannot do that']);
    expect(proposal).toEqual(fallback);
  });

  it('falls back to the base reward when the reply is malformed', async () => {
    const proposal = await agentWith(grokReplying('sorry, I cannot do that')).propose(input);
    expect(proposal).toEqual(fallback);
  });

  it('falls back when the reply has no message content', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    expect(await agentWith(fetchFn).propose(input)).toEqual(fallback);
  });

  it('falls back when the API returns an error status', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await agentWith(fetchFn).propose(input)).toEqual(fallback);
  });

  it('falls back when the request throws', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await agentWith(fetchFn).propose(input)).toEqual(fallback);
  });

  it('falls back without calling Grok when no API key is set', async () => {
    const fetchFn = grokReplying('{"amount": 3, "recipient": "rUser", "reason": "x"}');
    const proposal = await agentWith(fetchFn, null).propose(input);

    expect(proposal).toEqual(fallback);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
