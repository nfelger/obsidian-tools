# Installing via BRAT (Beta Reviewers Auto-update Tester)

This plugin uses BRAT for automatic updates during development. Every commit to `main` or `claude/**` branches automatically builds and deploys.

## First-Time Setup

### 1. Install BRAT Plugin

In Obsidian:
1. Settings → Community Plugins → Browse
2. Search for "BRAT"
3. Install and Enable BRAT

### 2. Add Obsidian Tools via BRAT

1. Settings → BRAT → Beta Plugins List
2. Click "Add Beta Plugin"
3. Enter: `nfelger/obsidian-tools`
4. Click "Add Plugin"
5. BRAT will download and install automatically

### 3. Enable the Plugin

1. Settings → Community Plugins
2. Find "Obsidian Tools"
3. Toggle ON

### 4. Configure Auto-Updates (Recommended)

In Settings → BRAT:
- ✅ Enable "Update Beta Plugins at Startup"
- ✅ Enable "Notification of Updates"
- Set "Update Check Interval" to **2 hours** (for active development)

## Testing the Installation

1. Open Command Palette (Cmd/Ctrl + P)
2. Search for "Test - Plugin is working"
3. Run the command
4. You should see: "🎉 Obsidian Tools plugin is working!"

## How Auto-Updates Work

1. Code is pushed to GitHub
2. GitHub Actions builds the plugin (~2-3 minutes)
3. "latest" release is updated with new build
4. BRAT checks for updates (every 2 hours, or at startup)
5. Plugin auto-updates on your device(s)

**Manual Update Check:**
Settings → BRAT → Check for Updates button

## Multiple Devices

Install via BRAT on all your devices (desktop + mobile). They'll all auto-update independently!

## Troubleshooting

**Plugin not appearing?**
- Check Settings → BRAT → Logs
- Verify repo name is correct: `nfelger/obsidian-tools`
- Try "Reload Without Saving" (Cmd+R)

**Updates not working?**
- Check GitHub Actions tab - is the build green?
- Check if "latest" release has new assets
- Manually trigger: Settings → BRAT → Check for Updates

**Plugin errors?**
- Open Developer Console: Cmd+Opt+I (Mac) or Ctrl+Shift+I (Windows)
- Check for error messages
- Look for "Loading Obsidian Tools plugin" log

## Switching Back to Stable Release

When v2.0.0 is officially released:
1. Settings → BRAT → Remove "obsidian-tools"
2. Settings → Community Plugins → Browse
3. Install official version from community plugins

---

**Happy testing!** 🚀
