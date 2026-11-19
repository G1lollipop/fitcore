// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** Fails the next write of this kind on this table (after running `during`, if set). */
  fail: null as null | { table: string; kind: 'update' | 'delete'; message: string; nth?: number; during?: () => void },
  writes: [] as string[],
}))

vi.mock('@/lib/auth/require-user', () => ({ authedUserId: async () => ({ ok: true, userId: 'user-1' }) }))
vi.mock('@/lib/supabaseClient', () => {
  /** Just enough of the query builder, with user_settings.current_plan_id's foreign key enforced. */
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = []
    let op: { kind: 'select' } | { kind: 'update'; values: Row } | { kind: 'delete' } = { kind: 'select' }
    const matches = (row: Row) => filters.every(([k, v]) => row[k] === v)
    const run = () => {
      const rows = db.tables[table] ?? []
      if (op.kind !== 'select') {
        db.writes.push(`${op.kind} ${table}`)
        const f = db.fail
        const count = db.writes.filter((w) => w === `${op.kind} ${table}`).length
        if (f && f.table === table && f.kind === op.kind && count === (f.nth ?? 1)) {
          db.fail = null
          f.during?.()
          return { data: null, error: { message: f.message } }
        }
      }
      if (op.kind === 'update') {
        const values = op.values
        rows.filter(matches).forEach((row) => Object.assign(row, values))
        return { data: null, error: null }
      }
      if (op.kind === 'delete') {
        const doomed = rows.filter(matches)
        if (table === 'workout_plans') {
          const referenced = (db.tables.user_settings ?? []).some((s) => doomed.some((p) => p.id === s.current_plan_id))
          if (referenced) {
            return {
              data: null,
              error: { message: 'update or delete on table "workout_plans" violates foreign key constraint "user_settings_current_plan_id_fkey"' },
            }
          }
        }
        db.tables[table] = rows.filter((row) => !matches(row))
        return { data: null, error: null }
      }
      // Copies, like rows that came over the wire.
      return { data: rows.filter(matches).map((row) => ({ ...row })), error: null }
    }
    const builder = {
      select: () => builder,
      update: (values: Row) => ((op = { kind: 'update', values }), builder),
      delete: () => ((op = { kind: 'delete' }), builder),
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      is: (k: string, v: unknown) => (filters.push([k, v]), builder),
      single: async () => {
        const { data } = run()
        const row = (data as Row[])[0]
        return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } }
      },
      then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }
  return { supabase: { from } }
})

import { deletePlan } from '../plans'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  db.fail = null
  db.writes = []
  db.tables = {
    workout_plans: [
      { id: 'plan-1', creator_id: 'user-1' },
      { id: 'plan-2', creator_id: 'user-1' },
    ],
    user_settings: [{ user_id: 'user-1', current_plan_id: 'plan-1', current_plan_start_date: '2026-11-01' }],
  }
})

describe('deletePlan', () => {
  it('deletes the active plan and leaves the user with no current plan', async () => {
    // Before the fix this failed on user_settings_current_plan_id_fkey.
    await expect(deletePlan('plan-1')).resolves.toEqual({ success: true })

    expect(db.tables.workout_plans.map((p) => p.id)).toEqual(['plan-2'])
    expect(db.tables.user_settings[0]).toMatchObject({ current_plan_id: null, current_plan_start_date: null })
  })

  it('puts the plan back as current when the delete fails after unsetting it', async () => {
    db.fail = { table: 'workout_plans', kind: 'delete', message: 'canceling statement due to statement timeout' }

    const result = await deletePlan('plan-1')

    expect(result).toMatchObject({ success: false })
    expect(db.tables.workout_plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2'])
    // Same plan and the same start date as before: as if nothing had happened.
    expect(db.tables.user_settings[0]).toMatchObject({ current_plan_id: 'plan-1', current_plan_start_date: '2026-11-01' })
    expect(db.writes).toEqual(['update user_settings', 'delete workout_plans', 'update user_settings'])
  })

  it('does not overwrite a plan selected while the failed delete was running', async () => {
    db.fail = {
      table: 'workout_plans',
      kind: 'delete',
      message: 'connection reset',
      // Another tab makes plan-2 current in the meantime.
      during: () => Object.assign(db.tables.user_settings[0], { current_plan_id: 'plan-2', current_plan_start_date: '2026-11-15' }),
    }

    await expect(deletePlan('plan-1')).resolves.toMatchObject({ success: false })

    expect(db.tables.user_settings[0]).toMatchObject({ current_plan_id: 'plan-2', current_plan_start_date: '2026-11-15' })
  })

  it('does not delete anything when unsetting the current plan fails', async () => {
    db.fail = { table: 'user_settings', kind: 'update', message: 'permission denied' }

    await expect(deletePlan('plan-1')).resolves.toMatchObject({ success: false })

    expect(db.writes).toEqual(['update user_settings'])
    expect(db.tables.workout_plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2'])
    expect(db.tables.user_settings[0]).toMatchObject({ current_plan_id: 'plan-1', current_plan_start_date: '2026-11-01' })
  })

  it('reports the failure when the delete and the restore both fail', async () => {
    // The known gap without a transaction: the plan survives but is no longer
    // selected. The user still sees "Delete failed" and the plan in the list.
    db.fail = {
      table: 'workout_plans',
      kind: 'delete',
      message: 'connection reset',
      during: () => { db.fail = { table: 'user_settings', kind: 'update', message: 'connection reset', nth: 2 } },
    }

    await expect(deletePlan('plan-1')).resolves.toMatchObject({ success: false })

    expect(db.tables.workout_plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2'])
    expect(db.tables.user_settings[0]).toMatchObject({ current_plan_id: null })
  })

  it('keeps the current plan when deleting a different one', async () => {
    await expect(deletePlan('plan-2')).resolves.toEqual({ success: true })

    expect(db.tables.workout_plans.map((p) => p.id)).toEqual(['plan-1'])
    expect(db.tables.user_settings[0]).toMatchObject({ current_plan_id: 'plan-1', current_plan_start_date: '2026-11-01' })
    // The settings row is not touched at all.
    expect(db.writes).toEqual(['delete workout_plans'])
  })
})
