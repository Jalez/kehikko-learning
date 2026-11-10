import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { rowsAdvice } from 'kehikot-module-protocol'

import { ROWS_PATH, rows, rowsText } from '../dev/rows.ts'

describe('the rows kehikot-check-rows reads', () => {
  test('kehikot.rows.json is what the row functions make now (bun run rows writes it)', () => {
    expect(readFileSync(ROWS_PATH, 'utf8')).toBe(rowsText())
  })

  test('the header and footer are placed by the rule, in every state', () => {
    for (const one of rows()) expect(rowsAdvice(one.header, one.footer, { state: one.state })).toEqual([])
  })
})
