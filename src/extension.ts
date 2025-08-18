// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConfigManager } from './config/configManager';
import { PatternMatcher } from './analysis/patternMatcher';
import { EnhancedTreeView } from './ui/enhancedTreeView';

let configManager: ConfigManager;
let patternMatcher: PatternMatcher;
let enhancedTreeView: EnhancedTreeView;
let treeView: vscode.TreeView<any>;
let outputChannel: vscode.OutputChannel;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Create shared output channel
	outputChannel = vscode.window.createOutputChannel('Flexible Log Analyzer');
	context.subscriptions.push(outputChannel);

	try {
		// Initialize the new configuration-driven system
		await initializeConfigurationSystem(context);
		
		// Register commands
		registerCommands(context);
		
		// Set up tree view
		setupTreeView(context);
		
		// Set up file watchers and auto-analysis
		setupFileWatchers(context);

		outputChannel.appendLine('Flexible Log Analyzer: Configuration system initialized successfully');
	} catch (error) {
		outputChannel.appendLine(`Failed to initialize Flexible Log Analyzer: ${error}`);
		vscode.window.showErrorMessage(`Failed to initialize Flexible Log Analyzer: ${error}`);
	}
}

async function initializeConfigurationSystem(context: vscode.ExtensionContext): Promise<void> {
	// Initialize configuration manager with shared output channel
	configManager = new ConfigManager(outputChannel);
	await configManager.initialize();
	
	// Initialize pattern matcher with shared output channel
	patternMatcher = new PatternMatcher(outputChannel);
	
	// Initialize enhanced tree view
	enhancedTreeView = new EnhancedTreeView(context);
}

function registerCommands(context: vscode.ExtensionContext): void {
	// Legacy hello world command
	const helloWorldCommand = vscode.commands.registerCommand('flexible-log-analyzer.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Flexible Log Analyzer!');
	});
	context.subscriptions.push(helloWorldCommand);

	// New configuration-driven analysis commands
	const analyzeCurrentFileCommand = vscode.commands.registerCommand('flexible-log-analyzer.analyzeCurrentFile', async () => {
		await analyzeCurrentFile();
	});
	context.subscriptions.push(analyzeCurrentFileCommand);

	// Configuration management commands
	const openConfigCommand = vscode.commands.registerCommand('flexible-log-analyzer.openConfiguration', async () => {
		await openConfigurationFile();
	});
	context.subscriptions.push(openConfigCommand);

	const createConfigCommand = vscode.commands.registerCommand('flexible-log-analyzer.createConfiguration', async () => {
		await createConfigurationFile();
	});
	context.subscriptions.push(createConfigCommand);

	// Legacy command mapping for backward compatibility
	const legacyRunScriptsCommand = vscode.commands.registerCommand('flexible-log-analyzer.runscripts.current', async () => {
		vscode.window.showWarningMessage(
			'Script-based analysis is deprecated. Using new configuration-based analysis.',
			'Learn More'
		).then(selection => {
			if (selection === 'Learn More') {
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/McCzarny/flexible-log-analyzer#migration'));
			}
		});
		await analyzeCurrentFile();
	});
	context.subscriptions.push(legacyRunScriptsCommand);
}

function setupTreeView(context: vscode.ExtensionContext): void {
	treeView = vscode.window.createTreeView('flexible-log-analyzer-view', {
		treeDataProvider: enhancedTreeView,
		showCollapseAll: true,
		canSelectMany: false
	});
	
	context.subscriptions.push(treeView);
	
	// Update tree view title with statistics
	treeView.title = 'Log Analysis Results';
}

function setupFileWatchers(context: vscode.ExtensionContext): void {
	// Auto-analyze when log files are opened
	const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(async (document) => {
		if (shouldAutoAnalyze(document)) {
			await analyzeDocument(document);
		}
	});
	context.subscriptions.push(onDidOpenTextDocument);

	// Auto-analyze when log files are saved
	const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (shouldAutoAnalyze(document)) {
			await analyzeDocument(document);
		}
	});
	context.subscriptions.push(onDidSaveTextDocument);

	// Auto-analyze when file content changes (with debouncing)
	let changeTimeout: NodeJS.Timeout;
	const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
		const document = event.document;
		if (shouldAutoAnalyze(document) && shouldAnalyzeOnChange()) {
			// Clear existing timeout
			if (changeTimeout) {
				clearTimeout(changeTimeout);
			}
			
			// Debounce the analysis to avoid too frequent updates
			changeTimeout = setTimeout(async () => {
				await analyzeDocument(document);
			}, getChangeAnalysisDelay());
		}
	});
	context.subscriptions.push(onDidChangeTextDocument);

	// Watch for configuration file changes and reload configurations
	const configWatcher = vscode.workspace.createFileSystemWatcher('**/.logconfig{,/**}');
	
	configWatcher.onDidCreate(async (uri) => {
		outputChannel.appendLine(`Configuration file created: ${uri.fsPath}`);
		await configManager.initialize();
	});
	
	configWatcher.onDidChange(async (uri) => {
		outputChannel.appendLine(`Configuration file changed: ${uri.fsPath}`);
		await configManager.initialize();
		
		// Re-analyze active file if auto-analysis is enabled
		if (vscode.window.activeTextEditor && shouldAutoAnalyze(vscode.window.activeTextEditor.document)) {
			await analyzeDocument(vscode.window.activeTextEditor.document);
		}
	});
	
	configWatcher.onDidDelete(async (uri) => {
		outputChannel.appendLine(`Configuration file deleted: ${uri.fsPath}`);
		await configManager.initialize();
	});
	
	context.subscriptions.push(configWatcher);

	// Auto-analyze currently active file on activation
	if (vscode.window.activeTextEditor) {
		const document = vscode.window.activeTextEditor.document;
		if (shouldAutoAnalyze(document)) {
			analyzeDocument(document);
		}
	}
}

function shouldAutoAnalyze(document: vscode.TextDocument): boolean {
	// Check if auto-analysis is enabled
	const config = vscode.workspace.getConfiguration('flexible-log-analyzer');
	const autoAnalysis = config.get<boolean>('autoAnalysis', true);
	
	if (!autoAnalysis) {
		return false;
	}

	// Check file patterns and size
	const fileName = document.fileName.toLowerCase();
	outputChannel.appendLine(`Checking auto-analysis for file: ${fileName}`);
	const logExtensions = ['.log', '.out', '.txt'];
	const hasLogExtension = logExtensions.some(ext => fileName.endsWith(ext));
	const hasNoExtension = fileName.indexOf('.') === -1;
	const result = hasLogExtension || !document.isUntitled || hasNoExtension;
	outputChannel.appendLine(`Auto-analysis result for ${fileName}: ${result}`);
	return result;
}

function shouldAnalyzeOnChange(): boolean {
	const config = vscode.workspace.getConfiguration('flexible-log-analyzer');
	return config.get<boolean>('enableAutoAnalysisOnChange', false);
}

function getChangeAnalysisDelay(): number {
	const config = vscode.workspace.getConfiguration('flexible-log-analyzer');
	return config.get<number>('changeAnalysisDelay', 1000);
}

async function analyzeCurrentFile(): Promise<void> {
	const activeEditor = vscode.window.activeTextEditor;
	if (!activeEditor) {
		vscode.window.showWarningMessage('No active file to analyze');
		return;
	}

	await analyzeDocument(activeEditor.document);
}

async function analyzeDocument(document: vscode.TextDocument): Promise<void> {
	try {
		// Show progress
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Analyzing ${document.fileName.split('/').pop()}`,
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 20, message: 'Loading configuration...' });
			
			// Get configuration for this file (this will also handle language mode change)
			const config = await configManager.getConfigForFile(document.fileName);
			if (!config) {
				return;
			}

			progress.report({ increment: 40, message: 'Analyzing patterns...' });
			
			// Analyze the file
			const result = await patternMatcher.analyzeFile(document.fileName, config);
			
			progress.report({ increment: 80, message: 'Updating results...' });
			
			// Update tree view
			enhancedTreeView.updateResults(result);
			
			// Update tree view title with statistics
			updateTreeViewTitle(result);
			
			progress.report({ increment: 100, message: 'Complete' });
			
			// Show summary
			const message = `Analysis complete: ${result.matches.length} issues found in ${result.totalLines} lines`;
			if (result.matches.length > 0) {
				vscode.window.showInformationMessage(message);
			}
		});
	} catch (error) {
		outputChannel.appendLine(`Error analyzing document: ${error}`);
		vscode.window.showErrorMessage(`Analysis failed: ${error}`);
	}
}

async function openConfigurationFile(): Promise<void> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showWarningMessage('No workspace folder open');
			return;
		}

		const configPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.logconfig');
		
		try {
			// Try to open existing config
			const document = await vscode.workspace.openTextDocument(configPath);
			await vscode.window.showTextDocument(document);
		} catch {
			// Config doesn't exist, offer to create it
			const createConfig = await vscode.window.showQuickPick([
				'Create new configuration',
				'Open global configuration (~/.logconfig)',
				'Cancel'
			], {
				placeHolder: 'Configuration file not found. What would you like to do?'
			});

			if (createConfig === 'Create new configuration') {
				await createConfigurationFile();
			} else if (createConfig === 'Open global configuration (~/.logconfig)') {
				const homeConfig = vscode.Uri.file(require('os').homedir() + '/.logconfig');
				try {
					const document = await vscode.workspace.openTextDocument(homeConfig);
					await vscode.window.showTextDocument(document);
				} catch {
					vscode.window.showWarningMessage('Global configuration file not found');
				}
			}
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to open configuration: ${error}`);
	}
}

async function createConfigurationFile(): Promise<void> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showWarningMessage('No workspace folder open');
			return;
		}

		const configPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.logconfig');
		const templateContent = getConfigurationTemplate();
		
		const encoder = new (require('util').TextEncoder)();
		await vscode.workspace.fs.writeFile(configPath, encoder.encode(templateContent));
		
		const document = await vscode.workspace.openTextDocument(configPath);
		await vscode.window.showTextDocument(document);

		vscode.window.showInformationMessage(`Created configuration template`);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to create configuration: ${error}`);
	}
}

function getConfigurationTemplate(): string {
	// Return basic template content - in a real implementation, 
	// you'd load these from template files
	const baseTemplate = `version: "1.0"
name: "Log Configuration"
description: "Basic configuration for log file analysis"

matchers:
  - name: "Error Messages"
    type: "error"
    severity: "high"
    pattern: '(error|fail|exception|crash)'
    color: "#FF4444"
    minimap: true
    description: "Lines containing error-related keywords"
    ignoreCase: true
    icon: "$(error)"
    
  - name: "Warning Messages"
    type: "warning"
    severity: "medium"
    pattern: '(warn|warning|caution|alert)'
    color: "#FFA500"
    minimap: true
    description: "Lines containing warning-related keywords"
    ignoreCase: true
    icon: "$(warning)"

groups:
  - name: "Critical Issues"
    description: "Fatal errors and critical problems"
    matchers: ["fatal", "error"]
    icon: "$(error)"
    color: "#FF0000"
    priority: 1
    
  - name: "Warnings"
    description: "Warning conditions"
    matchers: ["warning"]
    icon: "$(warning)"
    color: "#FFA500"
    priority: 2
`;

	return baseTemplate;
}

function updateTreeViewTitle(result: any): void {
	if (treeView) {
		const totalMatches = result.matches?.length || 0;
		const criticalCount = result.summary?.matchesBySeverity?.critical || 0;
		const highCount = result.summary?.matchesBySeverity?.high || 0;
		
		if (totalMatches > 0) {
			treeView.title = `Log Analysis Results (${totalMatches})`;
			if (criticalCount > 0 || highCount > 0) {
				treeView.title += ` ⚠️`;
			}
		} else {
			treeView.title = 'Log Analysis Results';
		}
	}
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (configManager) {
		configManager.dispose();
	}
	if (patternMatcher) {
		patternMatcher.dispose();
	}
	if (outputChannel) {
		outputChannel.dispose();
	}
}
