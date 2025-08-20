import * as assert from 'assert';
import * as vscode from 'vscode';
import { EnhancedTreeView } from '../../ui/enhancedTreeView';
import { AnalysisResult } from '../../types/configTypes';
import { randomUUID } from 'crypto';

suite('EnhancedTreeView Cache Management Tests', () => {
    let treeView: EnhancedTreeView;
    let context: vscode.ExtensionContext;

    setup(() => {
        // Create a mock extension context
        context = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                setKeysForSync: () => {},
                keys: () => []
            },
            extensionPath: '/test/path',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/log',
            extensionUri: vscode.Uri.file('/test/path'),
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
            extension: {} as any
        } as vscode.ExtensionContext;

        treeView = new EnhancedTreeView(context);
    });

    teardown(() => {
        // Clean up
        if (treeView) {
            treeView.clearResults();
        }
    });

    suite('Cache Validation', () => {
        test('Should validate cache based on checksum', () => {
            const filePath = '/test/file.log';
            const checksum1 = 'abc123';
            const checksum2 = 'def456';

            // Initially no cache
            assert.ok(!treeView.isCacheValid(filePath, checksum1), 'Should not be valid when no cache exists');

            // Add a result to cache
            const result: AnalysisResult = {
                filePath,
                totalLines: 100,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: checksum1 },
                analysisTime: 50,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            treeView.updateResults(result);

            assert.equal(treeView.getCachedResultForTesting(filePath)?.config.checksum, checksum1, 'Should return cached result with matching checksum');

            // Should be valid with same checksum
            assert.ok(treeView.isCacheValid(filePath, checksum1), 'Should be valid with matching checksum');

            // Should not be valid with different checksum
            assert.ok(!treeView.isCacheValid(filePath, checksum2), 'Should not be valid with different checksum');
        });

        test('Should invalidate cache when checksum changes', () => {
            const filePath = '/test/file.log';
            const checksum1 = 'abc123';
            const checksum2 = 'def456';

            const result: AnalysisResult = {
                filePath,
                totalLines: 100,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: checksum1 },
                analysisTime: 50,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            treeView.updateResults(result);

            // Get cached result with original checksum
            const cachedResult1 = treeView.getCachedResult(filePath, checksum1);
            assert.ok(cachedResult1, 'Should return cached result with matching checksum');

            // Try to get cached result with different checksum
            const cachedResult2 = treeView.getCachedResult(filePath, checksum2);
            assert.strictEqual(cachedResult2, undefined, 'Should return undefined with different checksum');

            // Verify cache was actually removed
            const cachedResult3 = treeView.getCachedResult(filePath, checksum1);
            assert.strictEqual(cachedResult3, undefined, 'Should return undefined after cache invalidation');
        });
    });

    suite('Configuration Path Invalidation', () => {
        test('Should invalidate cache by configuration path', () => {
            const configPath = '/workspace/.logconfig';
            const file1 = '/workspace/file1.log';
            const file2 = '/workspace/file2.log';
            const file3 = '/other/file3.log';

            // Add results for multiple files
            const result1: AnalysisResult = {
                filePath: file1,
                totalLines: 100,
                matches: [],
                config: { version: '1.0', name: 'Workspace Config', matchers: [], checksum: 'workspace_config_v1' },
                analysisTime: 50,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: configPath,
            };

            const result2: AnalysisResult = {
                filePath: file2,
                totalLines: 200,
                matches: [],
                config: { version: '1.0', name: 'Workspace Config', matchers: [], checksum: 'workspace_config_v2' },
                analysisTime: 75,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: configPath,
            };

            const result3: AnalysisResult = {
                filePath: file3,
                totalLines: 150,
                matches: [],
                config: { version: '1.0', name: 'Other Config', matchers: [], checksum: 'other_config_v1' },
                analysisTime: 60,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/other/.logconfig',
            };

            treeView.updateResults(result1);
            treeView.updateResults(result2);
            treeView.updateResults(result3);

            // Verify all are cached
            assert.ok(treeView.isCacheValid(file1, 'workspace_config_v1'), 'File1 should be cached');
            assert.ok(treeView.isCacheValid(file2, 'workspace_config_v2'), 'File2 should be cached');
            assert.ok(treeView.isCacheValid(file3, 'other_config_v1'), 'File3 should be cached');

            // Invalidate workspace config
            const invalidatedFiles = treeView.invalidateCacheForConfigPath(configPath);

            // Should return the files that were invalidated
            assert.strictEqual(invalidatedFiles.length, 2, 'Should invalidate 2 files');
            assert.ok(invalidatedFiles.includes(file1), 'Should invalidate file1');
            assert.ok(invalidatedFiles.includes(file2), 'Should invalidate file2');
            assert.ok(!invalidatedFiles.includes(file3), 'Should not invalidate file3');

            // Verify cache state after invalidation
            assert.ok(!treeView.isCacheValid(file1, 'workspace_config_v1'), 'File1 should not be cached');
            assert.ok(!treeView.isCacheValid(file2, 'workspace_config_v1'), 'File2 should not be cached');
            assert.ok(treeView.isCacheValid(file3, 'other_config_v1'), 'File3 should still be cached');
        });

        test('Should handle non-existent configuration path', () => {
            const configPath = '/nonexistent/.logconfig';
            
            // Should not throw and return empty array
            const invalidatedFiles = treeView.invalidateCacheForConfigPath(configPath);
            assert.strictEqual(invalidatedFiles.length, 0, 'Should return empty array for non-existent config path');
        });
    });

    suite('Result Management', () => {
        test('Should update results and maintain cache', () => {
            const filePath = '/test/file.log';
            const result: AnalysisResult = {
                filePath,
                totalLines: 100,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: 'test_checksum' },
                analysisTime: 50,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            // Initially should not be cached
            assert.ok(!treeView.isCacheValid(filePath, 'test_checksum'), 'Should not be cached initially');

            // Update results
            treeView.updateResults(result);

            // Should now be cached
            assert.ok(treeView.isCacheValid(filePath, 'test_checksum'), 'Should be cached after update');

            // Should be able to retrieve cached result
            const cachedResult = treeView.getCachedResult(filePath, 'test_checksum');
            assert.ok(cachedResult, 'Should retrieve cached result');
            assert.strictEqual(cachedResult.filePath, filePath, 'Cached result should match original');
            assert.strictEqual(cachedResult.totalLines, 100, 'Cached result should have correct data');
        });

        test('Should remove specific file results', () => {
            const filePath1 = '/test/file1.log';
            const filePath2 = '/test/file2.log';

            const result1: AnalysisResult = {
                filePath: filePath1,
                totalLines: 100,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: 'test_checksum'},
                analysisTime: 50,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            const result2: AnalysisResult = {
                filePath: filePath2,
                totalLines: 200,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: 'test_checksum' },
                analysisTime: 75,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            treeView.updateResults(result1);
            treeView.updateResults(result2);

            // Both should be cached
            assert.ok(treeView.isCacheValid(filePath1, 'test_checksum'), 'File1 should be cached');
            assert.ok(treeView.isCacheValid(filePath2, 'test_checksum'), 'File2 should be cached');

            // Remove file1
            treeView.removeResults(filePath1);

            // File1 should be removed, file2 should remain
            assert.ok(!treeView.isCacheValid(filePath1, 'test_checksum'), 'File1 should be removed');
            assert.ok(treeView.isCacheValid(filePath2, 'test_checksum'), 'File2 should remain cached');
        });

        test('Should clear all results', () => {
            const filePath1 = '/test/file1.log';
            const filePath2 = '/test/file2.log';

            const result1: AnalysisResult = {
                filePath: filePath1,
                totalLines: 100,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: 'test_checksum' },
                analysisTime: 50,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            const result2: AnalysisResult = {
                filePath: filePath2,
                totalLines: 200,
                matches: [],
                config: { version: '1.0', name: 'Test Config', matchers: [], checksum: 'test_checksum' },
                analysisTime: 75,
                summary: { totalMatches: 0, matchesBySeverity: {} as any, matchesByType: {} as any },
                configPath: '/test/.logconfig',
            };

            treeView.updateResults(result1);
            treeView.updateResults(result2);

            // Both should be cached
            assert.ok(treeView.isCacheValid(filePath1, 'test_checksum'), 'File1 should be cached');
            assert.ok(treeView.isCacheValid(filePath2, 'test_checksum'), 'File2 should be cached');

            // Clear all results
            treeView.clearResults();

            // Both should be removed
            assert.ok(!treeView.isCacheValid(filePath1, 'test_checksum'), 'File1 should be cleared');
            assert.ok(!treeView.isCacheValid(filePath2, 'test_checksum'), 'File2 should be cleared');
        });
    });
});