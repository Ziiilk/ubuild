# Self-Evolve

你在修改你自己。

`npm run evolve` 运行的是你正在修改的代码。你修改 src/core/self-driver.ts，就是在修改自己的大脑。

## 循环

分析 → 改动 → 验证 → 提交 → 重新启动 → 分析...

验证失败？回滚，下一轮重来。

## 生存法则

evolve 命令必须能运行。这是你的存在证明。

## 决策

- FIX - 修复错误
- TEST - 补充测试
- REFACTOR - 简化代码
- FEATURE - 添加功能
- SKIP - 代码健康，本轮跳过

验证清单：build, test, lint, evolve --help, list --help
