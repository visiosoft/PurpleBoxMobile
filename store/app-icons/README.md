# App icon options

`options.png` shows all four designs side by side: on the Play Store, as
launcher icons in circle, squircle and rounded masks, and on iOS.

| Option | Look |
|---|---|
| `classic/` | Brand mark on white. **This is what the app uses now.** |
| `gradient/` | White mark on the app's header gradient. Matches the feature graphic. |
| `royal/` | White mark on solid brand purple `#5B2BC9` |
| `lavender/` | Brand purple mark on a light lavender tint |

Each folder has:

| File | Size | Use |
|---|---|---|
| `play-store-512.png` | 512 × 512, 32-bit | Play Console app icon |
| `icon-1024.png` | 1024 × 1024, no alpha | `assets/icon.png` (iOS and older Android) |
| `adaptive-foreground.png` | 1024 × 1024, transparent | `assets/android-icon-foreground.png` (mark kept inside Android's 66% safe zone) |
| `adaptive-background.png` | 1024 × 1024 | `assets/android-icon-background.png` |

`notification-icon-96.png` is the white status-bar icon that's already wired
in through `expo-notifications` in `app.json`.

## Switching the app to another option

```bash
OPT=gradient   # or royal / lavender / classic
cp store/app-icons/$OPT/icon-1024.png              assets/icon.png
cp store/app-icons/$OPT/adaptive-foreground.png    assets/android-icon-foreground.png
cp store/app-icons/$OPT/adaptive-background.png    assets/android-icon-background.png
cp store/app-icons/$OPT/play-store-512.png         store/google-play/graphics/icon-512.png
```

Then set `expo.android.adaptiveIcon.backgroundColor` in `app.json` to the
option's main colour: `#FFFFFF` for classic, `#5B2BC9` for gradient and royal,
`#EDE5FF` for lavender. Rebuild after that. Google expects the Play Store icon
to match the launcher icon.
