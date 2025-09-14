import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as yaml from "js-yaml";
import { LogConfig } from "../types/configTypes";
import {
  ConfigLoadResult,
} from "../types/analysisTypes";
import { ConfigValidator } from "./configValidator";
import { PerformanceLogger } from "../utils/performanceLogger";
import { ChecksumUtils } from "../utils/checksumUtils";

export class ConfigManager {
  private configs: Map<string, LogConfig> = new Map();
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private validator: ConfigValidator;
  private outputChannel: vscode.OutputChannel;
  private performanceLogger: PerformanceLogger;

  constructor(outputChannel: vscode.OutputChannel) {
    this.validator = new ConfigValidator();
    this.outputChannel = outputChannel;
    this.performanceLogger = new PerformanceLogger(outputChannel);
  }

  async initialize(): Promise<void> {
    await this.loadAllConfigurations();
    this.setupFileWatchers();
  }

  async loadAllConfigurations(): Promise<void> {
    const timer = this.performanceLogger.createTimer('Load all configurations');
    timer.start();
    
    this.outputChannel.appendLine("Loading log configurations...");

    // Clear existing configurations
    this.configs.clear();

    try {
      // Load global configuration from ~/.logconfig
      await this.loadGlobalConfiguration();

      // Load local workspace configurations from .logconfig/*.yaml
      await this.loadWorkspaceConfigurations();

      const loadTime = timer.stop();
      
      if (this.performanceLogger.isLoggingEnabled()) {
        this.performanceLogger.logMetrics('Configuration Loading', {
          configLoadTime: loadTime,
          totalTime: loadTime
        }, `${this.configs.size} configs loaded`);
      }

      this.outputChannel.appendLine(
        `Total configurations loaded: ${this.configs.size} in ${loadTime.toFixed(2)}ms`
      );
    } catch (error) {
      const errorTime = timer.elapsed();
      this.performanceLogger.logError('Configuration loading', error as Error, errorTime);
      throw error;
    }
  }

  async getConfigForFile(filePath: string): Promise<LogConfig | undefined> {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath);

    // First, try to find workspace-specific configuration
    const workspaceConfig = await this.findWorkspaceConfig(filePath);
    if (workspaceConfig) {
      this.outputChannel.appendLine(`Using workspace config for ${fileName}`);

      // If the config has a detector, check if it matches the file content and trigger language mode change
      if (workspaceConfig.detector) {
        try {
          const fileUri = vscode.Uri.file(filePath);
          const content = await vscode.workspace.fs.readFile(fileUri);
          const firstLine = content.toString().split("\n")[0];

          if (this.matchesDetector(firstLine, workspaceConfig.detector)) {
            this.outputChannel.appendLine(
              `Detector also matches for workspace config ${workspaceConfig.name}`
            );
            // Handle language mode change since detector matched
            await this.handleLanguageModeChange(filePath, workspaceConfig);
          }
        } catch (error) {
          this.outputChannel.appendLine(
            `Error checking detector for workspace config: ${error}`
          );
        }
      }

      return workspaceConfig;
    }

    // Then check global configuration
    const globalConfig = this.configs.get("global");
    if (
      globalConfig &&
      this.configMatches(globalConfig, fileName, fileExtension)
    ) {
      this.outputChannel.appendLine(`Using global config for ${fileName}`);
      // Don't trigger language mode change for file pattern matches
      return globalConfig;
    }

    // Try to auto-detect based on file content
    const detectedConfig = await this.detectConfigFromFile(filePath);
    if (detectedConfig) {
      this.outputChannel.appendLine(`Auto-detected config for ${fileName}`);
      // Handle language mode change only when detector matches
      await this.handleLanguageModeChange(filePath, detectedConfig);
      return detectedConfig;
    }

    this.outputChannel.appendLine(`No configuration found for ${fileName}`);

    // No configuration found
    return undefined;
  }

  private async findWorkspaceConfig(
    filePath: string
  ): Promise<LogConfig | undefined> {
    // Check if the file matches any of the loaded workspace configurations
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath);

    // Iterate through all workspace configurations (non-global)
    for (const [configName, config] of this.configs) {
      if (configName !== "global") {
        this.outputChannel.appendLine(
          `Checking workspace config '${configName}' for ${fileName}`
        );
        this.outputChannel.appendLine(
          `Config metadata: name='${config.name}', filePatterns=${
            Array.isArray(config.filePatterns) ? config.filePatterns.length : 0
          }, detector=${config.detector ? "present" : "absent"}`
        );
        if (this.configMatches(config, fileName, fileExtension)) {
          this.outputChannel.appendLine(
            `Using workspace config '${configName}' for ${fileName}`
          );
          return config;
        } else {
          this.outputChannel.appendLine(
            `Config '${configName}' does not match ${fileName}`
          );
        }
      }
    }

    return undefined;
  }

  private configMatches(
    config: LogConfig,
    fileName: string,
    _fileExtension: string
  ): boolean {
    // Check if the configuration file patterns match the file
    if (config.filePatterns) {
      for (const pattern of config.filePatterns) {
        this.outputChannel.appendLine(
          `Checking file pattern '${pattern}' for ${fileName}`
        );
        if (this.matchesGlobPattern(fileName, pattern)) {
          this.outputChannel.appendLine(
            `File ${fileName} matches pattern '${pattern}'`
          );
          return true;
        }
      }
    } else {
      this.outputChannel.appendLine(
        `No file patterns specified in config for ${fileName}`
      );
    }

    return false;
  }

  private matchesGlobPattern(fileName: string, pattern: string): boolean {
    // Simple glob pattern matching (supports * wildcards)
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");

    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(fileName);
  }

  private async detectConfigFromFile(
    filePath: string
  ): Promise<LogConfig | undefined> {
    try {
      const fileUri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(fileUri);
      // TODO: Use more optimized way to read the first line
      const firstLine = content.toString().split("\n")[0];

      // Try to match against detector patterns from loaded configs
      for (const [configName, config] of this.configs) {
        this.outputChannel.appendLine(
          `Checking config '${configName}' for file: ${filePath} has detector: ${!!config.detector}`
        );
        if (
          config.detector &&
          this.matchesDetector(firstLine, config.detector)
        ) {
          this.outputChannel.appendLine(
            `Auto-detected config: ${config.name} for file: ${filePath}`
          );
          return config;
        }
      }

      return undefined;
    } catch (error) {
      this.outputChannel.appendLine(
        `Error detecting config for ${filePath}: ${error}`
      );
      return undefined;
    }
  }

  private matchesDetector(content: string, detector: any): boolean {
    try {
      const regex = new RegExp(detector.pattern);
      return regex.test(content);
    } catch (error) {
      this.outputChannel.appendLine(
        `Invalid detector pattern: ${detector.pattern}`
      );
      return false;
    }
  }

  private async loadConfigFromPath(
    configPath: string
  ): Promise<ConfigLoadResult> {
    try {
      const configUri = vscode.Uri.file(configPath);
      const content = await vscode.workspace.fs.readFile(configUri);
      const configText = content.toString();

      // Parse YAML configuration using js-yaml
      let config = yaml.load(configText) as LogConfig;

      // Validate configuration
      const validation = this.validator.validate(config);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors.map((e: any) => e.message),
          warnings: validation.warnings.map((w: any) => w.message),
          path: configPath,
        };
      }

      config.checksum = ChecksumUtils.calculateDocumentChecksum(configText);
      config.filePath = configPath;
      return {
        success: true,
        config,
        warnings: validation.warnings.map((w: any) => w.message),
        path: configPath,
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to load configuration: ${error}`],
        path: configPath,
      };
    }
  }

  private getConfigurationPaths(): string[] {
    const paths: string[] = [];

    // Get configured paths from VS Code settings
    const config = vscode.workspace.getConfiguration("flexible-log-analyzer");
    const configPaths = config.get<string[]>("configPaths", [
      ".logconfig",
      "~/.logconfig",
    ]);

    for (const configPath of configPaths) {
      if (configPath.startsWith("~/")) {
        paths.push(path.join(os.homedir(), configPath.substring(2)));
      } else if (path.isAbsolute(configPath)) {
        paths.push(configPath);
      } else if (vscode.workspace.workspaceFolders) {
        // Relative to workspace
        for (const folder of vscode.workspace.workspaceFolders) {
          paths.push(path.join(folder.uri.fsPath, configPath));
        }
      }
    }

    return paths;
  }

  private async loadGlobalConfiguration(): Promise<void> {
    const globalConfigPath = path.join(os.homedir(), ".logconfig");

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(globalConfigPath));
    } catch (error) {
      this.outputChannel.appendLine(
        `No global configuration found at ${globalConfigPath}`
      );
      return;
    }

    try {
      this.outputChannel.appendLine(
        `Loading global configuration from: ${globalConfigPath}`
      );
      const result = await this.loadConfigFromPath(globalConfigPath);

      if (result.success && result.config) {
        this.configs.set("global", result.config);
        this.outputChannel.appendLine(
          `Global configuration loaded successfully`
        );
      } else if (result.errors) {
        this.outputChannel.appendLine(
          `Failed to load global config: ${result.errors.join(", ")}`
        );
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `Got error while loading global configuration: ${error}`
      );
    }
  }

  private async loadWorkspaceConfigurations(): Promise<void> {
    if (!vscode.workspace.workspaceFolders) {
      this.outputChannel.appendLine(
        "No workspace folders found, skipping workspace configurations"
      );
      return;
    }

    for (const folder of vscode.workspace.workspaceFolders) {
      const configDir = path.join(folder.uri.fsPath, ".logconfig");

      try {
        this.outputChannel.appendLine(
          `Loading workspace configurations from: ${configDir}`
        );

        // Read all .yaml files in the .logconfig directory
        const files = await vscode.workspace.fs.readDirectory(
          vscode.Uri.file(configDir)
        );

        for (const [fileName, fileType] of files) {
          if (
            fileType === vscode.FileType.File &&
            (fileName.endsWith(".yaml") || fileName.endsWith(".yml"))
          ) {
            const configPath = path.join(configDir, fileName);
            const configName = path.basename(fileName, path.extname(fileName));

            try {
              const result = await this.loadConfigFromPath(configPath);

              if (result.success && result.config) {
                this.configs.set(configName, result.config);
                this.outputChannel.appendLine(
                  `✅ Loaded workspace config: ${fileName}`
                );
              } else if (result.errors) {
                this.outputChannel.appendLine(
                  `❌ Failed to load ${fileName}: ${result.errors.join(", ")}`
                );
              }
            } catch (error) {
              this.outputChannel.appendLine(
                `❌ Error loading ${fileName}: ${error}`
              );
            }
          }
        }
      } catch (error) {
        this.outputChannel.appendLine(
          `ℹ️ No .logconfig directory found in workspace: ${folder.uri.fsPath}`
        );
      }
    }
  }

  private setupFileWatchers(): void {
    // Clean up existing watchers
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    this.fileWatchers = [];

    // Watch for global configuration file ~/.logconfig
    const globalConfigPath = path.join(os.homedir(), ".logconfig");
    const globalWatcher =
      vscode.workspace.createFileSystemWatcher(globalConfigPath);

    globalWatcher.onDidChange(() => {
      this.outputChannel.appendLine(`Global configuration changed`);
      this.loadGlobalConfiguration();
    });

    globalWatcher.onDidCreate(() => {
      this.outputChannel.appendLine(`Global configuration created`);
      this.loadGlobalConfiguration();
    });

    globalWatcher.onDidDelete(() => {
      this.outputChannel.appendLine(`Global configuration deleted`);
      this.configs.delete("global");
    });

    this.fileWatchers.push(globalWatcher);

    // Watch for workspace .logconfig directory and .yaml files
    const workspaceConfigWatcher = vscode.workspace.createFileSystemWatcher(
      "**/.logconfig/*.{yaml,yml}"
    );

    workspaceConfigWatcher.onDidChange((uri) => {
      this.outputChannel.appendLine(
        `Workspace configuration changed: ${uri.fsPath}`
      );
      this.reloadWorkspaceConfig(uri.fsPath);
    });

    workspaceConfigWatcher.onDidCreate((uri) => {
      this.outputChannel.appendLine(
        `Workspace configuration created: ${uri.fsPath}`
      );
      this.reloadWorkspaceConfig(uri.fsPath);
    });

    workspaceConfigWatcher.onDidDelete((uri) => {
      this.outputChannel.appendLine(
        `Workspace configuration deleted: ${uri.fsPath}`
      );
      const configName = path.basename(uri.fsPath, path.extname(uri.fsPath));
      this.configs.delete(configName);
    });

    this.fileWatchers.push(workspaceConfigWatcher);
  }

  private async reloadConfig(configPath: string): Promise<void> {
    const result = await this.loadConfigFromPath(configPath);
    if (result.success && result.config) {
      this.configs.set(configPath, result.config);
      // Notify other components about config change
      this.notifyConfigChange(configPath, result.config);
    }
  }

  private async reloadWorkspaceConfig(configPath: string): Promise<void> {
    const configName = path.basename(configPath, path.extname(configPath));

    try {
      const result = await this.loadConfigFromPath(configPath);

      if (result.success && result.config) {
        this.configs.set(configName, result.config);
        this.outputChannel.appendLine(
          `✅ Reloaded workspace config: ${configName} checksum: ${result.config.checksum}`
        );
        this.notifyConfigChange(configName, result.config);
      } else if (result.errors) {
        this.outputChannel.appendLine(
          `❌ Failed to reload ${configName}: ${result.errors.join(", ")}`
        );
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `❌ Error reloading ${configName}: ${error}`
      );
    }
  }

  private notifyConfigChange(_configPath: string, _config: LogConfig): void {
    // Emit event for other components to react to config changes
    // This could trigger re-analysis of open files
    // TODO: Implement event emission system
  }

  private async handleLanguageModeChange(
    filePath: string,
    config: LogConfig
  ): Promise<void> {
    // Check if the configuration has the changeLanguageMode flag set in detector and detector matched
    if (config.detector?.changeLanguageMode === true) {
      this.outputChannel.appendLine(
        `Changing language mode to 'log' for file: ${path.basename(
          filePath
        )} (detector matched)`
      );
      try {
        // Find the document if it's already open
        const openDoc = vscode.workspace.textDocuments.find(
          (doc) => doc.fileName === filePath
        );

        if (openDoc) {
          // Check if it's already set to 'log' language mode
          if (openDoc.languageId !== "log") {
            // Change the language mode to 'log'
            await vscode.languages.setTextDocumentLanguage(openDoc, "log");

            this.outputChannel.appendLine(
              `Successfully changed language mode to 'log' for: ${path.basename(
                filePath
              )}`
            );
          } else {
            this.outputChannel.appendLine(
              `File ${path.basename(filePath)} already has 'log' language mode`
            );
          }
        } else {
          this.outputChannel.appendLine(
            `File ${path.basename(
              filePath
            )} is not currently open, will change language mode when opened`
          );
        }
      } catch (error) {
        this.outputChannel.appendLine(
          `Failed to change language mode for ${path.basename(
            filePath
          )}: ${error}`
        );
      }
    } else {
      this.outputChannel.appendLine(
        `Language mode change requested but detector did not match for: ${path.basename(
          filePath
        )}`
      );
    }
  }

  /**
   * Get configuration with checksum information
   */
  async getConfig(filePath: string): Promise<LogConfig | undefined> {
    const config = await this.getConfigForFile(filePath);
    return config ? config : undefined;
  }

  dispose(): void {
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    // Note: outputChannel is shared and disposed by the extension
  }
}
