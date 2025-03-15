import { ClientFunction } from 'testcafe';
import { Prompt } from '../types';

export const generateSeed = (): number => {
    return Math.floor(1000000000 + Math.random() * 9000000000);
};

export const validatePrompts = (prompts: Prompt[]): boolean => {
    return prompts.every(prompt => typeof prompt.prompt === 'string' && prompt.prompt.length > 0);
};

export const universalLog = ClientFunction((message: string) => {
    console.log(message);
});

export const log = async (message: string): Promise<void> => {
    await universalLog(message);
};