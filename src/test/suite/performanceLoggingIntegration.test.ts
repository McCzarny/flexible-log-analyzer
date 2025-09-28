import * as assert from "assert";
import * as vscode from "vscode";
import { PatternMatcher } from "../../analysis/patternMatcher";
import { LogConfig } from "../../types/configTypes";

suite("Performance Logging Integration Tests", () => {
  let mockOutputChannel: vscode.OutputChannel;
  let patternMatcher: PatternMatcher;
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

    patternMatcher = new PatternMatcher(mockOutputChannel);
  });

  test("Should create performance logger in PatternMatcher", () => {
    // PatternMatcher should be created successfully with performance logging
    assert.ok(patternMatcher, "PatternMatcher should be created");

    // Should have performance metrics method
    assert.ok(
      typeof patternMatcher.getPerformanceMetrics === "function",
      "PatternMatcher should have getPerformanceMetrics method",
    );
  });

  test("Should return performance metrics with correct structure", () => {
    const metrics = patternMatcher.getPerformanceMetrics();

    // Check that all expected metric properties exist
    assert.ok(
      typeof metrics.configLoadTime === "number",
      "Should have configLoadTime",
    );
    assert.ok(
      typeof metrics.patternCompileTime === "number",
      "Should have patternCompileTime",
    );
    assert.ok(
      typeof metrics.fileAnalysisTime === "number",
      "Should have fileAnalysisTime",
    );
    assert.ok(
      typeof metrics.uiUpdateTime === "number",
      "Should have uiUpdateTime",
    );
    assert.ok(typeof metrics.totalTime === "number", "Should have totalTime");
    assert.ok(
      typeof metrics.fileSizeBytes === "number",
      "Should have fileSizeBytes",
    );
    assert.ok(typeof metrics.matchCount === "number", "Should have matchCount");
    assert.ok(typeof metrics.lineCount === "number", "Should have lineCount");
    assert.ok(typeof metrics.cacheHit === "boolean", "Should have cacheHit");
  });

  test("Should log performance data during pattern compilation", () => {
    const testConfig: LogConfig = {
      version: "1.0",
      name: "Test Config",
      description: "Test configuration",
      matchers: [
        {
          name: "Error Matcher",
          type: "error",
          pattern: "\\berror\\b",
          severity: "high",
          enabled: true,
        },
      ],
      checksum: "test-checksum",
      filePath: "in-memory-invalid-config.yaml",
    };

    // Compile patterns - this should trigger performance logging if enabled
    assert.doesNotThrow(() => {
      patternMatcher.compile(testConfig);
    }, "Pattern compilation should not throw");

    // Should have logged compilation completion
    const compilationMessages = loggedMessages.filter(
      (msg) => msg.includes("Compiled") && msg.includes("matchers"),
    );
    assert.ok(
      compilationMessages.length > 0,
      "Should log pattern compilation results",
    );
  });

  test("Should log performance data during file analysis", async () => {
    const testConfig: LogConfig = {
      version: "1.0",
      name: "Test Config",
      description: "Test configuration",
      matchers: [
        {
          name: "Error Matcher",
          type: "error",
          pattern: "\\berror\\b",
          severity: "high",
          enabled: true,
        },
      ],
      checksum: "test-checksum",
      filePath: "in-memory-invalid-config.yaml",
    };

    const testContent = `
      This is a test log file.
      Here is an error message.
      Another line without issues.
      One more error here.
    `;

    // Analyze file - this should trigger performance logging if enabled
    const result = await patternMatcher.analyzeFile(
      "/test/file.log",
      testConfig,
      testContent,
    );

    // Verify analysis completed
    assert.ok(result, "Analysis should return result");
    assert.strictEqual(result.matches.length, 2, "Should find 2 error matches");
    assert.ok(result.analysisTime >= 0, "Should have recorded analysis time");

    // Should have logged analysis completion
    const analysisMessages = loggedMessages.filter((msg) =>
      msg.includes("Analysis completed"),
    );
    assert.ok(analysisMessages.length > 0, "Should log analysis completion");
  });

  test("Should handle performance logging when patterns fail to compile", () => {
    const testConfig: LogConfig = {
      version: "1.0",
      name: "Invalid Config",
      description: "Configuration with invalid regex",
      matchers: [
        {
          name: "Invalid Matcher",
          type: "error",
          pattern: "[invalid regex (", // Invalid regex pattern
          severity: "high",
          enabled: true,
        },
      ],
      checksum: "test-checksum-invalid",
      filePath: "in-memory-invalid-config.yaml",
    };

    // This should handle the error gracefully and log it
    assert.doesNotThrow(() => {
      patternMatcher.compile(testConfig);
    }, "Should handle invalid patterns gracefully");

    // Should have logged the compilation error
    const errorMessages = loggedMessages.filter((msg) =>
      msg.includes("Failed to compile"),
    );
    assert.ok(errorMessages.length > 0, "Should log compilation errors");
  });
});
