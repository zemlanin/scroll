# https://fonts.google.com/specimen/Damion
# https://markoskon.com/creating-font-subsets/
#
# python3 -m pip install --upgrade brotli zopfli fonttools

pyftsubset \
  templates/fonts/Damion-Regular.ttf \
  --output-file="templates/fonts/Damion-z.woff" \
  --flavor=woff \
  --layout-features="*" \
  --unicodes="U+007A"
