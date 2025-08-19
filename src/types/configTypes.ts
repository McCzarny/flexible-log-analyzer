// Configuration type definitions for the flexible log analyzer

export interface LogConfig {
  version: string;
  name: string;
  description?: string;
  detector?: LogDetector;
  settings?: ConfigSettings;
  logFormat?: LogFormat;
  matchers: Matcher[];
  highlighting?: HighlightRule[];
  groups?: GroupRule[];
  filePatterns?: string[];
  performance?: PerformanceSettings;
  export?: ExportSettings;
}

export interface LogDetector {
  type: 'first-line' | 'content' | 'filename';
  pattern: string;
  confidence?: number;
  changeLanguageMode?: boolean;
}

export interface ConfigSettings {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  multiline?: boolean;
  maxFileSize?: string;
  encoding?: string;
}

export interface LogFormat {
  name: string;
  description?: string;
  pattern: string;
  groups: Record<string, number>;
  timestampFormat?: string;
  timezone?: string;
}

export interface Matcher {
  name: string;
  type: string;
  severity: SeverityLevel;
  pattern: string;
  color: string;
  minimap: boolean;
  description?: string;
  ignoreCase?: boolean;
  wholeWord?: boolean;
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

export interface ExportSettings {
  formats?: string[];
  includeContext?: boolean;
  contextLines?: number;
  groupByType?: boolean;
  includeStatistics?: boolean;
  includeTimeline?: boolean;
}

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CompiledMatcher {
  original: Matcher;
  regex: RegExp;
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
  config: LogConfig;
  analysisTime: number;
  errors?: string[];
  summary: AnalysisSummary;
  configChecksum?: string; // SHA256 hash of the configuration used for analysis
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
