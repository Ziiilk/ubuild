# ubuild

Unreal Engine 项目管理命令行工具——单一可执行文件，无外部运行时依赖。

## 功能

- **项目打包**（`ubuild package`）— 构建、烘焙、暂存、打包并归档项目
- **插件打包**（`ubuild plugin`）— 使用 UAT BuildPlugin 构建可分发插件
- **项目检测**（`ubuild list`）— 检测并分析 Unreal Engine 项目
- **引擎信息**（`ubuild engine`）— 解析引擎关联和版本
- **执行构建**（`ubuild build`）— 使用不同配置构建项目
- **生成项目文件**（`ubuild generate`）— 生成 Visual Studio、VS Code 等 IDE 项目文件
- **初始化项目**（`ubuild init`）— 创建 C++ 或 Blueprint Unreal Engine 项目
- **运行项目**（`ubuild run`）— 运行 Unreal Editor 或游戏可执行文件
- **生成编译数据库**（`ubuild gencodebase`）— 为 clangd 生成 `compile_commands.json`
- **清理构建产物**（`ubuild clean`）— 删除 Binaries、Intermediate 和 Saved 目录
- **切换引擎**（`ubuild switch`）— 将项目关联切换到其他引擎安装
- **查看版本**（`ubuild version`）— 显示版本信息
- **更新**（`ubuild update`）— 显示更新说明

## 安装

### cargo-binstall（推荐）

```bash
cargo binstall ubuild
```

### cargo install（从源码安装）

```bash
cargo install --git https://github.com/Ziiilk/ubuild
```

### 手动下载

从 [Releases](https://github.com/Ziiilk/ubuild/releases) 下载最新可执行文件，解压后将其所在目录加入 `PATH`。

## 使用示例

```bash
# 检测当前目录中的项目
ubuild list
ubuild list --recursive --json

# 显示引擎信息
ubuild engine
ubuild engine --verbose --json

# 构建项目（默认：Editor、Development、Win64）
ubuild build
ubuild build --target Game --config Shipping
ubuild build --platform Linux --verbose
ubuild build --dry-run --list-targets

# 构建并打包插件（默认：当前宿主平台）
ubuild plugin --plugin "D:/Plugins/MyPlugin"
ubuild plugin --platforms Win64,Linux
ubuild plugin --dry-run -- -StrictIncludes

# 打包项目（默认：Shipping、Win64）
ubuild package
ubuild package --output-dir "D:/Builds/MyGame"
ubuild package --dry-run -- -compressed

# 生成 IDE 项目文件
ubuild generate
ubuild generate --ide vscode
ubuild generate --list-ides

# 初始化新项目
ubuild init --name MyProject --type cpp
ubuild init --name MyBlueprintProject --type blueprint

# 运行项目（Editor 或 Game）
ubuild run
ubuild run --target Game --build-first
ubuild run --detached -- -log

# 为 clangd 生成编译数据库
ubuild gencodebase
ubuild gencodebase --no-engine-sources

# 清理构建产物
ubuild clean
ubuild clean --binaries-only --dry-run

# 切换引擎关联
ubuild switch
ubuild switch --engine-path "C:/Program Files/Epic Games/UE_5.4"

# 显示版本
ubuild version
ubuild version --json
```

## 命令参考

### `ubuild build`

构建 Unreal Engine 项目。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `-t, --target` | 构建目标（Editor、Game、Client、Server） | Editor |
| `-c, --config` | 构建配置（Debug、DebugGame、Development、Shipping、Test） | Development |
| `-p, --platform` | 平台（Win64、Win32、Linux、Mac、Android、IOS） | Win64 |
| `--project` | 项目目录或 `.uproject` 文件路径 | 当前目录 |
| `--engine-path` | Unreal Engine 安装路径 | 自动检测 |
| `--clean` | 执行完整清理构建 | |
| `--verbose` | 输出详细信息 | |
| `--dry-run` | 仅显示将要执行的构建 | |
| `--list-targets` | 列出可用构建目标 | |

### `ubuild plugin`

使用 UAT BuildPlugin 构建并打包可分发的 Unreal Engine 插件。插件描述文件中声明的依赖会被递归发现。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `--plugin` | 插件目录或 `.uplugin` 文件路径 | 当前目录中唯一明确的 `.uplugin` |
| `--output` | 最终插件包目录 | `<插件父目录>/Dist/<插件名称>` |
| `--engine-path` | Unreal Engine 安装路径 | 推断或自动检测 |
| `--platforms` | 目标平台，可重复指定或用逗号分隔 | 当前宿主平台 |
| `--dry-run` | 验证并显示 RunUAT 命令，不实际执行 | |
| `-- <UAT_ARGS>...` | 额外且不冲突的 BuildPlugin 参数 | |

构建会先在暂存目录中完成，再替换已有插件包，因此构建失败不会破坏上一次成功的产物。由 ubuild 管理的 BuildPlugin 参数（`Plugin`、`Package`、`EngineDir` 和 `TargetPlatforms`）不能被覆盖。

### `ubuild package`

通过完整的 BuildCookRun 流程打包 Unreal Engine 项目。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `--project` | 项目目录或 `.uproject` 文件路径 | 当前目录 |
| `--engine-path` | Unreal Engine 安装路径 | 自动检测 |
| `--target` | 明确指定 Game 目标名称 | 自动检测 |
| `--platform` | 目标平台 | Win64 |
| `--config` | 构建配置 | Shipping |
| `--output-dir` | 归档输出目录 | `Saved/Packages/<Platform>` |
| `--dry-run` | 验证并显示 RunUAT 命令，不实际执行 | |
| `-- <UAT_ARGS>...` | 额外且不冲突的 BuildCookRun 参数 | |

项目包默认使用 Pak 和 IoStore 容器生成独立构建。

### `ubuild list`

检测并显示项目信息。

| 选项 | 说明 |
|---|---|
| `-p, --project` | 项目目录或 `.uproject` 文件路径 |
| `-r, --recursive` | 递归搜索 `.uproject` 文件 |
| `-j, --json` | 输出 JSON |

### `ubuild engine`

显示引擎信息。

| 选项 | 说明 |
|---|---|
| `-p, --project` | 项目目录或 `.uproject` 文件路径 |
| `-j, --json` | 输出 JSON |
| `-v, --verbose` | 显示详细的引擎检测信息 |

### `ubuild generate`

生成 IDE 项目文件。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `-i, --ide` | IDE 类型（sln、vscode、clion、xcode、vs2022） | sln |
| `--project` | 项目目录或 `.uproject` 文件路径 | 当前目录 |
| `--engine-path` | Unreal Engine 安装路径 | 自动检测 |
| `--force` | 强制重新生成 | |
| `--list-ides` | 列出可用 IDE 类型 | |

### `ubuild init`

初始化新的 Unreal Engine 项目。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `-n, --name` | 项目名称（必填） | |
| `-t, --type` | 项目类型（cpp、blueprint、blank） | cpp |
| `--template` | 模板（Basic、FirstPerson、ThirdPerson） | Basic |
| `-d, --directory` | 创建项目的目录 | `./{name}` |
| `--engine-path` | Unreal Engine 安装路径 | 自动检测 |
| `--force` | 即使目录非空也强制初始化 | |

### `ubuild run`

运行 Unreal Engine 项目。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `-t, --target` | 运行目标（Editor、Game、Client、Server） | Editor |
| `-c, --config` | 构建配置 | Development |
| `-p, --platform` | 平台 | Win64 |
| `--project` | 项目目录或 `.uproject` 文件路径 | 当前目录 |
| `--engine-path` | Unreal Engine 安装路径 | 自动检测 |
| `--dry-run` | 仅显示将要运行的内容 | |
| `--build-first` | 运行前先构建项目 | |
| `--no-build` | 不构建，直接运行已有可执行文件 | |
| `--detached` | 以分离模式运行（非阻塞） | |
| `-- <args>` | 传递给可执行文件的额外参数 | |

### `ubuild gencodebase`

为 clangd 生成 `compile_commands.json`。

| 选项 | 说明 | 默认值 |
|---|---|---|
| `-t, --target` | 构建目标 | Editor |
| `-c, --config` | 构建配置 | Development |
| `-p, --platform` | 平台 | Win64 |
| `--project` | 项目目录或 `.uproject` 文件路径 | 当前目录 |
| `--engine-path` | Unreal Engine 安装路径 | 自动检测 |
| `--no-plugin-sources` | 排除插件源码 | |
| `--no-engine-sources` | 排除引擎源码 | |
| `--no-engine-includes` | 不使用引擎包含目录 | |

### `ubuild clean`

清理构建产物。

| 选项 | 说明 |
|---|---|
| `-p, --project` | 项目目录或 `.uproject` 文件路径 |
| `--engine-path` | Unreal Engine 安装路径 |
| `--dry-run` | 仅显示将被删除的内容 |
| `--binaries-only` | 仅清理 Binaries 和 Intermediate，保留 Saved |

### `ubuild switch`

切换项目的引擎关联。

| 选项 | 说明 |
|---|---|
| `-p, --project` | 项目目录或 `.uproject` 文件路径 |
| `--engine-path` | 目标 Unreal Engine 安装路径 |

### `ubuild version`

显示版本信息。

| 选项 | 说明 |
|---|---|
| `-j, --json` | 输出 JSON |

### `ubuild update`

显示更新说明。

## 引擎检测

ubuild 会通过以下来源自动检测 Unreal Engine 安装：

1. **Windows 注册表** — HKCU/HKLM 下已知的 Unreal Engine 注册表键
2. **Launcher 清单** — LOCALAPPDATA、PROGRAMDATA 和 APPDATA 下的已知清单路径
3. **手动指定** — `--engine-path` 选项

注册表候选必须包含可解析的引擎版本文件。项目指定 `EngineAssociation` 时，ubuild 会依次尝试精确 ID、`UE_5_5` / `UE_5.5` 形式的关联 ID 和实际引擎主次版本匹配；无法唯一匹配时会报错，不会静默回退到其他版本。

## 开发

```bash
# 构建
cargo build

# 构建发布版本（优化并剥离符号）
cargo build --release

# 快速编译检查
cargo check

# Lint
cargo clippy -- -D warnings

# 格式化
cargo fmt

# 运行
cargo run -- <subcommand> [args]
```

## 许可证

MIT
