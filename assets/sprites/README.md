# Sprite artwork

One PNG per collectible slot, named for its catalogue id (`sprite_earth.png`,
`spritevar_zero_point_gold.png`). `pipeline/sync_sprite_assets.py` fetches new ones
weekly; `pipeline/tests/test_sprite_art.py` fails on any file matching no id.

Licensing: Epic's Fan Content Policy permits this art in a free, non-commercial fan
web app while the notice shown in the app footer stays displayed. Monetising the site
voids the permission. See docs/DECISIONS.md D-18.
