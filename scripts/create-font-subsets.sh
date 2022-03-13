# https://fonts.google.com/specimen/Damion
# https://markoskon.com/creating-font-subsets/
#
# python3 -m pip install --upgrade brotli zopfli fonttools

pyftsubset \
  static/fonts/Damion-Regular.ttf \
  --output-file="static/fonts/Damion-z.woff2" \
  --flavor=woff2 \
  --layout-features="*" \
  --unicodes="U+007A"

pyftsubset \
  static/fonts/Damion-Regular.ttf \
  --output-file="static/fonts/Damion-z.woff" \
  --flavor=woff \
  --layout-features="*" \
  --unicodes="U+007A"

pyftsubset \
  static/fonts/Damion-Regular.ttf \
  --output-file="static/fonts/Damion-z.ttf" \
  --layout-features="*" \
  --unicodes="U+007A"
