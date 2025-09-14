import * as crypto from "crypto";

/**
 * Utility functions for generating checksums
 */
export class ChecksumUtils {
  /**
   * Calculate SHA256 checksum of document content
   */
  static calculateDocumentChecksum(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16); // Use first 16 chars for shorter keys
  }
}