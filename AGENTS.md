# AGENTS.md

本文件为在此仓库中工作的编码代理提供指导。

## 仓库结构

- Rust 2021 edition 的单一二进制 CLI 项目
- 清单文件：`Cargo.toml`
- 源码目录：`src/`
- 构建输出：`target/`
- 程序入口：`src/main.rs`
- CLI 定义：`src/cli.rs`

分层结构：

- `src/cli.rs` — clap 派生定义（Parser、Subcommand、Args）
- `src/commands/` — 精简的命令处理器，负责验证、调用 core 并格式化输出
- `src/core/` — 实现逻辑（解析器、执行器、检测器、生成器等）
- `src/types.rs` — 共享结构体、枚举和常量
- `src/error.rs` — 基于 thiserror 的 `UbuildError` 枚举
- `src/utils/` — 共享工具（Logger、unreal_paths、version）
- `src/platform.rs` — 平台检测和路径标准化

不要将业务逻辑移入 `src/cli.rs` 或 `src/commands/`。

## 标准命令

### 构建

```bash
cargo build
```

### 发布构建（优化）

```bash
cargo build --release
```

- Windows 下生成 `target/release/ubuild.exe`
- 发布配置：`strip=true`、`lto=true`、`codegen-units=1`

### 快速编译检查

```bash
cargo check
```

### Lint

```bash
cargo clippy -- -D warnings
```

### 格式化

```bash
cargo fmt
```

### 格式检查

```bash
cargo fmt -- --check
```

### 运行

```bash
cargo run -- <subcommand> [args]
```

## Rust / Clippy 要求

`Cargo.toml` 中的 lint 配置：

- `unsafe_code = "forbid"`
- `clippy::pedantic = "warn"`（基础级别）
- `clippy::unwrap_used = "deny"`
- `clippy::expect_used = "warn"`
- 允许的部分 pedantic lint：`module_name_repetitions`、`missing_errors_doc`、`missing_panics_doc`、`must_use_candidate`、`struct_excessive_bools`、`too_many_lines`、`doc_markdown`、`too_many_arguments`、`fn_params_excessive_bools`、`needless_pass_by_value`、`similar_names`

代理规则：

- 禁止使用 `unsafe`。
- 禁止使用 `.unwrap()`，改用 `?`、`anyhow::bail!` 或 `.ok()` 模式。
- 仅在确实不可能失败的情况下使用 `.expect()`，这种情况应非常少见。
- 命令边界优先返回 `anyhow::Result`，core 层使用基于 `thiserror` 的错误枚举。
- 类型应保持明确。避免 `as` 转换，优先使用 `.into()` 或 `From` 实现。

## 格式与风格

- 使用 `cargo fmt`（rustfmt 默认配置）
- 缩进为 4 个空格
- 禁止行尾空格
- 遵循周围代码的现有风格

## 架构约定

### CLI（`src/cli.rs`）

- 单一 `Cli` 结构体，使用 `#[derive(Parser)]`
- `Command` 枚举，使用 `#[derive(Subcommand)]`
- 每个命令使用独立的 `*Args` 结构体和 `#[derive(Args)]`
- 此处只放 clap 注解，不放逻辑

### Commands（`src/commands/`）

每个命令文件：

- 接收对应的 `*Args` 结构体
- 按需验证输入
- 调用对应的 core 模块
- 通过 `Logger` 格式化输出
- 返回 `anyhow::Result<()>`

### Core（`src/core/`）

所有操作逻辑均位于此处：

- `BuildExecutor` — 通过子进程运行 UBT
- `ProjectBuilder` — 编排构建、目标列表和 dry-run
- `EngineResolver` — 从注册表、Launcher 清单和环境变量查找引擎安装
- `ProjectDetector` — 发现 `.uproject`、`.Target.cs` 和 `.Build.cs`
- `ProjectPathResolver` — 根据用户输入解析项目路径
- `TargetResolver` — 从 Source 目录解析构建目标
- `ProjectGenerator` — 生成 IDE 项目文件
- `ProjectInitializer` — 初始化新的 UE 项目
- `ProjectRunner` — 运行已构建的可执行文件
- `CleanExecutor` — 删除构建产物
- `SwitchExecutor` — 切换引擎关联
- `CompileCommandsGenerator` — 生成 `compile_commands.json`

新增行为应放入最相关的现有 core 模块。

### Types（`src/types.rs`）

所有共享结构体、枚举和常量均放在此处。主要类型：

- `BuildResult`、`CleanResult`、`SwitchResult`、`InitResult`、`GenerateResult`
- `EngineVersionInfo`、`EngineInstallation`、`EngineSource`、`EngineAssociation`
- `UProject`、`ProjectInfo`、`ProjectDetectionResult`、`EngineDetectionResult`
- `ResolvedTarget`、`ModuleInfo`
- 常量：`BUILD_TARGETS`、`BUILD_CONFIGS`、`BUILD_PLATFORMS`、`PROJECT_TYPES`、`IDE_TYPES`

### Error（`src/error.rs`）

`UbuildError` 是基于 `thiserror::Error` 的错误枚举，包含引擎、项目、构建和 IDE 相关错误。

### Utils（`src/utils/`）

- `Logger` — 结构化 CLI 输出（info、success、warning、error、title、subtitle、json、debug）
- `unreal_paths` — 解析 UBT、Build.bat 和引擎版本路径
- `version` — 版本比较、格式化和目标类型推断

### Platform（`src/platform.rs`）

- `is_windows()`、`exe_extension()`、`bat_extension()`、`normalize_path()`

## 命名约定

- 结构体和枚举：`PascalCase`
- 函数和方法：`snake_case`
- 文件：`snake_case.rs`
- 常量：`UPPER_SNAKE_CASE`

示例：`EngineResolver`、`resolve_engine`、`engine_resolver.rs`、`BUILD_TARGETS`

## 错误处理

- Core 模块返回 `anyhow::Result<T>` 或领域专用的 `Result<T, UbuildError>`
- Commands 使用 `?` 传播错误，通过 `.context("...")` 补充上下文
- `main.rs` 捕获顶层错误，通过 `Logger::error` 记录并以非零状态退出
- 禁止静默吞掉错误
- 禁止保留空的 match 分支或 catch 块
- 对应 `error instanceof Error ? error.message : String(error)` 的 Rust 模式：

  ```rust
  anyhow::bail!("Failed to ...: {e}");
  ```

## 日志与输出

所有 CLI 输出均使用基于 `console` crate 的 `Logger`：

- `Logger::info(msg)`、`Logger::success(msg)`、`Logger::warning(msg)`、`Logger::error(msg)`
- `Logger::title(msg)`、`Logger::subtitle(msg)`、`Logger::divider()`
- `Logger::write(msg)`、`Logger::writeln(msg)`
- `Logger::json(value)` — 使用 `serde_json` 序列化
- `Logger::debug(msg)` — 仅在设置 `UBUILD_DEBUG` 环境变量时输出

命令中的用户可见输出不要直接使用 `println!`。

## 依赖

保持依赖精简。主要依赖：

- `clap 4`（derive）— CLI 参数解析
- `serde` + `serde_json` — JSON 序列化
- `anyhow` — 顶层错误处理
- `thiserror` — 结构化领域错误
- `console` — 终端样式
- `dialoguer` — 交互式提示
- `glob` — 文件模式匹配
- `tempfile` — 安全的临时文件与原子替换
- `winreg`（仅 Windows）— 注册表查询

不要在没有充分理由的情况下添加依赖。

## 较大改动前应检查的文件

- `Cargo.toml`
- `src/main.rs`
- `src/cli.rs`
- `src/types.rs`
- `src/error.rs`
- `src/commands/` 中的相关文件
- `src/core/` 中对应的逻辑

## Git 约定

- 提交信息默认使用**中文**；用户明确指定其他语言时，遵循用户要求
- 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

  ```text
  <type>: <简短描述>

  <可选正文>
  ```

- 允许的类型：`feat`、`fix`、`refactor`、`docs`、`chore`、`test`、`ci`、`perf`、`style`
- 主题使用祈使语气，不加句号，尽量不超过 50 个字符
- 正文每行不超过 72 个字符，说明改了什么以及为什么，不描述具体实现步骤
- 每次提交只包含一个逻辑变更，不要混入无关内容
- 未经明确批准，不要 amend 或 force-push 已发布的提交

## 应做与禁止事项

应做：

- 使用 `cargo check`、`cargo clippy` 和 `cargo build` 作为标准命令
- 将 CLI 定义放在 `src/cli.rs`、命令放在 `src/commands/`、逻辑放在 `src/core/`
- 使用 `Logger` 输出结构化 CLI 信息
- 将共享类型放在 `src/types.rs`
- Commands 返回 `anyhow::Result`
- 使用 `?` 传播错误
- 当数据跨模块传递时新增共享类型

禁止：

- 使用 `unsafe`
- 使用 `.unwrap()`
- 将业务逻辑移入 `src/cli.rs`
- 添加不必要的依赖
- 在命令中使用原始 `println!` 输出用户可见内容
- 无必要地弱化类型或添加 `#[allow(...)]`
