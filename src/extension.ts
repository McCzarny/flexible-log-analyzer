// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { ConfigManager } from "./config/configManager";
import { PatternMatcher } from "./analysis/patternMatcher";
import { EnhancedTreeView } from "./ui/enhancedTreeView";
import { MinimapDecorationService } from "./ui/minimapDecorations";

let configManager: ConfigManager;
let patternMatcher: PatternMatcher;
let enhancedTreeView: EnhancedTreeView;
let minimapService: MinimapDecorationService;
let treeView: vscode.TreeView<any>;
let outputChannel: vscode.OutputChannel;

// Deduplication mechanism to prevent double analysis
const analysisInProgress = new Map<string, boolean>();

// Per-file change tracking for debounced analysis
const changeTimeouts = new Map<string, NodeJS.Timeout>();
const lastAnalysisTime = new Map<string, number>();
const FORCED_ANALYSIS_INTERVAL = 5000; // Force analysis every 5 seconds for frequently changing files

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Create shared output channel
  outputChannel = vscode.window.createOutputChannel("Flexible Log Analyzer");
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

    // Set up file link click handling
    setupFileLinkHandling(context);

    outputChannel.appendLine(
      "Flexible Log Analyzer: Configuration system initialized successfully"
    );
  } catch (error) {
    outputChannel.appendLine(
      `Failed to initialize Flexible Log Analyzer: ${error}`
    );
    vscode.window.showErrorMessage(
      `Failed to initialize Flexible Log Analyzer: ${error}`
    );
  }
}

async function initializeConfigurationSystem(
  context: vscode.ExtensionContext
): Promise<void> {
  // Initialize configuration manager with shared output channel
  configManager = new ConfigManager(outputChannel);
  await configManager.initialize();

  // Initialize pattern matcher with shared output channel
  patternMatcher = new PatternMatcher(outputChannel);

  // Initialize enhanced tree view
  enhancedTreeView = new EnhancedTreeView(context);

  // Initialize minimap decoration service
  minimapService = new MinimapDecorationService(outputChannel);
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Legacy hello world command
  const helloWorldCommand = vscode.commands.registerCommand(
    "flexible-log-analyzer.helloWorld",
    () => {
      vscode.window.showInformationMessage(
        "Hello World from Flexible Log Analyzer!"
      );
    }
  );
  context.subscriptions.push(helloWorldCommand);

  // New configuration-driven analysis commands
  const analyzeCurrentFileCommand = vscode.commands.registerCommand(
    "flexible-log-analyzer.analyzeCurrentFile",
    async () => {
      await analyzeCurrentFile();
    }
  );
  context.subscriptions.push(analyzeCurrentFileCommand);

  // Configuration management commands
  const openConfigCommand = vscode.commands.registerCommand(
    "flexible-log-analyzer.openConfiguration",
    async () => {
      await openConfigurationFile();
    }
  );
  context.subscriptions.push(openConfigCommand);

  const createConfigCommand = vscode.commands.registerCommand(
    "flexible-log-analyzer.createConfiguration",
    async () => {
      await createConfigurationFile();
    }
  );
  context.subscriptions.push(createConfigCommand);

  // Minimap toggle command
  const toggleMinimapCommand = vscode.commands.registerCommand(
    "flexible-log-analyzer.toggleMinimap",
    async () => {
      await toggleMinimapDecorations();
    }
  );
  context.subscriptions.push(toggleMinimapCommand);

  // Legacy command mapping for backward compatibility
  const legacyRunScriptsCommand = vscode.commands.registerCommand(
    "flexible-log-analyzer.runscripts.current",
    async () => {
      vscode.window
        .showWarningMessage(
          "Script-based analysis is deprecated. Using new configuration-based analysis.",
          "Learn More"
        )
        .then((selection) => {
          if (selection === "Learn More") {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/McCzarny/flexible-log-analyzer#migration"
              )
            );
          }
        });
      await analyzeCurrentFile();
    }
  );
  context.subscriptions.push(legacyRunScriptsCommand);
}

function setupTreeView(context: vscode.ExtensionContext): void {
  treeView = vscode.window.createTreeView("flexible-log-analyzer-view", {
    treeDataProvider: enhancedTreeView,
    showCollapseAll: true,
    canSelectMany: false,
  });

  context.subscriptions.push(treeView);
}

function setupFileLinkHandling(context: vscode.ExtensionContext): void {
  // Register DefinitionProvider for file links - provides "Go to Definition" functionality
  const fileLinkProvider = patternMatcher.getFileLinkProvider();
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    "*",
    fileLinkProvider
  );

  context.subscriptions.push(definitionProvider);

  outputChannel.appendLine(
    "File link DefinitionProvider registered - use F12 or Ctrl+Click on file paths to navigate"
  );
}

function setupFileWatchers(context: vscode.ExtensionContext): void {
  // Auto-analyze when log files are opened
  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(
    async (document) => {
      // Ignore anything that is not a file
      if (document.uri.scheme !== "file") {
        return;
      }

      const fileName = document.fileName.split("/").pop() || document.fileName;
      const timestamp = new Date().toISOString();
      outputChannel.appendLine(
        `[DEBUG ${timestamp}] onDidOpenTextDocument fired for: ${fileName}`
      );
      if (shouldAutoAnalyze(document)) {
        outputChannel.appendLine(
          `[DEBUG ${timestamp}] Triggering analysis from onDidOpenTextDocument for: ${fileName}`
        );
        await analyzeDocument(document);
      }
    }
  );
  context.subscriptions.push(onDidOpenTextDocument);

  // Auto-analyze when log files are saved
  const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      const fileName = document.fileName.split("/").pop() || document.fileName;
      const timestamp = new Date().toISOString();
      outputChannel.appendLine(
        `[DEBUG ${timestamp}] onDidSaveTextDocument fired for: ${fileName}`
      );
      if (shouldAutoAnalyze(document)) {
        outputChannel.appendLine(
          `[DEBUG ${timestamp}] Triggering analysis from onDidSaveTextDocument for: ${fileName}`
        );
        await analyzeDocument(document);
      }
    }
  );
  context.subscriptions.push(onDidSaveTextDocument);

  // Auto-analyze when file content changes (with per-file debouncing)
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const document = event.document;
      const filePath = document.fileName;

      if (shouldAutoAnalyze(document) && shouldAnalyzeOnChange()) {
        const now = Date.now();
        const lastChange = lastAnalysisTime.get(filePath) || 0;
        const timeSinceLastChange = now - lastChange;

        // Clear existing timeout for this specific file
        const existingTimeout = changeTimeouts.get(filePath);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Check if we should force analysis due to frequent changes
        const shouldForceAnalysis =
          timeSinceLastChange > FORCED_ANALYSIS_INTERVAL;
        const delay = shouldForceAnalysis ? 0 : getChangeAnalysisDelay();

        if (shouldForceAnalysis) {
          outputChannel.appendLine(`[DEBUG] Forcing analysis for: ${filePath}`);
        } else {
          outputChannel.appendLine(
            `[DEBUG] Delaying analysis for: ${filePath} by ${delay}ms`
          );
        }

        // Set new timeout for this specific file
        const newTimeout = setTimeout(async () => {
          await analyzeDocument(document);

          // Update last analysis time
          lastAnalysisTime.set(filePath, Date.now());
          // Clean up the timeout reference after it fires
          changeTimeouts.delete(filePath);
        }, delay);

        changeTimeouts.set(filePath, newTimeout);
      }
    }
  );
  context.subscriptions.push(onDidChangeTextDocument);

  // Clean up timeouts when documents are closed to prevent memory leaks
  const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument(
    (document) => {
      const filePath = document.fileName;
      const timeout = changeTimeouts.get(filePath);
      if (timeout) {
        clearTimeout(timeout);
        changeTimeouts.delete(filePath);
      }
      lastAnalysisTime.delete(filePath);
    }
  );
  context.subscriptions.push(onDidCloseTextDocument);

  // Auto-analyze when switching between tabs/editors
  const onDidChangeVisibleTextEditors =
    vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
      const timestamp = new Date().toISOString();
      outputChannel.appendLine(
        `[DEBUG ${timestamp}] onDidChangeVisibleTextEditors fired with ${editors.length} editors`
      );

      // Refresh minimap decorations for the active editor
      minimapService.refreshActiveEditor();

      // Analyze all newly visible editors that should be auto-analyzed
      // Only process file editors to avoid issues with output panels, settings, etc.
      for (const editor of editors) {
        if (
          editor &&
          editor.document &&
          editor.document.uri.scheme === "file" &&
          shouldAutoAnalyze(editor.document)
        ) {
          const fileName =
            editor.document.fileName.split("/").pop() ||
            editor.document.fileName;
          outputChannel.appendLine(
            `[DEBUG ${timestamp}] Triggering analysis from tab switch for: ${fileName}`
          );
          await analyzeDocument(editor.document);
        }
      }
    });
  context.subscriptions.push(onDidChangeVisibleTextEditors);

  // Watch for configuration file changes and reload configurations
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.logconfig{,/**}"
  );

  configWatcher.onDidCreate(async (uri) => {
    outputChannel.appendLine(`Configuration file created: ${uri.fsPath}`);
    await configManager.initialize();
  });

  configWatcher.onDidChange(async (uri) => {
    outputChannel.appendLine(`Configuration file changed: ${uri.fsPath}`);

    // Invalidate cache entries that use this configuration
    const invalidatedFiles = enhancedTreeView.invalidateCacheForConfigPath(
      uri.fsPath
    );
    if (invalidatedFiles.length > 0) {
      outputChannel.appendLine(
        `Invalidated cache for ${
          invalidatedFiles.length
        } files due to config change: ${invalidatedFiles
          .map((f) => path.basename(f))
          .join(", ")}`
      );
    }

    await configManager.initialize();

    // Re-analyze active file if auto-analysis is enabled
    if (
      vscode.window.activeTextEditor &&
      shouldAutoAnalyze(vscode.window.activeTextEditor.document)
    ) {
      outputChannel.appendLine(
        `Re-analyzing active file due to configuration change: ${path.basename(
          vscode.window.activeTextEditor.document.fileName
        )}`
      );
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
    const fileName = document.fileName.split("/").pop() || document.fileName;
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(
      `[DEBUG ${timestamp}] Initial analysis check for active file: ${fileName}`
    );
    if (shouldAutoAnalyze(document)) {
      outputChannel.appendLine(
        `[DEBUG ${timestamp}] Triggering initial analysis for: ${fileName}`
      );
      analyzeDocument(document);
    }
  }
}

function shouldAutoAnalyze(document: vscode.TextDocument): boolean {
  // Check if auto-analysis is enabled
  const config = vscode.workspace.getConfiguration("flexible-log-analyzer");
  const autoAnalysis = config.get<boolean>("autoAnalysis", true);

  if (!autoAnalysis || document.isUntitled || document.uri.scheme !== "file") {
    return false;
  }

  // Check file patterns and size
  const fileName = document.fileName.toLowerCase();
  outputChannel.appendLine(
    `Checking auto-analysis for file: ${fileName} (${document.uri.scheme})`
  );
  const logExtensions = [".log", ".out", ".txt"];
  const hasLogExtension = logExtensions.some((ext) => fileName.endsWith(ext));
  const hasNoExtension = fileName.indexOf(".") === -1;
  const result = hasLogExtension || hasNoExtension;
  outputChannel.appendLine(
    `Auto-analysis result for ${fileName}: ${result} (${hasLogExtension} ${hasNoExtension})`
  );
  return result;
}

function shouldAnalyzeOnChange(): boolean {
  const config = vscode.workspace.getConfiguration("flexible-log-analyzer");
  const result = config.get<boolean>("enableAutoAnalysisOnChange", true);
  outputChannel.appendLine(
    `Auto-analysis on change is ${result ? "enabled" : "disabled"}`
  );
  return result;
}

function getChangeAnalysisDelay(): number {
  const config = vscode.workspace.getConfiguration("flexible-log-analyzer");
  return config.get<number>("changeAnalysisDelay", 1000);
}

async function analyzeCurrentFile(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showWarningMessage("No active file to analyze");
    return;
  }

  await analyzeDocument(activeEditor.document);
}

async function analyzeDocument(document: vscode.TextDocument): Promise<void> {
  try {
    // Debug logging to track analysis calls
    const fileName = document.fileName.split("/").pop() || document.fileName;
    const timestamp = new Date().toISOString();
    const callId = Math.random().toString(36).substr(2, 9);
    outputChannel.appendLine(
      `[DEBUG ${timestamp}] analyzeDocument called for: ${fileName} (call-id: ${callId})`
    );

    // Check if analysis is already in progress for this file
    if (analysisInProgress.get(document.fileName)) {
      outputChannel.appendLine(
        `[DEBUG ${timestamp}] Analysis already in progress for: ${fileName}, skipping duplicate call`
      );
      return;
    }

    // Mark analysis as in progress
    analysisInProgress.set(document.fileName, true);

    try {
      // Get configuration with checksum for this file
      const configWithChecksum = await configManager.getConfig(
        document.fileName
      );
      if (!configWithChecksum) {
        outputChannel.appendLine(
          `[DEBUG ${timestamp}] No config found for: ${fileName}`
        );
        return;
      }

      const { config, configPath } = configWithChecksum;

      // Check if we have a valid cached result
      const cachedResult = enhancedTreeView.getCachedResult(
        document.fileName,
        config.checksum
      );

      if (cachedResult) {
        outputChannel.appendLine(
          `[DEBUG ${timestamp}] Using cached analysis for: ${fileName} (config checksum: ${cachedResult.config.checksum.substring(
            0,
            8
          )}...)`
        );

        // Update tree view with cached result
        enhancedTreeView.updateResults(cachedResult);
      }

      outputChannel.appendLine(
        `[DEBUG ${timestamp}] Performing fresh analysis for: ${fileName} (config checksum: ${config.checksum.substring(
          0,
          8
        )}...)`
      );

      // Analyze the file
      const result = await patternMatcher.analyzeFile(
        document.fileName,
        config
      );

      // Add checksum and metadata to result
      result.configPath = configPath;

      // Update tree view
      enhancedTreeView.updateResults(result);

      // Update minimap decorations
      minimapService.updateDecorations(result);

      // Log file links if present (for debugging purposes)
      if (result.fileLinks && result.fileLinks.length > 0) {
        outputChannel.appendLine(
          `Found ${result.fileLinks.length} file links in ${fileName} - use F12 or Ctrl+Click to navigate`
        );
      }
    } finally {
      // Always clear the in-progress flag
      analysisInProgress.delete(document.fileName);
    }
  } catch (error) {
    outputChannel.appendLine(`Error analyzing document: ${error}`);
    vscode.window.showErrorMessage(`Analysis failed: ${error}`);
    // Ensure we clear the in-progress flag even on error
    analysisInProgress.delete(document.fileName);
  }
}

async function openConfigurationFile(): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showWarningMessage("No workspace folder open");
      return;
    }

    const configPath = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      ".logconfig"
    );

    try {
      // Try to open existing config
      const document = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(document);
    } catch {
      // Config doesn't exist, offer to create it
      const createConfig = await vscode.window.showQuickPick(
        [
          "Create new configuration",
          "Open global configuration (~/.logconfig)",
          "Cancel",
        ],
        {
          placeHolder:
            "Configuration file not found. What would you like to do?",
        }
      );

      if (createConfig === "Create new configuration") {
        await createConfigurationFile();
      } else if (createConfig === "Open global configuration (~/.logconfig)") {
        const homeConfig = vscode.Uri.file(
          require("os").homedir() + "/.logconfig"
        );
        try {
          const document = await vscode.workspace.openTextDocument(homeConfig);
          await vscode.window.showTextDocument(document);
        } catch {
          vscode.window.showWarningMessage(
            "Global configuration file not found"
          );
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
      vscode.window.showWarningMessage("No workspace folder open");
      return;
    }

    const configDirPath = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      ".logconfig"
    );
    await vscode.workspace.fs.createDirectory(configDirPath);
    const configPath = vscode.Uri.joinPath(configDirPath, "example.yaml");

    const templateContent = getConfigurationTemplate();

    const encoder = new (require("util").TextEncoder)();
    await vscode.workspace.fs.writeFile(
      configPath,
      encoder.encode(templateContent)
    );

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

async function toggleMinimapDecorations(): Promise<void> {
  const config = vscode.workspace.getConfiguration("flexible-log-analyzer");
  const currentValue = config.get<boolean>("showMinimapDecorations", true);
  const newValue = !currentValue;

  await config.update(
    "showMinimapDecorations",
    newValue,
    vscode.ConfigurationTarget.Workspace
  );

  if (newValue) {
    // Re-analyze active file to show decorations
    if (
      vscode.window.activeTextEditor &&
      shouldAutoAnalyze(vscode.window.activeTextEditor.document)
    ) {
      await analyzeDocument(vscode.window.activeTextEditor.document);
    }
    vscode.window.showInformationMessage("Minimap decorations enabled");
  } else {
    // Clear all decorations
    minimapService.clearAllDecorations();
    vscode.window.showInformationMessage("Minimap decorations disabled");
  }
}

// this method is called when your extension is deactivated
export function deactivate() {
  // Clean up all pending timeouts
  for (const timeout of changeTimeouts.values()) {
    clearTimeout(timeout);
  }
  changeTimeouts.clear();
  lastAnalysisTime.clear();

  if (configManager) {
    configManager.dispose();
  }
  if (patternMatcher) {
    patternMatcher.dispose();
  }
  if (minimapService) {
    minimapService.dispose();
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
}
