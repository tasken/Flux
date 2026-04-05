import { gridDensityChars } from './settings.js'

const wordAlphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!\'"0123456789-'
const extraWordChars = [...wordAlphabet].filter((ch) => !gridDensityChars.includes(ch))

export const chars = gridDensityChars + extraWordChars.join('')
