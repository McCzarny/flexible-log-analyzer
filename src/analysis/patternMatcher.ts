import * as vscode from "vscode";
import {
  LogConfig,
  Matcher,
  CompiledMatcher,
  MatchResult,
  AnalysisResult,
  SeverityLevel,
} from "../types/configTypes";
import { PerformanceMetrics, PerformanceLogger, FileLinkMatch } from "../types/analysisTypes";
import { FileLinkProvider } from "../ui/fileLinkProvider";
import { ChecksumUtils } from "../utils/checksumUtils";

export class PatternMatcher {
  private compiledMatchers: CompiledMatcher[] = [];
  private outputChannel: vscode.OutputChannel;
  private compiledMatcherChecksum: string = "";
  private fileLinkProvider: FileLinkProvider;
  private performanceLogger: PerformanceLogger;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.fileLinkProvider = new FileLinkProvider();
    this.performanceLogger = new PerformanceLogger(outputChannel);
  }

  compile(config: LogConfig): void {
    this.outputChannel.appendLine(
      `Compiling patterns for config: ${config.name}`
    );
    
    const timer = this.performanceLogger.createTimer(`Pattern compilation for ${config.name}`);
    timer.start();

    this.compiledMatchers = [];
    this.compiledMatcherChecksum = "";

    try {
      for (const matcher of config.matchers) {
        // Skip disabled matchers
        if (matcher.enabled === false) {
          this.outputChannel.appendLine(
            `Skipping disabled matcher: ${matcher.name}`
          );
          continue;
        }

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
      const compileTime = timer.stop();
      
      // Log performance metrics
      if (this.performanceLogger.isLoggingEnabled()) {
        this.performanceLogger.logMetrics('Pattern Compilation', {
          patternCompileTime: compileTime,
          totalTime: compileTime
        }, `${config.name} (${this.compiledMatchers.length} matchers)`);
      }
      
      this.outputChannel.appendLine(
        `Compiled ${this.compiledMatchers.length} matchers in ${compileTime.toFixed(2)}ms`
      );
    } catch (error) {
      const errorTime = timer.elapsed();
      this.performanceLogger.logError('Pattern compilation', error as Error, errorTime);
      this.outputChannel.appendLine(`Error compiling patterns: ${error}`);
      throw error;
    }
  }

  private compileMatcher(matcher: Matcher): CompiledMatcher | null {
    try {
      let flags = "";
      if (matcher.ignoreCase) {
        flags += "i";
      }
      if (matcher.multiline) {
        flags += "m";
      }

      const regex = new RegExp(matcher.pattern, flags);

      let ignoreRegex: RegExp | undefined;
      if (matcher.ignorePattern) {
        try {
          ignoreRegex = new RegExp(matcher.ignorePattern, flags);
        } catch (error) {
          this.outputChannel.appendLine(
            `Failed to compile ignore pattern for matcher "${matcher.name}": ${error}`
          );
          // Continue without ignore pattern if it's invalid
        }
      }

      return {
        original: matcher,
        regex,
        ignoreRegex,
        compiledAt: new Date(),
      };
    } catch (error) {
      this.outputChannel.appendLine(
        `Failed to compile matcher "${matcher.name}": ${error}`
      );
      return null;
    }
  }

  matchLine(line: string, lineNumber: number): MatchResult[] {
    if (!this.compiledMatcherChecksum) {
      throw new Error("Patterns must be compiled before matching");
    }

    const results: MatchResult[] = [];

    for (const compiledMatcher of this.compiledMatchers) {
      const match = compiledMatcher.regex.exec(line);
      if (match) {
        // Check if line should be ignored
        if (
          compiledMatcher.ignoreRegex &&
          compiledMatcher.ignoreRegex.test(line)
        ) {
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
          originalLine: line,
        };

        results.push(result);
      }
    }

    return results;
  }

  async analyzeFile(
    filePath: string,
    config: LogConfig,
    textContent: string
  ): Promise<AnalysisResult> {
    const timer = this.performanceLogger.createTimer(`File analysis for ${filePath}`);
    timer.start();
    
    const fileName = filePath.split('/').pop() || filePath;
    const fileSizeBytes = new TextEncoder().encode(textContent).length;
    
    this.outputChannel.appendLine(
      `Starting analysis of ${fileName} (${fileSizeBytes} bytes)`
    );

    try {
      // Compile patterns if not already compiled
      let compileTime = 0;
      if (this.compiledMatcherChecksum !== config.checksum) {
        this.compile(config);
      }

      // Analyze the provided text content
      const contentResults = await this.analyzeTextContent(
        textContent,
        filePath
      );
      const matches = contentResults.matches;
      const totalLines = contentResults.totalLines;
      const fileLinks = contentResults.fileLinks;

      const analysisTime = timer.stop();
      const summary = this.createAnalysisSummary(matches);

      // Calculate badge count from matches where includeInCount=true (default: false)
      const badgeCount = matches.filter(
        (match) => match.matcher.includeInCount === true
      ).length;

      const documentChecksum = ChecksumUtils.calculateDocumentChecksum(textContent);

      // Log performance metrics
      if (this.performanceLogger.isLoggingEnabled()) {
        this.performanceLogger.logMetrics('File Analysis', {
          fileAnalysisTime: analysisTime - compileTime,
          patternCompileTime: compileTime,
          totalTime: analysisTime,
          fileSizeBytes,
          lineCount: totalLines,
          matchCount: matches.length
        }, fileName);
      }

      this.outputChannel.appendLine(
        `Analysis completed: ${matches.length} matches, ${fileLinks.length} file links found in ${totalLines} lines (${analysisTime.toFixed(2)}ms)`
      );

      return {
        filePath,
        totalLines,
        matches,
        fileLinks,
        config,
        analysisTime,
        summary,
        badgeCount,
        documentChecksum
      };
    } catch (error) {
      const errorTime = timer.elapsed();
      this.performanceLogger.logError('File analysis', error as Error, errorTime);
      this.outputChannel.appendLine(
        `Error analyzing file ${fileName}: ${error}`
      );
      throw error;
    }
  }

  private async analyzeTextContent(
    textContent: string,
    _filePath: string
  ): Promise<{
    matches: MatchResult[];
    totalLines: number;
    fileLinks: FileLinkMatch[];
  }> {
    const lines = textContent.split("\n");

    const matches: MatchResult[] = [];

    for (let i = 0; i < lines.length; i++) {
      const lineMatches = this.matchLine(lines[i], i + 1);
      matches.push(...lineMatches);
    }

    // File links are now handled by DefinitionProvider
    const fileLinks: FileLinkMatch[] = [];

    return {
      matches,
      totalLines: lines.length,
      fileLinks,
    };
  }

  private extractMessage(line: string, matcher: Matcher): string {
    // Extract a meaningful message from the matched line
    if (matcher.description) {
      return matcher.description;
    }

    // Try to extract the error message part
    const trimmed = line.trim();
    if (trimmed.length > 100) {
      return trimmed.substring(0, 97) + "...";
    }

    return trimmed;
  }

  private extractContext(
    line: string,
    startIndex: number,
    matchLength: number
  ): string {
    const contextStart = Math.max(0, startIndex - 20);
    const contextEnd = Math.min(line.length, startIndex + matchLength + 20);

    let context = line.substring(contextStart, contextEnd);

    if (contextStart > 0) {
      context = "..." + context;
    }
    if (contextEnd < line.length) {
      context = context + "...";
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
        critical: 0,
      } as Record<SeverityLevel, number>,
      matchesByType: {} as Record<string, number>,
      mostCommonIssue: undefined as string | undefined,
    };

    const typeCount: Record<string, number> = {};
    let maxCount = 0;
    let mostCommonType = "";

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
    return (
      this.compiledMatcherChecksum.length > 0 &&
      this.compiledMatchers.length > 0
    );
  }

  getPerformanceMetrics(): PerformanceMetrics {
    // Return basic performance metrics - these would be populated during actual analysis
    return {
      configLoadTime: 0,
      patternCompileTime: 0,
      fileAnalysisTime: 0,
      uiUpdateTime: 0,
      totalTime: 0,
      fileSizeBytes: 0,
      matchCount: 0,
      lineCount: 0,
      cacheHit: false,
    };
  }

  dispose(): void {
    this.compiledMatchers = [];
    this.compiledMatcherChecksum = "";
    // FileLinkProvider no longer needs disposal
    // Note: outputChannel is shared and disposed by the extension
  }
}
