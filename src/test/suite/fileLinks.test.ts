import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileLinkProvider } from '../../ui/fileLinkProvider';
import { FileLink } from '../../types/configTypes';

suite('FileLinkProvider Tests', () => {
  let fileLinkProvider: FileLinkProvider;
  let outputChannel: vscode.OutputChannel;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel('Test');
    fileLinkProvider = new FileLinkProvider(outputChannel);
  });

  teardown(() => {
    fileLinkProvider.dispose();
    outputChannel.dispose();
  });

  test('Should compile file link patterns correctly', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: '^\\[[^\\]*:(.*):(.*)\\]',
        fileUri: '$1',
        lineNumber: '$2',
      },
      {
        pattern: 'File: (\\S+) Line: (\\d+)',
        fileUri: '$1',
        lineNumber: '$2',
      }
    ];

    // Should not throw
    assert.doesNotThrow(() => {
      fileLinkProvider.compileFileLinks(fileLinks);
    });
  });

  test('Should find file links in content', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: '^\\[[^:]*:(.*):(.*)\\]',
        fileUri: '$1',
        lineNumber: '$2'
      }
    ];

    fileLinkProvider.compileFileLinks(fileLinks);

    const content = `
[INFO:chrome/browser/ui/tabs/tab_strip_model.cc:1234] Tab created
[ERROR:net/base/network_delegate.cc:567] Network error
[DEBUG:ui/views/widget/widget.cc:890] Widget destroyed
Normal log line without file reference
`;

    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    assert.strictEqual(matches.length, 3, 'Should find 3 file link matches');
    
    // Check first match
    assert.strictEqual(matches[0].fileUri, 'chrome/browser/ui/tabs/tab_strip_model.cc');
    assert.strictEqual(matches[0].lineNumber, 1234);
    assert.strictEqual(matches[0].line, 2);
    assert.strictEqual(matches[0].column, 0);

    // Check second match
    assert.strictEqual(matches[1].fileUri, 'net/base/network_delegate.cc');
    assert.strictEqual(matches[1].lineNumber, 567);
    assert.strictEqual(matches[1].line, 3);

    // Check third match
    assert.strictEqual(matches[2].fileUri, 'ui/views/widget/widget.cc');
    assert.strictEqual(matches[2].lineNumber, 890);
    assert.strictEqual(matches[2].line, 4);
  });

  test('Should handle patterns without line numbers', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: 'File: (\\S+)',
        fileUri: '$1'
      }
    ];

    fileLinkProvider.compileFileLinks(fileLinks);

    const content = 'File: src/main.cpp\nFile: include/header.h';
    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0].fileUri, 'src/main.cpp');
    assert.strictEqual(matches[0].lineNumber, undefined);
    assert.strictEqual(matches[1].fileUri, 'include/header.h');
    assert.strictEqual(matches[1].lineNumber, undefined);
  });

  test('Should handle multiple matches on same line', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: '(\\w+\\.cpp)',
        fileUri: '$1'
      }
    ];

    fileLinkProvider.compileFileLinks(fileLinks);

    const content = 'Files main.cpp, test.cpp, and utils.cpp were compiled';
    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    assert.strictEqual(matches.length, 3);
    assert.strictEqual(matches[0].fileUri, 'main.cpp');
    assert.strictEqual(matches[1].fileUri, 'test.cpp');
    assert.strictEqual(matches[2].fileUri, 'utils.cpp');
    
    // All matches should be on the same line
    assert.strictEqual(matches[0].line, 1);
    assert.strictEqual(matches[1].line, 1);
    assert.strictEqual(matches[2].line, 1);
  });

  test('Should ignore empty or invalid file URIs', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: 'File: (.*)',
        fileUri: '$1'
      }
    ];

    fileLinkProvider.compileFileLinks(fileLinks);

    const content = `
File: valid_file.cpp
File:    
File: 
File: another_valid.h
`;

    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    // Should only find matches for non-empty file URIs
    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0].fileUri, 'valid_file.cpp');
    assert.strictEqual(matches[1].fileUri, 'another_valid.h');
  });

  test('Should handle invalid regex patterns gracefully', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: '[invalid regex pattern',  // Missing closing bracket
        fileUri: '$1'
      },
      {
        pattern: '(valid\\.pattern)',
        fileUri: '$1'
      }
    ];

    // Should not throw, but log error and continue with valid patterns
    assert.doesNotThrow(() => {
      fileLinkProvider.compileFileLinks(fileLinks);
    });

    const content = 'Test valid.pattern here';
    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    // Should still find matches from valid patterns
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].fileUri, 'valid.pattern');
  });

  test('Should clear file link matches correctly', () => {
    // This test verifies the clearFileLinkMatches method exists and doesn't throw
    assert.doesNotThrow(() => {
      fileLinkProvider.clearFileLinkMatches('/test/file.txt');
    });
  });

  test('Should handle line number parsing correctly', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: '(\\w+\\.cpp):(.*)',  // Changed from \\d+ to .* to capture any line number
        fileUri: '$1',
        lineNumber: '$2'
      }
    ];

    fileLinkProvider.compileFileLinks(fileLinks);

    const content = `
main.cpp:123
test.cpp:456
utils.cpp:0
invalid.cpp:abc
`;

    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    assert.strictEqual(matches.length, 4);
    
    // Valid line numbers
    assert.strictEqual(matches[0].lineNumber, 123);
    assert.strictEqual(matches[1].lineNumber, 456);
    assert.strictEqual(matches[2].lineNumber, 0);
    
    // Invalid line number should be undefined
    assert.strictEqual(matches[3].lineNumber, undefined);
  });

  test('Should include description and pattern in matches', () => {
    const fileLinks: FileLink[] = [
      {
        pattern: '(\\w+\\.cpp)',
        fileUri: '$1'
      }
    ];

    fileLinkProvider.compileFileLinks(fileLinks);

    const content = 'main.cpp';
    const matches = fileLinkProvider.findFileLinks(content, '/test/log.txt');

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].pattern, '(\\w+\\.cpp)');
    assert.strictEqual(matches[0].originalText, 'main.cpp');
  });
});