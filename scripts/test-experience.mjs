// Run with:  node scripts/test-experience.mjs
import { getRequiredYears } from '../lib/resolveJobLink.js';

const mk = (html, name = 'Requirements') => ({ custom_fields: { details: [{ name, value: html }] } });

const cases = [
  ['4+ years', mk('<ul><li>4+ years of experience in backend</li></ul>'), 4],
  ['range 3-5', mk('<li>3-5 years experience with Node</li>'), 3],
  ['at least 5 years', mk('<li>At least 5 years of hands-on experience</li>'), 5],
  ['words: three years', mk('<li>Three years of experience</li>'), 3],
  ['1-2 years', mk('<li>1-2 years of experience</li>'), 1],
  ['advantage line ignored', mk('<li>3 years experience with React is an advantage</li>'), 0],
  ['hebrew שנים', mk('<li>ניסיון של 4 שנים בפיתוח</li>'), 4],
  ['hebrew שנתיים', mk('<li>ניסיון של שנתיים לפחות</li>'), 2],
  ['max of several', mk('<li>1 year experience with React</li><li>4 years experience in backend</li>'), 4],
  ['no experience mentioned', mk('<li>B.sc in computer science</li><li>Quick learner</li>'), 0],
  ['description ignored', { custom_fields: { details: [
    { name: 'Description', value: '<p>We have 10 years of experience in the market</p>' },
    { name: 'Requirements', value: '<li>B.sc in CS</li>' } ] } }, 0],
  ['hebrew number word', mk('<li>ניסיון עם Tableau/ BI של שלוש שנים ומעלה – חובה.</li>'), 3],
  ['hebrew prefix ו', mk('<li>ניסיון של ושלוש שנים</li>'), 3],
  ['"often years" is not "ten years"', mk('<li>experience that is often years long</li>'), 0],
  ['no details', {}, 0],
];

let failed = 0;
for (const [name, pos, expected] of cases) {
  const got = getRequiredYears(pos);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (expected ${expected}, got ${got})`);
}
process.exit(failed ? 1 : 0);
