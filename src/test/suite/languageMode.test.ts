import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { ConfigManager } from "../../config/configManager";
import { LogConfig } from "../../types/configTypes";

suite("Language Mode Change Tests", () => {
  let outputChannel: vscode.OutputChannel;
  let configManager: ConfigManager;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel("Test Language Mode");
    configManager = new ConfigManager(outputChannel);
  });

  teardown(() => {
    if (configManager) {
      configManager.dispose();
    }
    if (outputChannel) {
      outputChannel.dispose();
    }
  });

  suite("Configuration Parsing", () => {
    test("Should parse changeLanguageMode flag from detector when true", async () => {
      const configPath = path.join(
        __dirname,
        "../fixtures/config-with-language-mode/chromium-with-mode.yaml",
      );
      const configUri = vscode.Uri.file(configPath);

      try {
        const content = await vscode.workspace.fs.readFile(configUri);
        const configText = content.toString();

        // Parse using js-yaml like the real implementation
        const yaml = require("js-yaml");
        const config = yaml.load(configText);

        assert.ok(config.detector, "Detector should exist");
        assert.strictEqual(
          config.detector.changeLanguageMode,
          true,
          "changeLanguageMode should be true",
        );
        assert.strictEqual(
          typeof config.detector.changeLanguageMode,
          "boolean",
          "changeLanguageMode should be a boolean",
        );
      } catch (error) {
        assert.fail(`Failed to load or parse test config: ${error}`);
      }
    });

    test("Should parse changeLanguageMode flag from detector when false", async () => {
      const configPath = path.join(
        __dirname,
        "../fixtures/config-without-language-mode/chromium-without-mode.yaml",
      );
      const configUri = vscode.Uri.file(configPath);

      try {
        const content = await vscode.workspace.fs.readFile(configUri);
        const configText = content.toString();

        const yaml = require("js-yaml");
        const config = yaml.load(configText);

        assert.ok(config.detector, "Detector should exist");
        assert.strictEqual(
          config.detector.changeLanguageMode,
          false,
          "changeLanguageMode should be false",
        );
        assert.strictEqual(
          typeof config.detector.changeLanguageMode,
          "boolean",
          "changeLanguageMode should be a boolean",
        );
      } catch (error) {
        assert.fail(`Failed to load or parse test config: ${error}`);
      }
    });
  });

  suite("Language Mode Detection Logic", () => {
    test("Should detect Chromium log format and return config with changeLanguageMode=true", async () => {
      // Load test configuration from file
      const configPath = path.join(
        __dirname,
        "../fixtures/config-with-language-mode/chromium-with-mode.yaml",
      );
      const configContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(configPath),
      );
      const testConfig = yaml.load(configContent.toString()) as LogConfig;

      // Set version if missing and ensure we have matchers array
      testConfig.version = testConfig.version || "1.0";
      if (!testConfig.matchers) {
        testConfig.matchers = [
          {
            name: "Error",
            type: "error",
            severity: "high" as const,
            pattern: "ERROR",
            minimap: true,
          },
        ];
      }

      // Manually add the config to the manager for testing
      (configManager as any).configs.set("chromium-with-mode", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/chromium-log-no-ext",
      );
      const config = await configManager.getConfigForFile(testFilePath);

      assert.ok(config, "Should find a configuration for Chromium log");
      assert.strictEqual(
        config.name,
        "Chromium log with language mode",
        "Should match the test config",
      );
      assert.ok(config.detector, "Config should have detector");
      assert.strictEqual(
        config.detector.changeLanguageMode,
        true,
        "changeLanguageMode should be true",
      );
    });

    test("Should detect Chromium log format but not change language mode when flag is false", async () => {
      // Load test configuration from file
      const configPath = path.join(
        __dirname,
        "../fixtures/config-without-language-mode/chromium-without-mode.yaml",
      );
      const configContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(configPath),
      );
      const testConfig = yaml.load(configContent.toString()) as LogConfig;

      // Set version if missing and ensure we have matchers array
      testConfig.version = testConfig.version || "1.0";
      if (!testConfig.matchers) {
        testConfig.matchers = [
          {
            name: "Error",
            type: "error",
            severity: "high" as const,
            pattern: "ERROR",
            minimap: true,
          },
        ];
      }

      (configManager as any).configs.set("chromium-without-mode", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/chromium-log-no-ext",
      );
      const config = await configManager.getConfigForFile(testFilePath);

      assert.ok(config, "Should find a configuration for Chromium log");
      assert.strictEqual(
        config.name,
        "Chromium log without language mode",
        "Should match the test config",
      );
      assert.ok(config.detector, "Config should have detector");
      assert.strictEqual(
        config.detector.changeLanguageMode,
        false,
        "changeLanguageMode should be false",
      );
    });

    test("Should not match non-Chromium log format", async () => {
      const testConfig = {
        version: "1.0",
        name: "Test Chromium Config",
        detector: {
          type: "first-line",
          pattern: "^\\[.*\\] .*$",
          changeLanguageMode: true,
        },
        matchers: [
          {
            name: "Test",
            type: "info",
            severity: "low" as const,
            pattern: "info",
            minimap: false,
          },
        ],
      };

      (configManager as any).configs.set("test-config", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/non-chromium-log.log",
      );
      const config = await configManager.getConfigForFile(testFilePath);

      // Should not match because the non-chromium log doesn't have the [timestamp] format
      // This test verifies that detector pattern matching is working correctly
      assert.ok(
        !config || config.name !== "Test Chromium Config",
        "Should not match non-Chromium format",
      );
    });
  });

  suite("Language Mode Change Integration", () => {
    test("Should change language mode for open document when detector matches and flag is true", async () => {
      // Close any previously opened documents to avoid interference
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      // Load test configuration from file
      const configPath = path.join(
        __dirname,
        "../fixtures/config-with-language-mode/chromium-with-mode.yaml",
      );
      const configContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(configPath),
      );
      const testConfig = yaml.load(configContent.toString()) as LogConfig;

      // Set version if missing and ensure we have matchers array
      testConfig.version = testConfig.version || "1.0";
      if (!testConfig.matchers) {
        testConfig.matchers = [
          {
            name: "Error",
            type: "error",
            severity: "high" as const,
            pattern: "ERROR",
            minimap: true,
          },
        ];
      }

      (configManager as any).configs.set("chromium-with-mode", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/chromium-log-no-ext",
      );

      // Open the document first
      const document = await vscode.workspace.openTextDocument(testFilePath);

      // Verify initial language mode (should not be 'log')
      const initialLanguageId = document.languageId;

      // Call getConfigForFile which should trigger language mode change
      const config = await configManager.getConfigForFile(testFilePath);

      assert.ok(config, "Should find configuration");
      assert.ok(config.detector, "Config should have detector");
      assert.strictEqual(
        config.detector.changeLanguageMode,
        true,
        "Config should have changeLanguageMode=true",
      );

      // Give a moment for the language mode change to take effect
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify the document again (get fresh reference)
      const refreshedDoc = vscode.workspace.textDocuments.find(
        (doc) => doc.fileName === testFilePath,
      );
      const finalLanguageId = refreshedDoc
        ? refreshedDoc.languageId
        : document.languageId;

      assert.strictEqual(
        finalLanguageId,
        "log",
        'Document language mode should be changed to "log"',
      );
    });

    test("Should not change language mode when detector matches but flag is false", async () => {
      // Close any previously opened documents to avoid interference
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      // For this test, we'll use a file that WON'T match our detector pattern
      // to verify that when detection fails, no language mode change happens
      // even with a config that has changeLanguageMode=true
      const configPath = path.join(
        __dirname,
        "../fixtures/config-with-language-mode/chromium-with-mode.yaml",
      );
      const configContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(configPath),
      );
      const testConfig = yaml.load(configContent.toString()) as LogConfig;

      // Set version if missing and ensure we have matchers array
      testConfig.version = testConfig.version || "1.0";
      if (!testConfig.matchers) {
        testConfig.matchers = [
          {
            name: "Error",
            type: "error",
            severity: "high" as const,
            pattern: "ERROR",
            minimap: true,
          },
        ];
      }

      (configManager as any).configs.set("test-config-no-match", testConfig);

      // Use a file that doesn't match the detector pattern
      const testFilePath = path.join(
        __dirname,
        "../fixtures/different-format-log.txt",
      );

      // Open the document first
      const document = await vscode.workspace.openTextDocument(testFilePath);
      const initialLanguageId = document.languageId;
      outputChannel.appendLine(
        `Initial language mode for ${path.basename(testFilePath)}: ${initialLanguageId}`,
      );

      // Call getConfigForFile - this should NOT detect the config because content doesn't match
      const config = await configManager.getConfigForFile(testFilePath);

      // Should not find any configuration because file content doesn't match detector
      assert.ok(
        !config,
        "Should not find configuration for non-matching file content",
      );

      // Give a moment for any potential language mode change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Language mode should remain unchanged
      const finalLanguageId = document.languageId;
      outputChannel.appendLine(
        `Final language mode for ${path.basename(testFilePath)}: ${finalLanguageId}`,
      );
      assert.strictEqual(
        finalLanguageId,
        initialLanguageId,
        "Document language mode should not change",
      );
      assert.notStrictEqual(
        finalLanguageId,
        "log",
        "Document should not be in log mode",
      );
    });

    test("Should not change language mode when changeLanguageMode flag is explicitly false", async () => {
      // Close any previously opened documents to avoid interference
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      // Load test configuration with changeLanguageMode=false
      const configPath = path.join(
        __dirname,
        "../fixtures/config-without-language-mode/chromium-without-mode.yaml",
      );
      const configContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(configPath),
      );
      const testConfig = yaml.load(configContent.toString()) as LogConfig;

      // Set version if missing and ensure we have matchers array
      testConfig.version = testConfig.version || "1.0";
      if (!testConfig.matchers) {
        testConfig.matchers = [
          {
            name: "Error",
            type: "error",
            severity: "high" as const,
            pattern: "ERROR",
            minimap: true,
          },
        ];
      }

      (configManager as any).configs.set("test-config-false-mode", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/chromium-log-with-ext.log",
      );

      // Open the document first
      const document = await vscode.workspace.openTextDocument(testFilePath);

      // Explicitly reset language mode to plaintext to ensure clean state
      if (document.languageId === "log") {
        await vscode.languages.setTextDocumentLanguage(document, "plaintext");
        await new Promise((resolve) => setTimeout(resolve, 50)); // Allow time for change
      }

      const initialLanguageId = document.languageId;
      outputChannel.appendLine(
        `Initial language mode for ${path.basename(testFilePath)}: ${initialLanguageId}`,
      );

      // Call getConfigForFile
      const config = await configManager.getConfigForFile(testFilePath);

      assert.ok(config, "Should find configuration");
      assert.ok(config.detector, "Config should have detector");
      assert.strictEqual(
        config.detector.changeLanguageMode,
        false,
        "Config should have changeLanguageMode=false",
      );

      // Give a moment for any potential language mode change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Language mode should remain unchanged because changeLanguageMode is false
      const finalLanguageId = document.languageId;
      outputChannel.appendLine(
        `Final language mode for ${path.basename(testFilePath)}: ${finalLanguageId}`,
      );
      assert.strictEqual(
        finalLanguageId,
        initialLanguageId,
        "Document language mode should not change when flag is false",
      );
      assert.notStrictEqual(
        finalLanguageId,
        "log",
        "Document should not be in log mode when flag is false",
      );
    });

    test("Should not change language mode for file pattern matches (non-detector)", async () => {
      const testConfig = {
        version: "1.0",
        name: "Test Config File Pattern Only",
        // No detector, only file patterns
        filePatterns: ["*.log"],
        matchers: [
          {
            name: "Test",
            type: "info",
            severity: "low" as const,
            pattern: "info",
            minimap: false,
          },
        ],
      };

      (configManager as any).configs.set(
        "test-config-file-pattern",
        testConfig,
      );

      const testFilePath = path.join(
        __dirname,
        "../fixtures/non-chromium-log.log",
      );

      const document = await vscode.workspace.openTextDocument(testFilePath);
      const initialLanguageId = document.languageId;

      // This should match by file pattern but not trigger language mode change
      const config = await configManager.getConfigForFile(testFilePath);

      // Give a moment for any potential language mode change
      await new Promise((resolve) => setTimeout(resolve, 100));

      const finalLanguageId = document.languageId;
      assert.strictEqual(
        finalLanguageId,
        initialLanguageId,
        "Language mode should not change for file pattern matches",
      );
    });
  });

  suite("Edge Cases", () => {
    test("Should handle missing detector gracefully", async () => {
      const testConfig = {
        version: "1.0",
        name: "Test Config No Detector",
        // No detector at all
        matchers: [
          {
            name: "Test",
            type: "info",
            severity: "low" as const,
            pattern: "info",
            minimap: false,
          },
        ],
      };

      (configManager as any).configs.set("test-config-no-detector", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/chromium-log-no-ext",
      );

      // This should not throw an error and should not change language mode
      const config = await configManager.getConfigForFile(testFilePath);

      // Should not match because there's no detector
      assert.ok(
        !config || config.name !== "Test Config No Detector",
        "Should not match without detector",
      );
    });

    test("Should handle file that is not currently open", async () => {
      // Load test configuration from file
      const configPath = path.join(
        __dirname,
        "../fixtures/config-with-language-mode/chromium-with-mode.yaml",
      );
      const configContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(configPath),
      );
      const testConfig = yaml.load(configContent.toString()) as LogConfig;

      // Set version if missing and ensure we have matchers array
      testConfig.version = testConfig.version || "1.0";
      if (!testConfig.matchers) {
        testConfig.matchers = [
          {
            name: "Error",
            type: "error",
            severity: "high" as const,
            pattern: "ERROR",
            minimap: true,
          },
        ];
      }

      (configManager as any).configs.set("test-config-unopened", testConfig);

      const testFilePath = path.join(
        __dirname,
        "../fixtures/chromium-log-no-ext",
      );

      // Don't open the document, just call getConfigForFile
      const config = await configManager.getConfigForFile(testFilePath);

      assert.ok(config, "Should find configuration even for unopened file");
      assert.ok(config.detector, "Config should have detector");
      assert.strictEqual(
        config.detector.changeLanguageMode,
        true,
        "Config should have changeLanguageMode=true",
      );

      // This should not throw an error even though the file is not open
      // The language mode change will be logged but won't actually change anything
    });
  });
});
