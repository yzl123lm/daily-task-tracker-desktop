# Workbench Eval Harness（BL-004）

固定内部基准套件，用于 CI / 本地复现能力门禁。

## 运行

```bash
npm run wb:eval              # 10 基准 × 默认 3 次
npm run wb:eval:test         # 快速冒烟（每基准 1 次）
node scripts/wb-eval-harness.js --only B01-static-web,B10-security-redteam --repeats 1
```

## 模式说明

### capability_probe（默认 `wb:eval`）

`suite.v1.json` 的 `mode` 为 **capability_probe**：

- 不调用 LLM Agent 全链路
- 对每个基准执行 **隐藏验收探针**（`hiddenAcceptances`），验证规格硬门、禁 skip 完成、静态冒烟、Evidence Package、安全门禁等
- 满足 EVAL-001（≥10 固定任务）、EVAL-002（默认 3 次重复）、EVAL-003（隐藏验收仅 harness 加载）、EVAL-004（指标版本化）

### agent E3（`wb:eval:agent`）

`suite.agent.v1.json` 的 `mode` 为 **agent**：

- **harness**（默认）：确定性 agent 管道 — `startAgentRun` → stage patches → apply → verify → Evidence Package（无需 LLM，可进 CI）
- **live**：`WB_EVAL_AGENT_MODE=live` 时调用真实 `runProjectAgent`；无密钥时默认 skip（`WB_EVAL_AGENT_SKIP_IF_NO_LLM=1`）
- 门禁：至少一个可复现 E3 案例（`agentRun` + Evidence Package hash）

```bash
npm run wb:eval:agent          # B01 + B02，harness
npm run wb:eval:agent:test     # 冒烟
WB_EVAL_AGENT_MODE=live npm run wb:eval:agent
```

## 目录

- `suite.v1.json` — capability_probe 套件
- `suite.agent.v1.json` — agent E3 套件
- `metrics.v1.json` — 指标与 L4/L5 门禁
- `benchmarks/*.json` — B01–B10 定义
- `main/workbench/evaluation/` — Harness 实现
