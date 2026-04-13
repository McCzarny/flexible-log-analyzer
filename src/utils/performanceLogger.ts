import * as vscode from "vscode";
import { performance } from "perf_hooks";

export interface PerformanceMetrics {
  configLoadTime?: number;
  patternCompileTime?: number;
  fileAnalysisTime?: number;
  uiUpdateTime?: number;
  totalTime?: number;
  fileSizeBytes?: number;
  matchCount?: number;
  lineCount?: number;
  cacheHit?: boolean;
}

export interface PerformanceTimer {
  start(): void;
  stop(): number;
  elapsed(): number;
}

export class PerformanceLogger {
  private outputChannel: vscode.OutputChannel;
  private isEnabled: boolean = false;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.updateSettings();

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(
          "flexible-log-analyzer.enablePerformanceLogging",
        )
      ) {
        this.updateSettings();
      }
    });
  }

  private updateSettings(): void {
    const config = vscode.workspace.getConfiguration("flexible-log-analyzer");
    this.isEnabled = config.get<boolean>("enablePerformanceLogging", false);

    if (this.isEnabled) {
      this.outputChannel.appendLine("[PERF] Performance logging enabled");
    }
  }

  createTimer(operation: string): PerformanceTimer {
    let startTime = 0;
    let endTime = 0;

    return {
      start: () => {
        startTime = performance.now();
        // No start logging to reduce noise
      },
      stop: () => {
        endTime = performance.now();
        const elapsed = endTime - startTime;
        // Only log if enabled and operation took more than 50ms
        if (this.isEnabled && elapsed >= 50) {
          this.outputChannel.appendLine(
            `[PERF] ${operation} - Completed in ${elapsed.toFixed(2)}ms`,
          );
        }
        return elapsed;
      },
      elapsed: () => {
        if (endTime === 0) {
          return performance.now() - startTime;
        }
        return endTime - startTime;
      },
    };
  }

  logMetrics(
    operation: string,
    metrics: PerformanceMetrics,
    context?: string,
  ): void {
    if (!this.isEnabled) {
      return;
    }

    // Only log if total time is significant (>=50ms) or if there are high-value metrics
    const shouldLog =
      (metrics.totalTime && metrics.totalTime >= 50) ||
      (metrics.fileAnalysisTime && metrics.fileAnalysisTime >= 50) ||
      (metrics.uiUpdateTime && metrics.uiUpdateTime >= 50) ||
      (metrics.patternCompileTime && metrics.patternCompileTime >= 50);

    if (!shouldLog) {
      return;
    }

    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context}]` : "";

    this.outputChannel.appendLine(
      `[PERF] === Performance Metrics: ${operation}${contextStr} ===`,
    );
    this.outputChannel.appendLine(`[PERF] Timestamp: ${timestamp}`);

    if (metrics.totalTime !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] Total Time: ${metrics.totalTime.toFixed(2)}ms`,
      );
    }

    if (metrics.configLoadTime !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] Config Load Time: ${metrics.configLoadTime.toFixed(2)}ms`,
      );
    }

    if (metrics.patternCompileTime !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] Pattern Compile Time: ${metrics.patternCompileTime.toFixed(2)}ms`,
      );
    }

    if (metrics.fileAnalysisTime !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] File Analysis Time: ${metrics.fileAnalysisTime.toFixed(2)}ms`,
      );
    }

    if (metrics.uiUpdateTime !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] UI Update Time: ${metrics.uiUpdateTime.toFixed(2)}ms`,
      );
    }

    if (metrics.fileSizeBytes !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] File Size: ${this.formatBytes(metrics.fileSizeBytes)}`,
      );
    }

    if (metrics.lineCount !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] Line Count: ${metrics.lineCount.toLocaleString()}`,
      );
    }

    if (metrics.matchCount !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] Match Count: ${metrics.matchCount.toLocaleString()}`,
      );
    }

    if (metrics.cacheHit !== undefined) {
      this.outputChannel.appendLine(
        `[PERF] Cache Hit: ${metrics.cacheHit ? "YES" : "NO"}`,
      );
    }

    // Calculate throughput metrics if possible
    if (metrics.fileAnalysisTime && metrics.fileSizeBytes) {
      const throughputMBps =
        metrics.fileSizeBytes /
        (1024 * 1024) /
        (metrics.fileAnalysisTime / 1000);
      this.outputChannel.appendLine(
        `[PERF] Analysis Throughput: ${throughputMBps.toFixed(2)} MB/s`,
      );
    }

    if (metrics.fileAnalysisTime && metrics.lineCount) {
      const linesPerSecond =
        metrics.lineCount / (metrics.fileAnalysisTime / 1000);
      this.outputChannel.appendLine(
        `[PERF] Lines Processed: ${linesPerSecond.toFixed(0)} lines/s`,
      );
    }

    this.outputChannel.appendLine(
      `[PERF] ==========================================`,
    );
  }

  // Memory usage logging removed to reduce noise

  logError(operation: string, error: Error, duration?: number): void {
    if (!this.isEnabled) {
      return;
    }

    const durationStr =
      duration !== undefined ? ` (after ${duration.toFixed(2)}ms)` : "";
    this.outputChannel.appendLine(
      `[PERF] ERROR in ${operation}${durationStr}: ${error.message}`,
    );
  }

  isLoggingEnabled(): boolean {
    return this.isEnabled;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return "0 B";
    }

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}
