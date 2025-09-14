import * as assert from 'assert';
import * as vscode from 'vscode';
import { MinimapDecorationService } from '../../ui/minimapDecorations';
import { AnalysisResult, LogConfig, Matcher, MatchResult } from '../../types/configTypes';

suite('Minimap Decorations Test Suite', () => {
  let outputChannel: vscode.OutputChannel;
  let minimapService: MinimapDecorationService;

  setup(() => {
    outputChannel = vscode.window.createOutputChannel('Test Output');
    minimapService = new MinimapDecorationService(outputChannel);
  });

  teardown(() => {
    if (minimapService) {
      minimapService.dispose();
    }
    if (outputChannel) {
      outputChannel.dispose();
    }
  });

  test('Should create decoration types for all severity levels', () => {
    const decorationTypes = minimapService.getDecorationTypesForTesting();
    
    assert.strictEqual(decorationTypes.size, 4, 'Should create decoration types for 4 severity levels');
    assert.ok(decorationTypes.has('critical'), 'Should have critical severity decoration type');
    assert.ok(decorationTypes.has('high'), 'Should have high severity decoration type');
    assert.ok(decorationTypes.has('medium'), 'Should have medium severity decoration type');
    assert.ok(decorationTypes.has('low'), 'Should have low severity decoration type');
  });

  test('Should not update decorations when minimap is disabled', () => {
    // Mock the configuration to disable minimap decorations
    const originalGet = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = () => ({
      get: (key: string, defaultValue?: any) => {
        if (key === 'showMinimapDecorations') {
          return false;
        }
        return defaultValue;
      }
    } as any);

    const mockResult = createMockAnalysisResult();
    minimapService.updateDecorations(mockResult);

    const decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    assert.strictEqual(decorations.length, 0, 'Should not create decorations when disabled');

    // Restore original function
    vscode.workspace.getConfiguration = originalGet;
  });

  test('Should create decorations only for minimap-enabled matchers', () => {
    const mockResult = createMockAnalysisResult();
    minimapService.updateDecorations(mockResult);

    const decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    
    // Only the first two matches have minimap: true
    assert.strictEqual(decorations.length, 2, 'Should create decorations only for minimap-enabled matchers');
    
    const severities = decorations.map(d => d.severity);
    assert.ok(severities.includes('high'), 'Should include high severity decoration');
    assert.ok(severities.includes('medium'), 'Should include medium severity decoration');
    assert.ok(!severities.includes('low'), 'Should not include low severity decoration (minimap: false)');
  });

  test('Should create correct decoration ranges', () => {
    const mockResult = createMockAnalysisResult();
    minimapService.updateDecorations(mockResult);

    const decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    
    const firstDecoration = decorations[0];
    const expectedRange = new vscode.Range(9, 15, 9, 20); // line 10 -> 9 (0-based), column 15, length 5
    
    assert.ok(firstDecoration.range.isEqual(expectedRange), 'Should create correct range for match');
    assert.strictEqual(firstDecoration.severity, 'high', 'Should preserve severity');
    assert.strictEqual(firstDecoration.matcherName, 'Error Pattern', 'Should preserve matcher name');
  });

  test('Should clear decorations for specific file', () => {
    const mockResult = createMockAnalysisResult();
    minimapService.updateDecorations(mockResult);

    let decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    assert.ok(decorations.length > 0, 'Should have decorations before clearing');

    minimapService.clearDecorationsForFile(mockResult.filePath);
    decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    assert.strictEqual(decorations.length, 0, 'Should have no decorations after clearing');
  });

  test('Should clear all decorations', () => {
    const mockResult1 = createMockAnalysisResult();
    const mockResult2 = createMockAnalysisResult();
    mockResult2.filePath = '/test/file2.log';

    minimapService.updateDecorations(mockResult1);
    minimapService.updateDecorations(mockResult2);

    // Verify both files have decorations
    assert.ok(minimapService.getActiveDecorationsForTesting(mockResult1.filePath).length > 0);
    assert.ok(minimapService.getActiveDecorationsForTesting(mockResult2.filePath).length > 0);

    minimapService.clearAllDecorations();

    // Verify all decorations are cleared
    assert.strictEqual(minimapService.getActiveDecorationsForTesting(mockResult1.filePath).length, 0);
    assert.strictEqual(minimapService.getActiveDecorationsForTesting(mockResult2.filePath).length, 0);
  });

  test('Should handle empty analysis results', () => {
    const mockResult = createMockAnalysisResult();
    mockResult.matches = []; // No matches

    minimapService.updateDecorations(mockResult);
    const decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    
    assert.strictEqual(decorations.length, 0, 'Should handle empty matches gracefully');
  });

  test('Should handle results with no minimap-enabled matchers', () => {
    const mockResult = createMockAnalysisResult();
    // Set all matchers to minimap: false
    mockResult.matches.forEach(match => {
      match.matcher.minimap = false;
    });

    minimapService.updateDecorations(mockResult);
    const decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    
    assert.strictEqual(decorations.length, 0, 'Should handle results with no minimap-enabled matchers');
  });

  test('Should create decorations with correct properties', () => {
    const mockResult = createMockAnalysisResult();
    minimapService.updateDecorations(mockResult);

    const decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    const decoration = decorations[0];
    
    assert.strictEqual(decoration.severity, 'high', 'Should have correct severity');
    assert.strictEqual(decoration.matcherName, 'Error Pattern', 'Should have correct matcher name');
    assert.strictEqual(decoration.color, '#FF0000', 'Should have correct color from matcher');
    assert.strictEqual(decoration.message, 'Found error pattern', 'Should have correct message');
    assert.ok(decoration.range instanceof vscode.Range, 'Should have valid range');
  });

  test('Should update existing decorations when file is re-analyzed', () => {
    const mockResult = createMockAnalysisResult();
    minimapService.updateDecorations(mockResult);

    let decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    assert.strictEqual(decorations.length, 2, 'Should have initial decorations');

    // Update with new analysis (different matches)
    const updatedResult = createMockAnalysisResult();
    updatedResult.matches = [updatedResult.matches[0]]; // Only one match now

    minimapService.updateDecorations(updatedResult);
    decorations = minimapService.getActiveDecorationsForTesting(mockResult.filePath);
    
    assert.strictEqual(decorations.length, 1, 'Should update to new decoration count');
  });

  function createMockAnalysisResult(): AnalysisResult {
    const config: LogConfig = {
      version: '1.0',
      name: 'Test Config',
      matchers: [],
      checksum: 'test-checksum',
      filePath: 'in-memory-config.yaml',
    };

    const matcher1: Matcher = {
      name: 'Error Pattern',
      type: 'error',
      severity: 'high',
      pattern: 'error',
      color: '#FF0000',
      minimap: true
    };

    const matcher2: Matcher = {
      name: 'Warning Pattern',
      type: 'warning',
      severity: 'medium',
      pattern: 'warn',
      color: '#FFA500',
      minimap: true
    };

    const matcher3: Matcher = {
      name: 'Info Pattern',
      type: 'info',
      severity: 'low',
      pattern: 'info',
      color: '#0066CC',
      minimap: false // This one should not appear in minimap
    };

    const match1: MatchResult = {
      matcher: matcher1,
      line: 10,
      column: 15,
      length: 5,
      severity: 'high',
      message: 'Found error pattern',
      originalLine: 'This is an error line'
    };

    const match2: MatchResult = {
      matcher: matcher2,
      line: 20,
      column: 8,
      length: 4,
      severity: 'medium',
      message: 'Found warning pattern',
      originalLine: 'This is a warn line'
    };

    const match3: MatchResult = {
      matcher: matcher3,
      line: 30,
      column: 5,
      length: 4,
      severity: 'low',
      message: 'Found info pattern',
      originalLine: 'This is an info line'
    };

    return {
      filePath: '/test/file.log',
      totalLines: 100,
      matches: [match1, match2, match3],
      config,
      analysisTime: 50,
      summary: {
        totalMatches: 3,
        matchesBySeverity: {
          low: 1,
          medium: 1,
          high: 1,
          critical: 0
        },
        matchesByType: {
          error: 1,
          warning: 1,
          info: 1
        }
      },
      fileLinks: [],
      badgeCount: 3,
      documentChecksum: 'doc-checksum'
    };
  }
});