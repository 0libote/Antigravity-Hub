/**
 * Antigravity Hub — Landing Page Demo Logic
 * Ported from SidebarProvider.ts rendering engine
 */

// ────────────────────────────────────────
// DATA
// ────────────────────────────────────────
let currentSnapshot = {
    models: [
        { id: 'claude_3.5_sonnet', label: 'Claude 3.5 Sonnet', limit: 300, remaining: 120, remainingPercentage: 40, resetInSeconds: 3600, family: 'claude' },
        { id: 'claude_3.5_haiku', label: 'Claude 3.5 Haiku', limit: 1000, remaining: 800, remainingPercentage: 80, resetInSeconds: 7200, family: 'claude' },
        { id: 'gemini_1.5_pro', label: 'Gemini 1.5 Pro', limit: 1500, remaining: 900, remainingPercentage: 60, resetInSeconds: 1500, family: 'gemini_pro' },
        { id: 'gemini_1.5_flash', label: 'Gemini 1.5 Flash', limit: 50000, remaining: 50000, remainingPercentage: 100, resetInSeconds: 3600, family: 'gemini_flash' },
        { id: 'gemini_1.5_flash_8b', label: 'Gemini 1.5 Flash-8B', limit: 50000, remaining: 10000, remainingPercentage: 20, resetInSeconds: 3600, family: 'gemini_flash' },
        { id: 'gpt_4o', label: 'GPT-4o', limit: 50, remaining: 50, remainingPercentage: 100, resetInSeconds: 0, family: 'other' }
    ]
};

let currentGroups = [];
let currentSettings = {
    dashboardDisplayStyle: 'group-circle',
    warningThreshold: 60,
    criticalThreshold: 20,
    visibleGroups: ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other']
};

// ────────────────────────────────────────
// SMOOTH SCROLL
// ────────────────────────────────────────
function smoothScrollTo(e, targetId) {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ────────────────────────────────────────
// FILE TREE INTERACTIVITY & MOCK CODEBASE
// ────────────────────────────────────────
const MOCK_FILES = {
    'index.html': {
        type: 'html',
        lines: 11,
        content: `
&lt;<span class="keyword">!DOCTYPE html</span>&gt;<br>
&lt;<span class="class">html</span> <span class="string">lang</span>=<span class="string">"en"</span>&gt;<br>
&lt;<span class="class">head</span>&gt;<br>
&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="class">title</span>&gt;<span class="string">Random Dog Pics</span>&lt;/<span class="class">title</span>&gt;<br>
&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="class">link</span> <span class="string">rel</span>=<span class="string">"stylesheet"</span> <span class="string">href</span>=<span class="string">"style.css"</span>&gt;<br>
&lt;/<span class="class">head</span>&gt;<br>
&lt;<span class="class">body</span>&gt;<br>
&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="class">h1</span>&gt;<span class="string">Bark!</span>&lt;/<span class="class">h1</span>&gt;<br>
&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="class">img</span> <span class="string">id</span>=<span class="string">"dog-pic"</span> /&gt;<br>
&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="class">script</span> <span class="string">src</span>=<span class="string">"app.js"</span>&gt;&lt;/<span class="class">script</span>&gt;<br>
&lt;/<span class="class">body</span>&gt;<br>
&lt;/<span class="class">html</span>&gt;`
    },
    'style.css': {
        type: 'css',
        lines: 12,
        content: `
<span class="class">body</span> {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">background</span>: <span class="string">#111</span>;<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">color</span>: <span class="string">#fff</span>;<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">font-family</span>: <span class="string">sans-serif</span>;<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">text-align</span>: <span class="string">center</span>;<br>
}<br>
<span class="class">img</span> {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">max-width</span>: <span class="string">80%</span>;<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">border-radius</span>: <span class="string">12px</span>;<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">margin-top</span>: <span class="string">20px</span>;<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">box-shadow</span>: <span class="string">0 4px 12px rgba(0,0,0,0.5)</span>;<br>
}`
    },
    'app.js': {
        type: 'js',
        lines: 8,
        content: `
<span class="keyword">import</span> { <span class="function">fetchDogImage</span> } <span class="keyword">from</span> <span class="string">'./api.js'</span>;<br>
<br>
<span class="keyword">async function</span> <span class="function">loadDog</span>() {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">const</span> url = <span class="keyword">await</span> <span class="function">fetchDogImage</span>();<br>
&nbsp;&nbsp;&nbsp;&nbsp;document.<span class="function">getElementById</span>(<span class="string">'dog-pic'</span>).src = url;<br>
}<br>
<br>
<span class="function">loadDog</span>();`
    },
    'api.js': {
        type: 'js',
        lines: 6,
        content: `
<span class="keyword">export async function</span> <span class="function">fetchDogImage</span>() {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">const</span> res = <span class="keyword">await</span> <span class="function">fetch</span>(<span class="string">'https://dog.ceo/api/breeds/image/random'</span>);<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">const</span> data = <span class="keyword">await</span> res.<span class="function">json</span>();<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="keyword">return</span> data.message;<br>
}`
    }
};

function toggleFolder(el) {
    el.classList.toggle('open');
    const children = el.nextElementSibling;
    if (children && children.classList.contains('tree-children')) {
        children.style.display = el.classList.contains('open') ? '' : 'none';
    }
}

function selectFile(el) {
    document.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
    el.classList.add('active');

    // Update Mock Editor Content
    const filename = el.querySelector('span:nth-child(2)').innerText;
    const fileData = MOCK_FILES[filename] || { type: 'txt', lines: 1, content: 'File contents not mocked.' };

    document.getElementById('mock-filename').innerText = filename;

    const iconSpan = document.getElementById('mock-file-icon');
    iconSpan.className = 'file-icon ' + fileData.type;
    iconSpan.innerText = fileData.type.toUpperCase();

    // Generate line numbers
    let linesHtml = '';
    for (let i = 1; i <= fileData.lines; i++) {
        linesHtml += i + '<br>';
    }

    document.getElementById('mock-code-lines').innerHTML = linesHtml;
    document.getElementById('mock-code-editor').innerHTML = fileData.content;
}

// ────────────────────────────────────────
// GROUPING (from ModelGroupingService)
// ────────────────────────────────────────
const FAMILY_NAMES = {
    'claude': 'Claude',
    'gemini_pro': 'Gemini Pro',
    'gemini_flash': 'Gemini Flash',
    'gemini_image': 'Gemini Image',
    'other': 'Other Models'
};

function groupModels(models) {
    const groupsMap = new Map();
    models.forEach(model => {
        if (!groupsMap.has(model.family)) {
            groupsMap.set(model.family, {
                id: model.family,
                name: FAMILY_NAMES[model.family] || 'Other Models',
                models: [],
                remainingPercentage: 100,
                resetInSeconds: 0
            });
        }
        groupsMap.get(model.family).models.push(model);
    });

    return Array.from(groupsMap.values()).map(group => {
        let minPct = 100, maxReset = 0;
        group.models.forEach(m => {
            if (m.remainingPercentage < minPct) minPct = m.remainingPercentage;
            if (m.resetInSeconds > maxReset) maxReset = m.resetInSeconds;
        });
        group.remainingPercentage = minPct;
        group.resetInSeconds = maxReset;
        return group;
    });
}

// ────────────────────────────────────────
// RENDER ENGINE (from SidebarProvider.ts)
// ────────────────────────────────────────
function formatTimer(seconds) {
    if (seconds === undefined || seconds <= 0) return 'Ready';
    const totalMinutes = Math.ceil(seconds / 60);
    if (totalMinutes < 60) return totalMinutes + 'm';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h < 24) return h + 'h ' + m + 'm';
    const days = Math.floor(h / 24);
    return days + 'd ' + (h % 24) + 'h';
}

function renderQuotaDashboard() {
    const container = document.getElementById('dashboard');
    if (!container) return;

    currentGroups = groupModels(currentSnapshot.models);
    const visibleGroupsList = currentSettings.visibleGroups || ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other'];
    const filteredGroups = currentGroups.filter(g => visibleGroupsList.includes(g.id));

    const existingElementIds = new Set();
    const renderedElementIds = new Set();

    Array.from(container.children).forEach(child => {
        if (child.dataset.id) existingElementIds.add(child.dataset.id);
        else container.removeChild(child);
    });

    const displayStyle = document.getElementById('dashboard-display-style').value || 'group-circle';
    const wT = parseInt(document.getElementById('warning-threshold').value) || 60;
    const cT = parseInt(document.getElementById('critical-threshold').value) || 20;

    if (filteredGroups && filteredGroups.length > 0) {
        if (displayStyle === 'group-circle') {
            filteredGroups.forEach(g => renderCard(container, existingElementIds, renderedElementIds, g.id, g.name, g.remainingPercentage, g.resetInSeconds, wT, cT, 'circle'));
        } else if (displayStyle === 'group-line') {
            filteredGroups.forEach(g => renderCard(container, existingElementIds, renderedElementIds, g.id, g.name, g.remainingPercentage, g.resetInSeconds, wT, cT, 'line'));
        } else if (displayStyle === 'models-in-groups') {
            filteredGroups.forEach(group => {
                if (group.models.length > 0) {
                    renderHeader(container, existingElementIds, renderedElementIds, `header-${group.id}`, group.name);
                    group.models.forEach(m => renderCard(container, existingElementIds, renderedElementIds, m.id, m.label, m.remainingPercentage, m.resetInSeconds, wT, cT, 'circle'));
                }
            });
        } else {
            const allModels = filteredGroups.flatMap(g => g.models);
            allModels.forEach(m => renderCard(container, existingElementIds, renderedElementIds, m.id, m.label, m.remainingPercentage, m.resetInSeconds, wT, cT, 'circle'));
        }

        Array.from(container.children).forEach(child => {
            if (child.dataset.id && !renderedElementIds.has(child.dataset.id)) container.removeChild(child);
        });
    } else {
        container.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center;">No models visible (check settings)</div>';
    }

    updateStatusBar();
}

function renderHeader(container, existingIds, renderedIds, id, title) {
    renderedIds.add(id);
    let el = document.querySelector(`[data-id="${id}"]`);
    if (!el) { el = document.createElement('div'); el.className = 'group-header'; el.dataset.id = id; container.appendChild(el); }
    if (el.innerText !== title) el.innerText = title;
}

function renderCard(container, existingIds, renderedIds, id, title, pctRem, resetSeconds, wT, cT, type) {
    renderedIds.add(id);
    let color = 'var(--success)';
    if (pctRem <= wT) color = 'var(--warning)';
    if (pctRem <= cT) color = 'var(--danger)';

    let card = document.querySelector(`[data-id="${id}"]`);
    let isNew = false;
    if (!card) { isNew = true; card = document.createElement('div'); card.className = 'card'; card.dataset.id = id; container.appendChild(card); }

    const timerStr = formatTimer(resetSeconds);

    if (type === 'circle') {
        const html = `
            <div class="card-title"><span>${title}</span></div>
            <div class="progress-circle" style="background: conic-gradient(${color} ${pctRem}%, var(--border-color) 0%);">
                <span class="percentage" style="color:${color};">${pctRem}<span style="font-size:16px;">%</span></span>
            </div>
            <div class="info-row"><span>Available Quota</span><span style="font-weight:700;">${pctRem}%</span></div>
            <div class="info-row"><span>Refreshes In</span><span style="color:var(--text-primary)">${timerStr}</span></div>
        `;
        if (isNew || card.dataset.lastType !== 'circle') { card.innerHTML = html; card.dataset.lastType = 'circle'; }
        else {
            card.querySelector('.card-title span').innerText = title;
            card.querySelector('.progress-circle').style.background = `conic-gradient(${color} ${pctRem}%, var(--border-color) 0%)`;
            card.querySelector('.percentage').style.color = color;
            card.querySelector('.percentage').innerHTML = `${pctRem}<span style="font-size:16px;">%</span>`;
            card.querySelectorAll('.info-row span')[1].innerText = `${pctRem}%`;
            card.querySelectorAll('.info-row span')[3].innerText = timerStr;
        }
    } else if (type === 'line') {
        const html = `
            <div class="card-title"><span>${title}</span></div>
            <div class="line-graph-container">
                <div class="line-graph-fill" style="width: ${pctRem}%; background-color: ${color};"></div>
                <span class="percentage-overlay" style="color:${color};">${pctRem}%</span>
            </div>
            <div class="info-row" style="margin-top:20px;"><span>Refreshes In</span><span style="color:var(--text-primary)">${timerStr}</span></div>
        `;
        if (isNew || card.dataset.lastType !== 'line') { card.innerHTML = html; card.dataset.lastType = 'line'; }
        else {
            card.querySelector('.card-title span').innerText = title;
            card.querySelector('.line-graph-fill').style.width = `${pctRem}%`;
            card.querySelector('.line-graph-fill').style.backgroundColor = color;
            card.querySelector('.percentage-overlay').style.color = color;
            card.querySelector('.percentage-overlay').innerText = `${pctRem}%`;
            card.querySelectorAll('.info-row span')[1].innerText = timerStr;
        }
    }
}

// ────────────────────────────────────────
// STATUS BAR & HOVER MENU
// ────────────────────────────────────────
function updateStatusBar() {
    const el = document.getElementById('sb-quota-summary');
    const hoverPopup = document.getElementById('sb-hover-popup');

    if (!el || !currentGroups.length) return;

    const visibleGroups = currentGroups.filter(g => currentSettings.visibleGroups.includes(g.id));

    // 1. Update standard text pill (optional secondary info or we can just leave it as is if requested)
    // The user requested removing discord RPC and adding hover. For the primary pill, we update what they asked.
    const parts = visibleGroups.slice(0, 3).map(g => `${g.name}: ${g.remainingPercentage}%`);
    el.textContent = parts.join(' | ');

    // 2. Build the Hover Popup html mirroring Image 1
    if (hoverPopup) {
        let hoverHtml = `
            <div class="hp-title">
                <span>🚀</span> Antigravity Hub Status
            </div>
        `;

        visibleGroups.forEach(g => {
            // Determine status color
            let color = '#10b981'; // green
            if (g.remainingPercentage <= currentSettings.warningThreshold) color = '#f59e0b'; // yellow
            if (g.remainingPercentage <= currentSettings.criticalThreshold) color = '#ef4444'; // red

            const timerStr = formatTimer(g.resetInSeconds).replace(' ', ' ');

            hoverHtml += `
            <div class="hp-row">
                <div class="hp-model">
                    <div class="hp-status-dot" style="background-color: ${color}; box-shadow: 0 0 6px ${color}80;"></div>
                    ${g.name}
                </div>
                <div class="hp-details">
                    <span>Quota: ${g.remainingPercentage}%</span>
                    <span style="opacity:0.5;">|</span>
                    <span>Resets: ⏳ ${timerStr}</span>
                </div>
            </div>`;
        });

        hoverHtml += `
            <div class="hp-footer" onclick="smoothScrollTo(event, 'dashboard')">
                Open Dashboard
            </div>
        `;

        hoverPopup.innerHTML = hoverHtml;
    }
}

// ────────────────────────────────────────
// SETTINGS MODAL
// ────────────────────────────────────────
function openSettings() {
    document.getElementById('settings-modal').classList.add('visible');
}
function closeSettings() {
    document.getElementById('settings-modal').classList.remove('visible');
}

function saveSettings() {
    const visibleGroups = Array.from(document.querySelectorAll('.group-toggle:checked')).map(cb => cb.value);
    currentSettings.visibleGroups = visibleGroups;
    currentSettings.dashboardDisplayStyle = document.getElementById('dashboard-display-style').value;
    renderQuotaDashboard();
    closeSettings();
}

function resetSettings() {
    if (confirm("Reset all settings to default values?")) {
        document.getElementById('dashboard-display-style').value = 'group-circle';
        document.querySelector('#dashboard-style-wrapper .select-selected').childNodes[0].nodeValue = 'Group: Circular Gauges';
        document.querySelectorAll('.group-toggle').forEach(cb => cb.checked = true);
        document.getElementById('warning-threshold').value = 60;
        document.getElementById('critical-threshold').value = 20;
        saveSettings();
    }
}

// Custom Selects
function setupSelects() {
    document.querySelectorAll('.custom-select').forEach(customSelect => {
        const selected = customSelect.querySelector('.select-selected');
        const items = customSelect.querySelector('.select-items');
        const input = customSelect.querySelector('input[type="hidden"]');

        selected.addEventListener('click', function (e) {
            e.stopPropagation();
            closeAllSelect(this);
            items.classList.toggle('select-hide');
        });

        items.querySelectorAll('div').forEach(item => {
            item.addEventListener('click', function () {
                selected.childNodes[0].nodeValue = this.innerHTML;
                input.value = this.dataset.value;
                items.classList.add('select-hide');
                if (input.id === 'dashboard-display-style') renderQuotaDashboard();
            });
        });
    });
    document.addEventListener('click', closeAllSelect);
}

function closeAllSelect(elmnt) {
    document.querySelectorAll('.select-items').forEach(item => {
        if (elmnt !== item.previousElementSibling) item.classList.add('select-hide');
    });
}

// ────────────────────────────────────────
// SIMULATION ENGINE
// ────────────────────────────────────────
function simulateActivity() {
    currentSnapshot.models.forEach(model => {
        if (model.resetInSeconds > 0) model.resetInSeconds -= 1;

        if (Math.random() < 0.05 && model.remainingPercentage > 0) {
            model.remainingPercentage -= 20;
            if (model.remainingPercentage < 0) model.remainingPercentage = 0;
            model.remaining = Math.round((model.remainingPercentage / 100) * model.limit);
        }

        if (model.resetInSeconds <= 0) {
            model.remainingPercentage = 100;
            model.remaining = model.limit;
            model.resetInSeconds = 3600 + Math.floor(Math.random() * 7200);
        }
    });

    renderQuotaDashboard();
}

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupSelects();
    renderQuotaDashboard();
    setInterval(simulateActivity, 1000);

    initBackgroundParticles();
});

// ────────────────────────────────────────
// BACKGROUND PARTICLES (Actual Antigravity Style)
// ────────────────────────────────────────
function initBackgroundParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height, particles = [];
    const mouse = { x: -1000, y: -1000, radius: 200 };

    const colors = ['#4285f4', '#ea4335', '#fbbc05', '#34a853', '#ffffff'];

    class Particle {
        constructor() {
            this.init();
        }

        init() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = Math.random() * 1.5 + 0.5;
            this.baseX = this.x;
            this.baseY = this.y;
            this.density = (Math.random() * 40) + 1;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.opacity = Math.random() * 0.5 + 0.1;
        }

        update() {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < mouse.radius && distance > 0) {
                let forceDirectionX = dx / distance;
                let forceDirectionY = dy / distance;
                let maxDistance = mouse.radius;
                let force = (maxDistance - distance) / maxDistance;
                let directionX = forceDirectionX * force * this.density;
                let directionY = forceDirectionY * force * this.density;
                this.x -= directionX;
                this.y -= directionY;
            } else {
                // Subtle random drift
                this.x += (Math.random() - 0.5) * 0.1;
                this.y += (Math.random() - 0.5) * 0.1;

                if (Math.abs(this.x - this.baseX) > 0.1) {
                    this.x -= (this.x - this.baseX) / 30;
                }
                if (Math.abs(this.y - this.baseY) > 0.1) {
                    this.y -= (this.y - this.baseY) / 30;
                }
            }
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        particles = [];
        const quantity = Math.floor((width * height) / 8000);
        for (let i = 0; i < quantity; i++) {
            particles.push(new Particle());
        }
    }

    function animate() {
        if (width === 0 || height === 0) return;
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        ctx.globalAlpha = 1.0;
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
        resize();
        console.log(`Canvas resized to ${width}x${height}. Total particles: ${particles.length}`);
    });

    window.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    // Forced initial resize and start
    resize();
    console.log(`Initial particle population: ${particles.length}`);
    animate();
}
