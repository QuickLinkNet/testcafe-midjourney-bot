// Globale Typdefinitionen
declare global {
    interface Window {
        currentRenderings: number;
    }

    namespace globalThis {
        let currentRenderings: number;
    }
}

export interface Prompt {
    id: number;
    title: string;
    prompt: string;
    keywords: string;
    expected_runs: number;
    successful_runs: number;
}