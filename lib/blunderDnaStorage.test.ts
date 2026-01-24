import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isSnapshotValid, normalizePlayerName } from './blunderDnaStorage'
import type { BlunderDnaSnapshot } from './blunderDnaV1'

describe('blunderDnaStorage', () => {
  describe('normalizePlayerName', () => {
    it('normalizes player names correctly', () => {
      expect(normalizePlayerName('JohnDoe')).toBe('johndoe')
      expect(normalizePlayerName('  John Doe  ')).toBe('john doe')
      expect(normalizePlayerName('JOHN_DOE')).toBe('john_doe')
      expect(normalizePlayerName('john-doe')).toBe('john-doe')
    })
  })
  
  describe('isSnapshotValid', () => {
    it('returns false for null snapshot', () => {
      expect(isSnapshotValid(null)).toBe(false)
    })
    
    it('returns true for fresh snapshot (within 24h)', () => {
      const snapshot: BlunderDnaSnapshot = {
        userId: 'testuser',
        snapshotDate: new Date().toISOString().slice(0, 10),
        gamesAnalyzed: 10,
        blundersTotal: 5,
        patterns: [],
        computedAt: new Date().toISOString(), // Just now
      }
      expect(isSnapshotValid(snapshot)).toBe(true)
    })
    
    it('returns false for expired snapshot (older than 24h)', () => {
      const now = Date.now()
      const expiredTime = now - (25 * 60 * 60 * 1000) // 25 hours ago
      
      const snapshot: BlunderDnaSnapshot = {
        userId: 'testuser',
        snapshotDate: new Date(expiredTime).toISOString().slice(0, 10),
        gamesAnalyzed: 10,
        blundersTotal: 5,
        patterns: [],
        computedAt: new Date(expiredTime).toISOString(),
      }
      expect(isSnapshotValid(snapshot)).toBe(false)
    })
    
    it('returns true for snapshot just under 24h old', () => {
      const now = Date.now()
      const almostExpiredTime = now - (23 * 60 * 60 * 1000) // 23 hours ago
      
      const snapshot: BlunderDnaSnapshot = {
        userId: 'testuser',
        snapshotDate: new Date(almostExpiredTime).toISOString().slice(0, 10),
        gamesAnalyzed: 10,
        blundersTotal: 5,
        patterns: [],
        computedAt: new Date(almostExpiredTime).toISOString(),
      }
      expect(isSnapshotValid(snapshot)).toBe(true)
    })
  })
})
