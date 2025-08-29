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

      if (pattern.allowSearch === undefined) {
        pattern.allowSearch = true; // Default to true if not set
      }

      if (pattern.paths === undefined) {
        pattern.paths = ["."]; // Default to workspace root directory
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
              const targetRange = this.resolveLineNumber(match, pattern);
              const matchBounds = this.getMatchBounds(match);
              if (matchBounds) {
                matchStart = matchBounds.start;
                matchEnd = matchBounds.end;
              }

              // Check again if position is within updated match bounds
              // Whole match can contain some extra text before/after the actual path.
              if (
                position.character < matchStart ||
                position.character > matchEnd
              ) {
                continue;
              }

              // Check if file exists at the end of all processing
              await vscode.workspace.fs.stat(targetUri);

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

    return this.resolveFileUri(fileUri.trim(), pattern);
  }

  private async resolveFileUri(
    filePath: string,
    pattern: FileLink
  ): Promise<vscode.Uri | undefined> {
    let targetUri: vscode.Uri;

    if (path.isAbsolute(filePath)) {
      // Absolute path
      targetUri = vscode.Uri.file(filePath);
      try {
        await vscode.workspace.fs.stat(targetUri);
        return targetUri;
      } catch {
        return undefined;
      }
    } else {
      // Relative path - check in specified paths first, then workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
      }

      // If specific paths are configured, search only in those paths
      for (const folder of workspaceFolders) {
        for (const searchPath of pattern.paths) {
          const basePath = vscode.Uri.joinPath(folder.uri, searchPath);
          const fullPath = vscode.Uri.joinPath(basePath, filePath);

          try {
            await vscode.workspace.fs.stat(fullPath);
            return fullPath; // Found valid path
          } catch {
            // Not found in this path, continue checking
          }
        }
      }

      // If allowSearch is disabled or not set, don't fall back to global search
      if (pattern.allowSearch === false) {
        return undefined;
      }

      // If allowSearch is not explicitly disabled, try to find path in subdirectories
      let searchPattern = "**/" + filePath;

      // If specific paths are configured, limit search to those paths
      if (pattern.paths && pattern.paths.length > 0) {
        for (const searchPath of pattern.paths) {
          const limitedPattern = searchPath + "/**/" + filePath;
          const foundPaths = await vscode.workspace.findFiles(
            limitedPattern,
            undefined,
            1
          );
          if (foundPaths.length > 0) {
            return foundPaths[0];
          }
        }
      } else {
        // Search globally in workspace
        const foundPaths = await vscode.workspace.findFiles(
          searchPattern,
          undefined,
          1
        );
        if (foundPaths.length > 0) {
          return foundPaths[0];
        }
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
