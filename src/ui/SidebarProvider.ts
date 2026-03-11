import * as vscode from 'vscode';
import type { UsageSnapshot } from '../tracking/LocalFetcher.js';
import { ModelGroupingService, ModelGroup } from '../services/ModelGroupingService.js';

interface DashboardState {
    snapshot: UsageSnapshot | null;
    groups: ModelGroup[];
}

export class DashboardPanel {
    private static instance: DashboardPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    private state: DashboardState = {
        snapshot: null,
        groups: []
    };

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(
            async (msg: any) => {
                const config = vscode.workspace.getConfiguration('antigravityHub');
                switch (msg.command) {
                    case 'testNotification':
                        vscode.window.showInformationMessage('🚨 Test Critical Alert: Simulated quota is low! (This is a test notification)');
                        break;
                    case 'saveSettings':
                        await config.update('pollInterval', parseInt(msg.settings.pollInterval), vscode.ConfigurationTarget.Global);
                        await config.update('statusBarFormat', msg.settings.statusBarFormat, vscode.ConfigurationTarget.Global);
                        await config.update('warningThreshold', parseInt(msg.settings.warningThreshold), vscode.ConfigurationTarget.Global);
                        await config.update('criticalThreshold', parseInt(msg.settings.criticalThreshold), vscode.ConfigurationTarget.Global);
                        await config.update('dashboardDisplayStyle', msg.settings.dashboardDisplayStyle, vscode.ConfigurationTarget.Global);
                        await config.update('notificationsEnabled', msg.settings.notificationsEnabled, vscode.ConfigurationTarget.Global);
                        await config.update('visibleGroups', msg.settings.visibleGroups, vscode.ConfigurationTarget.Global);
                        break;
                    case 'resetSettings':
                        await config.update('pollInterval', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('statusBarFormat', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('warningThreshold', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('criticalThreshold', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('dashboardDisplayStyle', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('notificationsEnabled', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('visibleGroups', undefined, vscode.ConfigurationTarget.Global);

                        // Force refresh UI with defaults
                        this.updateUsage(this.state.snapshot);
                        break;
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static createOrShow(
        extensionUri: vscode.Uri
    ): DashboardPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.instance) {
            DashboardPanel.instance.panel.reveal(column);
            return DashboardPanel.instance;
        }

        const panel = vscode.window.createWebviewPanel(
            'antigravityHub.dashboard',
            'Antigravity Hub',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
                retainContextWhenHidden: true,
            }
        );

        DashboardPanel.instance = new DashboardPanel(panel, extensionUri);
        return DashboardPanel.instance;
    }

    public static getInstance(): DashboardPanel | undefined {
        return DashboardPanel.instance;
    }

    public updateUsage(snapshot: UsageSnapshot | null): void {
        const config = vscode.workspace.getConfiguration('antigravityHub');
        const settings = {
            pollInterval: config.get('pollInterval'),
            statusBarFormat: config.get('statusBarFormat'),
            warningThreshold: config.get('warningThreshold'),
            criticalThreshold: config.get('criticalThreshold'),
            dashboardDisplayStyle: config.get('dashboardDisplayStyle'),
            notificationsEnabled: config.get('notificationsEnabled'),
            visibleGroups: config.get('visibleGroups') || ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other']
        };
        this.state.snapshot = snapshot;
        this.state.groups = snapshot ? ModelGroupingService.groupModels(snapshot.models) : [];
        this.postMessage({ command: 'updateUsage', snapshot, groups: this.state.groups, settings });
    }

    private postMessage(msg: unknown): void {
        this.panel.webview.postMessage(msg);
    }

    private dispose(): void {
        DashboardPanel.instance = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) x.dispose();
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css')
        );
        const iconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.svg')
        );
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Hub</title>
    <link rel="stylesheet" href="${styleUri}">
    <!-- All premium styles are loaded from media/style.css -->
</head>
<body>

    <div class="header">
        <div class="header-title" style="display:flex; align-items:center; gap:8px;">
            <img src="${iconUri}" alt="Antigravity Hub Icon" style="width: 24px; height: 24px;">
            <span>Antigravity Hub</span>
        </div>
        <div class="controls">
            <button class="icon-btn" onclick="openSettings()" title="Settings">⚙ Settings</button>
            <div class="status-badge" id="backend-status" style="display:none; align-items:center; gap:5px; font-size:12px; color:var(--text-secondary);">
                <span id="status-dot" style="width:8px; height:8px; border-radius:50%; background:var(--text-secondary);"></span>
                <span id="status-text">Connecting...</span>
            </div>
        </div>
    </div>

    <!-- QUOTA DASHBOARD -->
    <div id="quota" class="tab-content active">
        <div id="dashboard">
            <div class="card" style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); font-size: 16px; padding: 40px;">
                Looking for Antigravity... Make sure it's running!
            </div>
        </div>
    </div>

    <!-- SETTINGS MODAL -->
    <div id="settings-modal" class="modal" onclick="if(event.target === this) closeSettings()">
        <div class="modal-content">
            <div class="modal-body">
                <div style="margin-bottom:25px; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:18px; font-weight:600;">Preferences</h3>
                <span class="close-btn" onclick="closeSettings()" style="font-size:24px; cursor:pointer; color:var(--text-secondary);">&times;</span>
            </div>
            
            <div class="settings-group">
                <span class="settings-group-title">General</span>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="display:block; margin-bottom:5px; font-size:12px; color:var(--text-secondary);">
                            Refresh Rate (ms)
                            <div class="info-icon-wrapper">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:4px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                <div class="info-tooltip">How often the dashboard checks for quota updates. Lower is faster but more intensive.</div>
                            </div>
                        </label>
                        <input type="number" id="poll-interval">
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-size:12px; color:var(--text-secondary);">Dashboard Display Style</label>
                        <div class="custom-select" id="dashboard-style-wrapper">
                            <input type="hidden" id="dashboard-display-style" value="group-circle">
                            <div class="select-selected">Group: Circular Gauges</div>
                            <div class="select-items select-hide">
                                <div data-value="group-circle">Group: Circular Gauges</div>
                                <div data-value="group-line">Group: Line Graphs</div>
                                <div data-value="models-in-groups">Models (Grouped)</div>
                                <div data-value="models-only">Models (Flat List)</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label class="checkbox-label" style="flex:1;">
                            <input type="checkbox" id="notifications-enabled">
                            <div>
                                <span class="checkbox-text">Critical Alerts</span>
                                <span class="checkbox-desc">Show desktop notifications when quota is low</span>
                            </div>
                        </label>
                        <button class="icon-btn" onclick="vscode.postMessage({command: 'testNotification'})" style="font-size:11px; padding:6px 10px;">Test VS Code Alert</button>
                    </div>
                </div>
            </div>

            <div class="settings-group">
                <span class="settings-group-title">Status Bar</span>
                <div style="margin-bottom:15px;">
                    <label style="display:block; margin-bottom:5px; font-size:12px; color:var(--text-secondary);">Format Style</label>
                    <div class="custom-select" id="status-bar-format-wrapper">
                        <input type="hidden" id="status-bar-format" value="standard">
                        <div class="select-selected">Standard (Icon, Name, %)</div>
                        <div class="select-items select-hide">
                            <div data-value="standard">Standard (Icon, Name, %)</div>
                            <div data-value="compact">Compact (Icon, Name)</div>
                            <div data-value="icon">Minimal (Icons Only)</div>
                            <div data-value="percent">Percentage (Icon, %)</div>
                        </div>
                    </div>
                </div>
                <label style="display:block; margin-bottom:10px; font-size:12px; color:var(--text-secondary);">Visible Providers</label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    <label class="checkbox-label"><input type="checkbox" class="group-toggle" value="claude"> <span class="checkbox-text">Claude</span></label>
                    <label class="checkbox-label"><input type="checkbox" class="group-toggle" value="gemini_pro"> <span class="checkbox-text">Gemini Pro</span></label>
                    <label class="checkbox-label"><input type="checkbox" class="group-toggle" value="gemini_flash"> <span class="checkbox-text">Gemini Flash</span></label>
                    <label class="checkbox-label"><input type="checkbox" class="group-toggle" value="gemini_image"> <span class="checkbox-text">Gemini Image</span></label>
                    <label class="checkbox-label" style="grid-column: 1/-1;"><input type="checkbox" class="group-toggle" value="other"> <span class="checkbox-text">Other Models</span></label>
                </div>
            </div>

            <div class="settings-group" style="margin-bottom:25px;">
                <span class="settings-group-title">Thresholds</span>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                    <div>
                        <label style="display:block; margin-bottom:5px; font-size:12px; color:var(--warning);">Warning Level (%)</label>
                        <input type="number" id="warning-threshold">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:5px; font-size:12px; color:var(--danger);">Critical Level (%)</label>
                        <input type="number" id="critical-threshold">
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:12px;">
                <button class="icon-btn" style="flex:1; justify-content:center;" onclick="resetSettings()">Reset</button>
                <button class="icon-btn primary" style="flex:2; justify-content:center;" onclick="saveSettings()">Save Configuration</button>
            </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentSnapshot = null;
        let currentGroups = [];
        let currentSettings = {};

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.command) {
                case 'updateUsage':
                    currentSnapshot = msg.snapshot;
                    currentGroups = msg.groups || [];
                    currentSettings = msg.settings || {};
                    const modal = document.getElementById('settings-modal');
                    if (!modal || !modal.classList.contains('visible')) {
                        updateSettingsUI();
                    }
                    renderQuotaDashboard();
                    break;
            }
        });

        function updateSettingsUI() {
            if (!currentSettings || Object.keys(currentSettings).length === 0) return;
            document.getElementById('poll-interval').value = currentSettings.pollInterval || 500;
            
            const sbFormat = currentSettings.statusBarFormat || 'standard';
            document.getElementById('status-bar-format').value = sbFormat;
            const sbOpt = document.querySelector(\`#status-bar-format-wrapper .select-items div[data-value="\${sbFormat}"]\`);
            if (sbOpt) document.querySelector('#status-bar-format-wrapper .select-selected').childNodes[0].nodeValue = sbOpt.innerHTML;
            
            document.getElementById('warning-threshold').value = currentSettings.warningThreshold ?? 60;
            document.getElementById('critical-threshold').value = currentSettings.criticalThreshold ?? 20;
            
            const ddStyle = currentSettings.dashboardDisplayStyle || 'group-circle';
            document.getElementById('dashboard-display-style').value = ddStyle;
            const ddOpt = document.querySelector(\`#dashboard-style-wrapper .select-items div[data-value="\${ddStyle}"]\`);
            if (ddOpt) document.querySelector('#dashboard-style-wrapper .select-selected').childNodes[0].nodeValue = ddOpt.innerHTML;
            
            document.getElementById('notifications-enabled').checked = currentSettings.notificationsEnabled !== false;
            
            const visibleGroups = currentSettings.visibleGroups || ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other'];
            document.querySelectorAll('.group-toggle').forEach(cb => {
                cb.checked = visibleGroups.includes(cb.value);
            });
        }

        function openSettings() { 
            updateSettingsUI();
            document.getElementById('settings-modal').classList.add('visible'); 
        }
        function closeSettings() { document.getElementById('settings-modal').classList.remove('visible'); }
        
        function saveSettings() {
            const visibleGroups = Array.from(document.querySelectorAll('.group-toggle:checked')).map(cb => cb.value);
            const settings = {
                pollInterval: document.getElementById('poll-interval').value,
                statusBarFormat: document.getElementById('status-bar-format').value,
                warningThreshold: document.getElementById('warning-threshold').value,
                criticalThreshold: document.getElementById('critical-threshold').value,
                dashboardDisplayStyle: document.getElementById('dashboard-display-style').value,
                notificationsEnabled: document.getElementById('notifications-enabled').checked,
                visibleGroups: visibleGroups
            };
            vscode.postMessage({command: 'saveSettings', settings});
            closeSettings();
        }

        function resetSettings() {
            if (confirm("Reset all settings to default values?")) {
                vscode.postMessage({command: 'resetSettings'});
                closeSettings();
            }
        }

        function formatTimer(seconds) {
            if (seconds === undefined || seconds <= 0) return 'Ready to use';
            const totalMinutes = Math.ceil(seconds / 60);
            if (totalMinutes < 60) return totalMinutes + 'm';
            
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            
            if (h < 24) return h + 'h ' + m + 'm';
            
            const days = Math.floor(h / 24);
            const remainingHours = h % 24;
            return days + 'd ' + remainingHours + 'h ' + m + 'm';
        }

        function renderQuotaDashboard() {
            const statusDot = document.getElementById('status-dot');
            const statusText = document.getElementById('status-text');
            const backendStatusMenuElement = document.getElementById('backend-status');
            const container = document.getElementById('dashboard');
            
            if (!currentSnapshot) {
                backendStatusMenuElement.style.display = 'flex';
                statusDot.style.background = 'var(--danger)'; 
                statusText.innerText = 'Disconnected';
                container.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); font-size: 16px; padding: 40px;">Waiting for connection... Make sure Antigravity is running.</div>';
                return;
            }

            // Hide the status indicator if everything is OK.
            backendStatusMenuElement.style.display = 'none';
            
            // Set tracking for existing DOM cards to prevent hover animation glitches during poll updates.
            const existingElementIds = new Set();
            const renderedElementIds = new Set();
            
            Array.from(container.children).forEach(child => {
                if (child.dataset.id) {
                    existingElementIds.add(child.dataset.id);
                } else {
                    // Remove elements that don't have our tracker IDs
                    container.removeChild(child);
                }
            });
            
            const displayStyle = currentSettings.dashboardDisplayStyle || 'group-circle';
            const wT = currentSettings.warningThreshold ?? 60;
            const cT = currentSettings.criticalThreshold ?? 20;

            if (currentGroups && currentGroups.length > 0) {
                 if (displayStyle === 'group-circle') {
                     currentGroups.forEach(group => renderCard(container, existingElementIds, renderedElementIds, group.id, group.name, group.remainingPercentage, group.resetInSeconds, wT, cT, 'circle'));
                 } else if (displayStyle === 'group-line') {
                     currentGroups.forEach(group => renderCard(container, existingElementIds, renderedElementIds, group.id, group.name, group.remainingPercentage, group.resetInSeconds, wT, cT, 'line'));
                 } else if (displayStyle === 'models-in-groups') {
                     currentGroups.forEach(group => {
                         if (group.models.length > 0) {
                             renderHeader(container, existingElementIds, renderedElementIds, \`header-\${group.id}\`, group.name);
                             group.models.forEach(model => renderCard(container, existingElementIds, renderedElementIds, model.id, model.label.replace(' MODEL_PLACEHOLDER', '').replace(' API', ''), model.remainingPercentage, model.resetInSeconds, wT, cT, 'circle'));
                         }
                     });
                 } else { // models-only
                     const allModels = currentGroups.flatMap(g => g.models);
                     allModels.forEach(model => renderCard(container, existingElementIds, renderedElementIds, model.id, model.label.replace(' MODEL_PLACEHOLDER', '').replace(' API', ''), model.remainingPercentage, model.resetInSeconds, wT, cT, 'circle'));
                 }
                 
                 // Cleanup removed elements
                 Array.from(container.children).forEach(child => {
                     if (child.dataset.id && !renderedElementIds.has(child.dataset.id)) {
                         container.removeChild(child);
                     }
                 });
                 
            } else {
                container.innerHTML = '<div class="card" style="grid-column:1/-1; text-align:center;">No models available</div>';
            }
        }
        
        function renderHeader(container, existingIds, renderedIds, id, title) {
            renderedIds.add(id);
            let el = document.querySelector(\`[data-id="\${id}"]\`);
            if (!el) {
                el = document.createElement('div');
                el.className = 'group-header';
                el.dataset.id = id;
                container.appendChild(el);
            }
            if (el.innerText !== title) el.innerText = title;
        }

        function renderCard(container, existingIds, renderedIds, id, title, pctRem, resetSeconds, wT, cT, type) {
            renderedIds.add(id);
            let color = 'var(--success)';
            if (pctRem <= wT) color = 'var(--warning)';
            if (pctRem <= cT) color = 'var(--danger)';
            
            let card = document.querySelector(\`[data-id="\${id}"]\`);
            let isNew = false;
            
            if (!card) {
                isNew = true;
                card = document.createElement('div');
                card.className = 'card';
                card.dataset.id = id;
                container.appendChild(card);
            }
            
            const timerStr = formatTimer(resetSeconds);
            
            if (type === 'circle') {
                const html = \`
                    <div class="card-title">
                        <span>\${title}</span>
                    </div>
                    
                    <div class="progress-circle" style="background: conic-gradient(\${color} \${pctRem}%, var(--border-color) 0%);">
                        <span class="percentage" style="color:\${color};">\${pctRem}<span style="font-size:16px;">%</span></span>
                    </div>

                    <div class="info-row">
                        <span>Available Quota</span>
                        <span style="font-weight:700;">\${pctRem}%</span>
                    </div>
                    <div class="info-row">
                        <span>Refreshes In</span>
                        <span style="color:var(--text-primary)">\${timerStr}</span>
                    </div>
                \`;
                if (isNew || card.dataset.lastType !== 'circle') {
                    card.innerHTML = html;
                    card.dataset.lastType = 'circle';
                } else {
                    card.querySelector('.card-title span').innerText = title;
                    card.querySelector('.progress-circle').style.background = \`conic-gradient(\${color} \${pctRem}%, var(--border-color) 0%)\`;
                    card.querySelector('.percentage').style.color = color;
                    card.querySelector('.percentage').innerHTML = \`\${pctRem}<span style="font-size:16px;">%</span>\`;
                    card.querySelectorAll('.info-row span')[1].innerText = \`\${pctRem}%\`;
                    card.querySelectorAll('.info-row span')[3].innerText = timerStr;
                }
            } else if (type === 'line') {
                 const html = \`
                    <div class="card-title">
                        <span>\${title}</span>
                    </div>

                    <div class="line-graph-container">
                        <div class="line-graph-fill" style="width: \${pctRem}%; background-color: \${color};"></div>
                        <span class="percentage-overlay" style="color:\${color};">\${pctRem}%</span>
                    </div>

                    <div class="info-row" style="margin-top:20px;">
                        <span>Refreshes In</span>
                        <span style="color:var(--text-primary)">\${timerStr}</span>
                    </div>
                \`;
                if (isNew || card.dataset.lastType !== 'line') {
                    card.innerHTML = html;
                    card.dataset.lastType = 'line';
                } else {
                    card.querySelector('.card-title span').innerText = title;
                    card.querySelector('.line-graph-fill').style.width = \`\${pctRem}%\`;
                    card.querySelector('.line-graph-fill').style.backgroundColor = color;
                    card.querySelector('.percentage-overlay').style.color = color;
                    card.querySelector('.percentage-overlay').innerText = \`\${pctRem}%\`;
                    card.querySelectorAll('.info-row span')[1].innerText = timerStr;
                }
            }
        }
        
        // Setup Custom Selects
        document.querySelectorAll('.custom-select').forEach(customSelect => {
            const selected = customSelect.querySelector('.select-selected');
            const items = customSelect.querySelector('.select-items');
            const input = customSelect.querySelector('input[type="hidden"]');
            
            selected.addEventListener('click', function(e) {
                e.stopPropagation();
                closeAllSelect(this);
                items.classList.toggle('select-hide');
            });
            
            items.querySelectorAll('div').forEach(item => {
                item.addEventListener('click', function(e) {
                    selected.childNodes[0].nodeValue = this.innerHTML;
                    input.value = this.dataset.value;
                    items.classList.add('select-hide');
                });
            });
        });

        function closeAllSelect(elmnt) {
            document.querySelectorAll('.select-items').forEach(item => {
                if (elmnt !== item.previousElementSibling) {
                    item.classList.add('select-hide');
                }
            });
        }
        document.addEventListener('click', closeAllSelect);

    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
