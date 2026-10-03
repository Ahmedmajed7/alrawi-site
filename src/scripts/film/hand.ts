/**
 * The coach's hand (film/phone.ts on the phone, film/device-live.ts on the light switch): a pointing hand that shows the gesture
 * on the control itself, the way a game teaches a move, styled in 05-walkthrough.css (`.coach-hand`). A 24-unit box with the
 * fingertip at (9, 2): the drawing is placed so that point sits on the control.
 */
export const HAND = 'M7.5 15.5V3.6a1.5 1.5 0 0 1 3 0V10a1.5 1.5 0 0 1 3 .2v.6a1.5 1.5 0 0 1 3 .3v.6a1.5 1.5 0 0 1 3 .4V16c0 3.6-2.6 6-6 6h-1.6c-2.2 0-3.5-.8-4.7-2.1l-3-3.4a1.4 1.4 0 0 1 2-2L7.5 15.5Z';
export const KNUCKLES = 'M10.5 10v3M13.5 10.8v2.6M16.5 11.7v2.2';
/** the hand's markup: a ring where the fingertip presses, and the drawing (no <i>: the app's switch styles every <i> in it) */
export const handHtml = `<b class="coach-ring"></b><svg viewBox="0 0 24 24"><path d="${HAND}"/><path class="k" d="${KNUCKLES}"/></svg>`;
