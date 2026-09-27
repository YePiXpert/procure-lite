import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type {
  ResponseInput,
  ResponseOutputItem,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  image?: string;
  responseItems?: ResponseOutputItem[];
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}
export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ChatCallOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  jsonMode?: boolean;
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface ChatCompletionResult {
  content: string | null;
  toolCalls: { id: string; name: string; args: unknown }[];
  outputItems?: ResponseOutputItem[];
  usage?: { input: number; output: number };
  requestId?: string;
}
export class AiResponseError extends ServiceUnavailableException {
  constructor(
    message: string,
    readonly kind: string,
    readonly metadata?: Pick<ChatCompletionResult, 'usage' | 'requestId'>,
  ) {
    super(message);
  }
}
/** Strict output contracts require all properties; formerly optional fields become nullable. */
export function strictSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  delete schema.$schema;
  function walk(node: Record<string, unknown>) {
    if (node.properties) {
      const properties = node.properties as Record<string, Record<string, unknown>>;
      const required = (node.required ?? []) as string[];
      for (const [key, value] of Object.entries(properties)) {
        walk(value);
        if (!required.includes(key)) properties[key] = { anyOf: [value, { type: 'null' }] };
      }
      node.required = Object.keys(properties);
      node.additionalProperties = false;
    }
    if (node.items) walk(node.items as Record<string, unknown>);
    for (const name of ['anyOf', 'oneOf', 'allOf'])
      for (const sub of (node[name] ?? []) as Record<string, unknown>[]) walk(sub);
  }
  walk(schema);
  return schema;
}

@Injectable()
export class LlmClient {
  async chat(opts: ChatCallOptions): Promise<ChatCompletionResult> {
    const client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseUrl.replace(/\/+$/, ''),
      maxRetries: 0,
      timeout: opts.timeoutMs ?? 120_000,
    });
    const input: ResponseInput = [];
    for (const message of opts.messages) {
      if (message.responseItems) {
        try {
          input.push(...toResponseInputItems(message.responseItems));
        } catch {
          throw new AiResponseError('服务返回了不支持的 Responses 输出条目', 'UNSUPPORTED_OUTPUT');
        }
        continue;
      }
      if (message.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: message.tool_call_id!,
          output: message.content ?? '',
        });
        continue;
      }
      if (message.tool_calls?.length) {
        for (const call of message.tool_calls)
          input.push({
            type: 'function_call',
            call_id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          });
        continue;
      }
      if (message.image)
        input.push({
          role: 'user',
          content: [
            { type: 'input_text', text: message.content ?? '' },
            { type: 'input_image', image_url: message.image, detail: 'high' },
          ],
        });
      else input.push({ role: message.role, content: message.content ?? '' });
    }
    const body: ResponseCreateParamsNonStreaming = {
      model: opts.model,
      input,
      store: false,
      max_output_tokens: opts.maxTokens ?? 4096,
      ...(opts.tools?.length
        ? {
            tools: opts.tools.map((t) => ({
              type: 'function' as const,
              name: t.function.name,
              description: t.function.description,
              parameters: strictSchema(t.function.parameters),
              strict: true,
            })),
          }
        : {}),
      ...(opts.schema
        ? {
            text: {
              format: {
                type: 'json_schema' as const,
                name: 'result',
                schema: strictSchema(opts.schema),
                strict: true,
              },
            },
          }
        : opts.jsonMode
          ? { text: { format: { type: 'json_object' as const } } }
          : {}),
    };
    for (let attempt = 0; ; attempt++) {
      let metadata: Pick<ChatCompletionResult, 'usage' | 'requestId'> | undefined;
      try {
        const response = await client.responses.create(body, { signal: opts.signal });
        metadata = {
          usage:
            response.usage &&
            Number.isFinite(response.usage.input_tokens) &&
            Number.isFinite(response.usage.output_tokens) &&
            response.usage.input_tokens >= 0 &&
            response.usage.output_tokens >= 0
              ? { input: response.usage.input_tokens, output: response.usage.output_tokens }
              : undefined,
          requestId: response._request_id ?? response.id,
        };
        if (response.status !== 'completed')
          throw new AiResponseError(
            response.status === 'incomplete'
              ? '模型输出被截断，请重试或减少单页内容'
              : '模型未完成响应',
            'INCOMPLETE',
            metadata,
          );
        if (
          response.output.some(
            (i) => i.type === 'message' && i.content.some((c) => c.type === 'refusal'),
          )
        )
          throw new AiResponseError('模型拒绝识别此内容', 'REFUSAL', metadata);
        const toolCalls = response.output
          .filter((i) => i.type === 'function_call')
          .map((i) => ({ id: i.call_id, name: i.name, args: JSON.parse(i.arguments) as unknown }));
        return {
          content: response.output_text || null,
          toolCalls,
          outputItems: response.output,
          usage: metadata.usage,
          requestId: response._request_id ?? response.id,
        };
      } catch (error) {
        if (error instanceof AiResponseError) throw error;
        if (
          attempt === 0 &&
          error instanceof OpenAI.APIError &&
          [429, 500, 502, 503].includes(error.status ?? 0)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        const reason =
          error instanceof OpenAI.APIError
            ? `服务返回 ${error.status ?? '连接错误'}（未自动重发不确定请求）`
            : error instanceof Error
              ? error.message
              : '未知错误';
        throw new AiResponseError(
          `AI 调用失败：${reason}`,
          error instanceof OpenAI.APIError && !error.status ? 'UNKNOWN' : 'SERVICE_ERROR',
          metadata,
        );
      }
    }
  }
  async ping(baseUrl: string, apiKey: string, model: string): Promise<boolean> {
    try {
      const result = await this.chat({
        baseUrl,
        apiKey,
        model,
        messages: [{ role: 'user', content: 'Reply OK' }],
        maxTokens: 128,
        timeoutMs: 15_000,
      });
      return !!result.content;
    } catch {
      return false;
    }
  }
}
