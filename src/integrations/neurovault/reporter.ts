import axios, { AxiosError } from 'axios';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type NeuroVaultEventType = 'STEP_UPDATE' | 'PROGRESS_UPDATE' | 'ERROR' | 'SYSTEM';
export type NeuroVaultStepKey =
    | 'PROMPT_SUBMITTED'
    | 'WAITING'
    | 'RENDERING'
    | 'UPSCALE'
    | 'COMPLETED'
    | 'FAILED';

interface NeuroVaultEventPayload {
    contract_version: 'nv-events-v1';
    sequence: number;
    job_id: string;
    phase: string;
    substep: string;
    attempt?: number;
    [key: string]: unknown;
}

interface NeuroVaultEvent {
    event_id: string;
    event_type: NeuroVaultEventType;
    room_key: string;
    worker_key: string;
    step_key: NeuroVaultStepKey;
    progress: number;
    label: string;
    message: string;
    ts: string;
    payload: NeuroVaultEventPayload;
}

interface ReporterState {
    sequences: Record<string, number>;
}

export interface NeuroVaultEventInput {
    workerKey: string;
    stepKey: NeuroVaultStepKey;
    progress: number;
    message: string;
    jobId?: string;
    phase: string;
    substep?: string;
    attempt?: number;
    payload?: Record<string, unknown>;
    eventId?: string;
    label?: string;
}

export interface NeuroVaultReporter {
    readonly enabled: boolean;
    emitStepUpdate(input: NeuroVaultEventInput): Promise<void>;
    emitProgressUpdate(input: NeuroVaultEventInput): Promise<void>;
    emitError(input: NeuroVaultEventInput & { code: string }): Promise<void>;
    emitSystem(input: NeuroVaultEventInput): Promise<void>;
    startHeartbeat(workerKeys: string[], intervalMs?: number, basePayload?: Record<string, unknown>): void;
    stopHeartbeat(): void;
    shutdown(): Promise<void>;
}

class NoopNeuroVaultReporter implements NeuroVaultReporter {
    public readonly enabled = false;

    public async emitStepUpdate(): Promise<void> {}
    public async emitProgressUpdate(): Promise<void> {}
    public async emitError(): Promise<void> {}
    public async emitSystem(): Promise<void> {}
    public startHeartbeat(): void {}
    public stopHeartbeat(): void {}
    public async shutdown(): Promise<void> {}
}

class ActiveNeuroVaultReporter implements NeuroVaultReporter {
    public readonly enabled = true;

    private readonly endpointUrl: string;
    private readonly roomKey: string;
    private readonly statePath: string;
    private readonly outboxPath: string;
    private readonly workerLabelPrefix: string;
    private readonly requestTimeoutMs: number;

    private state: ReporterState = { sequences: {} };
    private outbox: NeuroVaultEvent[] = [];
    private mutationChain: Promise<void> = Promise.resolve();
    private flushPromise: Promise<void> | null = null;
    private heartbeatTimer: NodeJS.Timeout | null = null;

    public constructor() {
        this.endpointUrl = process.env.NEUROVAULT_EVENT_URL ?? '';
        this.roomKey = process.env.NEUROVAULT_ROOM_KEY ?? 'midjourney_default';
        this.statePath = path.resolve(process.cwd(), process.env.NEUROVAULT_STATE_PATH ?? '.neurovault-state.json');
        this.outboxPath = path.resolve(process.cwd(), process.env.NEUROVAULT_OUTBOX_PATH ?? '.neurovault-outbox.json');
        this.workerLabelPrefix = process.env.NEUROVAULT_WORKER_LABEL_PREFIX ?? 'MJ Worker';
        this.requestTimeoutMs = this.parsePositiveInt(process.env.NEUROVAULT_TIMEOUT_MS, 5000);
    }

    public async initialize(): Promise<void> {
        this.state = await this.readJsonFile<ReporterState>(this.statePath, { sequences: {} });
        this.outbox = await this.readJsonFile<NeuroVaultEvent[]>(this.outboxPath, []);
        this.syncStateWithOutbox();
        await this.flushOutbox();
    }

    public async emitStepUpdate(input: NeuroVaultEventInput): Promise<void> {
        await this.enqueueEvent('STEP_UPDATE', input);
    }

    public async emitProgressUpdate(input: NeuroVaultEventInput): Promise<void> {
        await this.enqueueEvent('PROGRESS_UPDATE', input);
    }

    public async emitError(input: NeuroVaultEventInput & { code: string }): Promise<void> {
        const payload = {
            ...(input.payload ?? {}),
            error_code: input.code
        };

        await this.enqueueEvent('ERROR', {
            ...input,
            payload
        });
    }

    public async emitSystem(input: NeuroVaultEventInput): Promise<void> {
        await this.enqueueEvent('SYSTEM', {
            ...input,
            progress: 0
        });
    }

    public startHeartbeat(
        workerKeys: string[],
        intervalMs: number = 45000,
        basePayload?: Record<string, unknown>
    ): void {
        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            for (const workerKey of workerKeys) {
                this.emitSystem({
                    workerKey,
                    stepKey: 'WAITING',
                    progress: 0,
                    message: 'heartbeat',
                    phase: 'heartbeat',
                    substep: 'interval',
                    jobId: `${workerKey}:system`,
                    payload: basePayload
                }).catch(error => {
                    console.error('[neurovault] Heartbeat emit failed:', error);
                });
            }
        }, intervalMs);
    }

    public stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    public async shutdown(): Promise<void> {
        this.stopHeartbeat();
        await this.flushOutbox();
    }

    private async enqueueEvent(eventType: NeuroVaultEventType, input: NeuroVaultEventInput): Promise<void> {
        await this.enqueueMutation(async () => {
            const sequence = this.nextSequenceForWorker(input.workerKey);
            const eventId = input.eventId ?? `${input.workerKey}_${sequence}`;
            const progress = this.clampProgress(input.progress);

            const event: NeuroVaultEvent = {
                event_id: eventId,
                event_type: eventType,
                room_key: this.roomKey,
                worker_key: input.workerKey,
                step_key: input.stepKey,
                progress,
                label: input.label ?? this.buildWorkerLabel(input.workerKey),
                message: input.message,
                ts: new Date().toISOString(),
                payload: {
                    contract_version: 'nv-events-v1',
                    sequence,
                    job_id: input.jobId ?? `${input.workerKey}:system`,
                    phase: input.phase,
                    substep: input.substep ?? 'unspecified',
                    ...(typeof input.attempt === 'number' ? { attempt: input.attempt } : {}),
                    ...(input.payload ?? {})
                }
            };

            this.outbox.push(event);
            await this.persistState();
            await this.persistOutbox();
        });

        await this.flushOutbox();
    }

    private async flushOutbox(): Promise<void> {
        if (this.flushPromise) {
            await this.flushPromise;
            return;
        }

        this.flushPromise = this.runFlush().finally(() => {
            this.flushPromise = null;
        });

        await this.flushPromise;
    }

    private async runFlush(): Promise<void> {
        while (true) {
            const current = this.outbox[0];
            if (!current) {
                return;
            }

            const result = await this.sendWithRetries(current);
            if (result === 'keep') {
                return;
            }

            await this.enqueueMutation(async () => {
                this.outbox.shift();
                await this.persistOutbox();
            });
        }
    }

    private async sendWithRetries(event: NeuroVaultEvent): Promise<'sent' | 'drop' | 'keep'> {
        const maxAttempts = 3;
        const retryDelaysMs = [700, 1500, 3000];

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await axios.post(this.endpointUrl, event, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: this.requestTimeoutMs
                });
                return 'sent';
            } catch (error) {
                const axiosError = error as AxiosError;
                const status = axiosError.response?.status;
                const is4xx = typeof status === 'number' && status >= 400 && status < 500;

                if (is4xx) {
                    console.error(`[neurovault] dropping event ${event.event_id} due to client error ${status}`);
                    return 'drop';
                }

                if (attempt >= maxAttempts - 1) {
                    console.error(`[neurovault] keeping event ${event.event_id} in outbox after retries`);
                    return 'keep';
                }

                await this.wait(retryDelaysMs[attempt] ?? 2000);
            }
        }

        return 'keep';
    }

    private nextSequenceForWorker(workerKey: string): number {
        const current = this.state.sequences[workerKey] ?? 0;
        const next = current + 1;
        this.state.sequences[workerKey] = next;
        return next;
    }

    private buildWorkerLabel(workerKey: string): string {
        const match = workerKey.match(/(\d+)$/);
        if (match) {
            return `${this.workerLabelPrefix} ${match[1]}`;
        }
        return `${this.workerLabelPrefix} ${workerKey}`;
    }

    private clampProgress(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }
        return Math.max(0, Math.min(1, value));
    }

    private parsePositiveInt(raw: string | undefined, fallback: number): number {
        if (!raw) {
            return fallback;
        }
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }
        return parsed;
    }

    private async readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as T;
        } catch {
            return fallback;
        }
    }

    private async persistState(): Promise<void> {
        await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    }

    private async persistOutbox(): Promise<void> {
        await fs.writeFile(this.outboxPath, JSON.stringify(this.outbox, null, 2), 'utf-8');
    }

    private syncStateWithOutbox(): void {
        for (const pendingEvent of this.outbox) {
            const sequence = pendingEvent.payload?.sequence;
            if (!Number.isFinite(sequence)) {
                continue;
            }
            const workerKey = pendingEvent.worker_key;
            const current = this.state.sequences[workerKey] ?? 0;
            if (sequence > current) {
                this.state.sequences[workerKey] = sequence;
            }
        }
    }

    private async enqueueMutation(work: () => Promise<void>): Promise<void> {
        const next = this.mutationChain.then(work, work);
        this.mutationChain = next.then(
            () => undefined,
            () => undefined
        );
        await next;
    }

    private async wait(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const createNeuroVaultReporter = async (): Promise<NeuroVaultReporter> => {
    const enabledRaw = process.env.NEUROVAULT_ENABLED ?? 'false';
    const enabled = ['1', 'true', 'yes', 'on'].includes(enabledRaw.toLowerCase());
    const endpointUrl = process.env.NEUROVAULT_EVENT_URL ?? '';

    if (!enabled || endpointUrl.trim().length === 0) {
        return new NoopNeuroVaultReporter();
    }

    const reporter = new ActiveNeuroVaultReporter();
    await reporter.initialize();
    return reporter;
};
