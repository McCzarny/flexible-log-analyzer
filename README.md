# Flexible Log Analyzer

A powerful VS Code extension for analyzing log files using configurable pattern matching rules. Transform your log analysis workflow with YAML-based configurations that detect errors, warnings, and custom patterns across your log files.

## Features

- **Configuration-driven Analysis**: Use `.logconfig` YAML files to define custom patterns and rules
- **Multi-level Pattern Matching**: Support for ERROR, WARNING, INFO, and FATAL severity levels
- **Enhanced Tree View**: Organized display of analysis results with file grouping
- **Minimap Integration**: Visual error markers in the VS Code minimap
- **Hierarchical Configuration**: Supports workspace-specific, user-global, and built-in configurations
- **Real-time Analysis**: Automatic analysis when files are opened or saved
- **Flexible Pattern Matching**: Regex-based pattern engine with customizable matchers

## Requirements

- Visual Studio Code 1.71.0 or higher
- No external dependencies required

## Extension Settings

This extension contributes the following settings:

* `flexible-log-analyzer.enableAutoAnalysis`: Enable/disable automatic analysis when files are opened or saved
* `flexible-log-analyzer.enableAutoAnalysisOnChange`: Enable automatic analysis when file content changes (default: false, may impact performance on large files)
* `flexible-log-analyzer.changeAnalysisDelay`: Delay in milliseconds before analyzing file changes for debouncing (default: 1000ms)
* `flexible-log-analyzer.analysisResultCacheSize`: Number of analysis results to cache for quick switching (default: 10)
* `flexible-log-analyzer.configWatchEnabled`: Watch for changes in .logconfig files and reload automatically
* `flexible-log-analyzer.showMinimapDecorations`: Show error and warning decorations in the minimap
* `flexible-log-analyzer.maxResultsPerFile`: Maximum number of analysis results to show per file (default: 1000)

### Tree View and Caching Features

The extension provides a focused tree view with efficient caching:

1. **Active File Focus**: Shows analysis results only for the currently active/open file
2. **Smart Caching**: Maintains a configurable cache of recent analysis results for instant switching
3. **LRU Eviction**: Automatically removes oldest cached results when cache limit is reached

**Commands available in tree view:**
- `Clear Results`: Clear all cached analysis results
- `Refresh`: Manually refresh the tree view

### Auto-Analysis Features

The extension supports multiple auto-analysis modes:

1. **File Open/Save Analysis** (enabled by default): Automatically analyzes files when opened or saved
2. **Real-time Content Analysis** (opt-in): Analyzes files as you type or modify content with configurable debouncing
3. **Configuration Hot-reload**: Automatically re-analyzes files when `.logconfig` files are modified

To enable real-time analysis on file changes, set `enableAutoAnalysisOnChange` to `true` in your VS Code settings. The `changeAnalysisDelay` setting controls how long to wait after the last change before triggering analysis (default: 1 second).

### Performance and Usage Tips

- **Cache Size**: Adjust `analysisResultCacheSize` based on your workflow - larger values use more memory but provide faster switching
- **Real-time Analysis**: Enable cautiously on large files as it may impact editor responsiveness
- **Cache Management**: Use "Clear Results" command to free memory when needed

## Getting Started

1. **Create a Configuration File**: Create a `.logconfig` file in your workspace root or home directory
2. **Define Pattern Matchers**: Add regex patterns for detecting different log levels
3. **Analyze Your Logs**: Use the command palette (`Cmd+Shift+P`) and run "Analyze Current Log File"
4. **View Results**: Check the "Log Analysis Results" panel in the sidebar

### Sample Configuration

```yaml
version: "1.0"
description: "Sample log analysis configuration"
matchers:
  - name: "Error Detection"
    pattern: "\\b(ERROR|Error)\\b.*"
    severity: "error"
    description: "Detects error messages"
  
  - name: "Warning Detection"
    pattern: "\\b(WARNING|Warning|WARN)\\b.*"
    severity: "warning"
    description: "Detects warning messages"
```

## Commands

- `Analyze Current Log File`: Analyze the currently open file
- `Analyze All Log Files`: Analyze all files in the workspace
- `Clear Analysis Results`: Clear all analysis results
- `Open Log Configuration`: Open the .logconfig file for editing
- `Create Log Configuration`: Create a new .logconfig file template

## Known Issues

- Large log files (>10MB) may take longer to analyze
- Regex patterns with high complexity may impact performance

## Release Notes

### 0.0.1

Initial release of Flexible Log Analyzer with:
- YAML-based configuration system
- Pattern matching engine
- Enhanced tree view
- Minimap integration
- Multi-level configuration support

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
