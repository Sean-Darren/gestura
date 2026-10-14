import { PauseController } from '../pause'
import { createNativeInput } from './index'

export const pause = new PauseController()
export const nativeInput = createNativeInput(pause)

import { createNativeUiQueries } from './ui-elements'
export const nativeUi = createNativeUiQueries(pause)
