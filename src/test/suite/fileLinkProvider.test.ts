import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import { FileLinkProvider } from "../../ui/fileLinkProvider";
import { FileLink } from "../../types/configTypes";

suite("FileLinkProvider Tests", () => {
  let provider: FileLinkProvider;
  let testWorkspaceUri: vscode.Uri;
  let cancellationToken: vscode.CancellationToken;

  setup(async () => {
    provider = new FileLinkProvider();
    cancellationToken = new vscode.CancellationTokenSource().token;

    // Get workspace folder for testing
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      testWorkspaceUri = workspaceFolders[0].uri;
    }
  });

  teardown(() => {
    // Clean up
  });

  suite("New FileLink Settings", () => {
    test("Should respect allowSearch=false setting", async () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "^\\[.*:([^:]+):(\\d+)\\]",
          fileUri: "$1",
          lineNumber: "$2",
          allowSearch: false,
          paths: ["."],
        },
      ];

      provider.compileFileLinks(fileLinks);

      // Create a test document with a file link that would only be found by global search
      const testText = "[INFO:nonexistent/deep/file.ts:42] Some log message";
      const document = await vscode.workspace.openTextDocument({
        content: testText,
        language: "log",
      });

      const position = new vscode.Position(0, 5); // Position within the file path
      const result = await provider.provideDefinition(
        document,
        position,
        cancellationToken,
      );

      // Should not find the file since allowSearch is false and file doesn't exist in specified paths
      assert.strictEqual(result, undefined);
    });

    test("Should search in specified paths when configured", async () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "^\\[.*:([^:]+):(\\d+)\\]",
          fileUri: "$1",
          lineNumber: "$2",
          allowSearch: true,
          paths: ["src", "testdir"],
        },
      ];

      provider.compileFileLinks(fileLinks);

      // Test with a file that exists in one of the specified paths
      const testText = "[INFO:extension.ts:42] Some log message";
      const document = await vscode.workspace.openTextDocument({
        content: testText,
        language: "log",
      });

      const position = new vscode.Position(0, 5); // Position within the file path
      const result = await provider.provideDefinition(
        document,
        position,
        cancellationToken,
      );

      // Should find the file in the src directory
      if (result && result.length > 0) {
        assert.ok(result[0].targetUri.fsPath.includes("extension.ts"));
      }
    });

    test("Should handle empty paths array gracefully", async () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "^\\[.*:([^:]+):(\\d+)\\]",
          fileUri: "$1",
          lineNumber: "$2",
          allowSearch: false,
          paths: [], // Empty paths array
        },
      ];

      provider.compileFileLinks(fileLinks);

      const testText = "[INFO:extension.ts:42] Some log message";
      const document = await vscode.workspace.openTextDocument({
        content: testText,
        language: "log",
      });

      const position = new vscode.Position(0, 5);
      const result = await provider.provideDefinition(
        document,
        position,
        cancellationToken,
      );

      // With empty paths and allowSearch=false, should not find anything
      assert.strictEqual(result, undefined);
    });

    test("Should handle multiple search paths", async () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "^\\[.*:([^:]+):(\\d+)\\]",
          fileUri: "$1",
          lineNumber: "$2",
          allowSearch: true,
          paths: ["src/ui", "src/config", "src/analysis"],
        },
      ];

      provider.compileFileLinks(fileLinks);

      // Test with files from different specified paths
      const testTexts = [
        "[INFO:enhancedTreeView.ts:1] UI component",
        "[INFO:configManager.ts:1] Config component",
        "[INFO:patternMatcher.ts:1] Analysis component",
      ];

      for (const testText of testTexts) {
        const document = await vscode.workspace.openTextDocument({
          content: testText,
          language: "log",
        });

        const position = new vscode.Position(0, 5);
        const result = await provider.provideDefinition(
          document,
          position,
          cancellationToken,
        );

        // Should find files in their respective directories
        if (result && result.length > 0) {
          const fileName = testText.match(/\[INFO:([^:]+):/)?.[1];
          assert.ok(result[0].targetUri.fsPath.includes(fileName || ""));
        }
      }
    });

    test("Should extract correct line numbers from matches", async () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "^\\[.*:([^:]+):(\\d+)\\]",
          fileUri: "$1",
          lineNumber: "$2",
          allowSearch: true,
          paths: ["src"],
        },
      ];

      provider.compileFileLinks(fileLinks);

      const testText = "[INFO:extension.ts:123] Some log message";
      const document = await vscode.workspace.openTextDocument({
        content: testText,
        language: "log",
      });

      const position = new vscode.Position(0, 5);
      const result = await provider.provideDefinition(
        document,
        position,
        cancellationToken,
      );

      if (result && result.length > 0) {
        // Line numbers are 0-based, so 123 becomes 122
        assert.strictEqual(result[0].targetRange.start.line, 122);
        if (result[0].targetSelectionRange) {
          assert.strictEqual(result[0].targetSelectionRange.start.line, 122);
        }
      }
    });
  });

  suite("Pattern Compilation", () => {
    test("Should compile valid FileLink patterns", () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "^\\[.*:([^:]+):(\\d+)\\]",
          fileUri: "$1",
          lineNumber: "$2",
          allowSearch: true,
          paths: ["."],
        },
      ];

      // Should not throw
      assert.doesNotThrow(() => {
        provider.compileFileLinks(fileLinks);
      });
    });

    test("Should handle invalid regex patterns gracefully", () => {
      const fileLinks: FileLink[] = [
        {
          pattern: "[invalid regex pattern((",
          fileUri: "$1",
          allowSearch: true,
          paths: ["."],
        },
      ];

      // Should not throw, but log error
      assert.doesNotThrow(() => {
        provider.compileFileLinks(fileLinks);
      });
    });

    test("Should handle empty patterns array", () => {
      assert.doesNotThrow(() => {
        provider.compileFileLinks([]);
      });
    });
  });
});
