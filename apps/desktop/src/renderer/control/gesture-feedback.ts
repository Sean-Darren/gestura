import type { GestureDetection } from '@gestura/core'
const reasons: Record<GestureDetection['reason'], string> = {
  ready: 'Ready. Keep your head still, close your eyes, then reopen.',
  'mode-off': 'Click gestures are off.',
  'eyes-not-open': 'Waiting for both eyes to reopen before arming a gesture.',
  'face-lost': 'Face lost. No click detected.',
  'invalid-eye-signal': 'An eye signal is missing or has not crossed its open/closed threshold.',
  moving: 'Rejected: the cursor was moving too quickly during the gesture.',
  speech: 'Rejected: speech or mouth movement was detected during the gesture.',
  'too-short': 'Rejected: the eye closure was shorter than the calibrated minimum.',
  'too-long': 'Rejected: both eyes stayed closed longer than the allowed maximum.',
  unsynchronised: 'Rejected: the two eyes closed too far apart in time.',
  reclosed: 'Rejected: an eye closed again before both eyes had reopened.',
  cooldown: 'Rejected: another click happened too recently.',
  'left-wink-unmapped': 'Left-eye wink detected. Only a right-eye wink sends a right click.',
  dragging: 'Blink clicks are suppressed while dragging.',
  accepted: 'Gesture accepted. Check click delivery below.'
}
export function gestureReasonText(reason: GestureDetection['reason']): string {
  return reasons[reason]
}
