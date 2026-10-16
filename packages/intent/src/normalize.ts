import { Converter } from 'opencc-js/t2cn'
import { CellRangeSchema } from '@gestura/core'

const fold = Converter({ from: 'hk', to: 'cn' })
const digits: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}
const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
function chineseNumber(text: string): string {
  if (!/[十百千万]/.test(text)) return [...text].map((c) => digits[c]).join('')
  let total = 0,
    section = 0,
    value = 0
  for (const char of text) {
    if (digits[char] !== undefined) value = digits[char]!
    else if (units[char] === 10000) {
      total += (section + value || 1) * 10000
      section = 0
      value = 0
    } else {
      section += (value || 1) * units[char]!
      value = 0
    }
  }
  return String(total + section + value)
}
const words: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
}
const numberPattern = new RegExp(
  `\\b(?:${Object.keys(words).join('|')}|hundred|thousand|million)(?:[ -]+(?:${Object.keys(words).join('|')}|hundred|thousand|million|and))*\\b`,
  'g'
)
function englishNumber(text: string): string {
  const tokens = text.split(/[ -]+/).filter((t) => t !== 'and')
  if (tokens.every((t) => words[t] !== undefined && words[t]! < 10))
    return tokens.map((t) => words[t]).join('')
  let total = 0,
    section = 0
  for (const token of tokens) {
    if (token === 'hundred') section = (section || 1) * 100
    else if (token === 'thousand' || token === 'million') {
      total += (section || 1) * (token === 'million' ? 1000000 : 1000)
      section = 0
    } else section += words[token] ?? 0
  }
  return String(total + section)
}
export function normalizeUtterance(text: string): string {
  return fold(text.normalize('NFKC'))
    .toLowerCase()
    .replace(/[廿卅卌]/g, (char) => ({ 廿: '二十', 卅: '三十', 卌: '四十' })[char]!)
    .replace(/[零〇一二两三四五六七八九十百千万]+/g, chineseNumber)
    .replace(numberPattern, englishNumber)
    .replace(/(\d)\s*[-–—]\s*(?=[a-z])/g, '$1:')
    .replace(/[^\p{L}\p{N}\s:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fffa-z0-9])/g, '$1')
    .replace(/([a-z0-9])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/^:+|:+$/g, '')
    .trim()
}
const letters: Record<string, string> = {
  ay: 'a',
  alpha: 'a',
  bee: 'b',
  bravo: 'b',
  see: 'c',
  sea: 'c',
  charlie: 'c',
  dee: 'd',
  delta: 'd',
  ee: 'e',
  echo: 'e',
  ef: 'f',
  foxtrot: 'f',
  gee: 'g',
  golf: 'g',
  aitch: 'h',
  haitch: 'h',
  hotel: 'h',
  eye: 'i',
  india: 'i',
  jay: 'j',
  juliet: 'j',
  kay: 'k',
  kilo: 'k',
  el: 'l',
  lima: 'l',
  em: 'm',
  mike: 'm',
  en: 'n',
  november: 'n',
  oh: 'o',
  oscar: 'o',
  pee: 'p',
  papa: 'p',
  cue: 'q',
  quebec: 'q',
  ar: 'r',
  romeo: 'r',
  ess: 's',
  sierra: 's',
  tee: 't',
  tango: 't',
  you: 'u',
  uniform: 'u',
  vee: 'v',
  victor: 'v',
  whiskey: 'w',
  ex: 'x',
  xray: 'x',
  why: 'y',
  yankee: 'y',
  zed: 'z',
  zee: 'z',
  zulu: 'z'
}
function cell(value: string): string | undefined {
  // A compact reference is literal: BEE2 is column BEE, while "bee two" is B2.
  const literal = /^[a-z]{1,3}[1-9]\d*$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : undefined
  if (literal) return CellRangeSchema.safeParse(literal).success ? literal : undefined
  const match = /^(.*?)\s*([1-9]\d*)$/.exec(value.trim())
  if (!match) return undefined
  const spoken = match[1]!.trim().replace(/double u/g, 'w')
  const column = spoken
    .split(/\s+/)
    .map((part) => letters[part] ?? part)
    .join('')
  const result = `${column}${match[2]}`.toUpperCase()
  return CellRangeSchema.safeParse(result).success ? result : undefined
}
export function normalizeRange(text: string): string | undefined {
  const value = normalizeUtterance(text).replace(/\b(?:to|through)\b|到|至/g, ':')
  const parts = value.split(':')
  if (parts.length > 2) return undefined
  const cells = parts.map(cell)
  if (cells.some((c) => !c)) return undefined
  return cells.join(':')
}
