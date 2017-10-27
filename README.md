# rebase-docker-image
Rebase a Windows Docker image

Example: Rebase a Windows image `stefanscherer/winspector:windows-1.15.0` based on an older Windows base image to the new base image `microsoft/nanoserver:1709` and upload a new tag `stefanscherer/winspector:1709`

```
$ rebase-docker-image \
    stefanscherer/winspector:windows-1.15.0 \
    -t stefanscherer/winspector:1709 \
    -b microsoft/nanoserver:1709
```
