'use strict';

const assert = require('assertthat');

const parseImage = require('../lib/parseImage');

console.log(parseImage)
describe('parseImage', function() {
  it('should return null when the value is not present', function() {
    assert.that(parseImage()).is.undefined();
  });

  it('should return object for official docker image', function() {
    assert.that(parseImage('mongo')).is.equalTo({ registry: 'registry-1.docker.io', org: 'library', image: 'mongo', imagepath: 'library/mongo', tag: 'latest' });
  });

  it('should return object for official docker image with tag', function() {
    assert.that(parseImage('mongo:3.6.0')).is.equalTo({ registry: 'registry-1.docker.io', org: 'library', image: 'mongo', imagepath: 'library/mongo', tag: '3.6.0' });
  });

  it('should return object for docker hub image', function() {
    assert.that(parseImage('StefanScherer/whoami')).is.equalTo({ registry: 'registry-1.docker.io', org: 'StefanScherer', image: 'whoami', imagepath: 'StefanScherer/whoami', tag: 'latest' });
  });

  it('should return object for docker hub image with tag', function() {
    assert.that(parseImage('StefanScherer/whoami:1.0.0')).is.equalTo({ registry: 'registry-1.docker.io', org: 'StefanScherer', image: 'whoami', imagepath: 'StefanScherer/whoami', tag: '1.0.0' });
  });

  it('should return object for MCR windows image', function() {
    assert.that(parseImage('mcr.microsoft.com/windows')).is.equalTo({ registry: 'mcr.microsoft.com', image: 'windows', imagepath: 'windows', tag: 'latest' });
  });

  it('should return object for MCR windows image with tag', function() {
    assert.that(parseImage('mcr.microsoft.com/windows:1809')).is.equalTo({ registry: 'mcr.microsoft.com', image: 'windows', imagepath: 'windows', tag: '1809' });
  });

  it('should return object for MCR windows/nanoserver image with tag', function() {
    assert.that(parseImage('mcr.microsoft.com/windows/nanoserver:1809')).is.equalTo({ registry: 'mcr.microsoft.com', image: 'windows/nanoserver', imagepath: 'windows/nanoserver', tag: '1809' });
  });
});
