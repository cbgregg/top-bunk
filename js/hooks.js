// The frame's fixed list of modules. main.js's update() is a skeleton of named calls and never changes: a module that needs the frame
// (the parents at night, the door rules, the forest, the day's rings, the afternoons' clock, the spine) fills its own file and the
// skeleton reaches it through `hooks.<module>`, which carries a no-op default for every call the frame makes until the module is written.
// The modules are imported statically, so every one of them must be a real file (an unwritten module is a stub that exports nothing but
// `install`), and MODULES fixes the order their install(game) runs in at boot: the breakfast's dressing slots exist before the day fills
// them, and the event modules come after the doors they hook. Nobody edits this list; a module is filled in its own file.
import * as parents from './parents.js';
import * as doors from './doors.js';
import * as breakfast from './breakfast.js';
import * as day from './day.js';
import * as days from './days.js';
import * as barn from './barn.js';
import * as forest from './forest.js';
import * as spine from './spine.js';
import * as reflect from './reflect.js';
import * as eventsExisting from './events/existing.js';
import * as eventsWaveA from './events/wave_a.js';
import * as eventsWaveB from './events/wave_b.js';
import * as eventsWaveC from './events/wave_c.js';

const noop = () => {};
// what the frame calls on each module, so a call lands before the module is written (its exports replace these when it is)
const DEFAULTS = {
  parents: { update: noop },   // hooks.parents.update(dt): the sleep simulation and the noise ledger
  doors: { tick: noop },       // hooks.doors.tick(dt): the night door rules, the pocket's refusal
  forest: { update: noop },    // hooks.forest.update(dt): the forest zone and its rules
  day: { tick: noop },         // hooks.day.tick(dt): moving day's rings
  days: { tick: noop },        // hooks.days.tick(dt): the afternoons' clock
  spine: { start: noop },      // hooks.spine.start(n): the night's spine beat
};
// the modules, in install order
export const MODULES = ['parents', 'doors', 'breakfast', 'day', 'days', 'barn', 'forest', 'spine', 'reflect', 'events/existing', 'events/wave_a', 'events/wave_b', 'events/wave_c'];
const LOADED = { parents, doors, breakfast, day, days, barn, forest, spine, reflect, 'events/existing': eventsExisting, 'events/wave_a': eventsWaveA, 'events/wave_b': eventsWaveB, 'events/wave_c': eventsWaveC };

// a hooks object over a list of [name, module] pairs: each module's exports merged over its defaults, plus install(game), which runs every
// module's optional install once, in list order; one that throws is reported by name and the rest still run (the names are in hooks.failed)
export function makeHooks(list) {
  const hooks = { failed: [], installed: false };
  for (const [name, mod] of list) hooks[name] = { install: noop, ...(DEFAULTS[name] || {}), ...mod };
  hooks.install = (game) => {
    if (hooks.installed) return false;   // once, at boot
    hooks.installed = true;
    for (const [name] of list) {
      try { hooks[name].install(game); }
      catch (e) { hooks.failed.push(name); console.error(`module ${name} failed to install: ${(e && e.stack) || e}`); }
    }
    return true;
  };
  return hooks;
}
export const hooks = makeHooks(MODULES.map((name) => [name, LOADED[name]]));
export const install = hooks.install;
export default hooks;
