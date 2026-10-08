// Run with:  node scripts/test-matching.mjs
import { matchByTitle, isTooSenior } from '../lib/resolveJobLink.js';

const job = (name, extra = {}) => ({ name, position_slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...extra });
let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const names = (list) => list.map((p) => p.name);

// "full stack" must match all the common spellings
const stack = [job('Fullstack Developer'), job('Full-Stack Engineer'), job('Full Stack Developer'), job('Account Management'), job('Junior React Developer')];
const m = names(matchByTitle(stack, 'full stack'));
check('"full stack" matches Fullstack / Full-Stack / Full Stack',
  m.includes('Fullstack Developer') && m.includes('Full-Stack Engineer') && m.includes('Full Stack Developer'));
check('"full stack" does not match unrelated jobs', !m.includes('Account Management') && !m.includes('Junior React Developer'));
check('"fullstack" (one word) matches "Full Stack Developer"', names(matchByTitle(stack, 'fullstack')).includes('Full Stack Developer'));
check('single word "react" matches', names(matchByTitle(stack, 'react')).join() === 'Junior React Developer');
check('junior roles rank first on ties', names(matchByTitle([job('Backend Developer'), job('Junior Backend Developer')], 'backend'))[0] === 'Junior Backend Developer');
check('3 words, one missing still matches (ratio 0.6)', matchByTitle([job('Node Backend Developer')], 'node backend python').length === 1);
check('2 words, one missing does not match', matchByTitle([job('Backend Developer')], 'backend python').length === 0);
check('empty search returns everything', matchByTitle(stack, '').length === stack.length);

// seniority
check('Senior is too senior', isTooSenior(job('Senior AI Growth Builder')));
check('Mid level is too senior', isTooSenior(job('Fullstack Developer (Mid level)')));
check('Team Lead is too senior', isTooSenior(job('Team Lead')));
check('Manager is too senior', isTooSenior(job('Engineering Manager')));
check('experience_level Senior is too senior', isTooSenior(job('Developer', { experience_level: 'Senior' })));
check('Junior is fine', !isTooSenior(job('Junior React Developer')));
check('plain title is fine', !isTooSenior(job('Full Stack Engineer')));
check('Entry-level is fine', !isTooSenior(job('Developer', { experience_level: 'Entry-level' })));
check('"Junior ... Manager" is fine (junior wins)', !isTooSenior(job('Junior Product Manager')));
check('"Leader" word inside another word is fine', !isTooSenior(job('Headless CMS Developer')));
check('hebrew בכיר is too senior', isTooSenior({ name: 'מפתח בכיר', position_slug: '' }));

process.exit(failed ? 1 : 0);
