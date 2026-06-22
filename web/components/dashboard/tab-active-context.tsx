'use client'

import { createContext, useContext } from 'react'

/**
 * Whether the surrounding keep-alive `TabPanel` is the currently visible tab.
 *
 * Inactive tabs stay mounted (so re-visiting is instant) but are
 * `display:none`. framer-motion's `repeat: Infinity` loops keep running on
 * rAF even while hidden, burning CPU/GPU. Components with infinite animations
 * read this flag and freeze when their tab isn't active.
 *
 * Defaults to `true` so components used outside a TabPanel animate normally.
 */
const TabActiveContext = createContext<boolean>(true)

export const TabActiveProvider = TabActiveContext.Provider

export function useTabActive(): boolean {
  return useContext(TabActiveContext)
}
