// Tap-or-hold key behaviour (inventory, map):
//  - a press shorter than `threshold` seconds opens it and it stays open until the next press;
//  - a longer press keeps it open only until the key is released.

export function createHoldToggle({ threshold = 0.75, onOpen, onClose }) {
  let pressedAt = 0;
  let holding = false; // the press that opened it is still down
  const toggle = {
    open: false,
    /** Key went down (ignore auto-repeat). */
    press(now) {
      if (toggle.open) {
        toggle.open = false;
        holding = false;
        onClose();
        return;
      }
      toggle.open = true;
      holding = true;
      pressedAt = now;
      onOpen();
    },
    /** Key came up. */
    release(now) {
      if (!holding) return;
      holding = false;
      if (toggle.open && now - pressedAt >= threshold) {
        toggle.open = false;
        onClose();
      }
    },
    /** Something else closed it (pause, game over): just forget the state. */
    forceClose() {
      toggle.open = false;
      holding = false;
    },
  };
  return toggle;
}
