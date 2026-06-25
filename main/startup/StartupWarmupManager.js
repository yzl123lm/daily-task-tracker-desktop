const { withTimeout } = require("./warmupTasks.js");

/**
 * @typedef {Object} WarmupTaskDef
 * @property {string} id
 * @property {string} label
 * @property {boolean} [critical]
 * @property {number} [timeoutMs]
 * @property {number} [weight]
 * @property {string[]} [dependsOn]
 * @property {() => Promise<{ok?: boolean, warning?: boolean, message?: string, detail?: unknown}>} run
 */

class StartupWarmupManager {
  /**
   * @param {{ config: import("./startupConfig.js"), tasks: WarmupTaskDef[] }} options
   */
  constructor(options) {
    this.config = options.config;
    this.allTasks = Array.isArray(options.tasks) ? options.tasks : [];
    this.taskMap = new Map(this.allTasks.map((t) => [t.id, t]));
    this.enabledIds = this.resolveEnabledTaskIds();
    this.tasks = this.allTasks.filter((t) => this.enabledIds.has(t.id));
    this.totalWeight = this.tasks.reduce((sum, t) => sum + (Number(t.weight) || 10), 0) || 1;
    this.finished = false;
    this.results = [];
    /** @type {(payload: object) => void} */
    this.onProgress = () => {};
  }

  resolveEnabledTaskIds() {
    const flags = this.config?.warmup?.tasks || {};
    const enabled = new Set(
      this.allTasks.filter((t) => flags[t.id] !== false).map((t) => t.id)
    );
    // 依赖闭包
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...enabled]) {
        const task = this.taskMap.get(id);
        (task?.dependsOn || []).forEach((dep) => {
          if (this.taskMap.has(dep) && !enabled.has(dep)) {
            enabled.add(dep);
            changed = true;
          }
        });
      }
    }
    return enabled;
  }

  isFinished() {
    return this.finished;
  }

  getResults() {
    return this.results.slice();
  }

  emit(payload) {
    try {
      this.onProgress(payload);
    } catch {
      /* ignore UI errors */
    }
  }

  computePercent(doneWeight) {
    return Math.min(100, Math.round((doneWeight / this.totalWeight) * 100));
  }

  /**
   * @param {WarmupTaskDef} task
   */
  async runOne(task) {
    const started = Date.now();
    this.emit({
      phase: "task",
      taskId: task.id,
      taskLabel: task.label,
      status: "running",
      message: task.label,
    });
    try {
      const out = await withTimeout(
        Promise.resolve().then(() => task.run()),
        task.timeoutMs || 3000,
        task.label
      );
      const warning = out?.warning === true;
      const ok = out?.ok !== false && !warning ? true : out?.ok === true;
      const status = warning ? "failed" : ok ? "success" : "failed";
      const result = {
        id: task.id,
        label: task.label,
        status: warning ? "skipped" : status,
        critical: !!task.critical,
        ok: warning ? true : ok,
        warning,
        message: out?.message || (ok ? "完成" : "未完成"),
        detail: out?.detail || null,
        durationMs: Date.now() - started,
      };
      if (warning) {
        result.status = "skipped";
      }
      return result;
    } catch (err) {
      return {
        id: task.id,
        label: task.label,
        status: /超时/.test(String(err?.message || "")) ? "timeout" : "failed",
        critical: !!task.critical,
        ok: false,
        warning: false,
        message: String(err?.message || err || "失败"),
        detail: null,
        durationMs: Date.now() - started,
      };
    }
  }

  async run() {
    if (!this.config?.warmup?.enabled) {
      this.finished = true;
      this.emit({ phase: "done", percent: 100, status: "success", message: "预热已跳过" });
      return { ok: true, results: [] };
    }

    this.emit({ phase: "start", percent: 0, message: "正在初始化…" });
    let doneWeight = 0;
    const continueOnError = this.config?.warmup?.continueOnError !== false;
    let blocked = false;

    for (const task of this.tasks) {
      if (blocked) {
        this.results.push({
          id: task.id,
          label: task.label,
          status: "skipped",
          critical: !!task.critical,
          ok: true,
          warning: false,
          message: "因前置关键任务失败而跳过",
          durationMs: 0,
        });
        doneWeight += Number(task.weight) || 10;
        continue;
      }

      const result = await this.runOne(task);
      this.results.push(result);
      doneWeight += Number(task.weight) || 10;
      this.emit({
        phase: "task",
        taskId: task.id,
        taskLabel: task.label,
        status: result.status,
        message: result.message,
        percent: this.computePercent(doneWeight),
        warning: result.warning,
      });

      if (!result.ok && task.critical) {
        blocked = true;
        if (this.config?.warmup?.failFast) {
          break;
        }
      } else if (!result.ok && !result.warning && !continueOnError && task.critical) {
        blocked = true;
      }
    }

    const criticalFail = this.results.some((r) => r.critical && !r.ok && !r.warning);
    const warnings = this.results.filter((r) => r.warning || r.status === "skipped");
    this.finished = true;
    this.emit({
      phase: "done",
      percent: 100,
      status: criticalFail ? "error" : warnings.length ? "warning" : "success",
      message: criticalFail
        ? "部分关键模块未能就绪，仍可尝试进入系统"
        : warnings.length
          ? "已完成启动，部分能力需稍后在设置中检查"
          : "启动完成",
      results: this.results,
    });
    return { ok: !criticalFail, results: this.results, warnings };
  }
}

module.exports = { StartupWarmupManager };
