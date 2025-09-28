import * as assert from "assert";
import * as vscode from "vscode";
import { PatternMatcher } from "../../analysis/patternMatcher";
import { LogConfig } from "../../types/configTypes";

// Test for enabled field functionality
suite("Enabled Field Tests", () => {
  let patternMatcher: PatternMatcher;
  let outputChannel: vscode.OutputChannel;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel("Test Enabled Field");
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

  test("Should skip disabled matchers during compilation", () => {
    const config: LogConfig = {
      name: "Test Config",
      version: "1.0",
      checksum: "test-checksum",
      matchers: [
        {
          name: "Enabled Matcher",
          type: "error",
          severity: "high",
          pattern: "ERROR",
          enabled: true,
        },
        {
          name: "Disabled Matcher",
          type: "warning",
          severity: "medium",
          pattern: "WARNING",
          enabled: false,
        },
        {
          name: "Default Enabled Matcher",
          type: "info",
          severity: "low",
          pattern: "INFO",
          // enabled field not specified, should default to enabled
        },
      ],
      filePath: "/in-memory-config.yaml",
    };

    patternMatcher.compile(config);
    const compiledMatchers = patternMatcher.getCompiledMatchers();

    // Should have 2 compiled matchers (enabled and default)
    assert.strictEqual(compiledMatchers.length, 2);

    // Check that the disabled matcher is not included
    const matcherNames = compiledMatchers.map((m) => m.original.name);
    assert.ok(matcherNames.includes("Enabled Matcher"));
    assert.ok(matcherNames.includes("Default Enabled Matcher"));
    assert.ok(!matcherNames.includes("Disabled Matcher"));
  });
});
