# scroll

## optional dependencies
- `ffmpeg` for `gif -> mp4` encoding and generating `firstframe` previews
- `libicu.so` for Unicode-aware sqlite collation (correct case-insensitive search)

### `libicu.so` compilation
Ubuntu:
```
> apt install libicu-dev icu-devtools libsqlite3-dev
> bash -c "gcc -shared sqlite-icu/icu.c `icu-config --cppflags-searchpath` `icu-config --ldflags` -o sqlite-icu/libicu.so"
> echo "SQLITE_ICU=sqlite-icu/libicu.so" >> .env
```

macOS:
```
> brew install icu4c
> bash -c "gcc -shared sqlite-icu/icu.c `/usr/local/opt/icu4c/bin/icu-config --cppflags-searchpath` `/usr/local/opt/icu4c/bin/icu-config --ldflags` -o sqlite-icu/libicu.so"
> echo "SQLITE_ICU=sqlite-icu/libicu.so" >> .env
```
