import { describe, it, expect } from 'vitest'

describe('test framework sanity', () => {
  it('basic arithmetic works', () => {
    expect(1 + 1).toBe(2)
  })

  it('jsdom provides localStorage', () => {
    expect(typeof window).not.toBe('undefined')
    expect(typeof localStorage).not.toBe('undefined')
  })
})
