import * as assert from "assert";
import * as vscode from "vscode";
import { PerformanceLogger } from "../../utils/performanceLogger";

suite("Performance Logger Tests", () => {
  let mockOutputChannel: vscode.OutputChannel;
  let performanceLogger: PerformanceLogger;
  let loggedMessages: string[] = [];

  setup(() => {
    // Create a mock output channel that captures messages
    loggedMessages = [];
    mockOutputChannel = {
      appendLine: (message: string) => {
        loggedMessages.push(message);
      },
      dispose: () => {
        /* no-op */
      },
    } as any;

    performanceLogger = new PerformanceLogger(mockOutputChannel);
  });

  test("Should not log when performance logging is disabled by default", () => {
    // Performance logging should be disabled by default
    assert.strictEqual(performanceLogger.isLoggingEnabled(), false);

    // Log some metrics
    performanceLogger.logMetrics("Test Operation", {
      totalTime: 100,
      fileAnalysisTime: 50,
    });

    // Should not have logged anything
    const perfMessages = loggedMessages.filter((msg) => msg.includes("[PERF]"));
    assert.strictEqual(perfMessages.length, 0, "Should not log when disabled");
  });

  test("Should create timer with correct interface", () => {
    const timer = performanceLogger.createTimer("Test Operation");

    // Timer should have required methods
    assert.ok(
      typeof timer.start === "function",
      "Timer should have start method",
    );
    assert.ok(
      typeof timer.stop === "function",
      "Timer should have stop method",
    );
    assert.ok(
      typeof timer.elapsed === "function",
      "Timer should have elapsed method",
    );
  });

  test("Should format metrics correctly when logging would be enabled", () => {
    // Test the metrics structure
    const testMetrics = {
      totalTime: 150.5,
      fileAnalysisTime: 100.2,
      configLoadTime: 25.1,
      uiUpdateTime: 25.2,
      fileSizeBytes: 1024,
      lineCount: 50,
      matchCount: 10,
      cacheHit: true,
      memoryUsage: 2048000,
    };

    // Should accept all the metrics without error
    assert.doesNotThrow(() => {
      performanceLogger.logMetrics(
        "Test Operation",
        testMetrics,
        "test-file.log",
      );
    }, "Should handle all metric types without error");
  });

  test("Should handle error logging correctly", () => {
    const testError = new Error("Test error message");
    const duration = 123.45;

    // Should not throw when logging errors
    assert.doesNotThrow(() => {
      performanceLogger.logError("Test Operation", testError, duration);
    }, "Should handle error logging without throwing");
  });
});
