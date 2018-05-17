#!/usr/bin/env bash

BLOG_BASE_URL=https://zemlan.in DIST=root@159.65.122.125:/var/projects/scroll/dist node index.js

ansible-playbook ansible/init-static.yaml -i '159.65.122.125,'
# ansible-playbook ansible/init-server.yaml -i '159.65.122.125,'
