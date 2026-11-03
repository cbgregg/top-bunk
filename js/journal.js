// the kid's journal: a composition notebook that writes itself as the run goes. one entry a night (what kind of night it was, what he saw,
// what he photographed, whether it got him) and one a morning (what Mom and Dad said), his photos taped in on the night they were taken,
// and a page of rules he figured out, which only fills in as the game teaches them. it is kept in the run (RUN.journal, RUN.rules).

// the night's name in his words
const TITLES = {
  poltergeist: 'Our first night here', thirst: 'Somebody kept running the tap', ring: 'The phone rang and nobody was there',
  static: 'The TV turned itself on', mimic: 'Something used Mom\'s voice', blackout: 'The lights all went out', hunted: 'It came looking for me',
  paralysis: 'I woke up and couldn\'t move', teddy: 'Somebody took my bear', parents: 'Mom and Dad\'s door', quiet: 'Everything went quiet',
  car: 'The drive that wasn\'t real', vigil: 'Grandpa was in the hall', finale: 'Night ten',
};
// what a rule says, and what on screen teaches it (matched against the hints the game shows)
export const RULES = [
  { id: 'breath', text: 'Under the covers, hold your breath. It listens for breathing.', when: /hold\s*<b>|it heard you/i },
  { id: 'still', text: 'In the closet, stay still and keep quiet. It goes past.', when: null },
  { id: 'photo', text: 'Take pictures. They can\'t say a picture is a dream.', when: /take a photo/i },
  { id: 'stare', text: 'Don\'t look at it too long.', when: /don.t look|stop looking|look away/i },
  { id: 'lights', text: 'The lights help it find me. But it won\'t come into a lit room while I\'m looking at it. It waits right where the light stops.', when: /into the light/i },
  { id: 'flash', text: 'It hates the camera flash.', when: /flash/i },
  { id: 'dad', text: 'If Dad calls you at night, it isn\'t Dad.', when: null },
];

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export function createJournal({ RUN, save, proof, sfx }) {
  const J = () => (RUN.journal ||= {}), RL = () => (RUN.rules ||= {});
  const page = (key) => (J()[key] ||= []);
  const j = {
    // a line on a page ('n3' for night three, 'b3' for the morning after it); a line already there is not written twice
    note(key, text) { const p = page(key); if (!text || p.includes(text)) return; p.push(text); if (p.length > 14) p.shift(); save(); },
    night(n, type) { j.note('n' + n, '# ' + (TITLES[type] || TITLES.poltergeist)); },
    // a line said at breakfast: who said it, cut short like a kid would write it down
    said(n, who, html) { let t = plain(html).replace(/^(Mom|Dad|You):\s*/i, ''); if (t.length > 90) t = t.slice(0, 86).replace(/\s+\S*$/, '') + '...'; j.note('b' + n, `${who} said "${t}"`); },
    learn(id) { if (RL()[id] || !RULES.some((r) => r.id === id)) return false; RL()[id] = RUN.night || 1; save(); return true; },
    // the hints the game shows teach the rules (watched from the outside, so whoever adds a hint teaches the journal too)
    watch(el) {
      if (!el || typeof MutationObserver === 'undefined') return;
      new MutationObserver(() => { const h = el.innerHTML; for (const r of RULES) if (r.when && r.when.test(h)) j.learn(r.id); }).observe(el, { childList: true, characterData: true, subtree: true });
    },
    // the notebook: open on the latest page; arrows, swipes, or the buttons turn pages
    render(body, { at = null } = {}) {
      const pages = j.pages(); let i = at ?? Math.max(0, pages.length - 2);
      body.innerHTML = '<div class="nb" tabindex="0"><div class="nb-pages"></div><div class="nb-nav"><button type="button" class="nb-prev" aria-label="Previous page">&larr;</button><span class="nb-n"></span><button type="button" class="nb-next" aria-label="Next page">&rarr;</button></div></div>';
      const nb = body.querySelector('.nb'), holder = nb.querySelector('.nb-pages'), num = nb.querySelector('.nb-n');
      const draw = () => {
        i = Math.max(0, Math.min(pages.length - 1, i)); holder.innerHTML = pages[i] + (pages[i + 1] || '');   // a spread: two pages side by side when there is room
        num.textContent = `${i + 1} / ${pages.length}`;
      };
      const step = () => (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches ? 1 : 2);
      const turn = (d) => { const k = i; i = Math.max(0, Math.min(pages.length - 1, i + d * step())); if (i !== k) { if (sfx && sfx.pageTurn) sfx.pageTurn(); draw(); } };
      nb.querySelector('.nb-prev').onclick = () => turn(-1); nb.querySelector('.nb-next').onclick = () => turn(1);
      nb.addEventListener('keydown', (e) => { if (e.code === 'ArrowLeft') { turn(-1); e.preventDefault(); } if (e.code === 'ArrowRight') { turn(1); e.preventDefault(); } });
      let sx = null; nb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
      nb.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1); sx = null; });
      j.turn = turn; draw(); setTimeout(() => nb.focus(), 0);
    },
    // every page as html: the cover page, one per night that has happened (with its morning), and the rules
    pages() {
      const out = [], last = Math.max(1, Math.min(10, RUN.night || 1)), photos = RUN.photos || {}, at = RUN.evidenceAt || {};
      out.push(`<section class="nb-page nb-cover"><h3>MY JOURNAL</h3><p class="nb-l">Private. Keep out.</p><p class="nb-l">We moved in on a Saturday. The rent was cheap.</p><svg class="nb-doodle" viewBox="0 0 120 90"><path d="M10 80 L12 20 M70 80 L68 18 M11 50 L69 49 M12 30 L68 29" stroke="#8a6a44" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="96" cy="30" r="7" fill="#111"/><path d="M96 37 L95 66 M95 66 L88 86 M95 66 L103 86 M96 44 L84 58 M96 44 L110 56" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/></svg></section>`);
      for (let n = 1; n <= last; n++) {
        const lines = (J()['n' + n] || []).slice(), morning = J()['b' + n] || [];
        const title = (lines.find((l) => l.startsWith('# ')) || '').slice(2);
        const body = lines.filter((l) => !l.startsWith('# '));
        // what he photographed that night, in his words, and the prints taped in
        const shots = Object.keys(at).filter((k) => at[k] === n);
        const tells = shots.map((k) => proof && proof.tell ? proof.tell(k) : null).filter(Boolean);
        const tape = shots.filter((k) => photos[k]).slice(0, 3).map((k, q) => `<figure class="nb-tape" style="--r:${[-4, 3, -1][q]}deg"><img alt="" src="${photos[k]}"><figcaption>${esc((proof && proof.cap && proof.cap(k)) || '')}</figcaption></figure>`).join('');
        if (!body.length && !tells.length && !morning.length && n < last) body.push('Nothing happened. I don\'t believe it either.');
        out.push(`<section class="nb-page"><h4>Night ${n}</h4>${title ? `<p class="nb-t">${esc(title)}</p>` : ''}${[...body, ...tells].map((l) => `<p class="nb-l">${esc(l)}</p>`).join('')}${tape ? `<div class="nb-photos">${tape}</div>` : ''}${morning.length ? `<p class="nb-m">In the morning</p>${morning.map((l) => `<p class="nb-l">${esc(l)}</p>`).join('')}` : ''}</section>`);
      }
      const learned = RULES.filter((r) => RL()[r.id]);
      out.push(`<section class="nb-page nb-rules"><h4>Rules I figured out</h4>${learned.length ? `<ol>${learned.map((r) => `<li>${esc(r.text)}</li>`).join('')}</ol>` : '<p class="nb-l">None yet. It doesn\'t follow any.</p>'}${learned.length < RULES.length ? `<p class="nb-l nb-dim">${'.'.repeat(3)} there are more. I just don't know them yet.</p>` : ''}</section>`);
      return out;
    },
  };
  return j;
}
