import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { PatternMatcher } from '../../analysis/patternMatcher';
import { LogConfig } from '../../types/configTypes';

suite('File Links Integration Tests', () => {
  let patternMatcher: PatternMatcher;
  let outputChannel: vscode.OutputChannel;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel('Test');
    patternMatcher = new PatternMatcher(outputChannel);
  });

  teardown(() => {
    patternMatcher.dispose();
    outputChannel.dispose();
  });

  test('Should analyze file and find file links', async () => {
    const config: LogConfig = {
      version: '1.0',
      name: 'Test Config',
      matchers: [
        {
          name: 'Error',
          type: 'error',
          severity: 'high',
          pattern: 'ERROR',
          color: '#FF0000',
          minimap: true
        }
      ],
      fileLinks: [
        {
          pattern: '^\\[[^:]*:(.*):(.*)\\]',
          fileUri: '$1',
          lineNumber: '$2',
        }
      ],
      checksum: 'test-checksum'
    };

    // Create a temporary file with test content
    const tempDir = require('os').tmpdir();
    const testFilePath = require('path').join(tempDir, 'test-filelinks.log');
    const testContent = `
[INFO:chrome/browser/ui/tabs/tab_strip_model.cc:1234] Tab created
[ERROR:net/base/network_delegate.cc:567] Network error occurred
[DEBUG:ui/views/widget/widget.cc:890] Widget destroyed
Regular log line without file reference
[WARNING:content/browser/renderer_host/render_process_host_impl.cc:2345] Process warning
`;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(testFilePath),
      encoder.encode(testContent)
    );

    try {
      // Analyze the file
      const result = await patternMatcher.analyzeFile(testFilePath, config);

      // Check that matches were found
      assert.ok(result.matches.length > 0, 'Should find pattern matches');

      // Check that file links were found
      assert.ok(result.fileLinks, 'Should have file links in result');
      assert.strictEqual(result.fileLinks.length, 4, 'Should find 4 file links');

      // Verify first file link
      const firstLink = result.fileLinks[0];
      assert.strictEqual(firstLink.fileUri, 'chrome/browser/ui/tabs/tab_strip_model.cc');
      assert.strictEqual(firstLink.lineNumber, 1234);
      assert.strictEqual(firstLink.line, 2);

      // Verify second file link (ERROR line)
      const secondLink = result.fileLinks[1];
      assert.strictEqual(secondLink.fileUri, 'net/base/network_delegate.cc');
      assert.strictEqual(secondLink.lineNumber, 567);
      assert.strictEqual(secondLink.line, 3);

      // Verify third file link (DEBUG line)
      const thirdLink = result.fileLinks[2];
      assert.strictEqual(thirdLink.fileUri, 'ui/views/widget/widget.cc');
      assert.strictEqual(thirdLink.lineNumber, 890);
      assert.strictEqual(thirdLink.line, 4);

      // Verify fourth file link (WARNING line)
      const fourthLink = result.fileLinks[3];
      assert.strictEqual(fourthLink.fileUri, 'content/browser/renderer_host/render_process_host_impl.cc');
      assert.strictEqual(fourthLink.lineNumber, 2345);
      assert.strictEqual(fourthLink.line, 6);

    } finally {
      // Clean up test file
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(testFilePath));
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('Should handle configuration without file links', async () => {
    const config: LogConfig = {
      version: '1.0',
      name: 'Test Config',
      matchers: [
        {
          name: 'Error',
          type: 'error',
          severity: 'high',
          pattern: 'ERROR',
          color: '#FF0000',
          minimap: true
        }
      ],
      // No fileLinks property
      checksum: 'test-checksum'
    };

    const tempDir = require('os').tmpdir();
    const testFilePath = require('path').join(tempDir, 'test-no-links.log');
    const testContent = `
[INFO:chrome/browser/ui/tabs/tab_strip_model.cc:1234] Tab created
ERROR: Something went wrong
[DEBUG:ui/views/widget/widget.cc:890] Widget destroyed
`;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(testFilePath),
      encoder.encode(testContent)
    );

    try {
      const result = await patternMatcher.analyzeFile(testFilePath, config);

      // Should have regular matches
      assert.ok(result.matches.length > 0, 'Should find pattern matches');

      // Should have empty file links array when no file links configured
      assert.ok(result.fileLinks, 'Should have file links property');
      assert.strictEqual(result.fileLinks.length, 0, 'Should have no file links');

    } finally {
      // Clean up test file
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(testFilePath));
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('Should handle empty file links configuration', async () => {
    const config: LogConfig = {
      version: '1.0',
      name: 'Test Config',
      matchers: [
        {
          name: 'Error',
          type: 'error',
          severity: 'high',
          pattern: 'ERROR',
          color: '#FF0000',
          minimap: true
        }
      ],
      fileLinks: [], // Empty array
      checksum: 'test-checksum'
    };

    const tempDir = require('os').tmpdir();
    const testFilePath = require('path').join(tempDir, 'test-empty-links.log');
    const testContent = `
[INFO:chrome/browser/ui/tabs/tab_strip_model.cc:1234] Tab created
ERROR: Something went wrong
`;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(testFilePath),
      encoder.encode(testContent)
    );

    try {
      const result = await patternMatcher.analyzeFile(testFilePath, config);

      // Should have regular matches
      assert.ok(result.matches.length > 0, 'Should find pattern matches');

      // Should have empty file links array
      assert.ok(result.fileLinks, 'Should have file links property');
      assert.strictEqual(result.fileLinks.length, 0, 'Should have no file links');

    } finally {
      // Clean up test file
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(testFilePath));
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});