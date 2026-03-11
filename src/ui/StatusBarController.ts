import * as vscode from 'vscode';
import { UsageSnapshot } from '../tracking/LocalFetcher';
import { ModelGroupingService, ModelGroup } from '../services/ModelGroupingService';

export class StatusBarController {
    private mainItem: vscode.StatusBarItem;
    private context: vscode.ExtensionContext;
    private lastSnapshot: UsageSnapshot | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.mainItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.mainItem.command = 'antigravityHub.openDashboard';
        this.context.subscriptions.push(this.mainItem);
    }

    public update(snapshot: UsageSnapshot | null): void {
        this.lastSnapshot = snapshot;
        const config = vscode.workspace.getConfiguration('antigravityHub');
        const warningThreshold = config.get<number>('warningThreshold') || 60;
        const criticalThreshold = config.get<number>('criticalThreshold') || 20;
        let format = config.get<string>('statusBarFormat') || 'standard';

        const visibleGroupsSetting = config.get<string[]>('visibleGroups') || ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other'];

        if (!snapshot || visibleGroupsSetting.length === 0) {
            this.mainItem.text = '$(radio-tower) Hub: Offline';
            this.mainItem.tooltip = 'Click to open dashboard';
            if (!snapshot) {
                this.mainItem.show();
            } else {
                this.mainItem.hide();
            }
            return;
        }

        const groups = ModelGroupingService.groupModels(snapshot.models);
        const priorityOrder = ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other'];

        const pillTexts: string[] = [];
        const tooltipGroups: ModelGroup[] = [];

        for (const groupName of priorityOrder) {
            if (!visibleGroupsSetting.includes(groupName)) continue;

            const group = groups.find(g => g.id === groupName);
            if (!group) continue;

            tooltipGroups.push(group);
            const icon = group.remainingPercentage <= criticalThreshold ? '🔴' : group.remainingPercentage <= warningThreshold ? '🟡' : '🟢';

            let shortName = group.name;
            if (format === 'compact' && shortName.includes('Gemini')) {
                shortName = shortName.replace('Gemini', 'Gem');
            }

            switch (format) {
                case 'compact':
                    pillTexts.push(`${icon} ${shortName}`);
                    break;
                case 'icon':
                    pillTexts.push(`${icon}`);
                    break;
                case 'percent':
                    pillTexts.push(`${icon} ${group.remainingPercentage}%`);
                    break;
                case 'standard':
                default:
                    pillTexts.push(`${icon} ${group.name}: ${group.remainingPercentage}%`);
                    break;
            }
        }

        if (pillTexts.length > 0) {
            this.mainItem.text = pillTexts.join('  |  ');
            this.mainItem.tooltip = this.generateTooltip(tooltipGroups, criticalThreshold, warningThreshold);
            this.mainItem.show();
        } else {
            this.mainItem.hide();
        }
    }

    private generateTooltip(groups: ModelGroup[], critical: number, warning: number): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        md.appendMarkdown(`### 🚀 Antigravity Hub Status\n\n---\n\n`);

        for (const group of groups) {
            const icon = group.remainingPercentage <= critical ? '🔴' : group.remainingPercentage <= warning ? '🟡' : '🟢';
            const resetStr = group.resetInSeconds !== undefined ? this.formatTimer(group.resetInSeconds) : '--:--';

            md.appendMarkdown(`**${icon} ${group.name}**\n\n`);
            md.appendMarkdown(`Quota: \`${group.remainingPercentage}%\` &nbsp;&nbsp;|&nbsp;&nbsp; Resets: ⏳ ${resetStr}\n\n`);
            md.appendMarkdown(`---\n\n`);
        }

        md.appendMarkdown(`[Open Dashboard](command:antigravityHub.openDashboard)`);

        return md;
    }

    private formatTimer(seconds: number): string {
        if (seconds <= 0) return 'Ready to use';
        const totalMinutes = Math.ceil(seconds / 60);
        if (totalMinutes < 60) return `${totalMinutes}m`;

        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;

        if (h < 24) return `${h}h ${m}m`;

        const days = Math.floor(h / 24);
        const remainingHours = h % 24;
        return `${days}d ${remainingHours}h ${m}m`;
    }

    public dispose(): void {
        this.mainItem.dispose();
    }
}
