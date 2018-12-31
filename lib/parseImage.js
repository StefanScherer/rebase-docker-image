'use strict';

const parseImage = (imagename) => {
  if (!imagename) {
    return;
  }
  let found;

  found = imagename.match(/^([^\/.:]+)\/([^:]+):(.*)$/);
  if (found) {
    return { registry: 'registry-1.docker.io', org: found[1], image: found[2], imagepath: `${found[1]}/${found[2]}`, tag: found[3] };
  }
  found = imagename.match(/^([^\/.:]+)\/([^:]+)$/);
  if (found) {
    return { registry: 'registry-1.docker.io', org: found[1], image: found[2], imagepath: `${found[1]}/${found[2]}`, tag: 'latest' };
  }
  found = imagename.match(/^([^\/.:]+):(.*)$/);
  if (found) {
    return { registry: 'registry-1.docker.io', org: 'library', image: found[1], imagepath: `library/${found[1]}`, tag: found[2] };
  }
  found = imagename.match(/^([a-zA-Z0-9.]+)\/([^:]+):(.*)$/);
  if (found) {
    return { registry: found[1], image: found[2], imagepath: `${found[2]}`, tag: found[3] };
  }
  found = imagename.match(/^([a-zA-Z0-9.]+)\/([^:]+)$/);
  if (found) {
    return { registry: found[1], image: found[2], imagepath: `${found[2]}`, tag: 'latest' };
  }
  return { registry: 'registry-1.docker.io', org: 'library', image: imagename, imagepath: `library/${imagename}`, tag: 'latest' };
};

module.exports = parseImage;
