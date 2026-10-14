import { describe, expect, it } from 'vitest'
import { UiRoleSchema, UiElementSchema, UiElementsSchema, UiNearArgsSchema } from './ui-elements'

const element = {
  bounds: { x: -10, y: 0, width: 48, height: 48 },
  role: 'button',
  name: 'Save',
  isEnabled: true,
  isOffscreen: false,
  isClickable: true
}
describe('UI query schemas', () => {
  it('defines exactly eight common control roles', () => {
    expect(UiRoleSchema.options).toEqual([
      'button',
      'link',
      'menu-item',
      'tab',
      'list-item',
      'check-box',
      'edit-field',
      'spreadsheet-cell'
    ])
    expect(UiElementSchema.parse(element)).toEqual(element)
    expect(() => UiElementSchema.parse({ ...element, role: 'text' })).toThrow()
    expect(() => UiElementSchema.parse({ ...element, value: 'private cell content' })).toThrow()
    expect(() =>
      UiElementSchema.parse({ ...element, bounds: { ...element.bounds, width: 0 } })
    ).toThrow()
  })
  it('caps results and validates physical radius', () => {
    expect(UiElementsSchema.parse(Array.from({ length: 50 }, () => element))).toHaveLength(50)
    expect(() => UiElementsSchema.parse(Array.from({ length: 51 }, () => element))).toThrow()
    expect(() => UiNearArgsSchema.parse([0, 0, -1])).toThrow()
    expect(() => UiNearArgsSchema.parse([Number.NaN, 0, 1])).toThrow()
  })
})
