# rebase-docker-image
![npm](https://img.shields.io/npm/v/rebase-docker-image.svg)

Rebase a dockerized Windows app to a newer Windows Docker base image.

## Introduction

This repo started just for fun to see if it's possible to swap the
Windows base images of existing apps on the Docker Hub.

## Use cases

- Easily apply Windows Updates to an existing Windows app in seconds.
- Make images usable again that you have built with Insider.
- Provide your app for all available Windows Update layers to avoid download.
- Sync multiple images based on different Windows Update layers to the current.
- Create images for Server 1709 without having a machine for it.
- The tool can also be used on Linux as no images have to be pulled.

## Limits

- You cannot move an app from a windowsservercore image to the nanoserver image.
- You cannot rebase windowsservercore image with `RUN` instructions to 1709. Only `COPY` and `ENV` seem to be fine.
- You also cannot move PowerShell scripts into the 1709 nanoserver image as there is no PowerShell installed.
- Be warned that this tool may create corrupt images.

## Installation

```
npm install -g rebase-docker-image
```

## Usage

```
$ rebase-docker-image -h

rebase-docker-image

  Rebase a dockerized Windows app to a newer Windows Docker base image. The     
  rebase happens directly in Docker Hub, so no images have to be pulled and you 
  can run this tool on a non-Windows platform. You have to set the environment  
  variables DOCKER_USER and DOCKER_PASS to push the target manifest to Docker   
  Hub.                                                                          

Synopsis

  $ rebase-docker-image [--src] golang:nanoserver-sac2016 --target              
  my/golang:nanoserver-1709 --targetbase microsoft/nanoserver:1709              

Options

  -v, --verbose             Show more output.                                                             
  --src string              Source image for the rebase.                                                  
  -s, --srcbase string      If name target base image differs from source image, you can specify the      
                            source base image.                                                            
  -t, --target string       The target image name and tag after the rebase.                               
  -b, --targetbase string   The target base image that replaces the source base image.                    
  -h, --help                Print this usage guide.                                                       
  --version                 Print the version of this tool.                                               
```

It also needs two environment variables `DOCKER_USER` and `DOCKER_PASS` to push the target image.


## Example

### Nanoserver 2016 -> 1709

Let's modernize or update golang from the 10.0.14393.x base image to the 1709 variant.

```
$ rebase-docker-image \
    golang:1.9-nanoserver \
    -t stefanscherer/golang-windows:1.9-nanoserver-1709 \
    -b microsoft/nanoserver:1709
```

### Nanoserver 2016 -> Insider 17035

Let's modernize or update winspector from the 10.0.14393.x base image to the Insider 17035 variant.

```
$ rebase-docker-image \
    stefanscherer/winspector:windows-2.0.0-2016 \
    -s microsoft/nanoserver:10.0.14393.1770 \
    -t stefanscherer/winspector:insider-17035 \
    -b microsoft/nanoserver-insider:10.0.17035.1000
```

Changing from a different base image repo to another we have to specify with `-s` the source base image repo and tag. In this case the two base image layers are replaced by the single insider base image layer.


### Run it in a container

#### Windows

```
docker run -it -e DOCKER_USER -e DOCKER_PASS stefanscherer/node-windows:1709 cmd
npm install -g rebase-docker-image
rebase-docker-image -h
```

#### Linux

```
docker run -it -e DOCKER_USER -e DOCKER_PASS node bash
npm install -g rebase-docker-image
rebase-docker-image -h
```

## Contributing

This tool is in an early stage and many things can be improved.

- Add unit tests, as said it was a Proof of Concept
- Support the ~/.docker/config.json auth or the keychain
- Rewrite it to Golang
- ...

## License

MIT
