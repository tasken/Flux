import { densityChars } from './settings.js'

const wordAlphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!\'"0123456789-'
const extraWordChars = [...wordAlphabet].filter((ch) => !densityChars.includes(ch))

export const chars = densityChars + extraWordChars.join('')
