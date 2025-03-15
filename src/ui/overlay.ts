import { ClientFunction } from 'testcafe';

const overlayStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    .overlay-container {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        max-width: 90vw;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .main-progress {
        background: rgba(17, 24, 39, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .main-progress h3 {
        color: #fff;
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 12px 0;
    }

    .progress-bar {
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3B82F6, #60A5FA);
        border-radius: 4px;
        transition: width 0.3s ease;
    }

    .progress-text {
        color: #fff;
        font-size: 14px;
        margin: 0;
    }

    .jobs-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: calc(100vh - 200px);
        overflow-y: auto;
        padding-right: 4px;
    }

    .jobs-container::-webkit-scrollbar {
        width: 4px;
    }

    .jobs-container::-webkit-scrollbar-track {
        background: transparent;
    }

    .jobs-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
    }

    .job-overlay {
        background: rgba(17, 24, 39, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 8px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.3s ease;
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
        color: #94A3B8;
        font-size: 12px;
        margin: 0 0 8px 0;
    }

    .job-overlay .status-text {
        color: #60A5FA;
        font-weight: 500;
    }
`;

export const createMainOverlay = ClientFunction((styles: string) => {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    const container = document.createElement('div');
    container.className = 'overlay-container';
    container.innerHTML = `
        <div class="main-progress">
            <h3>Gesamtfortschritt</h3>
            <div class="progress-bar">
                <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
            </div>
            <p id="progress-text" class="progress-text">0 / 0 Prompts abgeschlossen</p>
        </div>
        <div id="jobs-container"></div>
    `;
    document.body.appendChild(container);
});

export const updateMainOverlay = ClientFunction((completed: number, total: number) => {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (progressFill && progressText) {
        const progressPercentage = (completed / total) * 100;
        progressFill.style.width = `${progressPercentage}%`;
        progressText.textContent = `${completed} / ${total} Prompts abgeschlossen`;
    }
});

export const createJobOverlay = ClientFunction((promptId: string, promptText: string) => {
    const jobsContainer = document.getElementById('jobs-container');
    if (!jobsContainer) return;

    const overlay = document.createElement('div');
    overlay.id = `job-overlay-${promptId}`;
    overlay.className = 'job-overlay';

    overlay.innerHTML = `
        <h4>
            <span>Prompt ${promptId}</span>
            <span id="job-progress-percent-${promptId}">0%</span>
        </h4>
        <p class="prompt-text">${promptText}</p>
        <p id="job-status-${promptId}" class="status-text">Status: Gestartet</p>
        <div class="progress-bar">
            <div id="job-progress-${promptId}" class="progress-fill" style="width: 0%"></div>
        </div>
    `;

    jobsContainer.appendChild(overlay);
});

export const updateJobOverlay = ClientFunction((promptId: string, status: string, progress: number) => {
    const jobStatus = document.getElementById(`job-status-${promptId}`);
    const jobProgress = document.getElementById(`job-progress-${promptId}`);
    const jobProgressPercent = document.getElementById(`job-progress-percent-${promptId}`);

    if (jobStatus && jobProgress && jobProgressPercent) {
        jobStatus.textContent = `Status: ${status}`;
        jobProgress.style.width = `${progress}%`;
        jobProgressPercent.textContent = `${progress}%`;
    }
});

export const removeJobOverlay = ClientFunction((promptId: string) => {
    const overlay = document.getElementById(`job-overlay-${promptId}`);
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }
});

export { overlayStyles }