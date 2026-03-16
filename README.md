# Antigravity Hub

A local-only AI quota tracker built for [Antigravity](https://antigravity.google). It's a small project I've worked on to monitor model usage inside VS Code without sending data to external servers/doing shady stuff like other extensions for tracking model usage.

[**GitHub Repository**](https://github.com/0libote/AntiGravity-Hub) | [**View Releases**](https://github.com/0libote/AntiGravity-Hub/releases)

## Features
- **Dashboard**: Simple circular or line gauges to visualize remaining quota.
- **Status Bar Integration**: Shows remaining quota in the VS Code status bar.
- **Basic Alerts**: Color-coded indicators and visual warnings for low quotas.

## Installation

You can install this extension by downloading the VSIX file from the releases page:

### Latest Release
Download the most recent stable release (`.vsix` file) from the [Releases page](https://github.com/0libote/AntiGravity-Hub/releases/latest).

### Beta Release
If you want to test new features, download the latest pre-release/beta release (`.vsix` file) from the [Releases page](https://github.com/0libote/AntiGravity-Hub/releases). 

> **Note:** The beta versions are actively being worked on and might be a bit unstable or have incomplete features. Proceed with caution!

**To install:**
1. Open VS Code.
2. Go to the Extensions view.
3. Click the `...` menu at the top right of the Extensions view.
4. Select `Install from VSIX...` and choose the downloaded file.

## Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| `pollInterval` | `500` | Frequency of quota checks (ms). |
| `statusBarFormat` | `standard` | Format of status bar items (`standard`, `compact`, `icon`, `percent`). |
| `warningThreshold` | `60` | Red color trigger point (%). |
| `criticalThreshold` | `20` | Yellow color trigger point (%). |
| `visibleGroups` | *All* | Filter which provider families appear. |
| `dashboardDisplayStyle` | `group-circle` | Visual style for displaying quota in the dashboard. |

## Future Plans
Other stuff will come in the future as I have time or want to work on things I need for myself.

## Building from Source

If you want to build it yourself:

```bash
# Install dependencies
npm install

# Compile the TypeScript source
npm run compile

# Package as a VSIX extension
vsce package
```

## Useful Links
- [GitHub Repository](https://github.com/0libote/AntiGravity-Hub)
- [Issue Tracker](https://github.com/0libote/AntiGravity-Hub/issues)
- [Releases](https://github.com/0libote/AntiGravity-Hub/releases)

