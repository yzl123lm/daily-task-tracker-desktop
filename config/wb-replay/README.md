# AGT-010 Offline Replay

离线回放同一 Agent 轨迹，对比模型输出与成本（不重跑工具副作用）。

## 捕获

Live Agent（`projectAgentLLM`）默认写入 `output.replayTrace`（可用 `WB_AGENT_REPLAY_CAPTURE=0` 关闭）。
Evidence Package 会带上 `replayTrace` 字段。

## 运行

```bash
npm run wb:replay -- --input config/wb-replay/fixtures/min-trace.v1.json --dry-run
npm run wb:replay -- --input baseline.json --candidate alt.json
npm run wb:replay:test
```

## 定价

`pricing.v1.json` 用于估算 USD 成本（可选）。
