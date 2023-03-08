const fs = require('fs-extra');
const path = require('path');
const getCommitsByType = require('./getCommitsByType');
const changelogJson = require('../changelog.json');

/**
 * The final markup for the CHANGELOG.
 */
const changelogArr = Object.keys(changelogJson).map((tag) => {
  const { commits, title, date } = changelogJson[tag];

  let body = `
| Description   | Type        | Applications impacted |
| :------------ | :---------- | :-------------------- |`;

  const { feat, fix, enh, refactor, revert, breaking } =
    getCommitsByType(commits);

  const createSection = (type, commitsList) => {
    const transformList = commitsList
      .sort((commit1, commit2) => {
        return (commit2.scopeText || '').localeCompare(commit1.scopeText || '');
      })
      .map((commit) => {
        const { scopeText, description } = commit;
        return `
| ${scopeText ? `**${scopeText}:**` : ''} ${description} | ${type} | Alta |`;
      })
      .join('');

    return `${transformList}`;
  };

  if (breaking.length > 0) {
    body = body + createSection('Breaking change', breaking);
  }

  if (feat.length > 0) {
    body = body + createSection('Feature', feat);
  }

  if (fix.length > 0) {
    body = body + createSection('Fix', fix);
  }

  if (enh.length > 0) {
    body = body + createSection('Enhancement', enh);
  }

  if (refactor.length > 0) {
    body = body + createSection('Refactor', refactor);
  }

  if (revert.length > 0) {
    body = body + createSection('Revert', revert);
  }

  return `
## ${title} ${date ? `(${date})` : ''}
    ${body}`;
});

/**
 * Write to the file.
 */
fs.writeFileSync(
  path.resolve(__dirname, '..', 'CHANGELOG-release-notes-table.md'),
  changelogArr.join('\n'),
  {
    encoding: 'utf8',
  },
);
