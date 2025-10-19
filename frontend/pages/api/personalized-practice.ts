import type { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL_NAME = 'gemini-2.5-flash';

declare const secrets: Record<string, string | undefined> | undefined;

interface PracticeQuizRequestBody {
  prompt: string;
  context?: string;
}

interface PracticeQuizSuccessResponse {
  content: string;
}

interface PracticeQuizErrorResponse {
  error: string;
}

function resolveGeminiKey(): string | undefined {
  const candidateEnvKeys = [
    'GEMINI_API_KEY',
    'GEMINI_KEY',
    'GOOGLE_GENAI_API_KEY',
    'GOOGLE_API_KEY',
    'GENAI_API_KEY',
    'GITHUB_SECRET_GEMINI_KEY',
    'secrets.GEMINI_API_KEY',
    'secrets.GEMINI_KEY',
    'secrets_GEMINI_API_KEY',
    'secrets_GEMINI_KEY'
  ] as const;

  for (const keyName of candidateEnvKeys) {
    const value = process.env[keyName];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const globalSecrets = (typeof secrets !== 'undefined' ? secrets : undefined)
    ?? ((globalThis as unknown as { secrets?: Record<string, string | undefined> }).secrets);

  const secretCandidates = [globalSecrets?.GEMINI_API_KEY, globalSecrets?.GEMINI_KEY];
  for (const candidate of secretCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  console.warn('[personalized-practice] GEMINI key not found. Checked env keys:', candidateEnvKeys.join(', '));
  return undefined;
}

function parseRequestBody(req: NextApiRequest): PracticeQuizRequestBody | null {
  if (typeof req.body !== 'object' || req.body === null) {
    return null;
  }

  const { prompt, context } = req.body as PracticeQuizRequestBody;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return null;
  }

  return {
    prompt: prompt.trim(),
    context: typeof context === 'string' ? context.trim() : undefined
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PracticeQuizSuccessResponse | PracticeQuizErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const apiKey = resolveGeminiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured. Ensure the secret is available to the Next.js runtime (try secrets.GEMINI_API_KEY).'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL_NAME;
    const contents = body.context ? `${body.prompt}\nContext:\n${body.context}` : body.prompt;

    const response = await ai.models.generateContent({
      model: modelName,
      contents
    });

  const text = typeof response.text === 'string' ? response.text : '';

    if (!text || text.trim().length === 0) {
      return res.status(502).json({ error: 'Gemini did not return any content.' });
    }

    return res.status(200).json({ content: text });
  } catch (error) {
    console.error('[personalized-practice] Gemini request failed:', error);
    return res.status(500).json({ error: 'Failed to generate content.' });
  }
}
