import * as assert from 'assert';
import * as vscode from 'vscode';
import { PatternMatcher } from '../../analysis/patternMatcher';
import { ConfigValidator } from '../../config/configValidator';
import { LogConfig, Matcher, MatchResult } from '../../types/configTypes';
import { randomUUID } from 'crypto';

suite('Ignore Pattern Tests', () => {
    let patternMatcher: PatternMatcher;
    let configValidator: ConfigValidator;
    let outputChannel: vscode.OutputChannel;

    setup(() => {
        outputChannel = vscode.window.createOutputChannel('Test IgnorePattern');
        patternMatcher = new PatternMatcher(outputChannel);
        configValidator = new ConfigValidator();
    });

    teardown(() => {
        if (patternMatcher) {
            patternMatcher.dispose();
        }
        if (outputChannel) {
            outputChannel.dispose();
        }
    });

    suite('Pattern Matching with Ignore Pattern', () => {
        test('Should ignore matches when ignore pattern matches', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: 'flaky',
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'This is an error message',           // Should match
                'This is a flaky error message',     // Should be ignored
                'Another error occurred',            // Should match
                'Error: flaky test failed',          // Should be ignored
                'Critical error in system'           // Should match
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 3, 'Should find 3 matches (ignoring 2 flaky lines)');
            assert.strictEqual(allMatches[0].line, 1, 'First match should be on line 1');
            assert.strictEqual(allMatches[1].line, 3, 'Second match should be on line 3');
            assert.strictEqual(allMatches[2].line, 5, 'Third match should be on line 5');
        });

        test('Should work without ignore pattern', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    // No ignorePattern
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'This is an error message',
                'This is a flaky error message',
                'Another error occurred'
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 3, 'Should find all 3 matches without ignore pattern');
        });

        test('Should handle case sensitivity in ignore pattern', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: 'FLAKY',
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true  // This should apply to both pattern and ignorePattern
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'This is an error message',           // Should match
                'This is a flaky error message',     // Should be ignored (case insensitive)
                'Error: FLAKY test failed',          // Should be ignored (exact case)
                'Error: FlaKy test failed'           // Should be ignored (mixed case)
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 1, 'Should find 1 match (ignoring 3 flaky lines)');
            assert.strictEqual(allMatches[0].line, 1, 'Only first line should match');
        });

        test('Should handle case sensitivity when ignoreCase is false', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: 'FLAKY',
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: false
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'This is an error message',           // Should match
                'This is a flaky error message',     // Should match (flaky != FLAKY)
                'Error: FLAKY test failed',          // Should not match pattern (Error != error)
                'error: FLAKY test failed'           // Should be ignored (FLAKY matches)
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 2, 'Should find 2 matches (case sensitive)');
            assert.strictEqual(allMatches[0].line, 1, 'First match should be on line 1');
            assert.strictEqual(allMatches[1].line, 2, 'Second match should be on line 2');
        });

        test('Should handle multiple matchers with different ignore patterns', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: 'flaky',
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true
                }, {
                    name: 'Warning Matcher',
                    type: 'warning',
                    severity: 'medium',
                    pattern: 'warning',
                    ignorePattern: 'expected',
                    color: '#FFA500',
                    minimap: true,
                    ignoreCase: true
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'This is an error message',               // Error match
                'This is a flaky error message',         // No match (ignored)
                'Warning: something happened',           // Warning match
                'Warning: expected behavior',            // No match (ignored)
                'Critical error and warning together',   // Both matches
                'Flaky warning expected'                 // No matches (both ignored)
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 4, 'Should find 4 matches total');
            
            const errorMatches = allMatches.filter(m => m.matcher.type === 'error');
            const warningMatches = allMatches.filter(m => m.matcher.type === 'warning');
            
            assert.strictEqual(errorMatches.length, 2, 'Should find 2 error matches');
            assert.strictEqual(warningMatches.length, 2, 'Should find 2 warning matches');
        });

        test('Should handle complex regex patterns in ignore pattern', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: '\\b(test|spec|flaky)\\b.*error',
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'Production error occurred',          // Should match
                'Test error in unit tests',          // Should be ignored
                'Spec error in specification',       // Should be ignored
                'Flaky error in CI',                 // Should be ignored
                'Error in testing environment',      // Should match (different pattern)
                'User error reported'                // Should match
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 3, 'Should find 3 matches (ignoring test/spec/flaky errors)');
            assert.strictEqual(allMatches[0].line, 1, 'First match should be on line 1');
            assert.strictEqual(allMatches[1].line, 5, 'Second match should be on line 5');
            assert.strictEqual(allMatches[2].line, 6, 'Third match should be on line 6');
        });

        test('Should handle multiline patterns in ignore pattern', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: '^.*error.*$',
                    ignorePattern: '^.*flaky.*$',
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true,
                    multiline: true
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'Start of error message',             // Should match
                'This is flaky error',               // Should be ignored
                'End of error message'               // Should match
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 2, 'Should find 2 matches (ignoring flaky line)');
        });
    });

    suite('Configuration Validation', () => {
        test('Should validate valid ignore pattern', () => {
            const config = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: 'flaky|test|spec',
                    color: '#FF0000',
                    minimap: true
                }]
            };

            const result = configValidator.validate(config);
            assert.ok(result.isValid, 'Config with valid ignore pattern should be valid');
            assert.strictEqual(result.errors.length, 0, 'Should have no validation errors');
        });

        test('Should reject invalid ignore pattern regex', () => {
            const config = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: '[invalid regex',  // Invalid regex
                    color: '#FF0000',
                    minimap: true
                }]
            };

            const result = configValidator.validate(config);
            assert.ok(!result.isValid, 'Config with invalid ignore pattern should be invalid');
            
            const ignorePatternError = result.errors.find(e => e.path.includes('ignorePattern'));
            assert.ok(ignorePatternError, 'Should have ignore pattern validation error');
            assert.ok(ignorePatternError.message.includes('Invalid ignore regex pattern'), 'Error message should mention invalid ignore regex');
        });

        test('Should validate empty ignore pattern', () => {
            const config = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: '',  // Empty ignore pattern
                    color: '#FF0000',
                    minimap: true
                }]
            };

            const result = configValidator.validate(config);
            assert.ok(result.isValid, 'Config with empty ignore pattern should be valid');
            assert.strictEqual(result.errors.length, 0, 'Should have no validation errors');
        });

        test('Should validate matcher without ignore pattern', () => {
            const config = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    // No ignorePattern property
                    color: '#FF0000',
                    minimap: true
                }]
            };

            const result = configValidator.validate(config);
            assert.ok(result.isValid, 'Config without ignore pattern should be valid');
            assert.strictEqual(result.errors.length, 0, 'Should have no validation errors');
        });
    });

    suite('Compilation Error Handling', () => {
        test('Should handle invalid ignore pattern gracefully during compilation', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: '[invalid',  // Invalid regex
                    color: '#FF0000',
                    minimap: true
                }],
                checksum: randomUUID()
            };

            // Should not throw during compilation
            patternMatcher.compile(config);
            
            // Should still compile the main pattern
            const compiledMatchers = patternMatcher.getCompiledMatchers();
            assert.strictEqual(compiledMatchers.length, 1, 'Should compile matcher despite invalid ignore pattern');
            assert.ok(compiledMatchers[0].regex, 'Should have main regex compiled');
            assert.ok(!compiledMatchers[0].ignoreRegex, 'Should not have ignore regex due to invalid pattern');
        });

        test('Should work normally when ignore pattern compilation fails', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Test Config',
                matchers: [{
                    name: 'Error Matcher',
                    type: 'error',
                    severity: 'high',
                    pattern: 'error',
                    ignorePattern: '[invalid',  // Invalid regex
                    color: '#FF0000',
                    minimap: true,
                    ignoreCase: true
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                'This is an error message',
                'This should also be an error'
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            // Should match both lines since ignore pattern failed to compile
            assert.strictEqual(allMatches.length, 2, 'Should match all lines when ignore pattern fails');
        });
    });

    suite('Real-world Examples', () => {
        test('Should handle Chromium log example from config file', () => {
            const config: LogConfig = {
                version: '1.0',
                name: 'Chromium Test Config',
                matchers: [{
                    name: 'Error Messages',
                    type: 'error',
                    severity: 'high',
                    pattern: '(error|fail|exception|crash)',
                    ignorePattern: 'flaky',
                    color: '#FF4444',
                    minimap: true,
                    description: 'Lines containing error-related keywords',
                    ignoreCase: true,
                    icon: '$(error)'
                }],
                checksum: randomUUID()
            };

            patternMatcher.compile(config);
            
            const testLines = [
                '[1234:5678] ERROR: Database connection failed',    // Should match
                '[1234:5679] FAIL: Network timeout occurred',      // Should match
                '[1234:5680] ERROR: Flaky test failed again',      // Should be ignored
                '[1234:5681] EXCEPTION: Memory allocation error',  // Should match
                '[1234:5682] CRASH: Application terminated',       // Should match
                '[1234:5683] WARN: This is just a warning',        // Should not match
                '[1234:5684] ERROR: Flaky connection issue'        // Should be ignored
            ];

            const allMatches: MatchResult[] = [];
            testLines.forEach((line, index) => {
                const matches = patternMatcher.matchLine(line, index + 1);
                allMatches.push(...matches);
            });

            assert.strictEqual(allMatches.length, 4, 'Should find 4 matches (ignoring 2 flaky errors)');
            
            // Verify the ignored lines
            const matchedLines = allMatches.map(m => m.line);
            assert.ok(matchedLines.includes(1), 'Should match line 1 (ERROR)');
            assert.ok(matchedLines.includes(2), 'Should match line 2 (FAIL)');
            assert.ok(!matchedLines.includes(3), 'Should not match line 3 (flaky ERROR)');
            assert.ok(matchedLines.includes(4), 'Should match line 4 (EXCEPTION)');
            assert.ok(matchedLines.includes(5), 'Should match line 5 (CRASH)');
            assert.ok(!matchedLines.includes(6), 'Should not match line 6 (WARN)');
            assert.ok(!matchedLines.includes(7), 'Should not match line 7 (flaky ERROR)');
        });
    });
});