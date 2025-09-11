import * as assert from "assert";
import * as vscode from "vscode";
import { PatternMatcher } from "../../analysis/patternMatcher";
import { LogConfig, Matcher, MatchResult } from "../../types/configTypes";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

suite("PatternMatcher Unit Tests", () => {
  let patternMatcher: PatternMatcher;
  let outputChannel: vscode.OutputChannel;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel("Test PatternMatcher");
    patternMatcher = new PatternMatcher(outputChannel);
  });

  teardown(() => {
    if (patternMatcher) {
      patternMatcher.dispose();
    }
    if (outputChannel) {
      outputChannel.dispose();
    }
  });

  suite("Pattern Compilation", () => {
    test("Should compile simple pattern correctly", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Error Matcher",
            type: "error",
            severity: "high",
            pattern: "ERROR",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      // Should not throw
      patternMatcher.compile(config);
      assert.ok(
        patternMatcher.isReady(),
        "PatternMatcher should be ready after compilation"
      );

      const compiledMatchers = patternMatcher.getCompiledMatchers();
      assert.strictEqual(
        compiledMatchers.length,
        1,
        "Should have one compiled matcher"
      );
      assert.strictEqual(
        compiledMatchers[0].original.name,
        "Error Matcher",
        "Matcher name should match"
      );
    });

    test("Should handle regex flags correctly", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Case Insensitive",
            type: "warning",
            severity: "medium",
            pattern: "WARN",
            color: "#FFA500",
            minimap: true,
            ignoreCase: true,
          },
          {
            name: "Multiline",
            type: "info",
            severity: "low",
            pattern: "^INFO.*$",
            color: "#0000FF",
            minimap: false,
            multiline: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);
      const compiledMatchers = patternMatcher.getCompiledMatchers();

      assert.strictEqual(
        compiledMatchers.length,
        2,
        "Should have two compiled matchers"
      );

      // Check flags
      const caseInsensitiveMatcher = compiledMatchers.find(
        (m) => m.original.name === "Case Insensitive"
      );
      assert.ok(
        caseInsensitiveMatcher,
        "Case insensitive matcher should exist"
      );
      assert.ok(
        caseInsensitiveMatcher.regex.flags.includes("i"),
        "Should have ignoreCase flag"
      );

      const multilineMatcher = compiledMatchers.find(
        (m) => m.original.name === "Multiline"
      );
      assert.ok(multilineMatcher, "Multiline matcher should exist");
      assert.ok(
        multilineMatcher.regex.flags.includes("m"),
        "Should have multiline flag"
      );
    });

    test("Should handle invalid regex patterns gracefully", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Invalid Regex",
            type: "error",
            severity: "high",
            pattern: "[invalid regex", // Unclosed bracket
            color: "#FF0000",
            minimap: true,
          },
          {
            name: "Valid Regex",
            type: "warning",
            severity: "medium",
            pattern: "WARN",
            color: "#FFA500",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      // Should not throw, but should compile only valid patterns
      patternMatcher.compile(config);
      const compiledMatchers = patternMatcher.getCompiledMatchers();

      // Should only have the valid matcher
      assert.strictEqual(
        compiledMatchers.length,
        1,
        "Should compile only valid patterns"
      );
      assert.strictEqual(
        compiledMatchers[0].original.name,
        "Valid Regex",
        "Should keep valid matcher"
      );
    });

    test("Should handle empty matchers array", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Empty Config",
        matchers: [],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);
      assert.ok(
        !patternMatcher.isReady(),
        "PatternMatcher should not be ready with no matchers"
      );
      assert.strictEqual(
        patternMatcher.getCompiledMatchers().length,
        0,
        "Should have no compiled matchers"
      );
    });
  });

  suite("Line Matching", () => {
    test("Should match simple patterns in lines", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Error Matcher",
            type: "error",
            severity: "high",
            pattern: "ERROR",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);

      const testLines = [
        "This is an ERROR message",
        "This is a normal message",
        "Another ERROR occurred",
        "Warning: something happened",
      ];

      const allMatches: MatchResult[] = [];
      testLines.forEach((line, index) => {
        const matches = patternMatcher.matchLine(line, index + 1);
        allMatches.push(...matches);
      });

      assert.strictEqual(allMatches.length, 2, "Should find 2 ERROR matches");
      assert.strictEqual(
        allMatches[0].line,
        1,
        "First match should be on line 1"
      );
      assert.strictEqual(
        allMatches[1].line,
        3,
        "Second match should be on line 3"
      );
      assert.strictEqual(
        allMatches[0].column,
        11,
        "First match should start at column 11"
      );
      assert.strictEqual(
        allMatches[0].length,
        5,
        "Match length should be 5 (ERROR)"
      );
    });

    test("Should handle case insensitive matching", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Warning Matcher",
            type: "warning",
            severity: "medium",
            pattern: "warn",
            color: "#FFA500",
            minimap: true,
            ignoreCase: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);

      const testLines = [
        "WARN: uppercase warning",
        "warn: lowercase warning",
        "Warn: mixed case warning",
        "WARNING: extended warning",
      ];

      let totalMatches = 0;
      testLines.forEach((line, index) => {
        const matches = patternMatcher.matchLine(line, index + 1);
        totalMatches += matches.length;
      });

      assert.strictEqual(totalMatches, 4, "Should match all case variations");
    });

    test("Should match multiple patterns in same line", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Error Matcher",
            type: "error",
            severity: "high",
            pattern: "ERROR",
            color: "#FF0000",
            minimap: true,
          },
          {
            name: "Failed Matcher",
            type: "error",
            severity: "high",
            pattern: "FAILED",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);

      const line = "ERROR: Operation FAILED completely";
      const matches = patternMatcher.matchLine(line, 1);

      assert.strictEqual(
        matches.length,
        2,
        "Should find both ERROR and FAILED"
      );
      assert.strictEqual(
        matches[0].matcher.name,
        "Error Matcher",
        "First match should be ERROR"
      );
      assert.strictEqual(
        matches[1].matcher.name,
        "Failed Matcher",
        "Second match should be FAILED"
      );
    });

    test("Should extract context correctly", () => {
      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Error Matcher",
            type: "error",
            severity: "high",
            pattern: "ERROR",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);

      const line = "2025-08-16 10:30:00 [ERROR] Database connection failed";
      const matches = patternMatcher.matchLine(line, 1);

      assert.strictEqual(matches.length, 1, "Should find one match");
      assert.ok(matches[0].context, "Should have context");
      assert.strictEqual(
        matches[0].originalLine,
        line,
        "Should preserve original line"
      );
    });

    test("Should throw error when not compiled", () => {
      // Don't compile the pattern matcher
      assert.throws(
        () => {
          patternMatcher.matchLine("test line", 1);
        },
        /Patterns must be compiled before matching/,
        "Should throw error when not compiled"
      );
    });
  });

  suite("Performance Metrics", () => {
    test("Should return performance metrics", () => {
      const metrics = patternMatcher.getPerformanceMetrics();

      assert.ok(metrics, "Should return metrics object");
      assert.ok(
        typeof metrics.configLoadTime === "number",
        "configLoadTime should be a number"
      );
      assert.ok(
        typeof metrics.patternCompileTime === "number",
        "patternCompileTime should be a number"
      );
      assert.ok(
        typeof metrics.fileAnalysisTime === "number",
        "fileAnalysisTime should be a number"
      );
      assert.ok(
        typeof metrics.uiUpdateTime === "number",
        "uiUpdateTime should be a number"
      );
      assert.ok(
        typeof metrics.memoryUsage === "number",
        "memoryUsage should be a number"
      );
      assert.ok(
        typeof metrics.totalTime === "number",
        "totalTime should be a number"
      );
    });
  });

  suite("State Management", () => {
    test("Should track compilation state correctly", () => {
      assert.ok(!patternMatcher.isReady(), "Should not be ready initially");

      const config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Test Matcher",
            type: "error",
            severity: "high",
            pattern: "test",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config);
      assert.ok(patternMatcher.isReady(), "Should be ready after compilation");

      patternMatcher.dispose();
      assert.ok(
        !patternMatcher.isReady(),
        "Should not be ready after disposal"
      );
    });

    test("Should clear state on new compilation", () => {
      const config1: LogConfig = {
        version: "1.0",
        name: "Config 1",
        matchers: [
          {
            name: "Matcher 1",
            type: "error",
            severity: "high",
            pattern: "error",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config1);
      assert.strictEqual(
        patternMatcher.getCompiledMatchers().length,
        1,
        "Should have 1 matcher"
      );

      const config2: LogConfig = {
        version: "1.0",
        name: "Config 2",
        matchers: [
          {
            name: "Matcher 1",
            type: "warning",
            severity: "medium",
            pattern: "warn",
            color: "#FFA500",
            minimap: true,
          },
          {
            name: "Matcher 2",
            type: "info",
            severity: "low",
            pattern: "info",
            color: "#0000FF",
            minimap: false,
          },
        ],
        checksum: randomUUID(),
      };

      patternMatcher.compile(config2);
      assert.strictEqual(
        patternMatcher.getCompiledMatchers().length,
        2,
        "Should have 2 matchers after recompilation"
      );

      const matcherNames = patternMatcher
        .getCompiledMatchers()
        .map((m) => m.original.name);
      assert.ok(matcherNames.includes("Matcher 1"), "Should have Matcher 1");
      assert.ok(matcherNames.includes("Matcher 2"), "Should have Matcher 2");
    });
    test("Should recompile matchers if checksum changes", async () => {
      let config: LogConfig = {
        version: "1.0",
        name: "Test Config",
        matchers: [
          {
            name: "Test Matcher",
            type: "error",
            severity: "high",
            pattern: "test",
            color: "#FF0000",
            minimap: true,
          },
        ],
        checksum: "checksum1",
      };

      const selfPath = path.join(__dirname, "patternMatcher.test.js");
      assert.ok(fs.existsSync(selfPath), "Self path should exist: " + selfPath);

      const fileContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(selfPath)
      );
      const textContent = Buffer.from(fileContent).toString("utf-8");
      await patternMatcher.analyzeFile(selfPath, config, textContent);
      assert.ok(
        patternMatcher.getCompiledMatchers().length > 0,
        "Matchers should be compiled"
      );
      assert.equal(
        patternMatcher.getCompiledMatchers()[0].original.name,
        "Test Matcher",
        "Matcher name should match"
      );

      config.checksum = "checksum2"; // Change checksum
      config.matchers[0].name = "Test Matcher 2"; // Change matcher name
      const fileContent2 = await vscode.workspace.fs.readFile(
        vscode.Uri.file(selfPath)
      );
      const textContent2 = Buffer.from(fileContent2).toString("utf-8");
      await patternMatcher.analyzeFile(selfPath, config, textContent2);
      assert.ok(
        patternMatcher.getCompiledMatchers().length > 0,
        "Matchers should be recompiled"
      );
      assert.equal(
        patternMatcher.getCompiledMatchers()[0].original.name,
        "Test Matcher 2",
        "Matcher name should match"
      );
    });
  });
});
