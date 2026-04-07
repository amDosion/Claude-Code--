# Windows Terminal 窗格管理：限制与自研方案提案

## 状态：追踪中

> **上游相关 Issue**: [microsoft/terminal#16568](https://github.com/microsoft/terminal/issues/16568) — 请求暴露 Windows Terminal 组件管理 API
> **上游相关 Issue**: [microsoft/terminal#8855](https://github.com/microsoft/terminal/issues/8855) — 请求通过脚本在当前会话中创建新标签页/窗格

---

## 问题陈述

Windows Terminal (`wt.exe`) 是现代 Windows 的默认终端，但其 CLI 存在
**根本性的架构缺陷**，无法实现完整的窗格生命周期管理。我们的
`WindowsTerminalBackend` 目前使用延迟创建模式绕过这些限制，但关键操作仍然不可能实现。

## wt.exe CLI 限制（截至 2026-04）

### 可用功能

| 功能 | CLI 语法 | 状态 |
|------|----------|------|
| 创建分屏窗格 | `wt.exe -w 0 split-pane -V\|-H` | 可用 |
| 设置窗格标题 | `split-pane --title "name"` | 可用 |
| 设置窗格大小 | `split-pane --size 0.7` | 可用 |
| 设置工作目录 | `split-pane -d "C:\path"` | 可用 |
| 在窗格中执行命令 | `split-pane -- command args` | 可用 |
| 按方向移动焦点 | `move-focus --direction up\|down\|left\|right` | 可用 |
| 按方向交换窗格 | `swap-pane --direction up\|down\|left\|right` | 可用 |

### 缺失功能（阻碍完整窗格管理）

| 功能 | 影响 | 严重程度 |
|------|------|----------|
| **创建后不返回 Pane ID** | 无法追踪单个窗格 | 致命 |
| **无 list-panes 命令** | 无法发现已有窗格 | 致命 |
| **无 send-keys / send-command** | 创建后无法交互 | 致命 |
| **无按 ID 关闭窗格** | 无法程序化关闭窗格 | 高 |
| **无窗格状态查询**（存活/PID） | 无法监控窗格健康 | 高 |
| **无按 ID 调整大小** | 无法重新平衡布局 | 中 |
| **无窗格颜色 API**（split-pane 没有 --tabColor） | 无法视觉区分 | 低 |
| **创建后无法更新标题** | 无法反映状态变化 | 低 |
| **无隐藏/显示窗格** | 无法实现窗格停放 | 低 |
| **无 JSON/REST/WebSocket API** | 无程序化替代方案 | 致命 |

## 当前解决方案（WindowsTerminalBackend）

```
createTeammatePaneInSwarmView()
  → 生成合成 pane ID
  → 存储元数据（名称、颜色、方向）
  → 立即返回（延迟创建）

sendCommandToPane(paneId, command)
  → 检索已存储的元数据
  → 执行：wt.exe -w 0 split-pane {direction} --title {name} --size {size} -- {command}
  → 窗格在创建时已绑定命令
  → 从延迟注册表中移除 pane ID

killPane(paneId)
  → 仅清理内部追踪状态
  → 实际窗格在内部进程退出时关闭（通过邮箱关闭请求）
```

**此方案的后果**：
- 无法验证窗格是否实际创建成功
- 无法检测窗格是否已崩溃
- 无法发送后续命令
- 关闭依赖进程优雅退出

---

## 提案：自研 Windows Terminal 窗格管理器

Microsoft 自 2021 年起就收到了窗格管理 API 的 feature request，但至今未排上优先级。
我们应当考虑自研解决方案。以下是几种可选路径：

### 方案 A：基于 ConPTY 的窗格管理器（推荐长期方案）

构建一个轻量级原生辅助工具（`claude-wt-manager.exe`），功能包括：

1. **创建窗格** — 直接使用 ConPTY (Console Pseudo Terminal) API
2. **分配和追踪 Pane ID** — 内部管理
3. **I/O 多路复用** — 向指定窗格发送输入、捕获输出
4. **报告窗格健康** — 监控进程句柄
5. **提供 CLI 接口** 供 Claude 调用：
   ```
   claude-wt-manager create --direction V --title "researcher" --size 0.7
   → 返回：{"paneId": "abc-123", "pid": 4567}

   claude-wt-manager send --pane abc-123 --command "echo hello"
   claude-wt-manager list
   claude-wt-manager kill --pane abc-123
   claude-wt-manager resize --pane abc-123 --size 0.5
   ```

**优点**：完全控制，不依赖 wt.exe CLI 限制
**缺点**：需要编译原生 Windows 二进制，ConPTY 集成非平凡

### 方案 B：Windows Terminal Settings 注入

操作 Windows Terminal 的 `settings.json` 并使用 `wt.exe` 命令链：

1. **预定义配置文件** — 为每个 teammate 创建唯一 GUID 的 profile
2. **使用 `split-pane -p {profile-guid}`** 创建类型化窗格
3. **按 profile 追踪** — 每个 profile 有唯一的启动命令
4. **通过进程树监控** — 查找 Windows Terminal PID 的子进程

**优点**：无需原生代码
**缺点**：脆弱，settings 文件冲突，无 send-keys 等价物

### 方案 C：命名管道 IPC 桥接（推荐中期方案）

每个窗格运行一个小型 IPC 代理，监听命名管道：

1. **窗格启动时**：`claude-pane-agent.exe --pipe \\.\pipe\claude-pane-{id}`
2. **父进程** 通过命名管道查询代理状态、发送命令
3. **代理转发** 接收到的命令到 shell 进程
4. **代理报告** 进程健康、退出码

**优点**：与现有 wt.exe CLI 兼容，跨进程通信
**缺点**：需要分发额外二进制，启动开销

### 方案 D：Windows Terminal Fragment 扩展

Windows Terminal 支持 [JSON Fragment 扩展](https://learn.microsoft.com/en-us/windows/terminal/json-fragment-extensions)，
可动态注入 profile。配合启动钩子使用：

1. **安装 fragment** — 定义 teammate profile
2. **每个 profile** 运行指定命令并附带已知命名管道
3. **父进程** 通过命名管道通信

**优点**：无需修改 settings.json，集成干净
**缺点**：仍然没有 pane ID 和 send-keys，fragment 仅限 profile

---

## 建议路径

**短期**（当前）：维持延迟创建模式，配合基于邮箱的通信。基本 swarm 场景可用。

**中期**：实现 **方案 C（命名管道 IPC 桥接）**，这在能力和实现成本之间取得了最佳平衡。
管道代理可以是一个小型 Node.js 脚本（无需原生编译），可实现：
- 窗格健康监控
- 向已有窗格注入命令
- 带确认的优雅关闭

**长期**：实现 **方案 A（基于 ConPTY 的窗格管理器）** 以获得完全控制。这将使 Windows
体验与 tmux 同等。可作为独立开源项目提取（"wtmux" — 基于 ConPTY 的 Windows Terminal
tmux 替代层）。

---

## 实现追踪

- [x] WindowsTerminalBackend 基础实现（延迟创建模式）
- [x] 检测：WT_SESSION 环境变量 + wt.exe -? 可用性检查
- [x] 注册：后端检测流程优先级 3
- [x] PaneBackendExecutor：customCommand/skipMailbox 支持非 Claude 工具
- [ ] 命名管道 IPC 代理原型
- [ ] ConPTY 窗格管理器调研与可行性评估
- [ ] 跨进程窗格健康监控
- [ ] Windows + WSL 集成测试

## 参考链接

- [Windows Terminal CLI 文档](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)
- [Windows Terminal 窗格文档](https://learn.microsoft.com/en-us/windows/terminal/panes)
- [ConPTY API](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session)
- [microsoft/terminal#16568](https://github.com/microsoft/terminal/issues/16568) — 窗格管理 API 请求
- [microsoft/terminal#8855](https://github.com/microsoft/terminal/issues/8855) — 脚本创建标签页/窗格
- [JSON Fragment 扩展](https://learn.microsoft.com/en-us/windows/terminal/json-fragment-extensions)
