/**
 * This scripts gathers source markdown files of approved and proposed RFCS into the mdbook/src directory.
 */

const fs = require('fs');

// The amount of days that an RFC is considered "new".
// Counted from the creation of a given PR.
const NEW_RFC_PERIOD_DAYS = 7

// The amount of days that an RFC is considered "stale".
// Counted from the last update on a PR.
const STALE_RFC_PERIOD_DAYS = 30

const dateDaysBefore = (daysBefore) => {
    const result = new Date()
    result.setDate(result.getDate() - daysBefore)
    return result
}

[
    "mdbook/src/approved",
    "mdbook/src/new",
    "mdbook/src/stale",
    "mdbook/src/proposed"
].forEach(path => fs.mkdirSync(path, {resursive: true}))

const TOC = "**Table of Contents**\n\n<\!-- toc -->\n"

module.exports = async ({github, context}) => {
    const owner = 'polkadot-fellows'
    const repo = 'RFCs'
    const prs = await github.paginate(github.rest.pulls.list, {owner, repo, state: 'open'})

    /*
      The open PRs are potential proposed RFCs.
      We iterate over them and filter those that include a new RFC markdown file.
    */
    for (const pr of prs) {
      const addedMarkdownFiles = (
        await github.rest.pulls.listFiles({
          owner, repo,
          pull_number: pr.number,
        })
      ).data.filter(
        (file) => file.status === "added" && file.filename.startsWith("text/") && file.filename.includes(".md"),
      );
      if (addedMarkdownFiles.length !== 1) continue;
      const [rfcFile] = addedMarkdownFiles;
      const rawText = await (await fetch(rfcFile.raw_url)).text();

      const isNew = new Date(pr.created_at) > dateDaysBefore(NEW_RFC_PERIOD_DAYS)
      const isStale = new Date(pr.updated_at) < dateDaysBefore(STALE_RFC_PERIOD_DAYS)
      const status = isNew ? 'new' : (isStale ? 'stale' : 'proposed')

      const filename = rfcFile.filename.replace("text/", "")

      fs.writeFileSync(
        `mdbook/src/${status}/${filename}`,
        `[(source)](${pr.html_url})\n\n`
        + TOC
        + rawText
        )
    }

    // Copy the approved (already-merged) RFCs markdown files, first adding a source link at the top and a TOC.
    for (const file of fs.readdirSync("text/")) {
        if (!file.endsWith(".md")) continue;
        const text = `[(source)](https://github.com/polkadot-fellows/RFCs/blob/main/text/${file})\n\n`
            + TOC
            + fs.readFileSync(`text/${file}`)
        fs.writeFileSync(`mdbook/src/approved/${file}`, text)
    }
}
