// Analysis result type definitions for the tree view and UI components

import { MatchResult, LogConfig, SeverityLevel } from './configTypes';

// Enhanced tree node hierarchy for the new configuration system
export type EnhancedTreeNode = ConfigGroupNode | MatchGroupNode | FileLocationNode;

export interface ConfigGroupNode {
  type: 'config-group';
  id: string;
  configName: string;
  totalMatches: number;
  children: MatchGroupNode[];
  icon: string;
  uri: string[];
}

export interface MatchGroupNode {
  type: 'match-group';
  id: string;
  groupName: string;
  severity: SeverityLevel;
  locations: FileLocationNode[];
  icon: string;
  color: string;
  uri: string[];
  totalMatches: number;
}

export interface FileLocationNode {
  type: 'file-location';
  id: string;
  filePath: string;
  line: number;
  column: number;
  context: string;
  message: string;
  matcherName: string;
  severity: SeverityLevel;
  preview: string;
  uri: string[];
}

// Analysis statistics for status bar and reporting
export interface AnalysisStatistics {
  totalFiles: number;
  totalLines: number;
  totalMatches: number;
  criticalIssues: number;
  highSeverityIssues: number;
  mediumSeverityIssues: number;
  lowSeverityIssues: number;
  lastAnalysis?: Date;
  analysisTime?: number;
}

// Configuration validation result
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

// File analysis context
export interface FileAnalysisContext {
  filePath: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  encoding: string;
  config: LogConfig;
  isLargeFile: boolean;
}

// Real-time analysis event types
export interface AnalysisEvent {
  type: 'started' | 'progress' | 'completed' | 'error' | 'cancelled';
  filePath: string;
  timestamp: Date;
  data?: any;
}

// Minimap decoration information
export interface MinimapDecoration {
  line: number;
  severity: SeverityLevel;
  color: string;
  tooltip: string;
  matcherType: string;
}

export interface GroupedResults {
  bySeverity: Record<SeverityLevel, MatchResult[]>;
  byType: Record<string, MatchResult[]>;
  byTimeRange?: Record<string, MatchResult[]>;
}

// Configuration discovery and loading
export interface ConfigDiscoveryResult {
  found: boolean;
  path?: string;
  source: 'workspace' | 'home' | 'builtin' | 'detected';
  detector?: string;
}

export interface ConfigLoadResult {
  success: boolean;
  config?: LogConfig;
  errors?: string[];
  warnings?: string[];
  path: string;
}

// Performance monitoring
export interface PerformanceMetrics {
  configLoadTime: number;
  patternCompileTime: number;
  fileAnalysisTime: number;
  uiUpdateTime: number;
  memoryUsage: number;
  totalTime: number;
}
