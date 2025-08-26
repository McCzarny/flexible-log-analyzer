import * as vscode from 'vscode';
import * as path from 'path';
import { FileLink } from '../types/configTypes';
import { FileLinkMatch } from '../types/analysisTypes';

export class FileLinkProvider implements vscode.CodeLensProvider {
  private outputChannel: vscode.OutputChannel;
  private compiledFileLinks: CompiledFileLink[] = [];
  private currentFileLinkMatches: Map<string, FileLinkMatch[]> = new Map();

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Provides CodeLenses for file links
   */
  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
    const filePath = document.fileName;
    const matches = this.currentFileLinkMatches.get(filePath);
    
    if (!matches || matches.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    
    for (const match of matches) {
      const startPos = new vscode.Position(match.line - 1, match.column);
      const endPos = new vscode.Position(match.line - 1, match.column + match.length);
      const range = new vscode.Range(startPos, endPos);
      
      const command: vscode.Command = {
        title: `Open ${match.fileUri}${match.lineNumber ? `:${match.lineNumber}` : ''}`,
        command: 'flexible-log-analyzer.openSpecificFileLink',
        arguments: [match]
      };
      
      codeLenses.push(new vscode.CodeLens(range, command));
    }
    
    return codeLenses;
  }

  /**
   * Compiles file link patterns for efficient matching
   */
  public compileFileLinks(fileLinks: FileLink[]): void {
    this.outputChannel.appendLine(`Compiling ${fileLinks.length} file link patterns`);
    
    this.compiledFileLinks = [];
    
    for (const fileLink of fileLinks) {
      try {
        let flags = 'g';
        
        const regex = new RegExp(fileLink.pattern, flags);
        
        this.compiledFileLinks.push({
          original: fileLink,
          regex,
          compiledAt: new Date()
        });
        
        this.outputChannel.appendLine(`Compiled file link pattern: ${fileLink.pattern} (flags: ${flags})`);
      } catch (error) {
        this.outputChannel.appendLine(`Failed to compile file link pattern "${fileLink.pattern}": ${error}`);
      }
    }
  }

  /**
   * Finds file link matches in the given text content
   */
  public findFileLinks(content: string, filePath: string): FileLinkMatch[] {
    if (this.compiledFileLinks.length === 0) {
      return [];
    }

    const matches: FileLinkMatch[] = [];
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      for (const compiledLink of this.compiledFileLinks) {
        compiledLink.regex.lastIndex = 0; // Reset regex state
        
        let match;
        while ((match = compiledLink.regex.exec(line)) !== null) {
          try {
            const fileUri = this.resolveFileUri(match, compiledLink.original);
            const lineNumber = this.resolveLineNumber(match, compiledLink.original);
            
            if (fileUri) {
              matches.push({
                line: lineIndex + 1,
                column: match.index,
                length: match[0].length,
                fileUri,
                lineNumber,
                pattern: compiledLink.original.pattern,
                originalText: match[0]
              });
            }
          } catch (error) {
            this.outputChannel.appendLine(`Error processing file link match: ${error}`);
          }
          
          // Prevent infinite loop in case regex doesn't advance
          if (match.index === compiledLink.regex.lastIndex) {
            break;
          }
        }
      }
    }

    this.outputChannel.appendLine(`Found ${matches.length} file links in ${filePath}`);
    return matches;
  }

  /**
   * Stores file link matches for CodeLens provider
   */
  public storeFileLinkMatches(filePath: string, matches: FileLinkMatch[]): void {
    this.currentFileLinkMatches.set(filePath, matches);
  }

  /**
   * Clears file link matches for the given file
   */
  public clearFileLinkMatches(filePath: string): void {
    this.currentFileLinkMatches.delete(filePath);
  }



  /**
   * Opens a file link in the editor
   */
  public async openFileLink(match: FileLinkMatch): Promise<void> {
    let targetUri: vscode.Uri;
    
    // Handle both absolute and relative paths
    if (path.isAbsolute(match.fileUri)) {
      targetUri = vscode.Uri.file(match.fileUri);
    } else {
      // Resolve relative to workspace
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder available for relative path resolution');
      }
      targetUri = vscode.Uri.joinPath(workspaceFolder.uri, match.fileUri);
    }

    // Check if file exists
    try {
      await vscode.workspace.fs.stat(targetUri);
    } catch (error) {
      // Try to find match.fileUri
      const files = await vscode.workspace.findFiles('**/' + match.fileUri, undefined, 1);
      if (files.length > 0) {
        targetUri = files[0];
      } else {
        vscode.window.showWarningMessage('File not found: ' + match.fileUri);
        throw new Error(`File does not exist: ${targetUri.fsPath}`);
      }
    }

    // Open the document
    const document = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(document);

    // Navigate to specific line if specified
    if (match.lineNumber && match.lineNumber > 0) {
      const line = Math.max(0, match.lineNumber - 1); // Convert to 0-based
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }

    this.outputChannel.appendLine(`Opened file link: ${targetUri.fsPath}${match.lineNumber ? `:${match.lineNumber}` : ''}`);
  }

  /**
   * Resolves the file URI from regex match groups
   */
  private resolveFileUri(match: RegExpExecArray, fileLink: FileLink): string | null {
    try {
      let fileUri = fileLink.fileUri;
      
      // Replace capture groups with matched values
      for (let i = 1; i < match.length; i++) {
        const placeholder = `$${i}`;
        if (fileUri.includes(placeholder)) {
          fileUri = fileUri.replace(new RegExp('\\' + placeholder, 'g'), match[i] || '');
        }
      }

      // If the result is empty or just whitespace, return null
      if (!fileUri.trim()) {
        return null;
      }

      return fileUri;
    } catch (error) {
      this.outputChannel.appendLine(`Error resolving file URI: ${error}`);
      return null;
    }
  }

  /**
   * Resolves the line number from regex match groups
   */
  private resolveLineNumber(match: RegExpExecArray, fileLink: FileLink): number | undefined {
    if (!fileLink.lineNumber) {
      return undefined;
    }

    try {
      let lineNumberStr = fileLink.lineNumber;
      
      // Replace capture groups with matched values
      for (let i = 1; i < match.length; i++) {
        const placeholder = `$${i}`;
        if (lineNumberStr.includes(placeholder)) {
          lineNumberStr = lineNumberStr.replace(new RegExp('\\' + placeholder, 'g'), match[i] || '');
        }
      }

      const lineNumber = parseInt(lineNumberStr, 10);
      return isNaN(lineNumber) ? undefined : lineNumber;
    } catch (error) {
      this.outputChannel.appendLine(`Error resolving line number: ${error}`);
      return undefined;
    }
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.currentFileLinkMatches.clear();
    this.compiledFileLinks = [];
  }
}

interface CompiledFileLink {
  original: FileLink;
  regex: RegExp;
  compiledAt: Date;
}