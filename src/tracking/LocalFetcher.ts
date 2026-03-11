import * as vscode from 'vscode';
import * as https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── Types ──

interface ModelUsage {
    id: string;
    label: string;
    remainingPercentage: number;
    resetTime?: string;
    resetInSeconds?: number;
    quotaGroup: 'primary' | 'secondary' | 'other';
}

interface UsageSnapshot {
    timestamp: number;
    models: ModelUsage[];
}

interface DiscoveryResult {
    connectPort: number;
    csrfToken: string;
}

interface ProcessCandidate {
    pid: number;
    extensionPort: number;
    csrfToken: string;
}

interface ApiQuotaInfo {
    remainingFraction?: number;
    resetTime?: string;
}

interface ClientModelConfig {
    label: string;
    modelOrAlias?: { model: string };
    quotaInfo?: ApiQuotaInfo;
}

interface ServerUserStatusResponse {
    userStatus?: {
        cascadeModelConfigData?: {
            clientModelConfigs?: ClientModelConfig[];
        };
        name?: string;
        email?: string;
    };
    message?: string;
}

// ── Constants ──

const PROCESS_NAME_WIN = 'language_server_windows_x64.exe';
const PROCESS_NAME_UNIX = 'language_server';
const GET_USER_STATUS = '/exa.language_server_pb.LanguageServerService/GetUserStatus';
const GET_UNLEASH_DATA = '/exa.language_server_pb.LanguageServerService/GetUnleashData';
const PROCESS_CMD_TIMEOUT_MS = 15_000;
const HTTP_TIMEOUT_MS = 10_000;
const SCAN_RETRY_MS = 100;

// ── State ──

let cachedDiscovery: DiscoveryResult | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const diag = vscode.window.createOutputChannel('Antigravity Hub');

const log = (step: string, msg: string): void => {
    const ts = new Date().toISOString().slice(11, 23);
    diag.appendLine(`[${ts}] [${step}] ${msg}`);
};

// ── Process Discovery (Windows) ──

const getProcessListCommandWin = (): string => {
    const utf8 = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
    return `chcp 65001 >nul && powershell -NoProfile -Command "${utf8}Get-CimInstance Win32_Process -Filter 'name=''${PROCESS_NAME_WIN}''' | Select-Object ProcessId,CommandLine | ConvertTo-Json"`;
};

const getProcessByKeywordCommandWin = (): string => {
    const utf8 = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
    return `chcp 65001 >nul && powershell -NoProfile -Command "${utf8}Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'csrf_token' } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json"`;
};

const isAntigravityProcess = (commandLine: string): boolean => {
    if (!commandLine.includes('--extension_server_port')) return false;
    if (!commandLine.includes('--csrf_token')) return false;
    return /--app_data_dir\s+antigravity\b/i.test(commandLine);
};

const parseWinProcessInfo = (stdout: string): ProcessCandidate[] => {
    const jsonStart = stdout.indexOf('[');
    const jsonObjStart = stdout.indexOf('{');
    let clean = stdout;
    if (jsonStart >= 0 || jsonObjStart >= 0) {
        const start = (jsonStart >= 0 && jsonObjStart >= 0)
            ? Math.min(jsonStart, jsonObjStart)
            : Math.max(jsonStart, jsonObjStart);
        clean = stdout.substring(start);
    }

    let data: Array<{ ProcessId?: number; CommandLine?: string }>;
    try {
        const parsed: unknown = JSON.parse(clean.trim());
        data = Array.isArray(parsed) ? parsed : [parsed as { ProcessId?: number; CommandLine?: string }];
    } catch {
        log('Parse', 'JSON parse failed on process output');
        return [];
    }

    const candidates: ProcessCandidate[] = [];
    for (const item of data) {
        const cmd = item.CommandLine ?? '';
        if (!cmd || !isAntigravityProcess(cmd)) continue;

        const pid = item.ProcessId;
        if (!pid) continue;

        const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);
        if (!tokenMatch?.[1]) continue;

        const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
        const extensionPort = portMatch?.[1] ? parseInt(portMatch[1], 10) : 0;

        candidates.push({ pid, extensionPort, csrfToken: tokenMatch[1] });
    }

    return candidates;
};

// ── Process Discovery (Unix) ──

const getProcessListCommandUnix = (): string => {
    return `ps -ww -eo pid,ppid,args | grep "${PROCESS_NAME_UNIX}" | grep -v grep`;
};

const parseUnixProcessInfo = (stdout: string): ProcessCandidate[] => {
    const lines = stdout.split('\n').filter(l => l.trim());
    const candidates: ProcessCandidate[] = [];

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) continue;

        const pid = parseInt(parts[0], 10);
        if (isNaN(pid)) continue;

        const cmd = parts.slice(2).join(' ');
        if (!isAntigravityProcess(cmd)) continue;

        const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/i);
        if (!tokenMatch?.[1]) continue;

        const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
        const extensionPort = portMatch?.[1] ? parseInt(portMatch[1], 10) : 0;

        candidates.push({ pid, extensionPort, csrfToken: tokenMatch[1] });
    }

    return candidates;
};

// ── Port Discovery ──

const getPortListCommandWin = (pid: number): string => {
    const utf8 = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
    return `chcp 65001 >nul && powershell -NoProfile -NonInteractive -Command "${utf8}$ports = Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort; if ($ports) { $ports | Sort-Object -Unique }"`;
};

const getPortListCommandUnix = (pid: number): string => {
    return `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null || ss -tlnp 2>/dev/null | grep "pid=${pid}," || netstat -tulpn 2>/dev/null | grep ${pid}`;
};

const parseListeningPorts = (stdout: string): number[] => {
    const ports = new Set<number>();

    if (process.platform === 'win32') {
        const matches = stdout.match(/\b\d{1,5}\b/g) ?? [];
        for (const v of matches) {
            const p = parseInt(v, 10);
            if (p > 0 && p <= 65535) ports.add(p);
        }
    } else {
        const combined = /(?:LISTEN\s+\d+\s+\d+\s+(?:\*|[\d.]+|\[[\da-f:]*\]):(\d+))|(?:TCP\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\))/gi;
        let match: RegExpExecArray | null;
        while ((match = combined.exec(stdout)) !== null) {
            const p = parseInt(match[1] ?? match[2], 10);
            if (!isNaN(p)) ports.add(p);
        }
    }

    return Array.from(ports).sort((a, b) => a - b);
};

// ── HTTPS Transport ──

const transmit = <T>(port: number, endpoint: string, token: string, payload: object): Promise<T> => {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const opts: https.RequestOptions = {
            hostname: '127.0.0.1',
            port,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': token,
            },
            rejectUnauthorized: false,
            timeout: HTTP_TIMEOUT_MS,
            agent: false,
        };

        const req = https.request(opts, res => {
            let body = '';
            res.on('data', c => (body += c));
            res.on('end', () => {
                if (!body || body.trim().length === 0) {
                    reject(new Error('Empty response'));
                    return;
                }
                try {
                    resolve(JSON.parse(body) as T);
                } catch {
                    reject(new Error(`JSON parse failed: ${body.substring(0, 200)}`));
                }
            });
        });

        req.on('error', e => reject(new Error(`Connection failed: ${e.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.write(data);
        req.end();
    });
};

// ── Port Verification ──

const pingPort = (port: number, token: string): Promise<boolean> => {
    return new Promise(resolve => {
        const opts: https.RequestOptions = {
            hostname: '127.0.0.1',
            port,
            path: GET_UNLEASH_DATA,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Codeium-Csrf-Token': token,
                'Connect-Protocol-Version': '1',
            },
            rejectUnauthorized: false,
            timeout: HTTP_TIMEOUT_MS,
            agent: false,
        };

        const req = https.request(opts, res => resolve(res.statusCode === 200));
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.write(JSON.stringify({ wrapper_data: {} }));
        req.end();
    });
};

// ── Full Discovery Chain ──

const findCandidates = async (): Promise<ProcessCandidate[]> => {
    const isWin = process.platform === 'win32';

    // Phase 1: by process name
    log('Hunt', `Phase 1: searching by process name (${isWin ? PROCESS_NAME_WIN : PROCESS_NAME_UNIX})...`);
    try {
        const cmd = isWin ? getProcessListCommandWin() : getProcessListCommandUnix();
        const { stdout } = await execAsync(cmd, { timeout: PROCESS_CMD_TIMEOUT_MS });

        if (stdout && stdout.trim()) {
            const candidates = isWin ? parseWinProcessInfo(stdout) : parseUnixProcessInfo(stdout);
            if (candidates.length > 0) {
                log('Hunt', `Found ${candidates.length} candidate(s) by process name`);
                return candidates;
            }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('Hunt', `Phase 1 failed: ${msg}`);
    }

    // Phase 2: keyword search (Windows only)
    if (isWin) {
        log('Hunt', 'Phase 2: keyword search (csrf_token)...');
        try {
            const cmd = getProcessByKeywordCommandWin();
            const { stdout } = await execAsync(cmd, { timeout: PROCESS_CMD_TIMEOUT_MS });

            if (stdout && stdout.trim()) {
                const candidates = parseWinProcessInfo(stdout);
                if (candidates.length > 0) {
                    log('Hunt', `Found ${candidates.length} candidate(s) by keyword`);
                    return candidates;
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log('Hunt', `Phase 2 failed: ${msg}`);
        }
    }

    log('Hunt', 'No candidates found');
    return [];
};

const identifyPorts = async (pid: number): Promise<number[]> => {
    try {
        const cmd = process.platform === 'win32'
            ? getPortListCommandWin(pid)
            : getPortListCommandUnix(pid);
        const { stdout } = await execAsync(cmd, { timeout: PROCESS_CMD_TIMEOUT_MS });
        return parseListeningPorts(stdout);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('Ports', `Port identification failed for PID ${pid}: ${msg}`);
        return [];
    }
};

const verifyConnection = async (ports: number[], token: string): Promise<number | null> => {
    for (const port of ports) {
        log('Verify', `Pinging port ${port}...`);
        if (await pingPort(port, token)) {
            return port;
        }
    }
    return null;
};

const runDiscovery = async (maxAttempts: number = 3): Promise<DiscoveryResult | null> => {
    log('Discovery', '═══ Starting discovery chain ═══');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        log('Discovery', `Attempt ${attempt}/${maxAttempts}...`);

        const candidates = await findCandidates();
        if (candidates.length === 0) {
            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, SCAN_RETRY_MS));
            }
            continue;
        }

        for (const info of candidates) {
            log('Discovery', `Checking PID=${info.pid}, ExtPort=${info.extensionPort}`);

            const ports = await identifyPorts(info.pid);
            log('Discovery', `Listening ports: ${ports.join(', ') || '(none)'}`);

            if (ports.length > 0) {
                const validPort = await verifyConnection(ports, info.csrfToken);
                if (validPort) {
                    log('Discovery', `✅ Verified connection on port ${validPort}`);
                    return { connectPort: validPort, csrfToken: info.csrfToken };
                }
            }
        }

        log('Discovery', `All candidates failed verification (attempt ${attempt})`);
        if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, SCAN_RETRY_MS));
        }
    }

    log('Discovery', '✗ Discovery chain exhausted');
    runDiagnostics();
    return null;
};

const runDiagnostics = (): void => {
    log('Diag', `Platform: ${process.platform}, Arch: ${process.arch}`);
    if (process.platform === 'win32') {
        log('Diag', 'Tips:');
        log('Diag', '  1. Ensure Antigravity IDE is running');
        log('Diag', '  2. Check if language_server_windows_x64.exe is in Task Manager');
        log('Diag', '  3. Try restarting Antigravity');
    } else {
        log('Diag', 'Tips:');
        log('Diag', '  1. Ensure Antigravity is running');
        log('Diag', '  2. Run: ps aux | grep language_server');
    }
};

// ── Public API ──

export const discoverPort = async (): Promise<number | null> => {
    cachedDiscovery = await runDiscovery();
    return cachedDiscovery?.connectPort ?? null;
};

// ── Data Fetching ──

export const classifyQuotaGroup = (
    key: string
): 'primary' | 'secondary' | 'other' => {
    const lower = key.toLowerCase();
    if (/pro|reasoning|premium|thinking/i.test(lower)) return 'primary';
    if (/flash|standard|basic|free/i.test(lower)) return 'secondary';
    return 'other';
};

const fetchUserStatus = async (discovery: DiscoveryResult): Promise<ServerUserStatusResponse> => {
    log('RPC', `POST https://127.0.0.1:${discovery.connectPort}${GET_USER_STATUS}`);
    return transmit<ServerUserStatusResponse>(
        discovery.connectPort,
        GET_USER_STATUS,
        discovery.csrfToken,
        {
            metadata: {
                ideName: 'antigravity',
                extensionName: 'antigravity',
                locale: 'en',
            },
        },
    );
};

const mapResponseToSnapshot = (data: ServerUserStatusResponse): UsageSnapshot | null => {
    const status = data.userStatus;
    if (!status) {
        log('RPC', `No userStatus in response. Message: ${data.message ?? 'none'}`);
        return null;
    }

    const configs = status.cascadeModelConfigData?.clientModelConfigs ?? [];
    const models: ModelUsage[] = [];
    const now = Date.now();

    for (const model of configs) {
        if (!model.quotaInfo) continue;

        const label = model.label;
        const id = model.modelOrAlias?.model || label;
        const fraction = model.quotaInfo.remainingFraction;
        const resetTimeStr = model.quotaInfo.resetTime;

        let resetInSeconds: number | undefined;
        if (resetTimeStr) {
            const resetDate = new Date(resetTimeStr);
            if (!isNaN(resetDate.getTime())) {
                resetInSeconds = Math.max(0, Math.floor((resetDate.getTime() - now) / 1000));
            }
        }

        const remainingPercentage = fraction !== undefined ? Math.round(fraction * 100) : 0;

        models.push({
            id,
            label,
            remainingPercentage,
            resetTime: resetTimeStr,
            resetInSeconds,
            quotaGroup: classifyQuotaGroup(label),
        });
    }

    if (models.length === 0) {
        log('RPC', 'Response contained no model quotas');
        return null;
    }

    log('RPC', `Parsed ${models.length} model quotas`);
    // Sort: Primary first, then Secondary, then Other
    models.sort((a, b) => {
        const rank = { primary: 0, secondary: 1, other: 2 };
        if (rank[a.quotaGroup] !== rank[b.quotaGroup]) {
            return rank[a.quotaGroup] - rank[b.quotaGroup];
        }
        return a.label.localeCompare(b.label); // Stable alpha sort within groups
    });

    return { timestamp: now, models };
};

export const pollUsage = async (): Promise<UsageSnapshot | null> => {
    if (!cachedDiscovery) {
        cachedDiscovery = await runDiscovery();
    }

    if (!cachedDiscovery) return null;

    try {
        const response = await fetchUserStatus(cachedDiscovery);
        return mapResponseToSnapshot(response);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('RPC', `FAILED: ${msg}`);
        cachedDiscovery = null;
        return null;
    }
};

export const startPolling = (
    intervalMs: number,
    callback: (snapshot: UsageSnapshot | null) => void
): void => {
    stopPolling();

    const tick = async () => {
        const snapshot = await pollUsage();
        callback(snapshot);
    };

    tick();
    pollTimer = setInterval(tick, intervalMs);
};

export const stopPolling = (): void => {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
};

export const resetDiscoveredPort = (): void => {
    cachedDiscovery = null;
};

export const showDiagnostics = (): void => {
    diag.show();
};

export type { UsageSnapshot, ModelUsage };
