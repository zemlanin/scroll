# scroll

## optional dependencies
- `ffmpeg` for `gif -> mp4` encoding and generating `firstframe` previews
- `libicu.so` for Unicode-aware sqlite collation (correct case-insensitive search)

### `libicu.so` compilation
macOS:
```
> brew install icu4c
> bash -c "gcc -shared sqlite-icu/icu.c `/usr/local/opt/icu4c/bin/icu-config --cppflags-searchpath` `/usr/local/opt/icu4c/bin/icu-config --ldflags` -o sqlite-icu/libicu.so"
> echo "sqlite-icu/libicu.so" > .env
```
