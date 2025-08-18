import * as vscode from 'vscode';
import * as path from 'path';
import { AnalysisResult } from '../types/configTypes';
import { EnhancedTreeNode, ConfigGroupNode, MatchGroupNode, FileLocationNode } from '../types/analysisTypes';

export class EnhancedTreeView implements vscode.TreeDataProvider<EnhancedTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<EnhancedTreeNode | undefined | null | void> = new vscode.EventEmitter<EnhancedTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<EnhancedTreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private treeData: EnhancedTreeNode[] = [];
  private analysisResults: Map<string, AnalysisResult> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    this.registerCommands();
  }

  private registerCommands(): void {
    // Register tree item click command
    const jumpToLocationCommand = vscode.commands.registerCommand(
      'flexible-log-analyzer.jumpToLocation',
      (node: FileLocationNode) => {
        this.jumpToFileLocation(node);
      }
    );
    this.context.subscriptions.push(jumpToLocationCommand);

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand(
      'flexible-log-analyzer.refreshTree',
      () => {
        this.refresh();
      }
    );
    this.context.subscriptions.push(refreshCommand);

    // Register clear command
    const clearCommand = vscode.commands.registerCommand(
      'flexible-log-analyzer.clearResults',
      () => {
        this.clearResults();
      }
    );
    this.context.subscriptions.push(clearCommand);
  }

  getTreeItem(element: EnhancedTreeNode): vscode.TreeItem {
    switch (element.type) {
      case 'config-group':
        return this.createConfigGroupItem(element);
      case 'match-group':
        return this.createMatchGroupItem(element);
      case 'file-location':
        return this.createFileLocationItem(element);
      default:
        return new vscode.TreeItem('Unknown');
    }
  }

  getChildren(element?: EnhancedTreeNode): Thenable<EnhancedTreeNode[]> {
    if (!element) {
      // Return root nodes
      return Promise.resolve(this.treeData);
    }

    switch (element.type) {
      case 'config-group':
        return Promise.resolve(element.children);
      case 'match-group':
        return Promise.resolve(element.locations);
      case 'file-location':
        return Promise.resolve([]);
      default:
        return Promise.resolve([]);
    }
  }

  updateResults(result: AnalysisResult): void {
    this.analysisResults.set(result.filePath, result);
    this.rebuildTreeData();
    this.refresh();
  }

  removeResults(filePath: string): void {
    this.analysisResults.delete(filePath);
    this.rebuildTreeData();
    this.refresh();
  }

  clearResults(): void {
    this.analysisResults.clear();
    this.rebuildTreeData();
    this.refresh();
  }

  private rebuildTreeData(): void {
    this.treeData = [];

    for (const [filePath, result] of this.analysisResults) {
      const configGroup = this.createConfigGroupFromResult(result);
      if (configGroup.children.length > 0) {
        this.treeData.push(configGroup);
      }
    }

    // Sort by priority and match count
    this.treeData.sort((a, b) => {
      if (a.type === 'config-group' && b.type === 'config-group') {
        return b.totalMatches - a.totalMatches;
      }
      return 0;
    });
  }

  private createConfigGroupFromResult(result: AnalysisResult): ConfigGroupNode {
    const matchGroups = this.groupMatchesByType(result);
    
    return {
      type: 'config-group',
      id: `config-${result.filePath}`,
      configName: `${result.config.name} (${this.getFileName(result.filePath)})`,
      totalMatches: result.matches.length,
      children: matchGroups,
      icon: '$(file-text)',
      uri: ['config', result.filePath]
    };
  }

  private groupMatchesByType(result: AnalysisResult): MatchGroupNode[] {
    const groups: Map<string, FileLocationNode[]> = new Map();

    // Group matches by type and create file location nodes directly
    for (const match of result.matches) {
      const type = match.matcher.type;
      if (!groups.has(type)) {
        groups.set(type, []);
      }

      const locationNode: FileLocationNode = {
        type: 'file-location',
        id: `location-${result.filePath}-${match.line}-${match.column}`,
        filePath: result.filePath,
        line: match.line,
        column: match.column,
        context: match.context || match.originalLine,
        message: match.message,
        matcherName: match.matcher.name,
        severity: match.matcher.severity,
        preview: this.createPreview(match.originalLine),
        uri: ['location', result.filePath, match.line.toString(), match.column.toString()]
      };

      groups.get(type)!.push(locationNode);
    }

    // Convert to match group nodes
    const matchGroups: MatchGroupNode[] = [];
    for (const [type, locations] of groups) {
      const firstLocation = locations[0];
      const groupConfig = this.findGroupConfig(result, type);
      
      const matchGroup: MatchGroupNode = {
        type: 'match-group',
        id: `group-${result.filePath}-${type}`,
        groupName: groupConfig?.name || this.capitalizeType(type),
        severity: firstLocation.severity,
        locations: locations.sort((a, b) => a.line - b.line),
        icon: groupConfig?.icon || this.getIconForSeverity(firstLocation.severity),
        color: groupConfig?.color || this.getColorForSeverity(firstLocation.severity),
        uri: ['group', result.filePath, type],
        totalMatches: locations.length
      };

      matchGroups.push(matchGroup);
    }

    // Sort groups by priority and severity
    return matchGroups.sort((a, b) => {
      const aPriority = this.getSeverityPriority(a.severity);
      const bPriority = this.getSeverityPriority(b.severity);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return b.totalMatches - a.totalMatches;
    });
  }

  private findGroupConfig(result: AnalysisResult, matcherType: string) {
    if (!result.config.groups) {
      return undefined;
    }

    return result.config.groups.find(group => 
      group.matchers.includes(matcherType)
    );
  }

  private createConfigGroupItem(element: ConfigGroupNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${element.configName} (${element.totalMatches})`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    
    item.id = element.id;
    item.iconPath = new vscode.ThemeIcon(element.icon.replace('$(', '').replace(')', ''));
    item.contextValue = 'configGroup';
    item.tooltip = `Configuration: ${element.configName}\nTotal matches: ${element.totalMatches}`;
    
    return item;
  }

  private createMatchGroupItem(element: MatchGroupNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${element.groupName} (${element.totalMatches})`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    
    item.id = element.id;
    item.iconPath = new vscode.ThemeIcon(
      element.icon.replace('$(', '').replace(')', ''),
      new vscode.ThemeColor(this.getThemeColorForSeverity(element.severity))
    );
    item.contextValue = 'matchGroup';
    item.tooltip = `${element.groupName}\nSeverity: ${element.severity}\nMatches: ${element.totalMatches}`;
    
    return item;
  }

  private createFileLocationItem(element: FileLocationNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${this.getFileName(element.filePath)}:${element.line}:${element.column} - ${element.matcherName}`,
      vscode.TreeItemCollapsibleState.None
    );
    
    item.id = element.id;
    item.iconPath = new vscode.ThemeIcon(
      'go-to-file',
      new vscode.ThemeColor(this.getThemeColorForSeverity(element.severity))
    );
    item.contextValue = 'fileLocation';
    item.command = {
      command: 'flexible-log-analyzer.jumpToLocation',
      title: 'Go to Location',
      arguments: [element]
    };
    item.tooltip = new vscode.MarkdownString(
      `**${element.matcherName}** (${element.severity})\n\n` +
      `File: ${element.filePath}\n` +
      `Line: ${element.line}, Column: ${element.column}\n\n` +
      `Preview: \`${element.preview}\`\n\n` +
      `Click to jump to location`
    );
    
    return item;
  }

  private async jumpToFileLocation(node: FileLocationNode): Promise<void> {
    try {
      const uri = vscode.Uri.file(node.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      
      // Navigate to the specific line and column
      const position = new vscode.Position(node.line - 1, node.column);
      const range = new vscode.Range(position, position);
      
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  private createPreview(line: string): string {
    const maxLength = 80;
    const trimmed = line.trim();
    
    if (trimmed.length <= maxLength) {
      return trimmed;
    }
    
    return trimmed.substring(0, maxLength - 3) + '...';
  }

  private getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  private capitalizeType(type: string): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private getSeverityPriority(severity: string): number {
    switch (severity) {
      case 'critical': return 1;
      case 'high': return 2;
      case 'medium': return 3;
      case 'low': return 4;
      default: return 5;
    }
  }

  private getIconForSeverity(severity: string): string {
    switch (severity) {
      case 'critical': return '$(error)';
      case 'high': return '$(error)';
      case 'medium': return '$(warning)';
      case 'low': return '$(info)';
      default: return '$(circle-filled)';
    }
  }

  private getColorForSeverity(severity: string): string {
    switch (severity) {
      case 'critical': return '#8B0000';
      case 'high': return '#FF4444';
      case 'medium': return '#FFA500';
      case 'low': return '#0066CC';
      default: return '#666666';
    }
  }

  private getThemeColorForSeverity(severity: string): string {
    switch (severity) {
      case 'critical': return 'errorForeground';
      case 'high': return 'errorForeground';
      case 'medium': return 'warningForeground';
      case 'low': return 'foreground';
      default: return 'foreground';
    }
  }

  private refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getParent(element: EnhancedTreeNode): vscode.ProviderResult<EnhancedTreeNode> {
    // Find parent in tree hierarchy
    for (const rootNode of this.treeData) {
      if (rootNode.type === 'config-group') {
        for (const groupNode of rootNode.children) {
          if (groupNode.id === element.id) {
            return rootNode;
          }
          if (groupNode.type === 'match-group') {
            for (const locationNode of groupNode.locations) {
              if (locationNode.id === element.id) {
                return groupNode;
              }
            }
          }
        }
      }
    }
    return null;
  }
}
