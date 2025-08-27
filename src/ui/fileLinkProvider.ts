import * as vscode from "vscode";
import * as path from "path";
import { FileLink } from "../types/configTypes";

export class FileLinkProvider implements vscode.DefinitionProvider {
  private compiledPatterns: Array<{
    pattern: FileLink;
    regex: RegExp;
  }> = [];

  public compileFileLinks(patterns: FileLink[]): void {
    this.compiledPatterns = [];

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern.pattern, "gd");
        this.compiledPatterns.push({ pattern, regex });
      } catch (error) {
        console.error(
          `Failed to compile file link pattern: ${pattern.pattern}`,
          error
        );
      }
    }
  }

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | undefined> {
    if (this.compiledPatterns.length === 0) {
      return undefined;
    }

    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check all compiled patterns for matches on this line
    for (const { pattern, regex } of this.compiledPatterns) {
      regex.lastIndex = 0; // Reset regex state
      let match;

      while ((match = regex.exec(lineText)) !== null) {
        let matchStart = match.index;
        let matchEnd = match.index + match[0].length;

        // Check if the position is within this match
        if (
          position.character >= matchStart &&
          position.character <= matchEnd
        ) {
          let targetUri = await this.resolveTargetUri(match, pattern);
          if (targetUri) {
            // Check if the target file actually exists
            try {
              await vscode.workspace.fs.stat(targetUri);
              const targetRange = this.resolveLineNumber(match, pattern);

              const matchBounds = this.getMatchBounds(match);
              if (matchBounds) {
                matchStart = matchBounds.start;
                matchEnd = matchBounds.end;
              }

              return [
                {
                  targetUri,
                  targetRange,
                  targetSelectionRange: targetRange,
                  originSelectionRange: new vscode.Range(
                    position.line,
                    matchStart,
                    position.line,
                    matchEnd
                  ),
                },
              ];
            } catch {
              // File does not exist, ignore this match
              continue;
            }
          }
        }
      }
    }

    return undefined;
  }

  private getMatchBounds(
    match: RegExpMatchArray
  ): { start: number; end: number } | undefined {
    if (match.index === undefined) {
      return undefined;
    }

    if (match.length > 1) {
      // If there are capturing groups but no named groups, use first and last group
      let minStart = Number.MAX_SAFE_INTEGER;
      let maxEnd = Number.MIN_SAFE_INTEGER;

      for (let i = 1; i < match.length; i++) {
        minStart = Math.min(
          minStart,
          match.indices?.[i]?.[0] ?? Number.MAX_SAFE_INTEGER
        );
        maxEnd = Math.max(
          maxEnd,
          match.indices?.[i]?.[1] ?? Number.MIN_SAFE_INTEGER
        );
      }

      if (
        minStart !== Number.MAX_SAFE_INTEGER &&
        maxEnd !== Number.MIN_SAFE_INTEGER
      ) {
        return { start: minStart, end: maxEnd };
      }
    } else if (match.index !== undefined) {
      // No groups, return whole match
      return { start: match.index, end: match.index + match[0].length };
    }

    return undefined;
  }

  private async resolveTargetUri(
    match: RegExpMatchArray,
    pattern: FileLink
  ): Promise<vscode.Uri | undefined> {
    // Use the fileUri template and replace placeholders
    let fileUri = pattern.fileUri;

    for (let i = 1; i < match.length; i++) {
      const placeholder = `$${i}`;
      fileUri = fileUri.replace(
        new RegExp("\\" + placeholder, "g"),
        match[i] || ""
      );
    }

    if (!fileUri || fileUri.trim() === "") {
      return undefined;
    }

    return this.resolveFileUri(fileUri.trim());
  }

  private async resolveFileUri(
    filePath: string
  ): Promise<vscode.Uri | undefined> {
    let targetUri: vscode.Uri;

    if (path.isAbsolute(filePath)) {
      // Absolute path
      targetUri = vscode.Uri.file(filePath);
    } else {
      // Check if file exists relative to workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        for (const folder of workspaceFolders) {
          const workspaceRelative = vscode.Uri.joinPath(folder.uri, filePath);
          try {
            await vscode.workspace.fs.stat(workspaceRelative);
            return workspaceRelative; // Found valid path
          } catch {
            // Not found in this folder, continue checking
          }
        }
      }

      // Try to find path in subdirectories of workspace
      const foundPaths = await vscode.workspace.findFiles(
        "**/" + filePath,
        undefined,
        1
      );
      if (foundPaths.length > 0) {
        return foundPaths[0];
      }
    }

    return undefined;
  }

  private resolveLineNumber(
    match: RegExpMatchArray,
    pattern: FileLink
  ): vscode.Range {
    let lineNumber = 0;

    if (pattern.lineNumber) {
      let lineNumberStr = pattern.lineNumber;

      for (let i = 1; i < match.length; i++) {
        const placeholder = `$${i}`;
        lineNumberStr = lineNumberStr.replace(
          new RegExp("\\" + placeholder, "g"),
          match[i] || ""
        );
      }

      const parsedLine = parseInt(lineNumberStr, 10);
      if (!isNaN(parsedLine) && parsedLine > 0) {
        lineNumber = parsedLine - 1; // Convert to 0-based
      }
    }

    const position = new vscode.Position(lineNumber, 0);
    return new vscode.Range(position, position);
  }
}
