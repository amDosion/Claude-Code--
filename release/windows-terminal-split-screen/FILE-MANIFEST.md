# 文件清单 — windows-terminal-split-screen.zip

## 包内容

```
windows-terminal-split-screen/
├── CHANGE-REPORT.md                          # 详细变更文档（含代码证据）
├── FILE-MANIFEST.md                          # 本文件
├── full-source-diff.patch                    # 完整 git diff（可用 git apply 应用）
│
├── src/utils/swarm/backends/
│   ├── WindowsTerminalBackend.ts             # [新增] 核心后端实现（360 行）
│   ├── detection.ts                          # [修改] +47 行：WT 检测函数
│   ├── registry.ts                           # [修改] +107/-20 行：后端注册
│   ├── types.ts                              # [修改] +28/-4 行：类型定义
│   └── PaneBackendExecutor.ts                # [修改] +41/-41 行：自定义命令支持
│
└── docs/
    └── 08-windows-terminal-pane-management.md  # [新增] 限制追踪与解决方案提案（175 行）
```

## 如何应用

### 方式一：应用 patch（推荐）
```bash
cd /path/to/RE-Claude-Code
git apply full-source-diff.patch
```

### 方式二：直接复制文件
将 `src/` 和 `docs/` 目录复制到项目根目录，覆盖已有文件。

## 验证
```bash
npx tsc --noEmit  # 这些文件应编译无错误
```
