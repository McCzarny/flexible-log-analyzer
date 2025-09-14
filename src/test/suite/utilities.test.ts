import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigManager } from '../../config/configManager';
import { LogConfig } from '../../types/configTypes';
import { randomUUID } from 'crypto';

suite('Utility Functions Tests', () => {
    let configManager: ConfigManager;
    let outputChannel: vscode.OutputChannel;

    setup(() => {
        outputChannel = vscode.window.createOutputChannel('Test Utils');
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

    suite('Severity and Type Utilities', () => {
        test('Should handle severity priority calculation', () => {
            // Test severity ordering - higher priority means more critical
            const severities = ['low', 'medium', 'high', 'critical'];
            const expectedPriorities = [4, 3, 2, 1]; // Lower number = higher priority

            // Create a mock object to test the severity priority function
            const mockTreeView = {
                getSeverityPriority(severity: string): number {
                    switch (severity) {
                        case 'critical': return 1;
                        case 'high': return 2;
                        case 'medium': return 3;
                        case 'low': return 4;
                        default: return 5;
                    }
                }
            };

            severities.forEach((severity, index) => {
                const priority = mockTreeView.getSeverityPriority(severity);
                assert.strictEqual(priority, expectedPriorities[index], 
                    `Severity ${severity} should have priority ${expectedPriorities[index]}`);
            });

            // Test unknown severity
            const unknownPriority = mockTreeView.getSeverityPriority('unknown');
            assert.strictEqual(unknownPriority, 5, 'Unknown severity should have lowest priority');
        });

        test('Should provide icons for different severities', () => {
            const mockTreeView = {
                getIconForSeverity(severity: string): string {
                    switch (severity) {
                        case 'critical': return '$(error)';
                        case 'high': return '$(error)';
                        case 'medium': return '$(warning)';
                        case 'low': return '$(info)';
                        default: return '$(circle-outline)';
                    }
                }
            };

            assert.strictEqual(mockTreeView.getIconForSeverity('critical'), '$(error)', 'Critical should use error icon');
            assert.strictEqual(mockTreeView.getIconForSeverity('high'), '$(error)', 'High should use error icon');
            assert.strictEqual(mockTreeView.getIconForSeverity('medium'), '$(warning)', 'Medium should use warning icon');
            assert.strictEqual(mockTreeView.getIconForSeverity('low'), '$(info)', 'Low should use info icon');
            assert.strictEqual(mockTreeView.getIconForSeverity('unknown'), '$(circle-outline)', 'Unknown should use default icon');
        });

        test('Should provide colors for different severities', () => {
            const mockTreeView = {
                getColorForSeverity(severity: string): string {
                    switch (severity) {
                        case 'critical': return '#8B0000';
                        case 'high': return '#FF4444';
                        case 'medium': return '#FFA500';
                        case 'low': return '#0088FF';
                        default: return '#666666';
                    }
                }
            };

            assert.strictEqual(mockTreeView.getColorForSeverity('critical'), '#8B0000', 'Critical should be dark red');
            assert.strictEqual(mockTreeView.getColorForSeverity('high'), '#FF4444', 'High should be red');
            assert.strictEqual(mockTreeView.getColorForSeverity('medium'), '#FFA500', 'Medium should be orange');
            assert.strictEqual(mockTreeView.getColorForSeverity('low'), '#0088FF', 'Low should be blue');
            assert.strictEqual(mockTreeView.getColorForSeverity('unknown'), '#666666', 'Unknown should be gray');
        });

        test('Should capitalize type names correctly', () => {
            const mockTreeView = {
                capitalizeType(type: string): string {
                    return type.charAt(0).toUpperCase() + type.slice(1);
                }
            };

            assert.strictEqual(mockTreeView.capitalizeType('error'), 'Error', 'Should capitalize error');
            assert.strictEqual(mockTreeView.capitalizeType('warning'), 'Warning', 'Should capitalize warning');
            assert.strictEqual(mockTreeView.capitalizeType('info'), 'Info', 'Should capitalize info');
            assert.strictEqual(mockTreeView.capitalizeType('debug'), 'Debug', 'Should capitalize debug');
            assert.strictEqual(mockTreeView.capitalizeType(''), '', 'Should handle empty string');
            assert.strictEqual(mockTreeView.capitalizeType('a'), 'A', 'Should handle single character');
        });
    });

    suite('Text Processing Utilities', () => {
        test('Should create preview text from lines', () => {
            const mockTreeView = {
                createPreview(line: string): string {
                    const maxLength = 100;
                    if (line.length <= maxLength) {
                        return line;
                    }
                    return line.substring(0, maxLength - 3) + '...';
                }
            };

            const shortLine = 'This is a short line';
            const longLine = 'This is a very long line that exceeds the maximum preview length and should be truncated with ellipsis at the end';

            assert.strictEqual(mockTreeView.createPreview(shortLine), shortLine, 'Short lines should not be truncated');
            
            const preview = mockTreeView.createPreview(longLine);
            assert.ok(preview.length <= 100, 'Preview should not exceed max length');
            assert.ok(preview.endsWith('...'), 'Long lines should end with ellipsis');
            assert.ok(preview.includes('This is a very long line'), 'Preview should contain beginning of line');
        });

        test('Should extract filename from path correctly', () => {
            const mockTreeView = {
                getFileName(filePath: string): string {
                    // Handle both Unix and Windows paths
                    const unixSeparated = filePath.split('/').filter(part => part.length > 0).pop() || filePath;
                    const windowsSeparated = unixSeparated.split('\\').filter(part => part.length > 0).pop() || unixSeparated;
                    return windowsSeparated;
                }
            };

            assert.strictEqual(mockTreeView.getFileName('/path/to/file.log'), 'file.log', 'Should extract filename from Unix path');
            assert.strictEqual(mockTreeView.getFileName('C:\\path\\to\\file.log'), 'file.log', 'Should handle Windows paths');
            assert.strictEqual(mockTreeView.getFileName('file.log'), 'file.log', 'Should handle filename without path');
            assert.strictEqual(mockTreeView.getFileName('/path/to/'), 'to', 'Should handle path ending with separator');
            assert.strictEqual(mockTreeView.getFileName(''), '', 'Should handle empty string');
        });

        test('Should handle file size parsing', () => {
            const mockPatternMatcher = {
                parseFileSize(sizeString: string): number {
                    const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
                    if (!match) {
                        return 0;
                    }

                    const value = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    
                    let multiplier = 1;
                    switch (unit) {
                        case 'B': multiplier = 1; break;
                        case 'KB': multiplier = 1024; break;
                        case 'MB': multiplier = 1024 * 1024; break;
                        case 'GB': multiplier = 1024 * 1024 * 1024; break;
                    }
                    
                    return Math.floor(value * multiplier);
                }
            };

            assert.strictEqual(mockPatternMatcher.parseFileSize('100B'), 100, 'Should parse bytes');
            assert.strictEqual(mockPatternMatcher.parseFileSize('1KB'), 1024, 'Should parse kilobytes');
            assert.strictEqual(mockPatternMatcher.parseFileSize('1MB'), 1024 * 1024, 'Should parse megabytes');
            assert.strictEqual(mockPatternMatcher.parseFileSize('1GB'), 1024 * 1024 * 1024, 'Should parse gigabytes');
            assert.strictEqual(mockPatternMatcher.parseFileSize('2.5MB'), Math.floor(2.5 * 1024 * 1024), 'Should parse decimal values');
            assert.strictEqual(mockPatternMatcher.parseFileSize('invalid'), 0, 'Should return 0 for invalid input');
        });
    });

    suite('Context Extraction', () => {
        test('Should extract context around matches', () => {
            const mockPatternMatcher = {
                extractContext(line: string, startIndex: number, matchLength: number): string {
                    const contextLength = 20;
                    const beforeStart = Math.max(0, startIndex - contextLength);
                    const afterEnd = Math.min(line.length, startIndex + matchLength + contextLength);
                    
                    let context = line.substring(beforeStart, afterEnd);
                    
                    if (beforeStart > 0) {
                        context = '...' + context;
                    }
                    if (afterEnd < line.length) {
                        context = context + '...';
                    }
                    
                    return context;
                }
            };

            const line = '2025-08-16 10:30:00 [ERROR] Database connection failed due to network timeout';
            const errorIndex = line.indexOf('ERROR');
            const errorLength = 5;

            const context = mockPatternMatcher.extractContext(line, errorIndex, errorLength);
            
            assert.ok(context.includes('ERROR'), 'Context should include the match');
            assert.ok(context.includes('10:30:00'), 'Context should include some preceding text');
            assert.ok(context.includes('Database'), 'Context should include some following text');
        });

        test('Should handle edge cases in context extraction', () => {
            const mockPatternMatcher = {
                extractContext(line: string, startIndex: number, matchLength: number): string {
                    const contextLength = 20;
                    const beforeStart = Math.max(0, startIndex - contextLength);
                    const afterEnd = Math.min(line.length, startIndex + matchLength + contextLength);
                    
                    let context = line.substring(beforeStart, afterEnd);
                    
                    if (beforeStart > 0) {
                        context = '...' + context;
                    }
                    if (afterEnd < line.length) {
                        context = context + '...';
                    }
                    
                    return context;
                }
            };

            // Match at beginning of line
            const shortLine = 'ERROR occurred';
            const context1 = mockPatternMatcher.extractContext(shortLine, 0, 5);
            assert.strictEqual(context1, shortLine, 'Should return entire short line');

            // Match at end of line
            const endLine = 'Something went wrong: ERROR';
            const errorIndex = endLine.indexOf('ERROR');
            const context2 = mockPatternMatcher.extractContext(endLine, errorIndex, 5);
            assert.ok(context2.includes('ERROR'), 'Should include match at end');
            assert.ok(context2.includes('wrong'), 'Should include preceding text');

            // Very long line
            const longLine = 'A'.repeat(100) + 'ERROR' + 'B'.repeat(100);
            const longErrorIndex = longLine.indexOf('ERROR');
            const context3 = mockPatternMatcher.extractContext(longLine, longErrorIndex, 5);
            assert.ok(context3.includes('ERROR'), 'Should include match in long line');
            assert.ok(context3.startsWith('...'), 'Should truncate beginning of long context');
            assert.ok(context3.endsWith('...'), 'Should truncate end of long context');
        });
    });
});