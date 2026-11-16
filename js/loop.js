// Fixed-timestep helper: how many simulation ticks to run this frame.

export function stepsForFrame(accumulator, frameDt, tickDt, maxSteps = 5) {
  let acc = accumulator + Math.max(0, frameDt);
  let steps = Math.floor(acc / tickDt + 1e-6);
  if (steps > maxSteps) {
    // A long hitch (tab hidden, debugger): don't fast-forward, just drop the extra time.
    steps = maxSteps;
    acc = acc % tickDt;
  } else {
    acc -= steps * tickDt;
  }
  if (acc < 0) acc = 0;
  return { steps, accumulator: acc };
}
