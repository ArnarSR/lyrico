/**
 * Shared plumbing for the Claude-backed endpoints in api/.
 *
 * It lives outside api/ on purpose: Vercel turns every file in that directory
 * into a function, and a module with no default export fails the build.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export const MODEL = 'claude-opus-5'

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}

/** The key, or null when the deployment has no Anthropic credentials. */
export function apiKey(): string | null {
  const key = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  return key || null
}

/** Turns whatever went wrong inside a handler into a response. */
export function errorResponse(err: unknown): Response {
  if (err instanceof Anthropic.APIError) {
    return json({ error: err.message, status: err.status }, 502)
  }
  return json({ error: err instanceof Error ? err.message : 'Request failed' }, 502)
}

/**
 * One structured-output request to Claude, optionally with the server-side web
 * search tool.
 *
 * Long search turns can come back with stop_reason "pause_turn" instead of a
 * finished answer; resuming means handing the paused assistant turn straight
 * back. Without this the caller would get a silently truncated result.
 */
export async function runStructured(
  client: Anthropic,
  opts: {
    system: string
    prompt: string
    format: NonNullable<Anthropic.OutputConfig['format']>
    /** Give Claude web search, so it can check claims against real sources. */
    search?: boolean
    maxTokens?: number
  },
): Promise<Anthropic.Message> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.prompt }]

  for (let attempt = 0; attempt < 4; attempt++) {
    const message = await client.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      thinking: { type: 'adaptive' },
      output_config: { format: opts.format },
      ...(opts.search
        ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 } as const] }
        : {}),
      messages,
    }).finalMessage()

    if (message.stop_reason !== 'pause_turn') return message
    messages.push({ role: 'assistant', content: message.content })
  }

  throw new Error('The request did not finish — too many paused turns')
}

/** Pulls the structured JSON out of a finished message and validates it. */
export function parseJson<T extends z.ZodTypeAny>(
  message: Anthropic.Message,
  schema: T,
): { ok: true; value: z.infer<T> } | { ok: false; error: string } {
  if (message.stop_reason === 'refusal') {
    return { ok: false, error: 'The request was declined. This usually means the text is under copyright — scan the sheet music instead.' }
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (!text) return { ok: false, error: 'No text returned' }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Response was not valid JSON' }
  }

  const result = schema.safeParse(raw)
  if (!result.success) return { ok: false, error: `Response did not match the expected shape: ${result.error.message}` }
  return { ok: true, value: result.data }
}
