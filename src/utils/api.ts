import axios from 'axios';
import * as dotenv from 'dotenv';
import { Prompt } from '../types';

// Lade die Umgebungsvariablen
dotenv.config();

// Hole die API-URL aus den Umgebungsvariablen
const apiBase: string = process.env.API || '';
if (!apiBase) {
    throw new Error('API environment variable is not set');
}

interface ApiResponse {
    success: boolean;
    data: {
        prompts: Prompt[];
    };
}

export const fetchPendingPrompts = async (limit: number = 20): Promise<Prompt[]> => {
    try {
        const url = `${apiBase}/prompts/pending?secret=brot&limit=${limit}`;
        console.log('Fetching prompts from:', url);

        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch prompts: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data: ApiResponse = await response.json();
        return data.data.prompts;
    } catch (error) {
        throw new Error(`Error fetching pending prompts: ${(error as Error).message}`);
    }
};

export const incrementSuccessfulRuns = async (id: string): Promise<void> => {
    const response = await fetch(`${apiBase}/prompts/${id}/increment-success?secret=brot`, {
        method: 'GET'
    });

    console.log(response);

    const errorText = await response.text();
    if (!response.ok) {
        throw new Error(`Failed to increment successful runs: ${errorText}`);
    }
};