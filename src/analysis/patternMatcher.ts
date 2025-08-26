import * as vscode from 'vscode';
import { LogConfig, Matcher, CompiledMatcher, MatchResult, AnalysisResult, SeverityLevel } from '../types/configTypes';
import { FileAnalysisContext, PerformanceMetrics, FileLinkMatch } from '../types/analysisTypes';
import { FileLinkProvider } from '../ui/fileLinkProvider';

export class PatternMatcher {
  private compiledMatchers: CompiledMatcher[] = [];
  private outputChannel: vscode.OutputChannel;
  private compiledMatcherChecksum: string = '';
  private fileLinkProvider: FileLinkProvider;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.fileLinkProvider = new FileLinkProvider(outputChannel);
  }

  compile(config: LogConfig): void {
    this.outputChannel.appendLine(`Compiling patterns for config: ${config.name}`);
    const startTime = Date.now();

    this.compiledMatchers = [];
    this.compiledMatcherChecksum = '';

    try {
      for (const matcher of config.matchers) {
        const compiledMatcher = this.compileMatcher(matcher);
        if (compiledMatcher) {
          this.compiledMatchers.push(compiledMatcher);
        }
      }

      // Compile file links if present
      if (config.fileLinks && config.fileLinks.length > 0) {
        this.fileLinkProvider.compileFileLinks(config.fileLinks);
      }

      this.compiledMatcherChecksum = config.checksum;
      const compileTime = Date.now() - startTime;
      this.outputChannel.appendLine(`Compiled ${this.compiledMatchers.length} matchers in ${compileTime}ms`);
    } catch (error) {
      this.outputChannel.appendLine(`Error compiling patterns: ${error}`);
      throw error;
    }
  }

  private compileMatcher(matcher: Matcher): CompiledMatcher | null {
    try {
      let flags = '';
      if (matcher.ignoreCase) {
        flags += 'i';
      }
      if (matcher.multiline) {
        flags += 'm';
      }

      const regex = new RegExp(matcher.pattern, flags);
      
      let ignoreRegex: RegExp | undefined;
      if (matcher.ignorePattern) {
        try {
          ignoreRegex = new RegExp(matcher.ignorePattern, flags);
        } catch (error) {
          this.outputChannel.appendLine(`Failed to compile ignore pattern for matcher "${matcher.name}": ${error}`);
          // Continue without ignore pattern if it's invalid
        }
      }
      
      return {
        original: matcher,
        regex,
        ignoreRegex,
        compiledAt: new Date()
      };
    } catch (error) {
      this.outputChannel.appendLine(`Failed to compile matcher "${matcher.name}": ${error}`);
      return null;
    }
  }

  matchLine(line: string, lineNumber: number): MatchResult[] {
    if (!this.compiledMatcherChecksum) {
      throw new Error('Patterns must be compiled before matching');
    }

    const results: MatchResult[] = [];

    for (const compiledMatcher of this.compiledMatchers) {
      const match = compiledMatcher.regex.exec(line);
      if (match) {
        // Check if line should be ignored
        if (compiledMatcher.ignoreRegex && compiledMatcher.ignoreRegex.test(line)) {
          // Skip this match as it matches the ignore pattern
          continue;
        }

        const result: MatchResult = {
          matcher: compiledMatcher.original,
          line: lineNumber,
          column: match.index,
          length: match[0].length,
          severity: compiledMatcher.original.severity,
          message: this.extractMessage(line, compiledMatcher.original),
          context: this.extractContext(line, match.index, match[0].length),
          originalLine: line
        };

        results.push(result);
      }
    }

    return results;
  }

  async analyzeFile(filePath: string, config: LogConfig): Promise<AnalysisResult> {
    const startTime = Date.now();
    const context = await this.createAnalysisContext(filePath, config);
    
    this.outputChannel.appendLine(`Starting analysis of ${filePath} (${context.fileSize} bytes)`);

    try {
      // Compile patterns if not already compiled
      if (this.compiledMatcherChecksum !== config.checksum) {
        this.compile(config);
      }

      const matches: MatchResult[] = [];
      let totalLines = 0;
      let fileLinks: FileLinkMatch[] = [];

      if (context.isLargeFile) {
        // Use streaming analysis for large files
        const streamResults = await this.analyzeFileStream(filePath, context);
        matches.push(...streamResults.matches);
        totalLines = streamResults.totalLines;
        fileLinks = streamResults.fileLinks;
      } else {
        // Read entire file for smaller files
        const fileResults = await this.analyzeFileContent(filePath, context);
        matches.push(...fileResults.matches);
        totalLines = fileResults.totalLines;
        fileLinks = fileResults.fileLinks;
      }

      const analysisTime = Date.now() - startTime;
      const summary = this.createAnalysisSummary(matches);

      this.outputChannel.appendLine(
        `Analysis completed: ${matches.length} matches, ${fileLinks.length} file links found in ${totalLines} lines (${analysisTime}ms)`
      );

      return {
        filePath,
        totalLines,
        matches,
        fileLinks,
        config,
        analysisTime,
        summary
      };
    } catch (error) {
      this.outputChannel.appendLine(`Error analyzing file ${filePath}: ${error}`);
      throw error;
    }
  }

  private async createAnalysisContext(filePath: string, config: LogConfig): Promise<FileAnalysisContext> {
    const uri = vscode.Uri.file(filePath);
    const stat = await vscode.workspace.fs.stat(uri);
    
    // Get max file size from config or settings
    const maxFileSize = this.parseFileSize(config.settings?.maxFileSize || '50MB');
    
    return {
      filePath,
      fileName: uri.path.split('/').pop() || '',
      fileExtension: uri.path.split('.').pop() || '',
      fileSize: stat.size,
      encoding: config.settings?.encoding || 'utf-8',
      config,
      isLargeFile: stat.size > maxFileSize
    };
  }

  private parseFileSize(sizeString: string): number {
    const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
    if (!match) {
      return 50 * 1024 * 1024; // Default 50MB
    }

    const size = parseFloat(match[1]);
    const unit = (match[2] || '').toUpperCase();

    switch (unit) {
      case 'KB': return size * 1024;
      case 'MB': return size * 1024 * 1024;
      case 'GB': return size * 1024 * 1024 * 1024;
      default: return size;
    }
  }

  private async analyzeFileContent(filePath: string, context: FileAnalysisContext): Promise<{ matches: MatchResult[], totalLines: number, fileLinks: FileLinkMatch[] }> {
    const uri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString(context.encoding as BufferEncoding);
    const lines = text.split('\n');

    const matches: MatchResult[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const lineMatches = this.matchLine(lines[i], i + 1);
      matches.push(...lineMatches);
    }

    // Find file links in the content
    const fileLinks = this.fileLinkProvider.findFileLinks(text, filePath);

    return {
      matches,
      totalLines: lines.length,
      fileLinks
    };
  }

  private async analyzeFileStream(filePath: string, context: FileAnalysisContext): Promise<{ matches: MatchResult[], totalLines: number, fileLinks: FileLinkMatch[] }> {
    // For large files, we'd implement streaming analysis
    // For now, fall back to regular file reading with progress reporting
    return this.analyzeFileContent(filePath, context);
  }

  private extractMessage(line: string, matcher: Matcher): string {
    // Extract a meaningful message from the matched line
    if (matcher.description) {
      return matcher.description;
    }

    // Try to extract the error message part
    const trimmed = line.trim();
    if (trimmed.length > 100) {
      return trimmed.substring(0, 97) + '...';
    }
    
    return trimmed;
  }

  private extractContext(line: string, startIndex: number, matchLength: number): string {
    const contextStart = Math.max(0, startIndex - 20);
    const contextEnd = Math.min(line.length, startIndex + matchLength + 20);
    
    let context = line.substring(contextStart, contextEnd);
    
    if (contextStart > 0) {
      context = '...' + context;
    }
    if (contextEnd < line.length) {
      context = context + '...';
    }

    return context;
  }

  private createAnalysisSummary(matches: MatchResult[]) {
    const summary = {
      totalMatches: matches.length,
      matchesBySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      } as Record<SeverityLevel, number>,
      matchesByType: {} as Record<string, number>,
      mostCommonIssue: undefined as string | undefined
    };

    const typeCount: Record<string, number> = {};
    let maxCount = 0;
    let mostCommonType = '';

    for (const match of matches) {
      // Count by severity
      summary.matchesBySeverity[match.severity]++;
      
      // Count by type
      const type = match.matcher.type;
      typeCount[type] = (typeCount[type] || 0) + 1;
      summary.matchesByType[type] = typeCount[type];
      
      // Track most common
      if (typeCount[type] > maxCount) {
        maxCount = typeCount[type];
        mostCommonType = type;
      }
    }

    if (mostCommonType) {
      summary.mostCommonIssue = mostCommonType;
    }

    return summary;
  }

  getCompiledMatchers(): CompiledMatcher[] {
    return [...this.compiledMatchers];
  }

  getFileLinkProvider(): FileLinkProvider {
    return this.fileLinkProvider;
  }

  isReady(): boolean {
    return this.compiledMatcherChecksum.length > 0 && this.compiledMatchers.length > 0;
  }

  getPerformanceMetrics(): PerformanceMetrics {
    // Return basic performance metrics
    return {
      configLoadTime: 0,
      patternCompileTime: 0,
      fileAnalysisTime: 0,
      uiUpdateTime: 0,
      memoryUsage: 0,
      totalTime: 0
    };
  }

  dispose(): void {
    this.compiledMatchers = [];
    this.compiledMatcherChecksum = '';
    this.fileLinkProvider.dispose();
    // Note: outputChannel is shared and disposed by the extension
  }
}
