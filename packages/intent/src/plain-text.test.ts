import { expect, it } from 'vitest'
import { IntentMatcher } from './matcher'
it('matches English, Cantonese and mixed text requests without changing reply content', () => {
  const matcher = new IntentMatcher()
  for (const [text, id] of [
    ['rewrite this formally', 'rewrite-formally'],
    ['幫我改正式啲', 'rewrite-formally'],
    ['譯做英文', 'translate-en'],
    ['translate to Chinese', 'translate-zh'],
    ['translate 做中文', 'translate-zh']
  ])
    expect(matcher.match(text!)).toMatchObject({ kind: 'match', intent: { id } })
  expect(matcher.match('幫我覆佢話 Hello 你好 = ( ) : $')).toMatchObject({
    kind: 'match',
    intent: { id: 'reply-request', slots: { request: 'Hello 你好 = ( ) : $' } }
  })
})
