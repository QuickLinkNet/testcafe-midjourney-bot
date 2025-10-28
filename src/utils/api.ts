import { promises as fs } from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Prompt } from '../types';

dotenv.config();

const SOURCE_API = 'api';
const SOURCE_FILE = 'file';
const DEFAULT_PROMPTS_FILE = 'prompts.json';

const promptSourceEnv = (process.env.PROMPT_SOURCE ?? '').trim().toLowerCase();
const apiBase = (process.env.API ?? '').trim();
const apiSecret = (process.env.API_SECRET ?? 'brot').trim();
const promptsFilePath = path.resolve(
  process.cwd(),
  (process.env.PROMPTS_FILE ?? DEFAULT_PROMPTS_FILE).trim() || DEFAULT_PROMPTS_FILE
);

type PromptFilePayload = Prompt[] | { prompts: Prompt[]; [key: string]: unknown };

interface ApiResponse {
  success: boolean;
  data: {
    prompts: Prompt[];
  };
}

const resolveSource = (): 'api' | 'file' => {
  if (promptSourceEnv === SOURCE_API) {
    if (!apiBase) {
      throw new Error('PROMPT_SOURCE is set to "api" but API environment variable is missing.');
    }
    return SOURCE_API;
  }

  if (promptSourceEnv === SOURCE_FILE) {
    return SOURCE_FILE;
  }

  if (apiBase) {
    return SOURCE_API;
  }

  return SOURCE_FILE;
};

const fetchFromApi = async (limit: number): Promise<Prompt[]> => {
  if (!apiBase) {
    throw new Error('API environment variable is not set');
  }

  const url = `${apiBase}/prompts/pending?secret=${encodeURIComponent(apiSecret)}&limit=${limit}`;
  console.log('Fetching prompts from API:', url);

  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch prompts: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data: ApiResponse = await response.json();
  return data.data.prompts;
};

const readPromptsFile = async (): Promise<{ prompts: Prompt[]; payload: PromptFilePayload }> => {
  try {
    const raw = await fs.readFile(promptsFilePath, 'utf-8');
    const parsed = JSON.parse(raw) as PromptFilePayload;

    if (Array.isArray(parsed)) {
      return { prompts: parsed, payload: parsed };
    }

    if (parsed && Array.isArray(parsed.prompts)) {
      return { prompts: parsed.prompts, payload: parsed };
    }

    throw new Error('Unknown file structure - expected array or object with "prompts" array.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Prompts file not found at ${promptsFilePath}. Provide one via PROMPTS_FILE or place ${DEFAULT_PROMPTS_FILE}.`
      );
    }

    throw new Error(`Failed to read prompts file at ${promptsFilePath}: ${(error as Error).message}`);
  }
};

const writePromptsFile = async (
  result: { prompts: Prompt[]; payload: PromptFilePayload },
  prompts: Prompt[]
): Promise<void> => {
  const nextPayload = Array.isArray(result.payload)
    ? prompts
    : {
        ...result.payload,
        prompts
      };

  const serialized = `${JSON.stringify(nextPayload, null, 2)}\n`;
  await fs.writeFile(promptsFilePath, serialized, { encoding: 'utf-8' });
};

const fetchFromFile = async (limit: number): Promise<Prompt[]> => {
  const { prompts } = await readPromptsFile();
  return prompts
    .filter(prompt => prompt.expected_runs > prompt.successful_runs)
    .slice(0, limit);
};

const incrementFilePrompt = async (id: string): Promise<void> => {
  const result = await readPromptsFile();
  const prompts = [...result.prompts];
  const index = prompts.findIndex(prompt => prompt.id.toString() === id);

  if (index === -1) {
    throw new Error(`Prompt with id ${id} not found in ${promptsFilePath}.`);
  }

  const prompt = prompts[index];
  const maxRuns = Math.max(prompt.expected_runs, 0);
  const nextSuccessfulRuns = Math.min(prompt.successful_runs + 1, maxRuns);

  prompts[index] = {
    ...prompt,
    successful_runs: nextSuccessfulRuns
  };

  await writePromptsFile(result, prompts);
};

const incrementApiPrompt = async (id: string): Promise<void> => {
  if (!apiBase) {
    throw new Error('API environment variable is not set');
  }

  const response = await fetch(
    `${apiBase}/prompts/${id}/increment-success?secret=${encodeURIComponent(apiSecret)}`,
    { method: 'GET' }
  );

  const errorText = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to increment successful runs: ${errorText}`);
  }
};

export const fetchPendingPrompts = async (limit: number = 20): Promise<Prompt[]> => {
  const source = resolveSource();
  if (source === SOURCE_API) {
    return fetchFromApi(limit);
  }
  return fetchFromFile(limit);
};

export const incrementSuccessfulRuns = async (id: string): Promise<void> => {
  const source = resolveSource();
  if (source === SOURCE_API) {
    await incrementApiPrompt(id);
    return;
  }

  await incrementFilePrompt(id);
};

export const getPromptSource = (): 'api' | 'file' => resolveSource();

export const getPromptsFilePath = (): string => promptsFilePath;
