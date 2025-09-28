import { SeverityLevel } from "../types/configTypes";
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "../types/analysisTypes";

export class ConfigValidator {
  validate(config: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Check required fields
      if (!config.version) {
        errors.push({
          path: "version",
          message: "Configuration version is required",
        });
      }

      if (!config.name) {
        errors.push({
          path: "name",
          message: "Configuration name is required",
        });
      }

      if (!config.matchers || !Array.isArray(config.matchers)) {
        errors.push({
          path: "matchers",
          message: "Matchers array is required",
        });
      } else {
        // Validate each matcher
        config.matchers.forEach((matcher: any, index: number) => {
          this.validateMatcher(matcher, index, errors, warnings);
        });
      }

      // Validate version format
      if (config.version && !this.isValidVersion(config.version)) {
        warnings.push({
          path: "version",
          message:
            'Version should follow semantic versioning (e.g., "1.0", "1.0.0")',
          suggestion: 'Use format like "1.0" or "1.0.0"',
        });
      }

      // Validate groups if present
      if (config.groups && Array.isArray(config.groups)) {
        config.groups.forEach((group: any, index: number) => {
          this.validateGroup(group, index, config.matchers, errors, warnings);
        });
      }
    } catch (error) {
      errors.push({
        path: "root",
        message: `Validation error: ${error}`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateMatcher(
    matcher: any,
    index: number,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const basePath = `matchers[${index}]`;

    // Required fields
    if (!matcher.name) {
      errors.push({
        path: `${basePath}.name`,
        message: "Matcher name is required",
      });
    }

    if (!matcher.type) {
      errors.push({
        path: `${basePath}.type`,
        message: "Matcher type is required",
      });
    }

    if (!matcher.severity) {
      errors.push({
        path: `${basePath}.severity`,
        message: "Matcher severity is required",
      });
    } else if (!this.isValidSeverity(matcher.severity)) {
      errors.push({
        path: `${basePath}.severity`,
        message: "Severity must be one of: low, medium, high, critical",
      });
    }

    if (!matcher.pattern) {
      errors.push({
        path: `${basePath}.pattern`,
        message: "Matcher pattern is required",
      });
    } else {
      // Validate regex pattern
      try {
        new RegExp(matcher.pattern, matcher.ignoreCase ? "i" : "");
      } catch (error) {
        errors.push({
          path: `${basePath}.pattern`,
          message: `Invalid regex pattern: ${error}`,
        });
      }
    }

    // Validate ignore pattern if present
    if (matcher.ignorePattern) {
      try {
        new RegExp(matcher.ignorePattern, matcher.ignoreCase ? "i" : "");
      } catch (error) {
        errors.push({
          path: `${basePath}.ignorePattern`,
          message: `Invalid ignore regex pattern: ${error}`,
        });
      }
    }

    if (matcher.minimap === undefined) {
      warnings.push({
        path: `${basePath}.minimap`,
        message: "Consider specifying minimap visibility",
        suggestion: "Add minimap: true/false to control minimap display",
      });
    }

    // Validate icon format
    if (matcher.icon && !this.isValidIcon(matcher.icon)) {
      warnings.push({
        path: `${basePath}.icon`,
        message: "Icon should be a valid VS Code codicon",
        suggestion: 'Use format like "$(error)" or "$(warning)"',
      });
    }
  }

  private validateGroup(
    group: any,
    index: number,
    matchers: any[],
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const basePath = `groups[${index}]`;

    if (!group.name) {
      errors.push({
        path: `${basePath}.name`,
        message: "Group name is required",
      });
    }

    if (!group.matchers || !Array.isArray(group.matchers)) {
      errors.push({
        path: `${basePath}.matchers`,
        message: "Group matchers array is required",
      });
    } else {
      // Check if referenced matcher types exist
      const matcherTypes = new Set(matchers.map((m: any) => m.type));
      group.matchers.forEach((matcherType: string) => {
        if (!matcherTypes.has(matcherType)) {
          warnings.push({
            path: `${basePath}.matchers`,
            message: `Referenced matcher type "${matcherType}" not found in matchers`,
            suggestion:
              "Ensure all referenced matcher types are defined in the matchers section",
          });
        }
      });
    }

    if (!group.icon) {
      warnings.push({
        path: `${basePath}.icon`,
        message: "Group icon is recommended",
        suggestion:
          'Add an icon property with VS Code codicon (e.g., "$(error)")',
      });
    }

    if (
      group.priority !== undefined &&
      (typeof group.priority !== "number" || group.priority < 1)
    ) {
      warnings.push({
        path: `${basePath}.priority`,
        message: "Priority should be a positive number",
        suggestion: "Use a number starting from 1 (1 = highest priority)",
      });
    }
  }

  private isValidVersion(version: string): boolean {
    // Simple version validation (semantic versioning)
    return /^\d+\.\d+(\.\d+)?$/.test(version);
  }

  private isValidSeverity(severity: string): boolean {
    const validSeverities: SeverityLevel[] = [
      "low",
      "medium",
      "high",
      "critical",
    ];
    return validSeverities.includes(severity as SeverityLevel);
  }

  private isValidIcon(icon: string): boolean {
    // VS Code codicon format validation
    return /^\$\([a-zA-Z0-9-]+\)$/.test(icon);
  }
}
