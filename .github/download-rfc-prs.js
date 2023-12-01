const fs = require('fs')

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

      /*
        The git patches are the only way to get the RFC contents without additional API calls.
        The alternative would be to download the file contents, one call per PR.
        The patch in this object is not a full patch with valid syntax, so we need to modify it a bit - add a header.
      */
      // This header will cause the patch to create a file in patches/text/*.md.
      const patch = `--- /dev/null\n+++ b/patches/${rfcFile.filename}\n` + rfcFile.patch + "\n"
      fs.writeFileSync(`patches/${rfcFile.filename}.patch`, patch)

      /*
        We want to link the proposed RFCs to their respective PRs.
        While we have it, we add a link to the source to markdown files.
        Later, we will append the text of the RFCs to those files.
      */
      fs.writeFileSync(
        `mdbook/src/proposed/${rfcFile.filename.replace('text/','')}`,
        `[(source)](${pr.html_url})\n\n`
      )
    }
}
