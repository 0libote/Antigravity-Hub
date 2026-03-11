import { ModelUsage } from '../tracking/LocalFetcher';

export interface ModelGroup {
    id: string;
    name: string;
    models: ModelUsage[];
    remainingPercentage: number;
    resetInSeconds?: number;
}

export type AutoGroupFamily = 'claude' | 'gemini_pro' | 'gemini_flash' | 'gemini_image' | 'other';

export class ModelGroupingService {
    private static readonly GROUPS = {
        CLAUDE: {
            id: 'claude',
            name: 'Claude',
            ids: [
                'MODEL_CLAUDE_4_5_SONNET',
                'MODEL_CLAUDE_4_5_SONNET_THINKING',
                'MODEL_PLACEHOLDER_M12',
                'MODEL_PLACEHOLDER_M26',
                'MODEL_PLACEHOLDER_M35',
                'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
            ],
            patterns: [/claude/i, /sonnet/i, /opus/i, /haiku/i],
        },
        GEMINI_PRO: {
            id: 'gemini_pro',
            name: 'Gemini Pro',
            ids: ['MODEL_PLACEHOLDER_M8', 'MODEL_PLACEHOLDER_M7', 'MODEL_PLACEHOLDER_M36', 'MODEL_PLACEHOLDER_M37'],
            patterns: [/gemini.*pro/i],
        },
        GEMINI_FLASH: {
            id: 'gemini_flash',
            name: 'Gemini Flash',
            ids: ['MODEL_PLACEHOLDER_M18'],
            patterns: [/gemini.*flash/i],
        },
        GEMINI_IMAGE: {
            id: 'gemini_image',
            name: 'Gemini Image',
            ids: ['MODEL_PLACEHOLDER_M9'],
            patterns: [/gemini.*image/i],
        },
    };

    public static resolveAutoGroupFamily(modelId: string, label: string): AutoGroupFamily {
        const idLower = modelId.toLowerCase();
        const labelLower = label.toLowerCase();

        if (this.GROUPS.CLAUDE.ids.includes(modelId) || this.GROUPS.CLAUDE.patterns.some(p => p.test(idLower) || p.test(labelLower))) {
            return 'claude';
        }
        if (this.GROUPS.GEMINI_PRO.ids.includes(modelId) || this.GROUPS.GEMINI_PRO.patterns.some(p => p.test(idLower) || p.test(labelLower))) {
            return 'gemini_pro';
        }
        if (this.GROUPS.GEMINI_FLASH.ids.includes(modelId) || this.GROUPS.GEMINI_FLASH.patterns.some(p => p.test(idLower) || p.test(labelLower))) {
            return 'gemini_flash';
        }
        if (this.GROUPS.GEMINI_IMAGE.ids.includes(modelId) || this.GROUPS.GEMINI_IMAGE.patterns.some(p => p.test(idLower) || p.test(labelLower))) {
            return 'gemini_image';
        }

        return 'other';
    }

    public static groupModels(models: ModelUsage[]): ModelGroup[] {
        const groupsMap = new Map<string, ModelGroup>();

        for (const model of models) {
            const family = this.resolveAutoGroupFamily(model.id, model.label);
            const groupInfo = family !== 'other'
                ? Object.values(this.GROUPS).find(g => g.id === family)
                : { id: 'other', name: 'Other' };

            const groupId = groupInfo?.id || 'other';
            const groupName = groupInfo?.name || 'Other';

            if (!groupsMap.has(groupId)) {
                groupsMap.set(groupId, {
                    id: groupId,
                    name: groupName,
                    models: [],
                    remainingPercentage: 0,
                });
            }

            const group = groupsMap.get(groupId)!;
            group.models.push(model);
        }

        // Finalize groups: calculate average percentage and get earliest reset
        const result: ModelGroup[] = [];
        for (const group of groupsMap.values()) {
            // Sort models within group alphabetically by label for stability
            group.models.sort((a, b) => a.label.localeCompare(b.label));

            // Group percentage should be the average of all its models to match native UI
            const total = group.models.reduce((sum, m) => sum + m.remainingPercentage, 0);
            group.remainingPercentage = group.models.length > 0 ? Math.round(total / group.models.length) : 0;

            // Earliest reset time
            const resets = group.models.map(m => m.resetInSeconds).filter((s): s is number => s !== undefined);
            if (resets.length > 0) {
                group.resetInSeconds = Math.min(...resets);
            }

            result.push(group);
        }

        // Stable sort groups: Claude > Gemini Pro > Gemini Flash > Gemini Image > Other
        const order = ['claude', 'gemini_pro', 'gemini_flash', 'gemini_image', 'other'];
        result.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

        return result;
    }
}
