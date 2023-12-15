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
    "patches",
    "new-rfcs",
    "proposed-rfcs",
    "stale-rfcs",
    "mdbook/src/approved",
    "mdbook/src/new",
    "mdbook/src/stale",
    "mdbook/src/proposed"
].forEach(path => fs.mkdirSync(path, {resursive: true}))

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

      const isNew = new Date(pr.created_at) > dateDaysBefore(NEW_RFC_PERIOD_DAYS)
      const isStale = new Date(pr.updated_at) < dateDaysBefore(STALE_RFC_PERIOD_DAYS)
      const status = isNew ? 'new' : (isStale ? 'stale' : 'proposed')

      /*
        The git patches are the only way to get the RFC contents without additional API calls.
        The alternative would be to download the file contents, one call per PR.
        The patch in this object is not a full patch with valid syntax, so we need to modify it a bit - add a header.
      */
      const filename = rfcFile.filename.replace("text/", "")
      // This header will cause the patch to create a file in {new,proposed,stale}-rfcs/*.md when git-applied.
      const patch = `--- /dev/null\n+++ b/${status}-rfcs/${filename}\n` + rfcFile.patch + "\n"
      fs.writeFileSync(`patches/${filename}.patch`, patch)

      /*
        We want to link the proposed RFCs to their respective PRs.
        While we have it, we add a link to the source to markdown files and a TOC.
        Later, we will append the text of the RFCs to those files.
      */
      fs.writeFileSync(
        `mdbook/src/${status}/${filename}`,
        `[(source)](${pr.html_url})\n\n`
        + "**Table of Contents**\n\n<\!-- toc -->\n\n"
      )
    }
}
