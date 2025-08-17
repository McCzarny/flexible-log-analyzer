import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { ConfigManager } from '../../config/configManager';
import { PatternMatcher } from '../../analysis/patternMatcher';
import { LogConfig, MatchResult } from '../../types/configTypes';

// Unit tests that don't require VS Code API
suite('Unit Tests', () => {

	suite('Log Parsing Tests', () => {
		let configManager: ConfigManager;
		let patternMatcher: PatternMatcher;
		let outputChannel: vscode.OutputChannel;
		
		setup(() => {
			// Create a shared output channel for testing
			outputChannel = vscode.window.createOutputChannel('Test Log Analyzer');
			configManager = new ConfigManager(outputChannel);
			patternMatcher = new PatternMatcher(outputChannel);
		});
		
		teardown(() => {
			if (configManager) {
				configManager.dispose();
			}
			if (patternMatcher) {
				patternMatcher.dispose();
			}
			if (outputChannel) {
				outputChannel.dispose();
			}
		});

		test('Should parse chromium.yaml configuration correctly', async () => {
			// Load the chromium configuration from testdir
			const testConfigPath = path.join(__dirname, '../../../testdir/.logconfig/chromium.yaml');
			const configUri = vscode.Uri.file(testConfigPath);
			
			try {
				const content = await vscode.workspace.fs.readFile(configUri);
				const configText = content.toString();
				
				// Parse the YAML configuration using proper YAML parser
				const config = yaml.load(configText) as LogConfig;
				
				// Validate the parsed configuration structure
				assert.ok(config, 'Configuration should be parsed');
				assert.strictEqual(config.version, '1.0', 'Version should be 1.0');
				assert.strictEqual(config.name, 'Chromium log configuration', 'Name should match');
				assert.strictEqual(config.description, 'Basic configuration for Chromium log file analysis', 'Description should match');
				assert.ok(config.matchers, 'Matchers should exist');
				assert.ok(config.matchers.length > 0, 'Should have at least one matcher');
				
				// Check specific matchers
				const errorMatcher = config.matchers.find(m => m.name === 'Error Messages');
				assert.ok(errorMatcher, 'Error Messages matcher should exist');
				assert.strictEqual(errorMatcher.type, 'error', 'Error matcher type should be error');
				assert.strictEqual(errorMatcher.severity, 'high', 'Error matcher severity should be high');
				assert.strictEqual(errorMatcher.color, '#FF4444', 'Error matcher color should be red');
				assert.strictEqual(errorMatcher.ignoreCase, true, 'Error matcher should ignore case');
				
				const warningMatcher = config.matchers.find(m => m.name === 'Warning Messages');
				assert.ok(warningMatcher, 'Warning Messages matcher should exist');
				assert.strictEqual(warningMatcher.severity, 'medium', 'Warning matcher severity should be medium');
				assert.strictEqual(warningMatcher.type, 'warning', 'Warning matcher type should be warning');
				
				const fatalMatcher = config.matchers.find(m => m.name === 'Fatal/Critical');
				assert.ok(fatalMatcher, 'Fatal/Critical matcher should exist');
				assert.strictEqual(fatalMatcher.severity, 'critical', 'Fatal matcher severity should be critical');
				assert.strictEqual(fatalMatcher.type, 'fatal', 'Fatal matcher type should be fatal');
				
				// Check file patterns
				assert.ok(config.filePatterns, 'File patterns should exist');
				assert.ok(Array.isArray(config.filePatterns), 'File patterns should be an array');
				assert.ok(config.filePatterns.includes('*.log'), 'Should include *.log pattern');
				assert.ok(config.filePatterns.includes('*.out'), 'Should include *.out pattern');
				assert.ok(config.filePatterns.includes('*.txt'), 'Should include *.txt pattern');
				
				// Check detector
				assert.ok(config.detector, 'Detector should exist');
				assert.strictEqual(config.detector.type, 'first-line', 'Detector type should be first-line');
				assert.ok(config.detector.pattern.length > 0, 'Detector pattern should not be empty');
				assert.strictEqual(config.detector.pattern, '^\\[.*\\] .*$', 'Detector pattern should match expected regex');
				
				// Check performance settings
				assert.ok(config.performance, 'Performance settings should exist');
				assert.strictEqual(config.performance.maxLinesPerAnalysis, 25000, 'Max lines should be 25000');
				assert.strictEqual(config.performance.analysisTimeout, 30, 'Analysis timeout should be 30');
				assert.strictEqual(config.performance.cacheResults, true, 'Cache results should be true');
				assert.strictEqual(config.performance.debounceInterval, 500, 'Debounce interval should be 500');
				
				// Check highlighting rules exist
				assert.ok(config.highlighting, 'Highlighting rules should exist');
				assert.ok(Array.isArray(config.highlighting), 'Highlighting should be an array');
				
				// Check groups exist
				assert.ok(config.groups, 'Groups should exist');
				assert.ok(Array.isArray(config.groups), 'Groups should be an array');
				
				// Check changeLanguageMode flag in detector
				assert.ok(config.detector, 'Detector should exist');
				assert.strictEqual(config.detector.changeLanguageMode, true, 'changeLanguageMode should be true in detector');
				assert.strictEqual(typeof config.detector.changeLanguageMode, 'boolean', 'changeLanguageMode should be a boolean');
				
			} catch (error) {
				assert.fail(`Failed to load or parse chromium.yaml: ${error}`);
			}
		});

		test('Should match patterns in Chromium log file', async () => {
			// Sample log lines from the Chromium log
			const logLines = [
				'[91167:11504282:0816/095805.977857:ERROR:chrome/browser/mac/code_sign_clone_manager.mm:98] error removing quarantine attribute "/var/folders/x6/g5skccc96j70w72tchlflfw40000gn/X/"',
				'[91167:11503885:0816/095806.172187:WARNING:chrome/browser/signin/account_consistency_mode_manager.cc:73] Desktop Identity Consistency cannot be enabled as no OAuth client ID and client secret have been configured.',
				'[91167:11503885:0816/095807.749393:INFO:CONSOLE:183] "%s service worker initialized 2025-08-16T07:58:07.744Z", source: chrome-extension://mnloefcpaepkpmhaoipjkpikbnkmbnic/background.js (183)',
				'[91167:11503885:0816/095814.943324:FATAL:base/threading/thread_restrictions.cc:165] DCHECK failed: !tls_base_sync_primitives_disallowed.',
				'[91167:11504369:0816/095813.723682:ERROR:google_apis/gcm/engine/registration_request.cc:291] Registration response error message: QUOTA_EXCEEDED'
			];
			
			// Create a simplified configuration for testing
			const testConfig: LogConfig = {
				version: '1.0',
				name: 'Test Chromium Config',
				matchers: [
					{
						name: 'Error Messages',
						type: 'error',
						severity: 'high',
						pattern: '(error|fail|exception|crash)',
						color: '#FF4444',
						minimap: true,
						ignoreCase: true,
						icon: '$(error)'
					},
					{
						name: 'Warning Messages',
						type: 'warning',
						severity: 'medium',
						pattern: '(warn|warning|caution|alert)',
						color: '#FFA500',
						minimap: true,
						ignoreCase: true,
						icon: '$(warning)'
					},
					{
						name: 'Fatal/Critical',
						type: 'fatal',
						severity: 'critical',
						pattern: '(fatal|critical|severe)',
						color: '#8B0000',
						minimap: true,
						ignoreCase: true,
						icon: '$(error)'
					}
				]
			};
			
			// Compile the configuration first
			patternMatcher.compile(testConfig);
			
			// Test pattern matching
			const results: MatchResult[] = [];
			
			for (let i = 0; i < logLines.length; i++) {
				const line = logLines[i];
				const lineMatches = patternMatcher.matchLine(line, i + 1);
				results.push(...lineMatches);
			}
			
			// Verify results
			assert.ok(results.length > 0, 'Should find at least one match');
			
			// Check for specific matches
			const errorMatches = results.filter(r => r.matcher.type === 'error');
			assert.ok(errorMatches.length >= 2, 'Should find at least 2 error matches');
			
			const warningMatches = results.filter(r => r.matcher.type === 'warning');
			assert.ok(warningMatches.length >= 1, 'Should find at least 1 warning match');
			
			const fatalMatches = results.filter(r => r.matcher.type === 'fatal');
			assert.ok(fatalMatches.length >= 1, 'Should find at least 1 fatal match');
			
			// Check severity distribution
			const criticalMatches = results.filter(r => r.severity === 'critical');
			const highMatches = results.filter(r => r.severity === 'high');
			const mediumMatches = results.filter(r => r.severity === 'medium');
			
			assert.ok(criticalMatches.length > 0, 'Should have critical severity matches');
			assert.ok(highMatches.length > 0, 'Should have high severity matches');
			assert.ok(mediumMatches.length > 0, 'Should have medium severity matches');
		});

		test('Should detect Chromium log format from file content', async () => {
			const chromiumLogLine = '[91167:11504282:0816/095805.977857:ERROR:chrome/browser/mac/code_sign_clone_manager.mm:98] error removing quarantine attribute';
			
			// Test detector pattern from chromium.yaml
			const detectorPattern = '^\\[.*\\] .*$';
			const regex = new RegExp(detectorPattern);
			
			assert.ok(regex.test(chromiumLogLine), 'Chromium log line should match detector pattern');
			
			// Test non-matching lines
			const nonChromiumLines = [
				'2025-08-16 09:58:05 ERROR: some error message',
				'INFO: regular log message',
				'plain text without brackets'
			];
			
			for (const line of nonChromiumLines) {
				assert.ok(!regex.test(line), `Line "${line}" should not match Chromium pattern`);
			}
		});

		test('Should handle regex special characters in patterns', async () => {
			const testLines = [
				'Registration response error message: QUOTA_EXCEEDED',
				'Connection failed: timeout',
				'DCHECK failed: assertion error'
			];
			
			const patterns = [
				'(error|fail|exception|crash)',
				'(timeout|timed out|time.*out)',
				'DCHECK failed'
			];
			
			for (let i = 0; i < patterns.length; i++) {
				const pattern = patterns[i];
				const line = testLines[i];
				
				try {
					const regex = new RegExp(pattern, 'i');
					const match = regex.test(line);
					assert.ok(match, `Pattern "${pattern}" should match line "${line}"`);
				} catch (error) {
					assert.fail(`Pattern "${pattern}" should be valid regex: ${error}`);
				}
			}
		});

		test('Should parse performance settings from configuration', async () => {
			const testConfigYaml = `
version: "1.0"
name: "Test Config"
matchers:
  - name: "Test Matcher"
    type: "error"
    severity: "high"
    pattern: "error"
    color: "#FF0000"
    minimap: true
performance:
  maxLinesPerAnalysis: 25000
  analysisTimeout: 30
  cacheResults: true
  debounceInterval: 500
`;
			
			const config = yaml.load(testConfigYaml) as LogConfig;
			
			assert.ok(config.performance, 'Performance settings should exist');
			assert.strictEqual(config.performance.maxLinesPerAnalysis, 25000, 'maxLinesPerAnalysis should be 25000');
			assert.strictEqual(config.performance.analysisTimeout, 30, 'analysisTimeout should be 30');
			assert.strictEqual(config.performance.cacheResults, true, 'cacheResults should be true');
			assert.strictEqual(config.performance.debounceInterval, 500, 'debounceInterval should be 500');
		});
	});
});
