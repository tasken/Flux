import { gridDensityChars } from './settings.js'

const wordAlphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!\'"/-_'
const extraWordChars = [...wordAlphabet].filter((ch) => !gridDensityChars.includes(ch))

export const chars = gridDensityChars + extraWordChars.join('')
