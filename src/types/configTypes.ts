// Configuration type definitions for the flexible log analyzer

export interface LogConfig {
  version: string;
  name: string;
  description?: string;
  detector?: LogDetector;
  settings?: ConfigSettings;
  matchers: Matcher[];
  highlighting?: HighlightRule[];
  groups?: GroupRule[];
  filePatterns?: string[];
  fileLinks?: FileLink[];
  performance?: PerformanceSettings;
  checksum: string;
}

export interface LogDetector {
  type: 'first-line' | 'content' | 'filename';
  pattern: string;
  changeLanguageMode?: boolean;
}

export interface ConfigSettings {
  caseSensitive?: boolean;
  multiline?: boolean;
  maxFileSize?: string;
  encoding?: string;
}

export interface Matcher {
  name: string;
  type: string;
  severity: SeverityLevel;
  pattern: string;
  ignorePattern?: string;
  color: string;
  minimap: boolean;
  description?: string;
  ignoreCase?: boolean;
  multiline?: boolean;
  icon?: string;
}

export interface HighlightRule {
  name: string;
  pattern: string;
  style: HighlightStyle;
}

export interface HighlightStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
}

export interface GroupRule {
  name: string;
  description?: string;
  matchers: string[];
  icon: string;
  color: string;
  priority: number;
}

export interface PerformanceSettings {
  maxLinesPerAnalysis?: number;
  analysisTimeout?: number;
  cacheResults?: boolean;
  debounceInterval?: number;
}

export interface FileLink {
  pattern: string;
  fileUri: string;
  lineNumber?: string;
}

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CompiledMatcher {
  original: Matcher;
  regex: RegExp;
  ignoreRegex?: RegExp;
  compiledAt: Date;
}

export interface MatchResult {
  matcher: Matcher;
  line: number;
  column: number;
  length: number;
  severity: SeverityLevel;
  message: string;
  context?: string;
  timestamp?: Date;
  originalLine: string;
}

export interface AnalysisResult {
  filePath: string;
  totalLines: number;
  matches: MatchResult[];
  fileLinks?: import('./analysisTypes').FileLinkMatch[];
  config: LogConfig;
  analysisTime: number;
  errors?: string[];
  summary: AnalysisSummary;
  configPath?: string;     // Path to the configuration file used
}

export interface AnalysisSummary {
  totalMatches: number;
  matchesBySeverity: Record<SeverityLevel, number>;
  matchesByType: Record<string, number>;
  mostCommonIssue?: string;
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}
