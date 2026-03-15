/**
 * Level estimator - stub implementation
 * TODO: Implement JLPT level estimation based on grammar exposure and vocabulary usage
 */

export type JLPTLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export function estimateLevel(_userId: string): JLPTLevel {
  // Stub: always returns N5
  return 'N5';
}
