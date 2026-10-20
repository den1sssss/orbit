// Daily reflection prompts. The prompt for a date is deterministic, so the
// same day always opens with the same question (until the user shuffles).
import { diffDays } from '@/lib/dates'
import type { ISODate } from '@/lib/types'

export const PROMPTS: readonly string[] = [
  'What made today meaningful?',
  'What drained your energy, and what restored it?',
  'What is one moment from today you want to remember?',
  'What challenged you today, and how did you respond?',
  'What did you learn about yourself today?',
  'Who made a difference to your day, and how?',
  'What are you quietly proud of today?',
  'If you could live today again, what would you do differently?',
  'What is weighing on your mind right now?',
  'When did you feel most like yourself today?',
  'What small win deserves a little celebration?',
  'What surprised you today?',
  'How did you take care of yourself today?',
  'What are you looking forward to?',
  'Which feeling showed up most today, and why?',
  'What did you spend time on that truly mattered?',
  'What are you ready to let go of?',
  'Which conversation stayed with you today?',
  'What progress did you make toward something you care about?',
  'What would make tomorrow a good day?',
  'What did you notice today that you usually overlook?',
  'When did you feel calm or at ease today?',
  'What question have you been sitting with lately?',
  'If today were a chapter in your life, what would it be called?',
]

const EPOCH: ISODate = '2024-01-01'
/** Coprime with PROMPTS.length, so shuffling visits every prompt before repeating. */
const STEP = 7

/** Prompt for a date; `shuffle` steps through the rest of the list. */
export function promptFor(date: ISODate, shuffle = 0): string {
  const n = PROMPTS.length
  const base = diffDays(date, EPOCH)
  const i = (((base + shuffle * STEP) % n) + n) % n
  return PROMPTS[i]
}
