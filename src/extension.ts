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

const notifiedCategories = new Set<string>();

const onUsagePoll = async (snapshot: UsageSnapshot | null): Promise<void> => {
    if (snapshot && lastSnapshot) {
        const config = vscode.workspace.getConfiguration('antigravityHub');
        const criticalThreshold = config.get<number>('criticalThreshold') || 5;
        const notificationsEnabled = config.get<boolean>('notificationsEnabled') !== false;

        const categorizedModels: Record<string, typeof snapshot.models> = {};
        for (const model of snapshot.models) {
            if (!categorizedModels[model.quotaGroup]) {
                categorizedModels[model.quotaGroup] = [];
            }
            categorizedModels[model.quotaGroup].push(model);
        }

        if (notificationsEnabled) {
            for (const [category, models] of Object.entries(categorizedModels)) {
                const anyLow = models.some(m => m.remainingPercentage <= criticalThreshold);
                const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

                if (anyLow) {
                    if (!notifiedCategories.has(category)) {
                        const lowestPercent = Math.min(...models.map(m => m.remainingPercentage));
                        vscode.window.showWarningMessage(`🚀 Antigravity Alert: ${categoryLabel} models are at ${lowestPercent}% quota!`);
                        notifiedCategories.add(category);
                    }
                } else {
                    notifiedCategories.delete(category); // Reset if all models in category go back up
                }
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
