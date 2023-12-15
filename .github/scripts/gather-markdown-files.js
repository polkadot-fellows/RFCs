/**
 * This scripts gathers source markdown files of approved and proposed RFCS in mdbook/src directory.
 */

const fs = require('fs');

module.exports = async ({github, context}) => {
    // Copy the approved (already-merged) RFCs markdown files, first adding a source link at the top and a TOC.
    for (const file of fs.readdirSync("text/")) {
      if (!file.endsWith(".md")) continue;
      const text = `[(source)](https://github.com/polkadot-fellows/RFCs/blob/main/text/${file})\n\n`
        + "**Table of Contents**\n\n<\!-- toc -->\n"
        + fs.readFileSync(`text/${file}`)
      fs.writeFileSync(`mdbook/src/approved/${file}`, text)
    }

    // Copy the proposed ones (created in previous steps).
    for (const status of ["new", "proposed", "stale"]) {
      const dirPath = `${status}-rfcs/`
      for (const filename of fs.readdirSync(dirPath)) {
        if (!filename.endsWith(".md")) continue;
        const text = "**Table of Contents**\n\n<\!-- toc -->\n"
          + fs.readFileSync(dirPath + filename)
        // Source link is already there (with a link to PR). So we append here.
        fs.appendFileSync(`mdbook/src/${status}/${filename}`, text)
      }
    }
}
