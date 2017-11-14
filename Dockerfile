ARG node=node
FROM $node
RUN npm install -g rebase-docker-image
ENTRYPOINT [ "rebase-docker-image" ]
