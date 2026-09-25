const fs = require('node:fs');
const path = require('node:path');

const reportPath = process.argv[2];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!reportPath || !summaryPath) process.exit(0);

const config = require(path.resolve(__dirname, '..', 'lighthouserc.js'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const assertions = config.ci.assert.assertions;
const categories = [
  ['performance', 'Performance'],
  ['accessibility', 'Accessibility'],
  ['best-practices', 'Best Practices'],
  ['seo', 'SEO'],
];

const rows = categories.map(([key, label]) => {
  const score = report.categories?.[key]?.score;
  const threshold = assertions[`categories:${key}`]?.[1]?.minScore ?? 0;
  const percentage = typeof score === 'number' ? Math.round(score * 100) : null;
  const pass = percentage !== null && score >= threshold;
  const indicator = pass
    ? '<span style="color:green">PASS</span>'
    : '<span style="color:red">FAIL</span>';
  return `| ${label} | ${percentage ?? 'N/A'} | ${Math.round(threshold * 100)} | ${indicator} |`;
});

const summary = [
  '## Lighthouse Scores',
  '',
  '| Category | Score | Threshold | Status |',
  '|---|---:|---:|---|',
  ...rows,
  '',
].join('\n');
fs.appendFileSync(summaryPath, summary);
