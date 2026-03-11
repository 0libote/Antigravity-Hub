import * as vscode from 'vscode';
import {
    startPolling,
    stopPolling,
    discoverPort,
    showDiagnostics,
} from './tracking/LocalFetcher.js';
import type { UsageSnapshot } from './tracking/LocalFetcher.js';
import { DashboardPanel } from './ui/SidebarProvider.js';

import { StatusBarController } from './ui/StatusBarController.js';
let statusBarController: StatusBarController;
let lastSnapshot: UsageSnapshot | null = null;

const openDashboard = async (extensionUri: vscode.Uri): Promise<void> => {
    const panel = DashboardPanel.createOrShow(extensionUri);

    panel.updateUsage(lastSnapshot);
};

const notifiedModels = new Set<string>();

const onUsagePoll = async (snapshot: UsageSnapshot | null): Promise<void> => {
    if (snapshot && lastSnapshot) {
        const config = vscode.workspace.getConfiguration('antigravityHub');
        const criticalThreshold = config.get<number>('criticalThreshold') || 5;
        const notificationsEnabled = config.get<boolean>('notificationsEnabled') !== false;

        for (const model of snapshot.models) {
            if (notificationsEnabled && model.remainingPercentage <= criticalThreshold) {
                if (!notifiedModels.has(model.id)) {
                    vscode.window.showWarningMessage(`🚀 Antigravity Alert: ${model.label} is at ${model.remainingPercentage}% quota!`);
                    notifiedModels.add(model.id);
                }
            } else if (model.remainingPercentage > criticalThreshold) {
                notifiedModels.delete(model.id); // Reset if it goes back up
            }
        }
    }

    lastSnapshot = snapshot;

    const dashboard = DashboardPanel.getInstance();
    if (dashboard) {
        dashboard.updateUsage(snapshot);
    }

    statusBarController.update(snapshot);
};

export const activate = async (
    context: vscode.ExtensionContext
): Promise<void> => {
    // Status bar
    statusBarController = new StatusBarController(context);
    context.subscriptions.push(statusBarController);

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityHub.openDashboard', () =>
            openDashboard(context.extensionUri)
        )
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityHub.showDiagnostics', () => showDiagnostics())
    );

    // Initial status bar
    statusBarController.update(null);

    // Config & Polling
    const config = vscode.workspace.getConfiguration('antigravityHub');
    const interval = config.get<number>('pollInterval', 5000);

    await discoverPort();
    startPolling(interval, onUsagePoll);

    // dashboard auto-open removed as requested
};

export const deactivate = (): void => {
    stopPolling();
};
