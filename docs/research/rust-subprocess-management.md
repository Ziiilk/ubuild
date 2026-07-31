# ubuild 的项目竞争与子进程管理

研究日期：2026-07-31

## 结论

最终设计由两个正交的深模块组成：

- `ProjectOperation` 管理同一 Project Workspace 在整台机器上的唯一占用和强制接管。
- `ProcessRunner` 管理外部命令的 stdio、等待、输出收集和子进程树生命周期。

两者不能合并。项目竞争是 ubuild 工作流语义；子进程管理是操作系统执行语义。把它们
放进一个 mode 或 runner 会迫使只读命令、dry-run 和非项目命令理解不属于自己的状态。

## ProjectOperation

Project Identity 由规范化后的 `.uproject` 绝对路径确定。Project Workspace 是
`.uproject` 所在的规范目录，也是 `Binaries`、`Intermediate` 和 `Saved` 的共享
可变资源范围。Workspace 路径的 SHA-256 摘要用作稳定的 Workspace Key，协调状态
位于 `Saved/ubuild/<Workspace Key>`：

- `takeover.lock` 串行化同时到达的接管者；
- `operation.lock` 表示当前 Project Operation 的所有权；
- `owner.json` 仅记录 Project Identity、Project Workspace、PID 和操作种类；
- `replacement.request` 是需要状态目录写权限的接管请求。

新的 Project Operation 发现所有权锁已被占用后：

1. 读取同一 Workspace Key 下的 owner 记录用于诊断；
2. 向 `replacement.request` 原子写入新的 128 位随机请求；
3. 实际持有 workspace lease 的旧 ubuild 检测到请求变化后立即退出；
4. 最多等待 5 秒确认旧进程退出和所有权锁释放；
5. 取得锁并执行完整工作流。

只有成功取得 workspace lease 的 ubuild 才会监听接管请求。`owner.json` 不参与终止
目标选择；篡改记录不能把其他 workspace 的 ubuild 重定向为终止目标。接管方必须有
状态目录写权限，写入失败或 5 秒内旧实例未退出时，新操作失败，绝不并行执行。
同一目录中的不同 `.uproject` 因共享产物而使用同一 workspace lease。

旧实例检测到接管请求后调用 `process::exit(72)`；操作系统关闭其文件和 Job Object 句柄，
因此 lease 自动释放，受管子进程树也被清理。文件锁由 Rust 标准库提供：

- [Rust `File::lock`](https://doc.rust-lang.org/std/fs/struct.File.html#method.lock)
- [Rust `File::try_lock`](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock)

这些 API 从 Rust 1.89 起稳定，因此 manifest 明确声明 `rust-version = "1.89"`。

## 哪些命令参与竞争

Project Operation：

- `build`
- `package`
- `generate`
- `gencodebase`
- `clean`
- `switch`
- `run`

Project Observation：

- `engine`
- `version`
- 所有 `--dry-run`
- `generate --list-ides`

`update`、`livecoding`、`installed`、`plugin` 和 `init` 不属于项目级竞争。
`run --build-first` 在命令边界只取得一次所有权，内部 build 不再次竞争。

## ProcessRunner

ProcessRunner 公开三个实际存在的执行契约：

```rust
ProcessRunner::stream(&mut command)
ProcessRunner::capture(&mut command)
ProcessRunner::inherit(&mut command)
```

- `stream` 同时排空 stdout/stderr，实时转发并保留全文；
- `capture` 等待并收集 stdout/stderr；
- `inherit` 继承终端并等待退出。

没有 `Mode` 大枚举，也没有 detached。UBT/UAT 参数、log-lock 重试、staging 清理、
生成文件搬移和 exit code 的业务解释仍留在各 workflow module。

Rust 标准库已经负责进程创建、参数传递、stdio 和等待；内部模块只组合 ubuild
需要的三个合法契约：

- [Rust `Command`](https://doc.rust-lang.org/std/process/struct.Command.html)
- [Rust `Stdio`](https://doc.rust-lang.org/std/process/struct.Stdio.html)
- [Rust `Child`](https://doc.rust-lang.org/std/process/struct.Child.html)

因此没有引入 `duct`、`subprocess`、`command-group`、`process-wrap` 或 `sysinfo`。

## Windows 子进程树保证

当前 `win32job` 继续配置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`。旧 ubuild 被正常关闭或
强制终止时，Windows 都会关闭它独占的 Job Object handle，随后终止 Job 中的全部
进程：

- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information)

为消除“直接子进程先启动、后加入 Job”的竞态，Windows ProcessRunner 使用隐藏的
ubuild trampoline：

1. 父 ubuild 创建尚未放行的临时 gate 文件；
2. 启动 trampoline；
3. 把 trampoline 加入 Job Object；
4. 向 gate 写入 `ready`；
5. trampoline 才启动真实目标。

真实目标由已经位于 Job 中的 trampoline 创建，因此默认继承 Job 归属。此设计只使用
安全 Rust，没有在 ubuild 中加入 `unsafe`。

非 Windows 平台仍能执行和等待外部命令，但本次不宣称与 Windows 等价的强制接管和
完整进程树保证。

## 验证

自动测试覆盖：

- 规范路径映射到同一 Project Identity；
- 同一目录中的不同 `.uproject` 映射到同一 Project Workspace；
- Project Operation 在整个 closure 期间持有所有权；
- 新实例真实终止旧测试进程并观察退出码 `72`；
- 伪造 owner 不能把接管重定向到其他项目；
- managed trampoline 透传目标退出码；
- command program、args、cwd 和环境修改被保留；
- Job Object guard 关闭时终止直接测试子进程；
- full clean 保留 `Saved/ubuild`，同时删除其余 `Saved` 内容。
