import { ClientFunction } from 'testcafe';

export const overlayStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    #automation-overlay-root,
    #automation-overlay-root * {
        box-sizing: border-box;
    }

    .overlay-container {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        max-width: 95vw;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
    }

    .overlay-container > * {
        pointer-events: auto;
    }

    .main-progress {
        background: linear-gradient(160deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.92));
        border-radius: 14px;
        padding: 18px 18px 20px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 18px 30px -20px rgba(15, 23, 42, 0.75);
    }

    .main-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .main-header h3 {
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        margin: 0;
    }

    .hotkey-pill {
        font-size: 11px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.75);
        background: rgba(59, 130, 246, 0.18);
        border: 1px solid rgba(59, 130, 246, 0.35);
        padding: 4px 8px;
        border-radius: 999px;
        letter-spacing: 0.05em;
    }

    .automation-status {
        font-size: 13px;
        margin: 0 0 12px 0;
        color: rgba(255, 255, 255, 0.8);
        transition: color 0.2s ease;
    }

    .automation-status[data-tone="running"] {
        color: #34d399;
    }

    .automation-status[data-tone="idle"] {
        color: #fbbf24;
    }

    .automation-status[data-tone="success"] {
        color: #60a5fa;
    }

    .automation-status[data-tone="warning"] {
        color: #f87171;
    }

    .automation-status[data-tone="paused"] {
        color: #fb923c;
    }

    .progress-bar {
        height: 10px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #60a5fa);
        border-radius: 6px;
        transition: width 0.35s ease;
    }

    .progress-text {
        color: rgba(255, 255, 255, 0.8);
        font-size: 13px;
        margin: 10px 0 12px 0;
        letter-spacing: 0.02em;
    }

    .metrics {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
    }

    .metric-pill {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .metric-label {
        font-size: 11px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.55);
        letter-spacing: 0.08em;
    }

    .metric-value {
        font-size: 15px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
    }

    .control-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: stretch;
    }

    .control-button {
        flex: 1;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(59, 130, 246, 0.45);
        background: rgba(59, 130, 246, 0.18);
        color: #e0e7ff;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s ease, border 0.2s ease, transform 0.15s ease;
    }

    .control-button:hover {
        transform: translateY(-1px);
        background: rgba(59, 130, 246, 0.28);
    }

    .control-button.is-paused {
        border-color: rgba(248, 113, 113, 0.45);
        background: rgba(248, 113, 113, 0.2);
    }

    .control-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .worker-control {
        flex: 1 1 200px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        background: rgba(148, 163, 184, 0.18);
        color: rgba(226, 232, 240, 0.9);
    }

    .worker-display {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
    }

    .worker-label {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.7);
    }

    .worker-count {
        font-size: 16px;
        font-weight: 600;
        color: rgba(248, 250, 252, 0.95);
    }

    .worker-button {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        background: rgba(148, 163, 184, 0.2);
        color: rgba(248, 250, 252, 0.9);
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease, border 0.2s ease, transform 0.15s ease;
    }

    .worker-button:hover:not(:disabled) {
        transform: translateY(-1px);
        background: rgba(148, 163, 184, 0.28);
    }

    .worker-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .log-window {
        margin-top: 12px;
        background: rgba(15, 23, 42, 0.85);
        border-radius: 10px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        max-height: 170px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .log-window::-webkit-scrollbar {
        width: 6px;
    }

    .log-window::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 10px;
    }

    .log-placeholder {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        text-align: center;
    }

    .log-entry {
        font-size: 12px;
        color: rgba(226, 232, 240, 0.85);
        line-height: 1.45;
        border-left: 2px solid rgba(148, 163, 184, 0.65);
        padding-left: 8px;
        letter-spacing: 0.01em;
    }

    .log-entry--neutral {
        color: rgba(226, 232, 240, 0.85);
        border-color: rgba(148, 163, 184, 0.65);
    }

    .log-entry--success {
        color: #bbf7d0;
        border-color: rgba(34, 197, 94, 0.6);
    }

    .log-entry--warn {
        color: #fecaca;
        border-color: rgba(248, 113, 113, 0.6);
    }

    .log-entry--info {
        color: #bfdbfe;
        border-color: rgba(59, 130, 246, 0.6);
    }

    .jobs-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: calc(100vh - 220px);
        overflow-y: auto;
        padding-right: 4px;
        scrollbar-width: thin;
    }

    .jobs-container::-webkit-scrollbar {
        width: 6px;
    }

    .jobs-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 4px;
    }

    .job-overlay {
        background: rgba(15, 23, 42, 0.9);
        border-radius: 10px;
        padding: 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: transform 0.25s ease, opacity 0.25s ease, border 0.25s ease;
    }

    .job-overlay[data-state="running"] {
        border-color: rgba(59, 130, 246, 0.45);
    }

    .job-overlay[data-state="done"] {
        border-color: rgba(34, 197, 94, 0.45);
        background: rgba(22, 163, 74, 0.16);
    }

    .job-overlay[data-state="error"] {
        border-color: rgba(248, 113, 113, 0.45);
        background: rgba(185, 28, 28, 0.16);
    }

    .job-overlay.is-fading {
        opacity: 0;
        transform: translateY(-6px);
    }

    .job-overlay h4 {
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 8px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .job-overlay p {
        color: rgba(203, 213, 225, 0.85);
        font-size: 12px;
        margin: 0 0 10px 0;
    }

    .job-overlay .status-text {
        color: #3b82f6;
        font-weight: 500;
    }

    .job-progress-percent {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
    }

    .progress-bar.progress-bar--mini {
        height: 6px;
        margin-top: 8px;
    }
`;

export const createMainOverlay = ClientFunction((styles: string) => {
    const doc = document;
    let styleElement = doc.getElementById('automation-overlay-styles') as HTMLStyleElement | null;
    if (!styleElement) {
        styleElement = doc.createElement('style');
        styleElement.id = 'automation-overlay-styles';
        doc.head.appendChild(styleElement);
    }
    styleElement.textContent = styles;

    const existing = doc.getElementById('automation-overlay-root');
    if (existing) {
        existing.remove();
    }

    const container = doc.createElement('div');
    container.id = 'automation-overlay-root';
    container.className = 'overlay-container';
    container.innerHTML = `
        <div class="main-progress">
            <div class="main-header">
                <h3>Midjourney Automation</h3>
                <span class="hotkey-pill" title="Ctrl+Shift+P toggles pause">Ctrl+Shift+P</span>
            </div>
            <p id="automation-status" class="automation-status" data-tone="idle">Status: Initializing</p>
            <div class="progress-bar">
                <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
            </div>
            <p id="progress-text" class="progress-text">0 / 0 prompts completed</p>
            <div class="metrics">
                <div class="metric-pill">
                    <span class="metric-label">Active</span>
                    <span id="queue-active" class="metric-value">0</span>
                </div>
                <div class="metric-pill">
                    <span class="metric-label">Queued</span>
                    <span id="queue-queued" class="metric-value">0</span>
                </div>
                <div class="metric-pill">
                    <span class="metric-label">Done</span>
                    <span id="queue-done" class="metric-value">0</span>
                </div>
            </div>
            <div class="control-bar">
                <button id="automation-toggle" class="control-button" type="button">Pause (Ctrl+Shift+P)</button>
                <div class="worker-control" title="Adjust worker limit">
                    <button id="worker-decrease" class="worker-button" type="button" aria-label="Decrease workers">-</button>
                    <div class="worker-display">
                        <span class="worker-label">Workers</span>
                        <span id="worker-count-display" class="worker-count">1</span>
                    </div>
                    <button id="worker-increase" class="worker-button" type="button" aria-label="Increase workers">+</button>
                </div>
            </div>
            <div id="automation-log" class="log-window" data-empty="true">
                <div class="log-placeholder">Live log appears here</div>
            </div>
        </div>
        <div id="jobs-container" class="jobs-container"></div>
    `;
    doc.body.appendChild(container);
});

export const initOverlayControls = ClientFunction(() => {
    const win = window as any;
    if (!win.__automationOverlayState) {
        win.__automationOverlayState = {
            paused: false,
            statusText: 'Active',
            statusTone: 'running',
            worker: {
                count: 1,
                min: 1,
                max: 1
            }
        };
    }

    const state = win.__automationOverlayState;
    if (!state.worker) {
        state.worker = {
            count: 1,
            min: 1,
            max: 1
        };
    }

    const statusEl = document.getElementById('automation-status') as HTMLElement | null;
    const toggleButton = document.getElementById('automation-toggle') as HTMLButtonElement | null;
    const workerDecrease = document.getElementById('worker-decrease') as HTMLButtonElement | null;
    const workerIncrease = document.getElementById('worker-increase') as HTMLButtonElement | null;
    const workerDisplay = document.getElementById('worker-count-display') as HTMLElement | null;

    const clampWorkerCount = (value: number) => {
        const worker = state.worker;
        if (!worker) {
            return 1;
        }
        const min = Number.isFinite(worker.min) ? Math.max(1, Math.floor(worker.min)) : 1;
        const max = Number.isFinite(worker.max) ? Math.max(min, Math.floor(worker.max)) : min;
        const normalized = Math.min(max, Math.max(min, Math.floor(value)));
        worker.min = min;
        worker.max = max;
        worker.count = normalized;
        return normalized;
    };

    const refreshStatus = () => {
        if (toggleButton) {
            toggleButton.textContent = state.paused ? 'Resume (Ctrl+Shift+P)' : 'Pause (Ctrl+Shift+P)';
            toggleButton.classList.toggle('is-paused', state.paused);
        }
        if (statusEl) {
            const tone = state.paused ? 'paused' : state.statusTone || 'running';
            const text = state.paused ? 'Paused' : state.statusText || 'Active';
            statusEl.setAttribute('data-tone', tone);
            statusEl.textContent = `Status: ${text}`;
        }
    };

    const updateWorkerUi = () => {
        const worker = state.worker;
        if (!worker) {
            return;
        }
        const normalized = clampWorkerCount(worker.count);
        if (workerDisplay && workerDisplay.textContent !== String(normalized)) {
            workerDisplay.textContent = String(normalized);
        }
        if (workerDecrease) {
            workerDecrease.disabled = normalized <= worker.min;
        }
        if (workerIncrease) {
            workerIncrease.disabled = normalized >= worker.max;
        }
    };

    win.__automationOverlayUpdate = refreshStatus;
    win.__automationOverlayWorkerUpdate = updateWorkerUi;

    refreshStatus();
    updateWorkerUi();

    if (!win.__automationOverlayControlsBound) {
        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                state.paused = !state.paused;
                refreshStatus();
            });
        }

        window.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
                event.preventDefault();
                state.paused = !state.paused;
                refreshStatus();
            }
        });

        if (workerDecrease) {
            workerDecrease.addEventListener('click', () => {
                const worker = state.worker;
                if (!worker) return;
                clampWorkerCount(worker.count - 1);
                updateWorkerUi();
            });
        }

        if (workerIncrease) {
            workerIncrease.addEventListener('click', () => {
                const worker = state.worker;
                if (!worker) return;
                clampWorkerCount(worker.count + 1);
                updateWorkerUi();
            });
        }

        win.__automationOverlayControlsBound = true;
    }
});

export const setOverlayPauseState = ClientFunction((paused: boolean) => {
    const win = window as any;
    if (!win.__automationOverlayState) {
        win.__automationOverlayState = {
            paused,
            statusText: 'Active',
            statusTone: 'running',
            worker: {
                count: 1,
                min: 1,
                max: 1
            }
        };
    }
    win.__automationOverlayState.paused = paused;
    if (typeof win.__automationOverlayUpdate === 'function') {
        win.__automationOverlayUpdate();
    }
});

export const isOverlayPaused = ClientFunction(() => {
    const win = window as any;
    return Boolean(win.__automationOverlayState && win.__automationOverlayState.paused);
});

export const setOverlayStatusText = ClientFunction((statusText: string, tone: string = 'running') => {
    const win = window as any;
    if (!win.__automationOverlayState) {
        win.__automationOverlayState = {
            paused: false,
            statusText,
            statusTone: tone,
            worker: {
                count: 1,
                min: 1,
                max: 1
            }
        };
    }
    win.__automationOverlayState.statusText = statusText;
    win.__automationOverlayState.statusTone = tone;
    if (typeof win.__automationOverlayUpdate === 'function') {
        win.__automationOverlayUpdate();
    }
});

export const configureOverlayWorkers = ClientFunction((initial: number, min: number, max: number) => {
    const win = window as any;
    if (!win.__automationOverlayState) {
        win.__automationOverlayState = {
            paused: false,
            statusText: 'Active',
            statusTone: 'running',
            worker: {
                count: 1,
                min: 1,
                max: 1
            }
        };
    }

    const worker = win.__automationOverlayState.worker || {
        count: 1,
        min: 1,
        max: 1
    };

    const normalizedMin = Math.max(1, Math.floor(Number.isFinite(min) ? min : 1));
    const normalizedMax = Math.max(
        normalizedMin,
        Math.floor(Number.isFinite(max) ? max : normalizedMin)
    );
    const normalizedCount = Math.min(
        normalizedMax,
        Math.max(normalizedMin, Math.floor(Number.isFinite(initial) ? initial : normalizedMin))
    );

    worker.min = normalizedMin;
    worker.max = normalizedMax;
    worker.count = normalizedCount;

    win.__automationOverlayState.worker = worker;

    if (typeof win.__automationOverlayWorkerUpdate === 'function') {
        win.__automationOverlayWorkerUpdate();
    }
});

export const setOverlayWorkerCount = ClientFunction((count: number) => {
    const win = window as any;
    if (!win.__automationOverlayState) {
        return;
    }
    const worker = win.__automationOverlayState.worker;
    if (!worker) {
        return;
    }

    const normalized = Math.min(worker.max, Math.max(worker.min, Math.floor(count)));
    worker.count = normalized;

    if (typeof win.__automationOverlayWorkerUpdate === 'function') {
        win.__automationOverlayWorkerUpdate();
    }
});

export const getOverlayWorkerCount = ClientFunction(() => {
    const win = window as any;
    const worker = win.__automationOverlayState?.worker;
    if (!worker) {
        return 1;
    }

    return Math.min(worker.max, Math.max(worker.min, Math.floor(worker.count)));
});

export const updateMainOverlay = ClientFunction((completed: number, total: number) => {
    const progressFill = document.getElementById('progress-fill') as HTMLElement | null;
    const progressText = document.getElementById('progress-text') as HTMLElement | null;

    const safeTotal = total <= 0 ? 1 : total;
    const percentage = Math.min(100, Math.max(0, Math.round((completed / safeTotal) * 100)));

    if (progressFill) {
        const current = progressFill.getAttribute('data-value');
        if (current !== String(percentage)) {
            progressFill.style.width = `${percentage}%`;
            progressFill.setAttribute('data-value', String(percentage));
        }
    }

    if (progressText) {
        const text = `${completed} / ${total} prompts completed`;
        if (progressText.textContent !== text) {
            progressText.textContent = text;
        }
    }
});

export const updateQueueStats = ClientFunction((active: number, queued: number, completed: number) => {
    const activeEl = document.getElementById('queue-active');
    const queuedEl = document.getElementById('queue-queued');
    const doneEl = document.getElementById('queue-done');

    if (activeEl && activeEl.textContent !== String(active)) {
        activeEl.textContent = String(active);
    }
    if (queuedEl && queuedEl.textContent !== String(queued)) {
        queuedEl.textContent = String(queued);
    }
    if (doneEl && doneEl.textContent !== String(completed)) {
        doneEl.textContent = String(completed);
    }
});

export const appendOverlayLog = ClientFunction((message: string, tone: string = 'neutral') => {
    const container = document.getElementById('automation-log');
    if (!container) {
        return;
    }

    container.setAttribute('data-empty', 'false');
    const placeholder = container.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.classList.add(`log-entry--${tone}`);

    const time = new Date();
    const timestamp = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.textContent = `[${timestamp}] ${message}`;

    container.insertAdjacentElement('afterbegin', entry);

    const maxEntries = 9;
    while (container.children.length > maxEntries) {
        const lastChild = container.lastElementChild;
        if (lastChild) {
            container.removeChild(lastChild);
        } else {
            break;
        }
    }
});

export const createJobOverlay = ClientFunction((promptId: string, promptText: string) => {
    const jobsContainer = document.getElementById('jobs-container');
    if (!jobsContainer) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = `job-overlay-${promptId}`;
    overlay.className = 'job-overlay';
    overlay.setAttribute('data-state', 'pending');

    const trimmedPrompt = promptText.length > 160 ? `${promptText.slice(0, 157)}...` : promptText;

    overlay.innerHTML = `
        <h4>
            <span>Prompt ${promptId}</span>
            <span id="job-progress-percent-${promptId}" class="job-progress-percent">0%</span>
        </h4>
        <p class="prompt-text">${trimmedPrompt}</p>
        <p id="job-status-${promptId}" class="status-text" data-value="">Status: Started</p>
        <div class="progress-bar progress-bar--mini">
            <div id="job-progress-${promptId}" class="progress-fill" style="width: 0%" data-value="0"></div>
        </div>
    `;

    jobsContainer.insertAdjacentElement('afterbegin', overlay);
});

export const updateJobOverlay = ClientFunction((promptId: string, status: string, progress: number) => {
    const jobStatus = document.getElementById(`job-status-${promptId}`);
    const jobProgress = document.getElementById(`job-progress-${promptId}`);
    const jobProgressPercent = document.getElementById(`job-progress-percent-${promptId}`);
    const overlay = document.getElementById(`job-overlay-${promptId}`);

    const normalized = Math.max(0, Math.min(progress, 100));

    if (jobStatus && jobStatus.getAttribute('data-value') !== status) {
        jobStatus.setAttribute('data-value', status);
        jobStatus.textContent = `Status: ${status}`;
    }

    if (jobProgress && jobProgress.getAttribute('data-value') !== String(normalized)) {
        jobProgress.setAttribute('data-value', String(normalized));
        jobProgress.setAttribute('style', `width: ${normalized}%`);
    }

    if (jobProgressPercent && jobProgressPercent.textContent !== `${normalized}%`) {
        jobProgressPercent.textContent = `${normalized}%`;
    }

    if (overlay) {
        const statusLower = status.toLowerCase();
        if (statusLower.includes('timeout') || statusLower.includes('error') || statusLower.includes('fehl')) {
            overlay.setAttribute('data-state', 'error');
        } else if (normalized >= 100) {
            overlay.setAttribute('data-state', 'done');
        } else if (normalized === 0) {
            overlay.setAttribute('data-state', 'pending');
        } else {
            overlay.setAttribute('data-state', 'running');
        }
    }
});

export const removeJobOverlay = ClientFunction((promptId: string) => {
    const overlay = document.getElementById(`job-overlay-${promptId}`);
    if (overlay) {
        overlay.classList.add('is-fading');
        setTimeout(() => overlay.remove(), 320);
    }
});
