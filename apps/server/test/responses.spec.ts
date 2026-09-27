import { afterEach, it, expect, vi } from 'vitest';
import { LlmClient, strictSchema } from '../src/ai/llm.client';
const opts = {
  apiKey: 'test-secret',
  baseUrl: 'https://provider.example/v1',
  model: 'test-gpt',
  messages: [{ role: 'user' as const, content: 'extract', image: 'data:image/png;base64,AA==' }],
};
afterEach(() => vi.unstubAllGlobals());
function result(
  status = 'completed',
  output: unknown[] = [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: '{"quantity":null}', annotations: [] }],
    },
  ],
) {
  return new Response(
    JSON.stringify({
      id: 'resp_1',
      object: 'response',
      status,
      output,
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_1' } },
  );
}
it('uses Responses image input, strict schema and no remote storage', async () => {
  const fetch = vi.fn(async () => result());
  vi.stubGlobal('fetch', fetch);
  const response = await new LlmClient().chat({
    ...opts,
    schema: {
      type: 'object',
      properties: { quantity: { type: ['number', 'null'] } },
      required: ['quantity'],
      additionalProperties: false,
    },
  });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  expect(String(url)).toBe('https://provider.example/v1/responses');
  expect(body.store).toBe(false);
  expect(body.text.format.type).toBe('json_schema');
  expect(body.input[0].content[1].type).toBe('input_image');
  expect(response.content).toBe('{"quantity":null}');
  expect(response.usage).toEqual({ input: 10, output: 20 });
});
it('rejects truncated outputs instead of applying their JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => result('incomplete')),
  );
  await expect(new LlmClient().chat(opts)).rejects.toThrow('截断');
});
it('rejects refusal', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      result('completed', [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }]),
    ),
  );
  await expect(new LlmClient().chat(opts)).rejects.toThrow('拒绝');
});
it('does not repeat unknown connection failures', async () => {
  const fetch = vi.fn(async () => {
    throw new TypeError('connection lost');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(new LlmClient().chat(opts)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('preserves response items and function call IDs across rounds', async () => {
  const fetch = vi.fn(async () =>
    result('completed', [
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{"id":7}',
      },
    ]),
  );
  vi.stubGlobal('fetch', fetch);
  const client = new LlmClient(),
    first = await client.chat({
      ...opts,
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'read',
            parameters: {
              type: 'object',
              properties: { id: { type: 'integer' } },
              required: ['id'],
            },
          },
        },
      ],
    });
  expect(first.toolCalls).toEqual([{ id: 'call_1', name: 'lookup', args: { id: 7 } }]);
  await client.chat({
    ...opts,
    messages: [
      { role: 'assistant', content: null, responseItems: first.outputItems },
      { role: 'tool', tool_call_id: 'call_1', content: '7' },
    ],
  });
  const body = JSON.parse(
    (fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(body.input[0].call_id).toBe('call_1');
  expect(body.input[1]).toEqual({ type: 'function_call_output', call_id: 'call_1', output: '7' });
});
it('makes optional arguments nullable while preserving required constraints', () => {
  const schema = strictSchema({
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'number' } },
    required: ['a'],
  });
  expect(schema.required).toEqual(['a', 'b']);
  expect(schema.additionalProperties).toBe(false);
});
it('replays opaque reasoning items without dropping their encrypted content', async () => {
  const fetch = vi.fn(async () => result());
  vi.stubGlobal('fetch', fetch);
  await new LlmClient().chat({
    ...opts,
    messages: [
      {
        role: 'assistant',
        content: null,
        responseItems: [
          { type: 'reasoning', id: 'r1', summary: [], encrypted_content: 'opaque-state' },
        ],
      },
    ],
  });
  const body = JSON.parse(
    (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(body.input[0]).toMatchObject({ type: 'reasoning', encrypted_content: 'opaque-state' });
});
it('retries a rate limit only once', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: 'busy' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(new LlmClient().chat(opts)).rejects.toThrow('429');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('treats missing third-party usage fields as unknown', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const payload = await result().json();
      payload.usage = {};
      return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  const response = await new LlmClient().chat(opts);
  expect(response.usage).toBeUndefined();
  expect(response.content).toBe('{"quantity":null}');
});
