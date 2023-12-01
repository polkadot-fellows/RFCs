#!/usr/bin/env bash
set -euo pipefail
cd $(dirname ${BASH_SOURCE[0]})

# This script will gatcher two sets of markdown files:
# - approved RFCs (already merged)
# - proposed RFCs (pending PRs)
mkdir -p src/{approved,proposed}

# mdBook relies on the creation of a special SUMMARY.md file
# https://rust-lang.github.io/mdBook/format/summary.html
cat SUMMARY_preface.md > src/SUMMARY.md

# Copy the approved RFCs markdown files, first adding a source link at the top.
cd ../text/
for f in *.md;
do
  [ -e "$f" ] || break
  echo -e "[(source)](https://github.com/polkadot-fellows/RFCs/blob/main/text/$f)\n" > "../mdbook/src/approved/$f"
  cat "$f" >> "../mdbook/src/approved/$f"
done
cd -

# This will append links to all RFCs into the SUMMARY.md,
# forming a sidebar of all contents.
append_rfc_to_summary () {
  local file="$1"
  local title=$(head -n 3 $file | grep '# ') # Grab the title from the contents of the file
  local title=${title#\# } # Remove the "# " prefix
  local path=${file#./src/} # Relative path, without the src prefix (format required by mdbook)
  echo "- [$title]($path)" >> src/SUMMARY.md;
}

for f in ./src/approved/*.md;
do
  [ -e "$f" ] || break
  append_rfc_to_summary "$f"
done

# Add a section header, and start adding proposed RFCs.
echo -e "\n---\n\n# Proposed\n\n" >> src/SUMMARY.md

for f in ./src/proposed/*.md;
do
  [ -e "$f" ] || break
  append_rfc_to_summary "$f"
done

echo -e "Preview of the generated SUMMARY.md:\n"
cat src/SUMMARY.md

rm -rf ./book/
mdbook build --dest-dir ./book/
