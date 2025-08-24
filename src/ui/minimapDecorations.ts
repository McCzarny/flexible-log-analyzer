import * as vscode from 'vscode';
import { AnalysisResult, MatchResult, SeverityLevel } from '../types/configTypes';

export interface MinimapDecoration {
  range: vscode.Range;
  severity: SeverityLevel;
  matcherName: string;
  message: string;
  color: string;
}

export class MinimapDecorationService {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private activeDecorations: Map<string, MinimapDecoration[]> = new Map();
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.createDecorationTypes();
  }

  private createDecorationTypes(): void {
    // Create decoration types for each severity level with minimap support
    const severityConfigs = {
      critical: {
        color: '#FF0000',
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
        overviewRulerColor: '#FF0000',
        overviewRulerLane: vscode.OverviewRulerLane.Right
      },
      high: {
        color: '#FF4444',
        backgroundColor: 'rgba(255, 68, 68, 0.2)',
        overviewRulerColor: '#FF4444',
        overviewRulerLane: vscode.OverviewRulerLane.Right
      },
      medium: {
        color: '#FFA500',
        backgroundColor: 'rgba(255, 165, 0, 0.2)',
        overviewRulerColor: '#FFA500',
        overviewRulerLane: vscode.OverviewRulerLane.Center
      },
      low: {
        color: '#0066CC',
        backgroundColor: 'rgba(0, 102, 204, 0.2)',
        overviewRulerColor: '#0066CC',
        overviewRulerLane: vscode.OverviewRulerLane.Left
      }
    };

    for (const [severity, config] of Object.entries(severityConfigs)) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: config.backgroundColor,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: config.color,
        borderRadius: '3px',
        overviewRulerColor: config.overviewRulerColor,
        overviewRulerLane: config.overviewRulerLane,
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      });

      this.decorationTypes.set(severity, decorationType);
    }
  }

  /**
   * Update minimap decorations for a file based on analysis results
   */
  updateDecorations(result: AnalysisResult): void {
    const filePath = result.filePath;
    const timestamp = new Date().toISOString();
    
    this.outputChannel.appendLine(
      `[MINIMAP ${timestamp}] Updating decorations for: ${this.getFileName(filePath)}`
    );

    // Clear existing decorations for this file
    this.clearDecorationsForFile(filePath);

    // Check if minimap decorations are enabled
    const config = vscode.workspace.getConfiguration('flexible-log-analyzer');
    const showMinimapDecorations = config.get<boolean>('showMinimapDecorations', true);
    
    if (!showMinimapDecorations) {
      this.outputChannel.appendLine(`[MINIMAP ${timestamp}] Minimap decorations disabled in settings`);
      return;
    }

    // Filter matches that should show in minimap
    const minimapMatches = result.matches.filter(match => match.matcher.minimap);
    
    if (minimapMatches.length === 0) {
      this.outputChannel.appendLine(`[MINIMAP ${timestamp}] No matches configured for minimap display`);
      return;
    }

    // Convert matches to decorations
    const decorations = this.createDecorationsFromMatches(minimapMatches);
    this.activeDecorations.set(filePath, decorations);

    // Apply decorations to active editor if it matches the file
    this.applyDecorationsToActiveEditor(filePath, decorations);

    this.outputChannel.appendLine(
      `[MINIMAP ${timestamp}] Applied ${decorations.length} decorations for ${minimapMatches.length} minimap matches`
    );
  }

  /**
   * Clear decorations for a specific file
   */
  clearDecorationsForFile(filePath: string): void {
    this.activeDecorations.delete(filePath);
    
    // Clear decorations from active editor if it matches the file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.fileName === filePath) {
      for (const decorationType of this.decorationTypes.values()) {
        activeEditor.setDecorations(decorationType, []);
      }
    }
  }

  /**
   * Clear all decorations
   */
  clearAllDecorations(): void {
    this.activeDecorations.clear();
    
    // Clear decorations from active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      for (const decorationType of this.decorationTypes.values()) {
        activeEditor.setDecorations(decorationType, []);
      }
    }
  }

  /**
   * Refresh decorations for the currently active editor
   */
  refreshActiveEditor(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.uri.scheme !== 'file') {
      return;
    }

    const filePath = activeEditor.document.fileName;
    const decorations = this.activeDecorations.get(filePath);
    
    if (decorations) {
      this.applyDecorationsToActiveEditor(filePath, decorations);
      this.outputChannel.appendLine(
        `[MINIMAP] Refreshed decorations for active editor: ${this.getFileName(filePath)}`
      );
    }
  }

  private createDecorationsFromMatches(matches: MatchResult[]): MinimapDecoration[] {
    const decorations: MinimapDecoration[] = [];

    for (const match of matches) {
      const range = new vscode.Range(
        match.line - 1, // VS Code uses 0-based line numbers
        match.column,
        match.line - 1,
        match.column + match.length
      );

      const decoration: MinimapDecoration = {
        range,
        severity: match.severity,
        matcherName: match.matcher.name,
        message: match.message,
        color: match.matcher.color
      };

      decorations.push(decoration);
    }

    return decorations;
  }

  private applyDecorationsToActiveEditor(filePath: string, decorations: MinimapDecoration[]): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.fileName !== filePath) {
      return;
    }

    // Group decorations by severity
    const decorationsBySeverity: Map<SeverityLevel, vscode.DecorationOptions[]> = new Map();
    
    for (const decoration of decorations) {
      if (!decorationsBySeverity.has(decoration.severity)) {
        decorationsBySeverity.set(decoration.severity, []);
      }

      const decorationOptions: vscode.DecorationOptions = {
        range: decoration.range,
        hoverMessage: new vscode.MarkdownString(
          `**${decoration.matcherName}** (${decoration.severity})  \n\n${decoration.message}`
        )
      };

      decorationsBySeverity.get(decoration.severity)!.push(decorationOptions);
    }

    // Apply decorations for each severity level
    for (const [severity, decorationType] of this.decorationTypes) {
      const severityDecorations = decorationsBySeverity.get(severity as SeverityLevel) || [];
      activeEditor.setDecorations(decorationType, severityDecorations);
    }
  }

  /**
   * Handle editor change events to refresh decorations
   */
  onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }

    // Apply decorations for the new active editor
    this.refreshActiveEditor();
  }

  /**
   * Get decoration information for testing
   */
  getActiveDecorationsForTesting(filePath: string): MinimapDecoration[] {
    return this.activeDecorations.get(filePath) || [];
  }

  /**
   * Get decoration types for testing
   */
  getDecorationTypesForTesting(): Map<string, vscode.TextEditorDecorationType> {
    return new Map(this.decorationTypes);
  }

  private getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
  }

  /**
   * Dispose of all decoration types and clear state
   */
  dispose(): void {
    // Dispose all decoration types
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    
    this.decorationTypes.clear();
    this.activeDecorations.clear();
    
    this.outputChannel.appendLine('[MINIMAP] MinimapDecorationService disposed');
  }
}