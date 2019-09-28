#!/usr/bin/env bash

OS="`uname`"
NEWLINE=$'\n'
TAB=$'\t'

if [[ "$OS" == "Linux" ]]; then
  gcc -shared sqlite-icu/icu.c \
    `icu-config --cppflags-searchpath` \
    `icu-config --ldflags` \
    -o sqlite-icu/libicu.so || echo "${NEWLINE}${NEWLINE}${TAB}install icu4c and sqlite-dev with \`apt install libicu-dev icu-devtools libsqlite3-dev\` and then re-run \`npm install\`${NEWLINE}${NEWLINE}"
elif [[ "$OS" == "Darwin" ]]; then
  gcc -shared sqlite-icu/icu.c \
    `/usr/local/opt/icu4c/bin/icu-config --cppflags-searchpath` \
    `/usr/local/opt/icu4c/bin/icu-config --ldflags` \
    -o sqlite-icu/libicu.so || echo "${NEWLINE}${NEWLINE}${TAB}install icu4c with \`brew install icu4c\` and then re-run \`npm install\`${NEWLINE}${NEWLINE}"
else
  echo "PRs are welcome"
fi

