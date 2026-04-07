# File Manifest — windows-terminal-split-screen.zip

## Package Contents

```
windows-terminal-split-screen/
├── CHANGE-REPORT.md                          # Comprehensive change documentation with evidence
├── FILE-MANIFEST.md                          # This file
├── full-source-diff.patch                    # Complete git diff (applicable with: git apply)
│
├── src/utils/swarm/backends/
│   ├── WindowsTerminalBackend.ts             # [NEW] Core backend implementation (360 lines)
│   ├── detection.ts                          # [MODIFIED] +47 lines: WT detection functions
│   ├── registry.ts                           # [MODIFIED] +107/-20 lines: backend registration
│   ├── types.ts                              # [MODIFIED] +28/-4 lines: type definitions
│   └── PaneBackendExecutor.ts                # [MODIFIED] +41/-41 lines: custom command support
│
└── docs/
    └── 08-windows-terminal-pane-management.md  # [NEW] Limitations & solution proposals (175 lines)
```

## How to Apply

### Option 1: Apply the patch (recommended)
```bash
cd /path/to/RE-Claude-Code
git apply full-source-diff.patch
```

### Option 2: Copy files directly
Copy the `src/` and `docs/` directories into the project root, overwriting existing files.

## Verification
```bash
npx tsc --noEmit  # Should compile without errors in these files
```
