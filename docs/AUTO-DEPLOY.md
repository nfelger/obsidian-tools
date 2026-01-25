# BRAT Auto-Deploy Setup

This plugin uses BRAT (Beta Reviewers Auto-update Tester) for automatic updates during development.

**Every push to `main` or `claude/**` branches = automatic deployment to all devices within ~3 minutes.**

---

## Quick Start: Installing the Plugin

### 1. Install BRAT Plugin

In Obsidian:
1. Settings → Community Plugins → Browse
2. Search for "BRAT"
3. Install and Enable BRAT

### 2. Add Bullet Flow via BRAT

1. Settings → BRAT → Beta Plugins List
2. Click "Add Beta Plugin"
3. Enter: `nfelger/obsidian-tools`
4. Click "Add Plugin"
5. BRAT downloads and installs automatically

### 3. Enable the Plugin

1. Settings → Community Plugins
2. Find "Bullet Flow"
3. Toggle ON

### 4. Configure Auto-Updates (Recommended)

In Settings → BRAT:
- ✅ Enable "Update Beta Plugins at Startup"
- ✅ Enable "Notification of Updates"
- Set "Update Check Interval" to **2 hours** (for active development)

**Manual update:** Settings → BRAT → Check for Updates button

### 5. Test It Works

1. Open Command Palette (Cmd/Ctrl + P)
2. Search for "Test - Plugin is working"
3. Run the command
4. You should see a success message!

---

## How It Works

**Every push to GitHub triggers:**
1. GitHub Actions builds the plugin (~2-3 min)
2. Creates a GitHub release with incrementing version: `0.2.0-dev.7`, `0.2.0-dev.8`, etc.
3. BRAT detects the new version via semantic versioning
4. Plugin auto-updates on all devices

**No manual file copying. Ever.** 🚀

---

## Key Technical Details

### BRAT Uses Semantic Versioning, Not Tag Names

❌ **Wrong approach:** Using a static `latest` tag
- BRAT picks highest semver, not tag names
- Version `0.1.0` released repeatedly = no updates detected

✅ **Correct approach:** Incrementing pre-release versions
- `0.2.0-dev.1`, `0.2.0-dev.2`, `0.2.0-dev.3`, etc.
- Each version is higher than the last
- BRAT sees each as a new update

### Semantic Version Ordering

```
0.1.0-dev.6  <  0.1.0  <  0.2.0-dev.1  <  0.2.0-dev.2  <  0.2.0
```

**Critical:** Dev versions must be **higher** than the last installed version.
- If BRAT installed `0.1.0`, then `0.1.0-dev.X` is a downgrade (won't update)
- Solution: Bump base version to `0.2.0`, use `0.2.0-dev.X`

### GitHub Actions Workflow

Located: `.github/workflows/release-on-push.yml`

**Key steps:**
1. Extract base version from `manifest.json` (e.g., `0.2.0`)
2. Append GitHub run number: `0.2.0-dev.${{ github.run_number }}`
3. Update `manifest.json` with dev version
4. Build plugin with updated version
5. Create GitHub release with `main.js` and `manifest.json`

**Critical flags:**
- `prerelease: true` - Marks as pre-release
- `makeLatest: false` - Doesn't mark as "latest release"
- `tag: ${{ steps.version.outputs.dev_version }}` - Unique tag per build

---

## Version Management

**During development:**
- Keep base version in `manifest.json` (e.g., `0.2.0`)
- Each push creates `0.2.0-dev.X` release
- Don't commit dev versions to repo (GitHub Actions handles it)

**For official releases:**
- Bump `manifest.json` to `1.0.0` (or next version)
- Create proper release (not from auto-deploy workflow)
- Publish to Obsidian community plugins

---

## Troubleshooting

### Updates Not Detected?

**Check semver ordering:**
- Dev versions must be higher than installed version
- If stuck, bump base version in `manifest.json`

**Verify build succeeded:**
- GitHub Actions tab shows green checkmark
- Release has `main.js` and `manifest.json` attached

**Check BRAT logs:**
- Settings → BRAT → Logs

### Build Failing?

- Check GitHub Actions tab for error logs
- Verify `npm run build` succeeds locally
- Check TypeScript compilation errors

### Plugin Not Appearing?

- Verify repo name: `nfelger/obsidian-tools`
- Check Settings → BRAT → Logs
- Try "Reload Without Saving" (Cmd+R)

### Plugin Errors?

- Open Developer Console: Cmd+Opt+I (Mac) or Ctrl+Shift+I (Windows)
- Look for "Loading Bullet Flow plugin" log
- Check for error messages

---

## Multiple Devices

Install via BRAT on all your devices (desktop + mobile). They'll all auto-update independently!

---

## References

- [BRAT Developer Guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
- [BRAT Plugin](https://github.com/TfTHacker/obsidian42-brat)
- [Semantic Versioning](https://semver.org/)

---

**Result:** Zero manual file copying. Every commit auto-deploys to all devices. 🚀
