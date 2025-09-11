import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { PatternMatcher } from "../../analysis/patternMatcher";
import { MinimapDecorationService } from "../../ui/minimapDecorations";
import { LogConfig } from "../../types/configTypes";

suite("Minimap Integration Test Suite", () => {
  let outputChannel: vscode.OutputChannel;
  let patternMatcher: PatternMatcher;
  let minimapService: MinimapDecorationService;
  let tempFiles: string[] = [];

  setup(() => {
    outputChannel = vscode.window.createOutputChannel(
      "Integration Test Output"
    );
    patternMatcher = new PatternMatcher(outputChannel);
    minimapService = new MinimapDecorationService(outputChannel);
  });

  teardown(async () => {
    // Clean up temporary files
    for (const filePath of tempFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Failed to clean up temp file ${filePath}:`, error);
      }
    }
    tempFiles = [];

    if (minimapService) {
      minimapService.dispose();
    }
    if (patternMatcher) {
      patternMatcher.dispose();
    }
    if (outputChannel) {
      outputChannel.dispose();
    }
  });

  test("Should integrate pattern matching with minimap decorations", async () => {
    // Create a temporary log file with test content
    const tempFilePath = await createTempLogFile(
      `
2024-01-01 10:00:00 INFO Application started
2024-01-01 10:01:00 ERROR Database connection failed
2024-01-01 10:02:00 WARN Low memory warning
2024-01-01 10:03:00 ERROR Authentication failed
2024-01-01 10:04:00 INFO User logged in
2024-01-01 10:05:00 DEBUG Processing request
    `.trim()
    );

    // Create test configuration
    const config: LogConfig = {
      version: "1.0",
      name: "Integration Test Config",
      matchers: [
        {
          name: "Error Messages",
          type: "error",
          severity: "high",
          pattern: "\\bERROR\\b",
          color: "#FF0000",
          minimap: true,
          ignoreCase: false,
        },
        {
          name: "Warning Messages",
          type: "warning",
          severity: "medium",
          pattern: "\\bWARN\\b",
          color: "#FFA500",
          minimap: true,
          ignoreCase: false,
        },
        {
          name: "Info Messages",
          type: "info",
          severity: "low",
          pattern: "\\bINFO\\b",
          color: "#0066CC",
          minimap: false, // This should not appear in minimap
          ignoreCase: false,
        },
        {
          name: "Debug Messages",
          type: "debug",
          severity: "low",
          pattern: "\\bDEBUG\\b",
          color: "#666666",
          minimap: true,
          ignoreCase: false,
        },
      ],
      checksum: "integration-test-checksum",
    };

    // Read file content and analyze
    const fileContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(tempFilePath)
    );
    const textContent = Buffer.from(fileContent).toString("utf-8");
    const analysisResult = await patternMatcher.analyzeFile(
      tempFilePath,
      config,
      textContent
    );

    // Verify analysis results
    assert.ok(
      analysisResult.matches.length > 0,
      "Should find matches in the log file"
    );

    // Update minimap decorations
    minimapService.updateDecorations(analysisResult);

    // Verify minimap decorations
    const decorations =
      minimapService.getActiveDecorationsForTesting(tempFilePath);

    // Should have decorations for ERROR, WARN, and DEBUG (INFO has minimap: false)
    const expectedMinimapMatches = analysisResult.matches.filter(
      (m) => m.matcher.minimap
    );
    assert.strictEqual(
      decorations.length,
      expectedMinimapMatches.length,
      "Should create decorations only for minimap-enabled matchers"
    );

    // Verify decoration properties
    const errorDecorations = decorations.filter((d) => d.severity === "high");
    const warningDecorations = decorations.filter(
      (d) => d.severity === "medium"
    );

    assert.ok(
      errorDecorations.length >= 2,
      "Should have at least 2 error decorations"
    );
    assert.ok(
      warningDecorations.length >= 1,
      "Should have at least 1 warning decoration"
    );

    // Verify decoration ranges are valid
    for (const decoration of decorations) {
      assert.ok(
        decoration.range instanceof vscode.Range,
        "Decoration should have valid range"
      );
      assert.ok(
        decoration.range.start.line >= 0,
        "Range should have valid start line"
      );
      assert.ok(
        decoration.range.start.character >= 0,
        "Range should have valid start character"
      );
      assert.ok(decoration.color.length > 0, "Decoration should have color");
      assert.ok(
        decoration.matcherName.length > 0,
        "Decoration should have matcher name"
      );
    }
  });

  test("Should handle configuration changes affecting minimap", async () => {
    const tempFilePath = await createTempLogFile("ERROR: Something went wrong");

    // Initial config with minimap enabled
    const initialConfig: LogConfig = {
      version: "1.0",
      name: "Initial Config",
      matchers: [
        {
          name: "Error Pattern",
          type: "error",
          severity: "high",
          pattern: "ERROR",
          color: "#FF0000",
          minimap: true,
        },
      ],
      checksum: "initial-checksum",
    };

    // Read file content and analyze
    let fileContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(tempFilePath)
    );
    let textContent = Buffer.from(fileContent).toString("utf-8");
    let analysisResult = await patternMatcher.analyzeFile(
      tempFilePath,
      initialConfig,
      textContent
    );
    minimapService.updateDecorations(analysisResult);

    let decorations =
      minimapService.getActiveDecorationsForTesting(tempFilePath);
    assert.strictEqual(
      decorations.length,
      1,
      "Should have decoration when minimap is enabled"
    );

    // Updated config with minimap disabled
    const updatedConfig: LogConfig = {
      version: "1.0",
      name: "Updated Config",
      matchers: [
        {
          name: "Error Pattern",
          type: "error",
          severity: "high",
          pattern: "ERROR",
          color: "#FF0000",
          minimap: false, // Disabled
        },
      ],
      checksum: "updated-checksum",
    };

    // Re-analyze and update decorations
    fileContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(tempFilePath)
    );
    textContent = Buffer.from(fileContent).toString("utf-8");
    analysisResult = await patternMatcher.analyzeFile(
      tempFilePath,
      updatedConfig,
      textContent
    );
    minimapService.updateDecorations(analysisResult);

    decorations = minimapService.getActiveDecorationsForTesting(tempFilePath);
    assert.strictEqual(
      decorations.length,
      0,
      "Should have no decorations when minimap is disabled"
    );
  });

  test("Should handle multiple files with different configurations", async () => {
    // Create two different log files
    const logFile1 = await createTempLogFile(
      "ERROR: Database error\nWARN: Low memory"
    );
    const logFile2 = await createTempLogFile(
      "CRITICAL: System failure\nINFO: System restored"
    );

    // Different configs for each file
    const config1: LogConfig = {
      version: "1.0",
      name: "DB Config",
      matchers: [
        {
          name: "DB Errors",
          type: "error",
          severity: "high",
          pattern: "ERROR",
          color: "#FF0000",
          minimap: true,
        },
      ],
      checksum: "db-config-checksum",
    };

    const config2: LogConfig = {
      version: "1.0",
      name: "System Config",
      matchers: [
        {
          name: "Critical Issues",
          type: "critical",
          severity: "critical",
          pattern: "CRITICAL",
          color: "#8B0000",
          minimap: true,
        },
      ],
      checksum: "system-config-checksum",
    };

    // Analyze both files
    const fileContent1 = await vscode.workspace.fs.readFile(
      vscode.Uri.file(logFile1)
    );
    const textContent1 = Buffer.from(fileContent1).toString("utf-8");
    const result1 = await patternMatcher.analyzeFile(
      logFile1,
      config1,
      textContent1
    );

    const fileContent2 = await vscode.workspace.fs.readFile(
      vscode.Uri.file(logFile2)
    );
    const textContent2 = Buffer.from(fileContent2).toString("utf-8");
    const result2 = await patternMatcher.analyzeFile(
      logFile2,
      config2,
      textContent2
    );

    // Update decorations for both files
    minimapService.updateDecorations(result1);
    minimapService.updateDecorations(result2);

    // Verify decorations for each file
    const decorations1 =
      minimapService.getActiveDecorationsForTesting(logFile1);
    const decorations2 =
      minimapService.getActiveDecorationsForTesting(logFile2);

    assert.ok(decorations1.length > 0, "File 1 should have decorations");
    assert.ok(decorations2.length > 0, "File 2 should have decorations");

    // Verify decorations are file-specific
    assert.strictEqual(
      decorations1[0].severity,
      "high",
      "File 1 should have high severity decorations"
    );
    assert.strictEqual(
      decorations2[0].severity,
      "critical",
      "File 2 should have critical severity decorations"
    );
  });

  async function createTempLogFile(content: string): Promise<string> {
    const tempDir = require("os").tmpdir();
    const fileName = `test-log-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}.log`;
    const filePath = path.join(tempDir, fileName);

    fs.writeFileSync(filePath, content);
    tempFiles.push(filePath);

    return filePath;
  }
});
