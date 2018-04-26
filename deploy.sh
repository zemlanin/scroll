#!/usr/bin/env bash

BLOG_BASE_URL=https://zemlan.in node index.js

# deploy to own hosting
TDIR=`mktemp -d`
REMOTE_HOST=root@159.65.122.125
cp -r dist $TDIR
rsync --progress --delete -Icru $TDIR/dist $REMOTE_HOST:/var/projects/scroll
rm -rf $TDIR

ansible-playbook ansible/init-static.yaml -i '159.65.122.125,'
